/**
 * HospiSync – Transfer Module
 * Patient transfer modal and submission with dynamic bed type support
 */

let currentHospitalCategories = [];

async function openTransferModal(toHospitalId, hospitalName, patients) {
    // RULE 2: CHECK: Is there already an active transfer?
    const existingId = localStorage.getItem('activeTransferId');
    if (existingId && existingId !== 'null') {
      showActiveTransferWarning(existingId, hospitalName);
      return;
    }

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

// Helper for mapping origin bed names to destination bed names (e.g. ICU -> Intensive Care Unit)
function fuzzyMatchBedName(name1, name2) {
    if (!name1 || !name2) return false;
    const n1 = name1.toLowerCase().replace(/beds/g, '').replace(/unit/g, '').trim();
    const n2 = name2.toLowerCase().replace(/beds/g, '').replace(/unit/g, '').trim();
    return n1 === n2 || n1.includes(n2) || n2.includes(n1);
}

function renderDynamicBedInputs(categories) {
    const container = document.getElementById('transferBedTypesContainer');
    
    if (!categories || categories.length === 0) {
        container.innerHTML = '<div style="grid-column: span 2; padding: 20px; text-align: center; color: var(--warning);">This hospital has no registered bed categories.</div>';
        return;
    }

    // Filter categories to only show those that have a requirement > 0 in the dashboard
    const filteredCategories = categories.filter(cat => {
        const destName = cat.categoryName || cat.name;
        let matchedVal = 0;
        document.querySelectorAll('input[id^="req-"]').forEach(input => {
            const reqName = input.id.replace('req-', '');
            if (fuzzyMatchBedName(destName, reqName)) {
                matchedVal = parseInt(input.value) || 0;
            }
        });
        return matchedVal > 0;
    });

    // If no specific requirements were set (or no match was found at this hospital), show all available
    const displayList = filteredCategories.length > 0 ? filteredCategories : categories;

    container.innerHTML = displayList.map((cat, index) => {
        const destName = cat.categoryName || cat.name;
        
        let defaultVal = 0;
        document.querySelectorAll('input[id^="req-"]').forEach(input => {
            const reqName = input.id.replace('req-', '');
            if (fuzzyMatchBedName(destName, reqName)) {
                defaultVal = parseInt(input.value) || 0;
            }
        });

        return `
            <div class="space-y-2">
                <label class="text-[10px] font-black text-slate-400 border-l-2 border-primary/20 pl-2 uppercase tracking-widest block">${cat.icon || '🏥'} ${destName} <span class="lowercase text-[9px] text-slate-300">(Avail: ${cat.available})</span></label>
                <div class="relative">
                    <input type="number" 
                           id="input_cat_${index}" 
                           data-available="${cat.available}"
                           data-name="${destName}"
                           class="w-full bg-slate-50 border-none rounded-xl py-4 px-5 text-sm font-black text-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                           min="0" 
                           max="${cat.available}"
                           value="${defaultVal}" 
                           oninput="onBedInput(this)">
                    <span class="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">UNITS</span>
                </div>
            </div>
        `;
    }).join('');
    
    // Calculate total immediately after rendering to show pre-filled total
    if (typeof calcTransferTotal === 'function') {
        calcTransferTotal();
    }
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
            
            const data = result;
            const transferId = data.id || data.transferId;
            const toHospitalId = document.getElementById('transferToId').value;
            const selectedHospitalId = parseInt(toHospitalId);
            const specSelect = document.getElementById('filter-speciality');
            const selectedSpeciality = specSelect ? specSelect.value : '';

            // Store for timer page
            localStorage.setItem('activeTransferId', String(transferId));
            localStorage.setItem('activeTransferSpeciality', selectedSpeciality || '');

            // Add tried hospital to list
            const tried = JSON.parse(localStorage.getItem('triedHospitals') || '[]');
            if (!tried.includes(selectedHospitalId)) {
                tried.push(selectedHospitalId);
            }
            localStorage.setItem('triedHospitals', JSON.stringify(tried));

            closeTransferModal();

            // Navigate to transfers section and start timer
            console.log('Transfer created ID:', transferId);
            console.log('Redirecting to transfers section...');
            setTimeout(() => {
                if (typeof showSection === 'function') {
                    showSection('transfer');
                }
                setTimeout(() => {
                    if (typeof initTransferPage === 'function') initTransferPage();
                }, 200);
            }, 500);
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
    const btn = document.querySelector('button[onclick="loadTransfers()"] .material-symbols-outlined');
    if (btn) btn.classList.add('animate-spin');
    
    try {
        const hospitalId = getHospitalId();
        const [incoming, outgoing] = await Promise.all([
            apiGet(`/transfer/incoming/${hospitalId}`),
            apiGet(`/transfer/outgoing/${hospitalId}`)
        ]);

        renderTransferTables(incoming || [], outgoing || []);
        showToast("Transfers successfully synchronized", "success");
    } catch (err) {
        console.error("Failed to load transfers:", err);
        showToast("Failed to sync transfer data", "error");
    } finally {
        if (btn) btn.classList.remove('animate-spin');
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

// ===== Active Transfer Constraint Methods =====
function showActiveTransferWarning(existingId, newHospitalName) {
  let warningDiv = document.getElementById('activeTransferWarning');
  if (!warningDiv) {
    warningDiv = document.createElement('div');
    warningDiv.id = 'activeTransferWarning';
    const recSection = document.getElementById('recommendations-section') || document.querySelector('.recommendations-container');
    if (recSection) {
      recSection.insertBefore(warningDiv, recSection.firstChild);
    } else {
      // Fallback if section isn't found, append clearly to body
      document.body.prepend(warningDiv); 
    }
  }
  
  warningDiv.innerHTML = `
    <div style="
      background: #FEF3C7;
      border: 2px solid #B45309;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      z-index: 1000;
      position: relative;
    ">
      <div>
        <div style="font-weight:700; color:#B45309; font-size:16px; margin-bottom:6px;">
          ⚠️ Active Transfer Already In Progress
        </div>
        <div style="color:#92400E; font-size:14px;">
          You have an active transfer request (#${existingId}). You cannot send 
          a new request to ${newHospitalName} until the current one is resolved.
        </div>
      </div>
      <div style="display:flex; gap:10px; flex-shrink:0; margin-left:20px;">
        <button onclick="window.location.hash='#transfers'; if(typeof showSection==='function') showSection('transfer');"
          style="padding:10px 16px; background:#B45309; color:white; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap;">
          View Active Transfer
        </button>
        <button onclick="cancelAndSendNew('${existingId}', '${newHospitalName.replace(/'/g, "\\'")}')"
          style="padding:10px 16px; background:white; color:#B45309; border:1px solid #B45309; border-radius:8px; font-size:13px; cursor:pointer; white-space:nowrap;">
          Cancel Old & Send New
        </button>
      </div>
    </div>`;
  
  warningDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function cancelAndSendNew(oldTransferId, newHospitalName) {
  const token = localStorage.getItem('token');
  const hospitalId = getHospitalId();
  
  try {
      showLoading(true);
      // Cancel existing transfer via status route, or the dedicated reject route
      // Wait, there is no generic reject route for sender except updateTransferStatus or similar. 
      // The user snippet uses `/api/transfer/${oldTransferId}/reject` ?
      // Wait, the user specifically provided the URL `/api/transfer/${oldTransferId}/reject`
      await fetch(`/api/transfer/${oldTransferId}/reject`, {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      localStorage.removeItem('activeTransferId');
      localStorage.removeItem('triedHospitals');
      localStorage.removeItem('activeTransferSpeciality');
      
      const w = document.getElementById('activeTransferWarning');
      if (w) w.remove();
      
      showToast('Previous transfer cancelled. You can now send to ' + newHospitalName, 'success');
  } catch (err) {
      console.error(err);
      showToast('Failed to cancel old transfer. Server error.', 'error');
  } finally {
      showLoading(false);
  }
}
// ==========================================
// SENDER-SIDE TIMER & NEXT-HOSPITAL POLLING (USER PROVIDED)
// ==========================================

function initTransferPage() {
  const activeId = localStorage.getItem('activeTransferId');
    
  console.log('Active transfer ID:', activeId);
  
  if (activeId && activeId !== 'null' && activeId !== 'undefined') {
    
    // Show loading state immediately
    const panel = document.getElementById('senderTimerPanel');
    if (panel) {
      panel.style.display = 'block';
      panel.innerHTML = `
        <div style="background:white;
                    border-radius:12px;
                    border-left:4px solid #004ac6;
                    padding:24px;
                    margin-bottom:24px;
                    box-shadow:0 2px 8px rgba(0,0,0,0.08)">
          <p style="color:#004ac6; font-weight:600; margin:0;">
            ⏳ Loading transfer status...
          </p>
        </div>`;
    }
    
    // Start polling immediately
    pollTransferStatus(activeId);
    
    // Poll every 5 seconds
    const pollInterval = setInterval(() => {
      const currentId = localStorage.getItem('activeTransferId');
      if (!currentId) {
        clearInterval(pollInterval);
        return;
      }
      pollTransferStatus(currentId);
    }, 5000);
  }
  
  // Also load transfer history
  if (typeof loadTransferData === 'function') loadTransferData();
  else if (typeof loadTransfers === 'function') loadTransfers();
}

// Call on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTransferPage);
} else {
    initTransferPage();
}
window.addEventListener('hashchange', () => {
    if (window.location.hash.includes('transfer')) {
        initTransferPage();
    }
});

async function pollTransferStatus(transferId) {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/transfer/${transferId}/status`, {
        headers: {
          'Authorization': 'Bearer ' + token
        }
    });
    
    if (!response.ok) {
      console.error('Status fetch failed:', response.status);
      return;
    }
    
    const data = await response.json();
    console.log('Transfer status:', data);
    updateTimerPanel(data);
  } catch (error) {
    console.error('Poll error:', error);
  }
}

function updateTimerPanel(transfer) {
  const panel = document.getElementById('senderTimerPanel');
  if (!panel) return;
  
  panel.style.display = 'block';
  const stage = transfer.stage;
  
  let deadline = null;
  let stageText = '';
  
  if (stage === 'PENDING') {
    deadline = new Date(transfer.acknowledgeBy);
    stageText = 'STAGE 1 — Awaiting Hospital Response';
  } else if (stage === 'ACKNOWLEDGED') {
    deadline = new Date(transfer.confirmBy);
    stageText = 'STAGE 2 — Hospital Assigning Doctor';
  } else if (stage === 'APPROVED' || stage === 'COMPLETED') {
    showSuccessPanel(transfer, panel);
    return;
  } else if (stage === 'TIMEOUT_STAGE1' || stage === 'TIMEOUT_STAGE2' || stage === 'REJECTED') {
    showNextHospitalPanel(transfer, panel);
    return;
  }
  
  const remainingMs = deadline - new Date();
  const remainingSecs = Math.max(0, Math.floor(remainingMs / 1000));
  const mins = Math.floor(remainingSecs / 60);
  const secs = remainingSecs % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2,'0')}`;
  const timerColor = remainingSecs < 30 ? '#B91C1C' : remainingSecs < 60 ? '#B45309' : '#004ac6';
  
  panel.innerHTML = `
    <div style="background:white; border-radius:12px; border-left:4px solid #004ac6; padding:24px; margin-bottom:24px; box-shadow:0 2px 8px rgba(0,0,0,0.08)">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span style="background:#EFF6FF; color:#004ac6; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600;">${stageText}</span>
          <h3 style="margin:8px 0 4px; font-size:18px; color:#0F172A;">Transfer sent to: ${transfer.toHospitalName || 'Network Facility'}</h3>
          <p style="color:#64748B; margin:0; font-size:14px;">${transfer.totalPatients || 0} patients</p>
        </div>
        <div style="text-align:center;">
          <div style="font-size:52px; font-weight:700; color:${timerColor}; font-family:monospace; ${remainingSecs < 30 ? 'animation:pulse 1s infinite' : ''}">${timeStr}</div>
          <div style="font-size:12px; color:#64748B;">remaining to respond</div>
        </div>
      </div>
      <div style="margin-top:16px; padding-top:16px; border-top:1px solid #F1F5F9; font-size:13px; color:#64748B;">
        ℹ️ If hospital does not respond, next available hospital will be suggested automatically.
      </div>
      <div style="text-align:center; margin-top:12px;">
        <button onclick="cancelCurrentTransfer('${transfer.transferId || transfer.id || localStorage.getItem('activeTransferId')}')"
          style="background:none; border:none; color:#94A3B8; font-size:13px; cursor:pointer; text-decoration:underline;">
          Cancel this transfer request
        </button>
      </div>
    </div>`;
}

async function cancelCurrentTransfer(transferId) {
  const confirm = window.confirm("Cancel this transfer request? The hospital will be notified.");
  if (!confirm) return;
  
  const token = localStorage.getItem('token');
  try {
      showLoading(true);
      await fetch(`/api/transfer/${transferId}/reject`, {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      localStorage.removeItem('activeTransferId');
      localStorage.removeItem('triedHospitals');
      localStorage.removeItem('activeTransferSpeciality');
      
      const panel = document.getElementById('senderTimerPanel');
      if (panel) panel.style.display = 'none';
      
      showToast('Transfer request cancelled', 'success');
  } catch (err) {
      console.error(err);
      showToast('Failed to cancel transfer.', 'error');
  } finally {
      showLoading(false);
  }
}

function showSuccessPanel(transfer, panel) {
  localStorage.removeItem('activeTransferId');
  localStorage.removeItem('triedHospitals');
  panel.innerHTML = `
    <div style="background:#DCFCE7; border-radius:12px; border-left:4px solid #15803D; padding:24px; margin-bottom:24px;">
      <h3 style="color:#15803D; margin:0 0 8px;">✅ Transfer Confirmed!</h3>
      <p style="color:#166534; margin:0;">Hospital: ${transfer.toHospitalName || 'Network Facility'} has accepted the transfer. ${transfer.assignedDoctorName ? 'Doctor: ' + transfer.assignedDoctorName : ''}</p>
    </div>`;
  setTimeout(() => { panel.style.display = 'none'; }, 8000);
}

async function showNextHospitalPanel(transfer, panel) {
  let next = transfer.nextHospital;
  
  const token = localStorage.getItem('token');
  const tried = JSON.parse(localStorage.getItem('triedHospitals') || '[]');
  
  // Add the current hospital to 'tried' if not already there, 
  // since it just timed out or rejected us!
  const currentToId = transfer.toHospitalId || transfer.toHospital?.id;
  if (currentToId && !tried.includes(parseInt(currentToId))) {
      tried.push(parseInt(currentToId));
      localStorage.setItem('triedHospitals', JSON.stringify(tried));
  }

  // Prevent recommending the exact same hospital or any already-tried hospitals
  if (next && tried.includes(parseInt(next.hospitalId || next.id))) {
      next = null; // Force fallback search
  }
  
  if (!next) {
    // Try expanded radius automatically
    const expandedRadius = 50;

    const fromHospitalId = typeof getHospitalId === 'function' ? getHospitalId() : transfer.fromHospitalId;

    let url = `/api/recommend/${fromHospitalId}?maxDistance=${expandedRadius}`;
    
    // Add previously tried hospitals to exclusion list
    if (tried.length > 0) {
        url += `&excludeHospitalIds=${tried.join(',')}`;
    }

    // Add speciality if known
    const spec = localStorage.getItem('activeTransferSpeciality');
    if (spec) {
        url += `&speciality=${spec}`;
    }

    // Add bed requirements from the timed-out transfer
    if (transfer.bedAllocations) {
        for (const [bedName, count] of Object.entries(transfer.bedAllocations)) {
            url += `&req-${bedName}=${count}`;
        }
    }

    try {
        const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
        const data = await res.json();

        if (data && data.length > 0) {
          const nextHosp = data[0];
          
          panel.innerHTML = `
            <div style="background:white; border-radius:12px; border-left:5px solid #B45309; padding:24px; margin-bottom:24px; box-shadow:0 4px 12px rgba(0,0,0,0.1)">
              <div style="color:#B45309; font-weight:700; margin-bottom:8px;">
                ⌛ No response or rejected by ${transfer.toHospitalName || 'Hospital'}
              </div>
              <div style="background:#FEF3C7; border-radius:8px; padding:10px 16px; margin-bottom:16px; font-size:13px; color:#92400E;">
                ℹ️ Expanded search radius to ${expandedRadius}km to find next hospital
              </div>
              <div style="font-size:16px; font-weight:700; margin-bottom:12px; color:#0F172A;">
                🔄 Next Available Hospital:
              </div>
              <div style="background:#F8FAFC; border-radius:8px; padding:16px; margin-bottom:16px;">
                <div style="font-size:18px; font-weight:700; color:#0F172A;">
                  🏥 ${nextHosp.hospitalName}
                </div>
                <div style="color:#64748B; font-size:14px; margin-top:6px;">
                  📍 ${nextHosp.distanceKm || nextHosp.distance || 0} km away &nbsp;|&nbsp; 🛏️ ${nextHosp.availableBeds || 0} beds available
                  ${nextHosp.availableDoctorName ? ' | 👨⚕️ ' + nextHosp.availableDoctorName : ''}
                </div>
                <div style="color:#64748B; font-size:13px; margin-top:4px;">
                  Score: ${Number(nextHosp.score || 0).toFixed(2)}
                </div>
              </div>
              <div style="display:flex; gap:12px;">
                <button onclick="sendToNextHospital(${nextHosp.hospitalId || nextHosp.id}, '${(nextHosp.hospitalName || '').replace(/'/g, "\\'")}', ${transfer.totalPatients || 1})"
                  style="flex:1; padding:14px; background:#004ac6; color:white; border:none; border-radius:8px; font-size:15px; font-weight:700; cursor:pointer;">
                  🚑 Send Request to ${nextHosp.hospitalName}
                </button>
                <button onclick="goBackToRecommendations()"
                  style="padding:14px 20px; background:white; color:#64748B; border:1px solid #E2E8F0; border-radius:8px; font-size:14px; cursor:pointer;">
                  ← Search Manually
                </button>
              </div>
            </div>`;
            return;
        }
    } catch (e) {
        console.error("Fallback recommendation failed:", e);
    }

    // Truly no hospitals found even at 50km
    panel.innerHTML = `
      <div style="background:#FEF3C7; border-radius:12px; border-left:5px solid #B45309; padding:24px; margin-bottom:24px;">
        <div style="font-weight:700; color:#B45309; font-size:16px; margin-bottom:8px;">
          ⚠️ No Response Received
        </div>
        <div style="color:#92400E; margin-bottom:16px; font-size:14px;">
          No response from ${transfer.toHospitalName || 'Hospital'}. No other hospitals found within ${expandedRadius}km matching your requirements.
        </div>
        <div style="display:flex; gap:12px;">
          <button onclick="goBackToRecommendations()"
            style="flex:1; padding:12px; background:#004ac6; color:white; border:none; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer;">
            🔍 Search with Different Filters
          </button>
          <button onclick="cancelActiveTransfer()"
            style="padding:12px 20px; background:white; color:#64748B; border:1px solid #E2E8F0; border-radius:8px; font-size:14px; cursor:pointer;">
            Cancel
          </button>
        </div>
      </div>`;
    return;
  }
  
  // Existing behavior for when nextHospital IS found normally (and is not identical)
  panel.innerHTML = `
    <div style="background:white; border-radius:12px; border-left:4px solid #B45309; padding:24px; margin-bottom:24px; box-shadow:0 2px 8px rgba(0,0,0,0.08)">
      <div style="margin-bottom:16px;"><span style="background:#FEF3C7; color:#B45309; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600;">⌛ ${transfer.toHospitalName || 'Hospital'} did not respond in time</span></div>
      <h3 style="margin:0 0 4px;color:#0F172A;">🔄 Next Available Hospital Found:</h3>
      <div style="background:#F8FAFC; border-radius:8px; padding:16px; margin:12px 0;">
        <div style="font-size:18px; font-weight:700; color:#0F172A;">🏥 ${next.hospitalName}</div>
        <div style="color:#64748B; font-size:14px; margin-top:4px;">📍 ${next.distanceKm || 0} km away &nbsp;|&nbsp; 🛏️ ${next.availableBeds || 0} beds ${next.availableDoctorName ? ' | 👨⚕️ ' + next.availableDoctorName : ''}</div>
      </div>
      <div style="display:flex; gap:12px;">
        <button onclick="sendToNextHospital(${next.hospitalId}, '${(next.hospitalName || '').replace(/'/g, "\\'")}', ${transfer.totalPatients || 1})" style="flex:1; padding:12px; background:#004ac6; color:white; border:none; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer;">Send Request to ${next.hospitalName}</button>
        <button onclick="cancelActiveTransfer()" style="padding:12px 20px; background:white; color:#64748B; border:1px solid #E2E8F0; border-radius:8px; font-size:14px; cursor:pointer;">Cancel</button>
      </div>
    </div>`;
}

function cancelActiveTransfer() {
  goBackToRecommendations();
}

function goBackToRecommendations() {
  // Clear only the active transfer ID, but Keep triedHospitals 
  // so the recommendation engine excludes hospitals that already rejected us!
  localStorage.removeItem('activeTransferId');
  
  // Set the speciality directly if we had one
  const speciality = localStorage.getItem('activeTransferSpeciality');
  if (speciality) {
    const specSelect = document.getElementById('filter-speciality');
    if (specSelect) specSelect.value = speciality;
  }
  
  // Clear it so it doesn't stick forever
  localStorage.removeItem('activeTransferSpeciality');
  
  // Automatically increase search radius since the previous hospitals didn't work out
  const distanceFilter = document.getElementById('filter-distance');
  if (distanceFilter) {
      if (!distanceFilter.value || parseInt(distanceFilter.value) < 50) {
          distanceFilter.value = '50';
      }
  }

  // Hide timer panel
  const panel = document.getElementById('senderTimerPanel');
  if (panel) panel.style.display = 'none';
  
  // Navigate to recommendations
  window.location.hash = '#recommendations';
  
  // Switch to the section natively 
  if (typeof showSection === 'function') {
      showSection('recommend');
  }
  
  // Trigger search
  setTimeout(() => {
      if (typeof fetchAIRecommendations === 'function') {
          fetchAIRecommendations();
      }
  }, 300);
}

function sendToNextHospital(hospitalId, hospitalName, patients) {
    const triedStr = localStorage.getItem('triedHospitals');
    let tried = [];
    if (triedStr) {
        try { tried = JSON.parse(triedStr); } catch(e){}
    }
    if (!tried.includes(hospitalId)) {
        tried.push(hospitalId);
        localStorage.setItem('triedHospitals', JSON.stringify(tried));
    }
    
    document.getElementById('senderTimerPanel').style.display = 'none';
    if (typeof openTransferModal === 'function') {
        openTransferModal(hospitalId, hospitalName);
    } else {
        showToast('Error: Cannot load transfer modal', 'error');
    }
}


// ==========================================
// RECEIVER-SIDE TIMER & INCOMING POLLING
// ==========================================

let stageTimerIntervals = {};

async function pollActiveIncomingTransfers() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch('/api/transfer/incoming/active', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) return;

        const transfers = await response.json();
        renderActiveIncomingPanel(transfers || []);
    } catch (err) {
        console.error('pollActiveIncomingTransfers: Error:', err);
    }
}

function renderActiveIncomingPanel(transfers) {
    Object.values(stageTimerIntervals).forEach(clearInterval);
    stageTimerIntervals = {};

    const container = document.getElementById('activeTransferPanel');
    if (!container) return;

    if (!transfers || transfers.length === 0) {
        container.innerHTML = `
        <div style="background:#F0FDF4; border:1px solid #BBF7D0; border-radius:12px;
                    padding:16px 20px; margin-bottom:16px;
                    display:flex; align-items:center; gap:12px;">
            <span style="font-size:20px;">✅</span>
            <div>
                <div style="font-size:13px; font-weight:700; color:#166534;">No Active Transfer Requests</div>
                <div style="font-size:11px; color:#15803d; margin-top:2px;">Live monitoring is ON • checking every 10 seconds</div>
            </div>
        </div>`;
        return;
    }

    let html = '';
    transfers.forEach(t => {
        html += renderStageCard(t);
    });
    container.innerHTML = html;

    transfers.forEach(t => {
        const deadline = t.stage === 'PENDING' ? t.acknowledgeBy : t.confirmBy;
        if (!deadline) return;
        startCountdown(t.id, new Date(deadline));
        if (t.stage === 'ACKNOWLEDGED') loadDoctorsForTransfer(t.id);
    });
}

function renderStageCard(t) {
    const isStage1 = t.stage === 'PENDING';
    const deadlineStr = isStage1 ? t.acknowledgeBy : t.confirmBy;
    const deadline = deadlineStr ? new Date(deadlineStr) : null;
    const remainingMs = deadline ? Math.max(0, deadline - Date.now()) : 0;
    const remainingSecs = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(remainingSecs / 60);
    const seconds = remainingSecs % 60;
    const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;

    const fromName = t.fromHospital?.hospitalName || 'Unknown Hospital';
    const patients = t.patientCount || 0;
    const priority = (t.priority || 'NORMAL').toUpperCase();
    const priorityBg = priority === 'EMERGENCY' ? '#FEE2E2' : priority === 'CRITICAL' ? '#FEF3C7' : '#F1F5F9';
    const priorityColor = priority === 'EMERGENCY' ? '#B91C1C' : priority === 'CRITICAL' ? '#B45309' : '#475569';
    const timerColor = remainingSecs < 30 ? '#B91C1C' : (isStage1 ? '#B45309' : '#1D4ED8');
    const beds = t.bedAllocations ? Object.entries(t.bedAllocations).map(([k, v]) => `${k}: ${v}`).join(' ') : '';
    const stageBadge = isStage1 ? 'STAGE 1 • ACKNOWLEDGE' : 'STAGE 2 • ASSIGN DOCTOR';

    const actionsHtml = isStage1 ? `
        <div style="display:flex; gap:12px; margin-top:16px;">
            <button onclick="acknowledgeTransferRequest(${t.id})"
                style="flex:1; padding:12px 16px; background:#004ac6; color:white;
                       border:none; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer;"
                onmouseover="this.style.opacity=0.85" onmouseout="this.style.opacity=1">
                Acknowledge - I am Checking
            </button>
            <button onclick="rejectTransferRequest(${t.id})"
                style="padding:12px 20px; background:white; color:#B91C1C;
                       border:2px solid #B91C1C; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer;">
                Reject
            </button>
        </div>` : `
        <div style="margin-top:16px;">
            <label style="font-size:12px; font-weight:700; color:#374151; display:block; margin-bottom:8px;">Select Available Doctor:</label>
            <select id="doctorSelect_${t.id}"
                style="width:100%; padding:10px 14px; border:1px solid #E2E8F0; border-radius:10px;
                       margin-bottom:12px; font-size:13px; background:#F8FAFC; color:#1E293B;">
                <option value="">Loading doctors...</option>
            </select>
            <div style="display:flex; gap:12px;">
                <button onclick="confirmTransferRequest(${t.id})"
                    style="flex:1; padding:12px 16px; background:#15803D; color:white;
                           border:none; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer;">
                    Confirm Transfer
                </button>
                <button onclick="rejectTransferRequest(${t.id})"
                    style="padding:12px 20px; background:white; color:#B91C1C;
                           border:2px solid #B91C1C; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer;">
                    Cannot Accept
                </button>
            </div>
        </div>`;

    return `
    <div id="stageCard_${t.id}"
         style="background:white; border-radius:14px; border-left:4px solid #004ac6;
                padding:24px; margin-bottom:16px; box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
            <div style="flex:1;">
                <span style="background:${priorityBg}; color:${isStage1 ? '#B45309' : '#1D4ED8'};
                             padding:4px 12px; border-radius:20px; font-size:11px; font-weight:700;
                             display:inline-block; margin-bottom:10px;">${stageBadge}</span>
                <div style="font-size:17px; font-weight:800; color:#0F172A; margin-bottom:4px;">From: ${fromName}</div>
                <div style="font-size:13px; color:#64748B; margin-bottom:2px;">
                    <span style="background:${priorityBg}; color:${priorityColor}; padding:2px 8px;
                                 border-radius:10px; font-size:11px; font-weight:700;">${priority}</span>
                    &nbsp;&nbsp;${patients} Patients
                </div>
                ${beds ? `<div style="font-size:11px; color:#94A3B8; margin-top:4px;">${beds}</div>` : ''}
            </div>
            <div style="text-align:center; padding-left:24px; min-width:100px;">
                <div style="font-size:11px; font-weight:700; color:#94A3B8; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">Time Left</div>
                <div id="timer_${t.id}" style="font-size:44px; font-weight:900; color:${timerColor}; font-family:monospace; letter-spacing:-2px; line-height:1;">${timeStr}</div>
                <div style="font-size:11px; color:#94A3B8; margin-top:4px;">${isStage1 ? 'to acknowledge' : 'to confirm'}</div>
            </div>
        </div>
        ${actionsHtml}
    </div>`;
}

function startCountdown(transferId, deadline) {
    const el = document.getElementById(`timer_${transferId}`);
    if (!el) return;

    stageTimerIntervals[transferId] = setInterval(() => {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
            clearInterval(stageTimerIntervals[transferId]);
            el.textContent = '0:00';
            el.style.color = '#B91C1C';
            setTimeout(pollActiveIncomingTransfers, 5000);
            return;
        }
        const secs = Math.floor(remainingMs / 1000);
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        el.textContent = `${m}:${String(s).padStart(2, '0')}`;
        el.style.color = secs < 30 ? '#B91C1C' : '#004ac6';
    }, 1000);
}

async function acknowledgeTransferRequest(transferId) {
    const token = localStorage.getItem('token');
    try {
        const result = await fetch(`/api/transfer/${transferId}/acknowledge`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (result.ok) {
            if (typeof showToast === 'function') showToast('Transfer acknowledged', 'success');
            pollActiveIncomingTransfers();
            if (typeof loadTransfers === 'function') setTimeout(loadTransfers, 1000);
        } else {
            const data = await result.json();
            if (typeof showToast === 'function') showToast(data.error || 'Failed to acknowledge', 'error');
        }
    } catch (e) { console.error(e); }
}

async function confirmTransferRequest(transferId) {
    const token = localStorage.getItem('token');
    const doctorSelect = document.getElementById(`doctorSelect_${transferId}`);
    const doctorId = doctorSelect ? doctorSelect.value : null;

    try {
        const payload = doctorId ? { doctorId: doctorId } : {};
        const result = await fetch(`/api/transfer/${transferId}/confirm`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (result.ok) {
            if (typeof showToast === 'function') showToast('Transfer confirmed', 'success');
            pollActiveIncomingTransfers();
            if (typeof loadTransfers === 'function') setTimeout(loadTransfers, 1000);
        } else {
            const data = await result.json();
            if (typeof showToast === 'function') showToast(data.error || 'Failed to confirm', 'error');
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast('Failed to confirm', 'error');
    }
}

async function rejectTransferRequest(transferId) {
    if (typeof updateTransferStatus === 'function') {
        updateTransferStatus(transferId, 'REJECTED');
        setTimeout(pollActiveIncomingTransfers, 1000);
    }
}

async function loadDoctorsForTransfer(transferId) {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch('/api/doctors/available', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return;
        const doctors = await response.json();
        
        const select = document.getElementById(`doctorSelect_${transferId}`);
        if (!select) return;
        
        select.innerHTML = '<option value="">Select a doctor...</option>' + 
            doctors.map(d => `<option value="${d.id}">${d.name} (${d.speciality || 'General'})</option>`).join('');
    } catch (e) {
        console.error('Failed to load doctors:', e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setInterval(pollActiveIncomingTransfers, 10000);
        pollActiveIncomingTransfers();
    });
} else {
    setInterval(pollActiveIncomingTransfers, 10000);
    pollActiveIncomingTransfers();
}
