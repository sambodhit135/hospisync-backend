/**
 * HospiSync – Transfer Module
 * Patient transfer modal and submission with dynamic bed type support
 */

let currentHospitalCategories = [];

async function openTransferModal(toHospitalId, hospitalName, patients) {
    const fromId = getHospitalId();
    document.getElementById('transferToId').value = toHospitalId;
    document.getElementById('transferHospitalName').value = hospitalName;
    
    // Reset form
    const container = document.getElementById('transferBedTypesContainer');
    container.innerHTML = '<div style="grid-column: span 2; padding: 20px; text-align: center; color: var(--text-muted);">🔄 Loading hospital configuration...</div>';
    document.getElementById('transferCount').value = 0;
    document.getElementById('transferValidationError').style.display = 'none';
    
    document.getElementById('transferModal').classList.add('active');

    try {
        // Fetch destination hospital details to get its specific bed categories
        const data = await apiGet(`/hospital/${toHospitalId}/details?fromHospitalId=${fromId}`);
        
        if (!data || !data.categories) {
            container.innerHTML = '<div style="grid-column: span 2; padding: 20px; text-align: center; color: var(--danger);">Failed to load hospital configuration.</div>';
            return;
        }

        currentHospitalCategories = data.categories;
        renderDynamicBedInputs(data.categories);
        
        // If a default patient count was suggested (e.g. from dashboard overlay), 
        // we might not know which bed type it is, so we don't automatically assign it.
        // The user must specify.
        
    } catch (err) {
        console.error("Error opening transfer modal:", err);
        container.innerHTML = '<div style="grid-column: span 2; padding: 20px; text-align: center; color: var(--danger);">Error loading details.</div>';
    }
}

function renderDynamicBedInputs(categories) {
    const container = document.getElementById('transferBedTypesContainer');
    
    if (!categories || categories.length === 0) {
        container.innerHTML = '<div style="grid-column: span 2; padding: 20px; text-align: center; color: var(--warning);">This hospital has no registered bed categories.</div>';
        return;
    }

    container.innerHTML = categories.map((cat, index) => {
        const name = cat.categoryName || cat.name;
        return `
            <div class="form-group">
                <label>${cat.icon} ${name} <span style="color:var(--text-muted);font-size:11px;">(Avail: ${cat.available})</span></label>
                <input type="number" 
                       id="input_cat_${index}" 
                       data-available="${cat.available}"
                       data-name="${name}"
                       min="0" 
                       max="${cat.available}"
                       value="0" 
                       oninput="onBedInput(this)">
            </div>
        `;
    }).join('');
}

// Removed mapCategoryToField as we now use dynamic names from backend

function onBedInput(input) {
    const val = parseInt(input.value) || 0;
    const max = parseInt(input.getAttribute('data-available')) || 0;
    const name = input.getAttribute('data-name');

    if (val > max) {
        input.style.borderColor = 'var(--danger)';
        input.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.15)';
        showValidationError(`⚠️ Only ${max} ${name} beds available.`);
    } else {
        input.style.borderColor = '';
        input.style.boxShadow = '';
        document.getElementById('transferValidationError').style.display = 'none';
    }
    
    calcTransferTotal();
}

function calcTransferTotal() {
    let total = 0;
    const inputs = document.querySelectorAll('#transferBedTypesContainer input');
    inputs.forEach(input => {
        total += (parseInt(input.value) || 0);
    });
    document.getElementById('transferCount').value = total;
}

function closeTransferModal() {
    document.getElementById('transferModal').classList.remove('active');
}

async function submitTransfer() {
    const toId = document.getElementById('transferToId').value;
    const fromId = getHospitalId();
    const total = parseInt(document.getElementById('transferCount').value) || 0;

    if (total <= 0) {
        showValidationError('Please specify at least one patient to transfer.');
        return;
    }

    // Prepare payload dynamically
    const payload = {
        fromHospitalId: parseInt(fromId),
        toHospitalId: parseInt(toId),
        patientCount: total,
        bedAllocations: {},
        priority: document.getElementById('transferPriority').value || 'NORMAL'
    };

    let hasCapacityError = false;
    const inputs = document.querySelectorAll('#transferBedTypesContainer input');
    inputs.forEach(input => {
        const val = parseInt(input.value) || 0;
        const max = parseInt(input.getAttribute('data-available')) || 0;
        const name = input.getAttribute('data-name');

        if (val > max) {
            hasCapacityError = true;
            showValidationError(`⚠️ Requested ${val} ${name} patients, but only ${max} beds are available.`);
            input.focus();
        }
        
        if (val > 0) {
            payload.bedAllocations[name] = val;
        }
    });

    if (hasCapacityError) return;

    if (!toId || !fromId) {
        showToast('Missing transfer details', 'error');
        return;
    }

    showLoading(true);
    try {
        const result = await apiPost('/transfer/request', payload);

        if (result && !result.error) {
            showToast('Transfer request created successfully', 'success');
            closeTransferModal();
            loadTransfers();
            if (typeof fetchAIRecommendations === 'function') fetchAIRecommendations();
        } else {
            showValidationError(result?.error || 'Transfer failed');
        }
    } catch (err) {
        showToast('Failed to create transfer', 'error');
    } finally {
        showLoading(false);
    }
}

function showValidationError(msg) {
    const errDiv = document.getElementById('transferValidationError');
    const errMsg = document.getElementById('transferValidationMsg');
    errMsg.textContent = msg;
    errDiv.style.display = 'block';
}

async function loadTransfers() {
    try {
        const hospitalId = getHospitalId();
        const [incoming, outgoing] = await Promise.all([
            apiGet(`/transfer/incoming/${hospitalId}`),
            apiGet(`/transfer/outgoing/${hospitalId}`)
        ]);

        renderTransferTables(incoming || [], outgoing || []);
    } catch (err) {
        console.error("Failed to load transfers:", err);
        showToast("Failed to sync transfer data", "error");
    }
}

function renderTransferTables(incoming, outgoing) {
    const incomingTable = document.getElementById('incomingTransferTable');
    const outgoingTable = document.getElementById('outgoingTransferTable');

    if (incomingTable) {
        incomingTable.innerHTML = incoming.length === 0
            ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:32px;">No incoming requests</td></tr>'
            : incoming.map(t => {
                const statusColor = getStatusColor(t.status);
                let actions = '';
                
                if (t.status === 'PENDING') {
                    actions = `
                        <button class="btn btn-sm" style="background:var(--success);color:white;padding:4px 8px;" onclick="updateTransferStatus(${t.id}, 'APPROVED')">Accept</button>
                        <button class="btn btn-sm" style="background:var(--danger);color:white;padding:4px 8px;margin-left:4px;" onclick="updateTransferStatus(${t.id}, 'REJECTED')">Reject</button>
                    `;
                } else if (t.status === 'APPROVED') {
                    actions = `<button class="btn btn-sm" style="background:var(--primary);color:white;padding:4px 8px;" onclick="updateTransferStatus(${t.id}, 'COMPLETED')">Mark Completed</button>`;
                } else {
                    actions = `<span style="color:var(--text-muted);font-size:12px;">No actions</span>`;
                }

                return `
                    <tr>
                        <td>
                            <div style="font-weight:600;color:var(--text-primary);">${t.fromHospital?.hospitalName || 'Unknown'}</div>
                        </td>
                        <td>
                            <div style="font-weight:700;color:var(--primary);">${t.patientCount} Total</div>
                            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">
                                ${renderBedTypeBreakdown(t)}
                            </div>
                        </td>
                        <td>
                            <div style="font-size:12px;color:var(--text-muted);">${new Date(t.createdAt).toLocaleString()}</div>
                        </td>
                        <td><span style="color:${statusColor};font-weight:600;font-size:12px;padding:4px 10px;border-radius:12px;background:${statusColor}15;border:1px solid ${statusColor}40;">${t.status}</span></td>
                        <td>${actions}</td>
                    </tr>
                `;
            }).join('');
    }

    if (outgoingTable) {
        outgoingTable.innerHTML = outgoing.length === 0
            ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:32px;">No outgoing transfers</td></tr>'
            : outgoing.map(t => {
                const statusColor = getStatusColor(t.status);
                return `
                    <tr>
                        <td style="font-size:12px;color:var(--text-muted);font-weight:600;">#${t.id}</td>
                        <td style="font-weight:600;color:var(--text-primary);">${t.toHospital?.hospitalName || 'Unknown'}</td>
                        <td>
                            <div style="font-weight:700;color:var(--primary);">${t.patientCount} Total</div>
                            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">
                                ${renderBedTypeBreakdown(t)}
                            </div>
                        </td>
                        <td><span style="color:${statusColor};font-weight:600;font-size:12px;padding:4px 10px;border-radius:12px;background:${statusColor}15;border:1px solid ${statusColor}40;">${t.status}</span></td>
                        <td>${new Date(t.createdAt).toLocaleDateString()}</td>
                    </tr>
                `;
            }).join('');
    }
}

function renderBedTypeBreakdown(t) {
    if (!t.bedAllocations || Object.keys(t.bedAllocations).length === 0) return 'General Transfer';
    return Object.entries(t.bedAllocations)
        .map(([name, count]) => `${name}: ${count}`)
        .join(' | ');
}

function getStatusColor(status) {
    if (status === 'PENDING') return '#f59e0b';
    if (status === 'APPROVED') return '#10b981';
    if (status === 'COMPLETED') return '#3b82f6';
    if (status === 'REJECTED') return '#ef4444';
    return '#6b7280';
}

async function updateTransferStatus(transferId, newStatus) {
    console.log(`Attempting status update: Transfer ${transferId} -> ${newStatus}`);
    
    let isConfirmed = false;
    try {
        isConfirmed = confirm(`Are you sure you want to mark this request as ${newStatus}?`);
    } catch (e) {
        console.warn("Native confirm blocked, proceeding anyway for automation compatibility");
        isConfirmed = true; 
    }

    if (!isConfirmed) return;
    
    showLoading(true);
    try {
        const hospitalId = getHospitalId();
        if (!hospitalId) {
            showToast("Session error: Hospital ID missing. Please re-login.", "error");
            return;
        }

        const result = await apiPut(`/transfer/${transferId}/status`, {
            hospitalId: parseInt(hospitalId),
            status: newStatus
        });
        
        if (result && !result.error) {
            showToast(`Transfer successfully marked as ${newStatus}`, 'success');
            loadTransfers();
            if (typeof loadDashboard === 'function') loadDashboard(); 
        } else {
            console.error("Status Update Failed Result:", result);
            showToast(result?.error || 'Server rejected the status update', 'error');
        }
    } catch (err) {
        console.error('Network or Status Error:', err);
        showToast('Failed to communicate with server. Check connectivity.', 'error');
    } finally {
        showLoading(false);
    }
}

// ===== Notification System (Feature 3) =====
function showNotificationAlert(message, type = 'INFO') {
    const container = document.getElementById('notificationAlertsContainer');
    if (!container) return;

    const alert = document.createElement('div');
    alert.className = 'notif-alert-card animate-in ' + type.toLowerCase();
    
    const icon = type === 'EMERGENCY' ? '🚨' : type === 'SUCCESS' ? '✅' : 'ℹ️';
    const title = type === 'EMERGENCY' ? 'EMERGENCY ALERT' : 'Notification';
    
    alert.innerHTML = `
        <div style="display:flex; gap:12px; align-items:flex-start;">
            <div style="font-size:24px;">${icon}</div>
            <div style="flex:1;">
                <div style="font-weight:700; font-size:12px; margin-bottom:4px; opacity:0.8; letter-spacing:0.5px;">${title}</div>
                <div style="font-size:13px; line-height:1.4; color:var(--text-primary);">${message}</div>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:16px;">&times;</button>
        </div>
    `;

    container.appendChild(alert);

    // Auto-remove after 8 seconds
    setTimeout(() => {
        if (alert.parentElement) {
            alert.style.opacity = '0';
            alert.style.transform = 'translateX(20px)';
            setTimeout(() => alert.remove(), 400);
        }
    }, 8000);
}

// Polling for notifications (in a real app, use WebSocket/SSE)
async function poolNotifications() {
    try {
        const hospitalId = getHospitalId();
        if (!hospitalId) return; 
        
        // Call the general notifications endpoint which includes the list and count
        const data = await apiGet(`/notifications/${hospitalId}`);
        
        if (data && data.notifications && data.notifications.length > 0) {
            // Find unread ones. We only alert for new ones since last check if we wanted to be fancy,
            // but for now, we alert for any unread that the backend sends.
            const unread = data.notifications.filter(n => !n.isRead);
            
            unread.forEach(notif => {
                showNotificationAlert(notif.message, notif.type);
                // Mark as read immediately for the demo to prevent repeat alerts
                apiPut(`/notifications/${notif.id}/read`, { hospitalId: hospitalId });
            });

            // Update UI count in header if dashboard helper is available
            if (typeof loadNotificationCount === 'function') loadNotificationCount();
        }
    } catch (err) {
        console.error("Polling error:", err);
    }
}

// Start polling every 10 seconds
setInterval(poolNotifications, 10000);

// Close modal on backdrop click
document.getElementById('transferModal')?.addEventListener('click', function (e) {
    if (e.target === this) closeTransferModal();
});
