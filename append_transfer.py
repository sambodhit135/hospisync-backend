import codecs

file_path = 'src/main/resources/static/js/transfer.js'

user_logic = """

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
    </div>`;
}

function showSuccessPanel(transfer, panel) {
  localStorage.removeItem('activeTransferId');
  panel.innerHTML = `
    <div style="background:#DCFCE7; border-radius:12px; border-left:4px solid #15803D; padding:24px; margin-bottom:24px;">
      <h3 style="color:#15803D; margin:0 0 8px;">✅ Transfer Confirmed!</h3>
      <p style="color:#166534; margin:0;">Hospital: ${transfer.toHospitalName || 'Network Facility'} has accepted the transfer. ${transfer.assignedDoctorName ? 'Doctor: ' + transfer.assignedDoctorName : ''}</p>
    </div>`;
  setTimeout(() => { panel.style.display = 'none'; }, 8000);
}

function showNextHospitalPanel(transfer, panel) {
  const next = transfer.nextHospital;
  if (!next) {
    panel.innerHTML = `
      <div style="background:#FEF3C7; border-radius:12px; border-left:4px solid #B45309; padding:24px; margin-bottom:24px;">
        <h3 style="color:#B45309; margin:0 0 8px;">⚠️ No Response Received</h3>
        <p style="color:#92400E; margin:0;">${transfer.toHospitalName || 'Hospital'} did not respond. No other hospitals available nearby. Please try increasing search radius.</p>
      </div>`;
    return;
  }
  
  panel.innerHTML = `
    <div style="background:white; border-radius:12px; border-left:4px solid #B45309; padding:24px; margin-bottom:24px; box-shadow:0 2px 8px rgba(0,0,0,0.08)">
      <div style="margin-bottom:16px;"><span style="background:#FEF3C7; color:#B45309; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600;">⌛ ${transfer.toHospitalName || 'Hospital'} did not respond</span></div>
      <h3 style="margin:0 0 4px;color:#0F172A;">🔄 Next Available Hospital Found:</h3>
      <div style="background:#F8FAFC; border-radius:8px; padding:16px; margin:12px 0;">
        <div style="font-size:18px; font-weight:700; color:#0F172A;">🏥 ${next.hospitalName}</div>
        <div style="color:#64748B; font-size:14px; margin-top:4px;">📍 ${next.distanceKm || 0} km away &nbsp;|&nbsp; 🛏️ ${next.availableBeds || 0} beds ${next.availableDoctorName ? ' | 👨⚕️ ' + next.availableDoctorName : ''}</div>
      </div>
      <div style="display:flex; gap:12px;">
        <button onclick="sendToNextHospital(${next.hospitalId}, '${next.hospitalName || 'Next Hospital'}', ${transfer.totalPatients || 1})" style="flex:1; padding:12px; background:#004ac6; color:white; border:none; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer;">Send Request to ${next.hospitalName}</button>
        <button onclick="cancelActiveTransfer()" style="padding:12px 20px; background:white; color:#64748B; border:1px solid #E2E8F0; border-radius:8px; font-size:14px; cursor:pointer;">Cancel</button>
      </div>
    </div>`;
}

function cancelActiveTransfer() {
  localStorage.removeItem('activeTransferId');
  document.getElementById('senderTimerPanel').style.display = 'none';
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
"""

with codecs.open(file_path, 'a', encoding='utf-8') as f:
    f.write(user_logic)
print("Safely appended user timer panel logic to transfer.js")
