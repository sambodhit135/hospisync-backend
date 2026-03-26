// patient-admissions.js

document.addEventListener('DOMContentLoaded', () => {
    // Initial fetch
    fetchPatientAdmissions();
    
    // Auto-poll for the badge every 30 seconds
    setInterval(pollPatientAdmissionsBadge, 30000);
    pollPatientAdmissionsBadge();
});

async function pollPatientAdmissionsBadge() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const res = await fetch('/api/patient/incoming', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) return;
        const requests = await res.json();
        
        // Count only pending requests
        const pendingCount = requests.filter(r => r.status === 'PENDING').length;
        
        const badge = document.getElementById('patientAdmissionsBadge');
        if (badge) {
            if (pendingCount > 0) {
                badge.innerText = pendingCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (e) {
        console.error('Error polling admissions badge:', e);
    }
}

// PATIENT BOOKING FLOW REMOVED.
// KEPT FOR FUTURE REFERENCE.
async function fetchPatientAdmissions() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const res = await fetch('/api/patient/incoming', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (!res.ok) {
            document.getElementById('admissionsRequestsContainer').innerHTML = `
                <div class="p-8 text-center bg-white rounded-xl border border-slate-100 text-error font-bold">Failed to load admission requests.</div>
            `;
            return;
        }

        const data = await res.json();
        
        // Process Stats
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        console.log('DEBUG: Now:', now, 'Start of Today:', startOfToday);
        
        const requestsToday = data.filter(r => {
            if (!r.createdAt) return false;
            const d = new Date(r.createdAt);
            const isToday = d >= startOfToday;
            console.log(`DEBUG: Req #${r.id} createdAt: ${r.createdAt} parsed: ${d.toDateString()} isToday: ${isToday}`);
            return isToday;
        });
        
        const totalToday = requestsToday.length;
        const pendingCount = data.filter(r => r.status === 'PENDING').length;
        const confirmedToday = requestsToday.filter(r => r.status === 'CONFIRMED').length;
        const declinedToday = requestsToday.filter(r => r.status === 'REJECTED').length;

        document.getElementById('admStatsTotal').innerText = totalToday;
        document.getElementById('admStatsPending').innerText = pendingCount;
        document.getElementById('admStatsConfirmed').innerText = confirmedToday;
        document.getElementById('admStatsDeclined').innerText = declinedToday;

        // Render Sections
        const pendingRequests = data.filter(r => r.status === 'PENDING');
        const historyRequests = data.filter(r => r.status !== 'PENDING').sort((a,b) => b.id - a.id);
        
        const activeContainer = document.getElementById('admissionsRequestsContainer');
        const historyContainer = document.getElementById('admissionsHistoryContainer');
        const historyHeader = document.getElementById('admHistoryHeader');
        
        // 1. Render Active
        if (activeContainer) {
            if (pendingRequests.length === 0) {
                // ... (empty state)
                activeContainer.innerHTML = `
                    <div class="p-12 text-center bg-white rounded-xl border border-slate-100 shadow-sm relative overflow-hidden">
                        <span class="material-symbols-outlined text-5xl text-slate-200 mb-4">inbox</span>
                        <h3 class="text-lg font-bold text-slate-900 mb-2">no request is coming</h3>
                        <p class="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                            When patients submit requests from the public portal, they appear here. 
                        </p>
                    </div>
                `;
            } else {
                const now = new Date();
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                
                const groups = { today: [], yesterday: [], earlier: [] };
                pendingRequests.forEach(req => {
                    const date = new Date(req.createdAt);
                    if (date.toDateString() === now.toDateString()) groups.today.push(req);
                    else if (date.toDateString() === yesterday.toDateString()) groups.yesterday.push(req);
                    else groups.earlier.push(req);
                });

                const renderGroup = (label, requests) => {
                    if (requests.length === 0) return '';
                    let html = `<div class="mt-4 mb-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <span class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></span>
                        ${label}
                    </div>`;
                    requests.forEach(req => html += buildRequestCard(req, true));
                    return html;
                };

                activeContainer.innerHTML = 
                    renderGroup('Coming in Today', groups.today) +
                    renderGroup('Coming in Yesterday', groups.yesterday) +
                    renderGroup('Earlier History', groups.earlier);
            }
        }

        // 2. Render History
        if (historyContainer) {
            if (historyRequests.length > 0) {
                if (historyHeader) historyHeader.style.display = 'block';
                
                const now = new Date();
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                
                const groups = {
                    today: [],
                    yesterday: [],
                    earlier: []
                };
                
                historyRequests.forEach(req => {
                    const date = new Date(req.createdAt);
                    if (date.toDateString() === now.toDateString()) groups.today.push(req);
                    else if (date.toDateString() === yesterday.toDateString()) groups.yesterday.push(req);
                    else groups.earlier.push(req);
                });
                
                const renderGroup = (label, requests) => {
                    if (requests.length === 0) return '';
                    let html = `<div class="mt-8 mb-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <span class="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
                        ${label}
                    </div>`;
                    requests.forEach(req => {
                        html += buildRequestCard(req, false);
                    });
                    return html;
                };
                
                historyContainer.innerHTML = 
                    renderGroup('Coming in Today', groups.today) +
                    renderGroup('Coming in Yesterday', groups.yesterday) +
                    renderGroup('Earlier History', groups.earlier);
            } else {
                if (historyHeader) historyHeader.style.display = 'none';
                historyContainer.innerHTML = '';
            }
        }

        // Update badge
        const badge = document.getElementById('patientAdmissionsBadge');
        if (badge) {
            if (pendingCount > 0) {
                badge.innerText = pendingCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

    } catch (e) {
        console.error('Error fetching patient admissions:', e);
    }
}

function buildRequestCard(req, isActionable) {
    let urgencyColor = 'border-slate-300';
    let urgencyDot = 'text-slate-500';
    
    if (req.urgencyLevel === 'TODAY') {
        urgencyColor = 'border-error';
        urgencyDot = 'text-error';
    } else if (req.urgencyLevel === 'THIS_WEEK') {
        urgencyColor = 'border-amber-500';
        urgencyDot = 'text-amber-500';
    }

    // Time & Status Logic
    const timestamp = req.createdAt ? formatDate(req.createdAt) : '';
    const timeBadge = timestamp ? `<span class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50/50 border border-indigo-100/50 text-[10px] text-indigo-600 font-bold uppercase tracking-wider"><span class="material-symbols-outlined text-[12px]">schedule</span> ${timestamp}</span>` : '';
    
    let statusBadge = '';
    if (!isActionable) {
        let bgStyle = 'bg-slate-100 text-slate-600';
        let label = req.status;

        if (req.status === 'CONFIRMED') {
            bgStyle = 'bg-green-100 text-green-700';
            label = 'Accepted';
        } else if (req.status === 'REJECTED') {
            bgStyle = 'bg-red-100 text-red-700';
            label = 'Rejected';
        } else if (req.status === 'TIMEOUT') {
            bgStyle = 'bg-amber-100 text-amber-700';
            label = 'System Timeout';
        } else if (req.status === 'CANCELLED') {
            bgStyle = 'bg-slate-100 text-slate-500';
            label = 'Cancelled by Patient';
        } else if (req.status === 'NO_HOSPITAL_AVAILABLE') {
            bgStyle = 'bg-slate-100 text-slate-600';
            label = 'No Hospital Found';
        }

        statusBadge = `
            <div class="flex items-center gap-2">
                ${timeBadge}
                <span class="px-2.5 py-1 ${bgStyle} rounded-full text-[10px] font-black uppercase tracking-wider">${label}</span>
            </div>
        `;
    } else {
        // For actionable (pending), just show the time badge
        statusBadge = timeBadge;
    }

    // Expiration / Extra Info / Time Created
    let footerInfo = '';
    if (isActionable && req.expiresAt) {
        const expires = new Date(req.expiresAt);
        const now = new Date();
        const diffSec = Math.floor((expires - now) / 1000);
        if (diffSec > 0) {
            const mins = Math.floor(diffSec / 60);
            const secs = diffSec % 60;
            footerInfo = `<div class="flex flex-col gap-1 mt-6">
                <span class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Expires in</span>
                <span class="font-black text-slate-700 font-mono tracking-tight">${mins}:${secs < 10 ? '0' : ''}${secs}</span>
            </div>`;
        } else {
            footerInfo = `<div class="text-[10px] text-error font-bold uppercase tracking-widest mt-6">Expired</div>`;
        }
    } else if (!isActionable) {
        if (req.status === 'CONFIRMED' && req.assignedDoctorName) {
            footerInfo = `<div class="mt-4 pt-4 border-t border-slate-100">
                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Assigned Physician</p>
                <p class="text-sm font-bold text-slate-700 mt-1">Dr. ${req.assignedDoctorName} (${req.assignedDoctorSpeciality})</p>
            </div>`;
        } else {
            footerInfo = `<div class="mt-4 pt-4 border-t border-slate-100 italic text-[11px] text-slate-400">Request processed</div>`;
        }
    }

    const actionHtml = isActionable ? `
        <div class="flex flex-col gap-3 min-w-[200px]" id="actions-${req.id}">
            <button onclick="showConfirmDoctorSelect(${req.id})" class="flex items-center justify-center gap-2 w-full py-3 bg-green-600 text-white font-black rounded-lg hover:bg-green-700 transition-colors shadow-sm shadow-green-600/20">
                <span class="material-symbols-outlined text-base">check_circle</span> Confirm
            </button>
            <button onclick="declinePatientRequest(${req.id})" class="flex items-center justify-center gap-2 w-full py-3 bg-white border border-error/30 text-error font-bold rounded-lg hover:bg-error/5 transition-colors">
                <span class="material-symbols-outlined text-base">close</span> Decline
            </button>
        </div>
    ` : '';

    return `
        <div class="bg-white p-6 rounded-xl border border-slate-100 border-l-4 ${urgencyColor} shadow-sm relative overflow-hidden flex flex-col md:flex-row md:items-center gap-6 group hover:shadow-md transition-shadow ${!isActionable ? 'opacity-85' : ''}">
            
            <div class="flex-1">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        ${req.patientName} | Age: ${req.patientAge} | ${statusBadge}
                    </h3>
                    <div class="text-sm font-bold text-slate-500 mt-1">
                        📞 ${req.patientPhone || 'Not provided'}
                    </div>
                </div>
                
                <div class="flex flex-wrap items-center gap-4 text-sm font-bold text-slate-600 mb-4">
                    <span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md text-[10px] uppercase font-black tracking-widest border border-indigo-100">Request ID: #${req.requestId || req.id}</span>
                    <span class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-100 text-[10px] uppercase tracking-widest">
                        <span class="${urgencyDot} text-base material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">circle</span> ${req.urgencyLevel.replace('_', ' ')}
                    </span>
                </div>
                
                <div class="bg-slate-50 p-4 rounded-lg flex items-start gap-3">
                    <span class="material-symbols-outlined text-slate-400 text-lg mt-0.5">medical_information</span>
                    <div>
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Speciality Required: <span class="text-slate-700">${req.specialityNeeded}</span></p>
                        <p class="text-sm font-medium text-slate-700 mt-1 italic">"${req.conditionDescription}"</p>
                        ${req.preferredArrivalTime ? `<p class="text-[11px] text-slate-500 mt-2 font-medium">⏰ Prefers to visit: <span class="text-slate-700 font-bold">${req.preferredArrivalTime}</span></p>` : ''}
                    </div>
                </div>
                
                ${footerInfo}
            </div>

            ${actionHtml}

        </div>
    `;
}

// Action Handlers
async function showConfirmDoctorSelect(requestId) {
    const actionsDiv = document.getElementById(`actions-${requestId}`);
    const originalHtml = actionsDiv.innerHTML;
    
    actionsDiv.innerHTML = `
        <div class="w-full text-center">
            <span class="material-symbols-outlined animate-spin text-slate-400">autorenew</span>
            <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">Finding available doctors...</p>
        </div>
    `;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/doctors/available', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (!res.ok) throw new Error('Failed to load doctors');
        const doctors = await res.json();
        
        if (doctors.length === 0) {
            actionsDiv.innerHTML = `
                <div class="text-center p-3 bg-error/10 text-error rounded-lg">
                    <p class="text-xs font-bold mb-2">No doctors available</p>
                    <button onclick="document.getElementById('actions-${requestId}').innerHTML = \`${originalHtml.replace(/"/g, '&quot;')}\`" class="text-[10px] underline uppercase tracking-widest">Cancel</button>
                </div>
            `;
            return;
        }

        let optionsHtml = '<option value="">Select an available doctor...</option>';
        doctors.forEach(doc => {
            const availabilityText = doc.availabilityType === 'ON_CALL' ? ' (On Call)' : '';
            optionsHtml += `<option value="${doc.id}">Dr. ${doc.name} — ${doc.speciality}${availabilityText}</option>`;
        });

        actionsDiv.innerHTML = `
            <div class="flex flex-col gap-2">
                <label class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Assign Doctor</label>
                <select id="docSelect-${requestId}" class="w-full bg-slate-50 border border-slate-200 rounded-lg py-3 px-3 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-green-500/20">
                    ${optionsHtml}
                </select>
                <div class="flex gap-2 mt-2">
                    <button onclick="document.getElementById('actions-${requestId}').innerHTML = \`${originalHtml.replace(/"/g, '&quot;')}\`" class="flex-1 py-2 bg-slate-100 text-slate-500 font-bold rounded-lg text-xs hover:bg-slate-200">Cancel</button>
                    <button onclick="executeConfirmPatient(${requestId})" class="flex-2 py-2 bg-green-600 text-white font-black rounded-lg shadow-sm shadow-green-600/20 hover:bg-green-700 text-xs">Assign & Confirm</button>
                </div>
            </div>
        `;
    } catch (e) {
        actionsDiv.innerHTML = `<div class="text-xs text-error font-bold">Error loading doctors. <button onclick="fetchPatientAdmissions()" class="underline">Retry</button></div>`;
    }
}

// PATIENT BOOKING FLOW REMOVED.
// KEPT FOR FUTURE REFERENCE.
async function executeConfirmPatient(requestId) {
    const docId = document.getElementById(`docSelect-${requestId}`).value;
    if (!docId) {
        alert('Please select a doctor to assign before confirming.');
        return;
    }

    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`/api/patient/request/${requestId}/confirm?doctorId=${docId}`, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (res.ok) {
            fetchPatientAdmissions();
        } else {
            alert('Failed to confirm request.');
        }
    } catch (e) {
        console.error('Confirm error:', e);
        alert('An error occurred.');
    }
}

// PATIENT BOOKING FLOW REMOVED.
// KEPT FOR FUTURE REFERENCE.
async function declinePatientRequest(requestId) {
    if (!confirm('Are you sure you want to decline this patient request?')) {
        return;
    }

    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`/api/patient/request/${requestId}/reject`, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (res.ok) {
            fetchPatientAdmissions();
        } else {
            alert('Failed to decline request.');
        }
    } catch (e) {
        console.error('Decline error:', e);
        alert('An error occurred.');
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = date.toDateString() === now.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
    const timeStr = date.toLocaleTimeString([], timeOptions);

    if (isToday) {
        return `Today, ${timeStr}`;
    } else if (isYesterday) {
        return `Yesterday, ${timeStr}`;
    } else {
        const dateOptions = { day: '2-digit', month: 'short' };
        return `${date.toLocaleDateString([], dateOptions)}, ${timeStr}`;
    }
}
