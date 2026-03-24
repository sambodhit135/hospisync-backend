import codecs

sender_code = """
// ==========================================
// SENDER-SIDE TIMER & NEXT-HOSPITAL POLLING
// ==========================================

let senderPollInterval = null;
let senderTimerEnd = null;
let senderCountdownInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    // Feature 2: If we just initiated a transfer, show timer panel automatically
    const activeTransferId = localStorage.getItem('activeTransferId');
    const urlParams = new URLSearchParams(window.location.search);
    
    if (activeTransferId && (urlParams.get('showTimer') === 'true' || window.location.pathname.includes('dashboard') || window.location.pathname.includes('transfer'))) {
        startSenderPolling(activeTransferId);
    }
});

function startSenderPolling(transferId) {
    if (senderPollInterval) clearInterval(senderPollInterval);
    
    // Immediate first fetch
    fetchSenderTransferStatus(transferId);
    
    // Poll every 5 seconds
    senderPollInterval = setInterval(() => {
        fetchSenderTransferStatus(transferId);
    }, 5000);
}

async function fetchSenderTransferStatus(transferId) {
    try {
        const data = await apiGet(`/transfer/${transferId}/status`);
        if (!data || data.error) return;
        
        renderSenderPanel(data);
        
        // Stop polling on terminal states
        if (['APPROVED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'TIMEOUT_STAGE1', 'TIMEOUT_STAGE2'].includes(data.stage)) {
            clearInterval(senderPollInterval);
            if (senderCountdownInterval) clearInterval(senderCountdownInterval);
            
            if (['APPROVED', 'COMPLETED', 'CANCELLED'].includes(data.stage)) {
                // Auto clean up
                setTimeout(() => {
                    localStorage.removeItem('activeTransferId');
                    localStorage.removeItem('activeTransferSpeciality');
                    localStorage.removeItem('triedHospitals');
                }, 5000);
            }
        }
        
    } catch (err) {
        console.error('Error polling sender transfer status:', err);
    }
}

function renderSenderPanel(data) {
    const panel = document.getElementById('senderTimerPanel');
    if (!panel) return;
    
    let html = '';
    
    // FEATURE 3 & 4: Next hospital recommendation UI on Timeout/Reject
    if (['TIMEOUT_STAGE1', 'TIMEOUT_STAGE2', 'REJECTED'].includes(data.stage)) {
        clearInterval(senderPollInterval);
        if (senderCountdownInterval) clearInterval(senderCountdownInterval);
        
        localStorage.removeItem('activeTransferId');
        
        const next = data.nextHospital;
        const failReason = data.stage === 'REJECTED' ? 'declined request' : 'did not respond in time';
        
        if (!next) {
            html = `
            <div style="background:#FEF2F2; border:1px solid #FECACA; padding:24px; border-radius:16px; margin-bottom:20px;">
                <h3 style="color:#B91C1C; font-weight:900; margin:0 0 16px 0;">⌛ ${data.toHospitalName || 'Hospital'} ${failReason}</h3>
                <p style="color:#7F1D1D; font-weight:bold;">No other nearby hospitals have availability for your requirements.</p>
                <div style="margin-top:16px;">
                    <button onclick="document.getElementById('senderTimerPanel').style.display='none'" style="padding:12px 24px; border-radius:12px; font-weight:bold; cursor:pointer; background:#FEE2E2; color:#991B1B; border:none;">Close</button>
                </div>
            </div>`;
        } else {
            html = `
            <div style="background:#F0FDF4; border:1px solid #BBF7D0; padding:24px; border-radius:16px; margin-bottom:20px; box-shadow:0 10px 25px -5px rgba(22, 163, 74, 0.1);">
                <h3 style="color:#B91C1C; font-weight:900; margin:0 0 16px 0;">⌛ ${data.toHospitalName || 'Hospital'} ${failReason}</h3>
                
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:20px; color:#16A34A; font-weight:bold; text-transform:uppercase; font-size:12px; letter-spacing:1px;">
                    <span class="material-symbols-outlined" style="font-size:16px;">autorenew</span>
                    Finding next available hospital...
                </div>
                
                <h4 style="color:#166534; font-weight:900; margin:0 0 16px 0; font-size:18px;">✅ Next Recommendation Found:</h4>
                
                <div style="background:white; padding:20px; border-radius:12px; border:1px solid #DCFCE7; margin-bottom:20px;">
                   <div style="font-size:20px; font-weight:900; color:#111827; margin-bottom:8px;">🏥 ${next.hospitalName || 'Network Facility'}</div>
                   <div style="color:#4B5563; font-weight:bold; font-size:14px; margin-bottom:4px;">📍 ${next.distanceKm || 0} km away</div>
                   <div style="color:#059669; font-weight:900; font-size:14px; margin-bottom:4px;">🛏️ ${next.availableBeds || 0} beds available</div>
                   ${next.availableDoctorName ? `<div style="color:#111827; font-weight:bold; font-size:14px;">👨‍⚕️ ${next.availableDoctorName} (${next.availableDoctorSpeciality})</div>` : ''}
                   <div style="color:#9CA3AF; font-size:12px; margin-top:8px; font-weight:bold;">📊 Match Score: ${Number(next.score || 0).toFixed(2)}</div>
                </div>
                
                <div style="display:flex; gap:12px;">
                    <button onclick="document.getElementById('senderTimerPanel').style.display='none'" style="flex:1; padding:16px; background:white; color:#6B7280; border:1px solid #E5E7EB; border-radius:12px; font-weight:bold; cursor:pointer;">Cancel — I will handle manually</button>
                    <button onclick="autoTransferNextHospital(${next.hospitalId})" style="flex:2; padding:16px; background:linear-gradient(to right, #16A34A, #15803D); color:white; border:none; border-radius:12px; font-weight:900; box-shadow:0 10px 15px -3px rgba(22, 163, 74, 0.3); transform:scale(1); transition:transform 0.2s; cursor:pointer;">Send Request to ${next.hospitalName || 'Next Hospital'}</button>
                </div>
            </div>`;
        }
    } 
    // SUCCESS - APPROVED OR COMPLETED
    else if (['APPROVED', 'COMPLETED'].includes(data.stage)) {
        html = `
        <div style="background:linear-gradient(to right, #F0FDF4, #DCFCE7); border:1px solid #86EFAC; padding:32px; border-radius:16px; margin-bottom:20px; text-align:center;">
            <div style="font-size:48px; margin-bottom:16px;">✅</div>
            <h3 style="color:#166534; font-weight:900; font-size:24px; margin:0 0 16px 0; letter-spacing:-0.5px;">TRANSFER CONFIRMED</h3>
            
            <div style="background:white; padding:20px; border-radius:12px; text-align:left; max-width:400px; margin:0 auto 24px auto; box-shadow:0 10px 15px -3px rgba(0,0,0,0.05);">
                <div style="margin-bottom:8px;"><span style="color:#9CA3AF; font-weight:bold; text-transform:uppercase; font-size:11px; letter-spacing:1px; display:inline-block; width:80px;">Hospital:</span> <span style="color:#111827; font-weight:900;">${data.toHospitalName || 'Network Facility'}</span></div>
                ${data.assignedDoctorName ? `<div style="margin-bottom:8px;"><span style="color:#9CA3AF; font-weight:bold; text-transform:uppercase; font-size:11px; letter-spacing:1px; display:inline-block; width:80px;">Doctor:</span> <span style="color:#111827; font-weight:900;">${data.assignedDoctorName}</span></div>` : ''}
                <div><span style="color:#9CA3AF; font-weight:bold; text-transform:uppercase; font-size:11px; letter-spacing:1px; display:inline-block; width:80px;">Patients:</span> <span style="color:#059669; font-weight:900;">${data.totalPatients || 0} Units</span></div>
            </div>
            
            <p style="color:#15803D; font-weight:bold; margin:0;">The receiving hospital has confirmed and assigned a doctor.<br>You can now proceed with the physical transfer.</p>
        </div>`;
    }
    // ACTIVE TIMER STAGES - PENDING OR ACKNOWLEDGED
    else {
        let stageName = '';
        let targetTimeStr = null;
        let subText = '';
        
        if (data.stage === 'PENDING') {
            stageName = 'STAGE 1 — Awaiting Response';
            targetTimeStr = data.acknowledgeBy;
            subText = '⏳ Waiting for hospital to acknowledge';
        } else if (data.stage === 'ACKNOWLEDGED') {
            stageName = 'STAGE 2 — Doctor Confirmation';
            targetTimeStr = data.confirmBy;
            subText = '🔍 Hospital is checking doctors';
        }
        
        if (targetTimeStr) {
            senderTimerEnd = new Date(targetTimeStr).getTime();
            if (!senderCountdownInterval) {
                senderCountdownInterval = setInterval(updateSenderTimerDisplay, 1000);
            }
        }
        
        html = `
        <div style="background:#F8FAFC; border:2px solid #E2E8F0; padding:24px; border-radius:16px; margin-bottom:20px; box-shadow:0 10px 25px -5px rgba(0, 0, 0, 0.05);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px;">
                <div>
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                        <span style="background:#EF4444; color:white; padding:4px 12px; border-radius:999px; font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:1px; animation: pulse 2s infinite;">🚨 Transfer In Progress</span>
                    </div>
                    <div style="font-weight:900; color:#0F172A; font-size:20px; letter-spacing:-0.5px; margin-bottom:4px;">Sent to: ${data.toHospitalName || 'Network Facility'}</div>
                    <div style="color:#64748B; font-weight:bold; font-size:14px;">Patients: <span style="color:#0EA5E9;">${data.totalPatients || 0} Units</span></div>
                </div>
            </div>
            
            <div style="background:white; border:1px solid #E2E8F0; border-radius:16px; padding:24px; text-align:center;">
                <h4 style="color:#64748B; font-weight:900; text-transform:uppercase; letter-spacing:1px; margin:0 0 16px 0; font-size:12px;">${stageName}</h4>
                <div id="senderCountdownDisplay" style="font-size:48px; font-weight:900; color:#0EA5E9; font-variant-numeric:tabular-nums; line-height:1; margin-bottom:8px;">0:00</div>
                <div style="color:#94A3B8; font-weight:bold; font-size:12px; margin-bottom:16px;">(remaining to respond)</div>
                <div style="color:#334155; font-weight:bold; font-size:14px; background:#F1F5F9; display:inline-block; padding:8px 16px; border-radius:8px;">${subText}</div>
                <div style="color:#94A3B8; font-weight:bold; font-size:11px; margin-top:20px;">If no response — next hospital will be suggested automatically</div>
            </div>
            
            <div style="margin-top:24px; text-align:right;">
                <button onclick="document.getElementById('senderTimerPanel').style.display='none'" style="padding:12px 24px; background:transparent; color:#94A3B8; border:1px solid #CBD5E1; border-radius:12px; font-weight:bold; cursor:pointer;">Hide Panel</button>
            </div>
        </div>
        <style>
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: .5; }
            }
        </style>`;
    }
    
    panel.innerHTML = html;
    panel.style.display = 'block';
    
    if (['PENDING', 'ACKNOWLEDGED'].includes(data.stage)) {
        updateSenderTimerDisplay();
    }
}

function updateSenderTimerDisplay() {
    const display = document.getElementById('senderCountdownDisplay');
    if (!display || !senderTimerEnd) return;
    
    const now = new Date().getTime();
    const distance = senderTimerEnd - now;
    
    if (distance < 0) {
        display.innerHTML = "0:00";
        display.style.color = "#94A3B8";
        return;
    }
    
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);
    
    display.innerHTML = minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
    
    if (distance > 60000) {
        display.style.color = "#004ac6";
    } else if (distance > 30000) {
        display.style.color = "#B45309";
    } else {
        display.style.color = "#B91C1C";
    }
}

async function autoTransferNextHospital(nextHospitalId) {
    if (!nextHospitalId) return;
    
    let tried = [];
    try {
        const triedStr = localStorage.getItem('triedHospitals');
        if (triedStr) tried = JSON.parse(triedStr);
    } catch(e){}
    
    if (!tried.includes(nextHospitalId)) {
        tried.push(nextHospitalId);
    }
    localStorage.setItem('triedHospitals', JSON.stringify(tried));
    
    try {
        const fromId = getHospitalId();
        const nextData = await apiGet(`/hospital/${nextHospitalId}/details?fromHospitalId=${fromId}`);
        if (nextData && nextData.hospitalName) {
            document.getElementById('senderTimerPanel').style.display = 'none';
            openTransferModal(nextHospitalId, nextData.hospitalName);
        } else {
            showToast('Failed to load next hospital details', 'error');
        }
    } catch(err) {
        console.error(err);
        showToast('Error redirecting to next hospital', 'error');
    }
}
"""

with codecs.open('D:/Porject using antigravity/Hospisync-backend/Hospisync-backend/src/main/resources/static/js/transfer.js', 'a', encoding='utf-8') as f:
    f.write("\n" + sender_code + "\n")
