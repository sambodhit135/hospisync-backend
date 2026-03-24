import codecs

file_path = 'src/main/resources/static/js/transfer.js'

receiver_logic = """

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
    try {
        const response = await fetch('/api/doctors/available');
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
"""

with codecs.open(file_path, 'a', encoding='utf-8') as f:
    f.write(receiver_logic)

print("Safely appended receiver timer logic")
