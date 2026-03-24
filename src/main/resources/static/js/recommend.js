let currentBedCategories = []; // Will be populated dynamically
let lastSplitPlan = null; // Cache for split transfer plans

function clearFilters() {
    currentBedCategories.forEach(cat => {
        const name = cat.categoryName || cat.name;
        const input = document.getElementById(`req-${name}`);
        if (input) input.value = 0;
    });
    document.getElementById('filter-distance').value = '';
    fetchAIRecommendations();
}

async function initRecommendationFilters() {
    try {
        const categories = await apiGet(`/bed-categories/${getHospitalId()}`);
        currentBedCategories = categories;
        
        const container = document.getElementById('multi-bed-requirements');
        if (!container) return;

        container.innerHTML = categories.map(cat => `
            <div class="space-y-2">
                <label class="text-[10px] font-black text-slate-400 border-l-2 border-primary/20 pl-2 uppercase tracking-widest block">${cat.categoryName || cat.name}</label>
                <div class="relative">
                    <input type="number" id="req-${cat.categoryName || cat.name}" 
                           class="w-full bg-slate-50 border-none rounded-xl py-3 pl-4 pr-12 text-xs font-black text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all" 
                           value="0" min="0">
                    <span class="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">REQ</span>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Failed to init recommendation filters:", err);
    }
}

// Initialize filters when the script loads or when specific event happens
document.addEventListener('DOMContentLoaded', () => {
    // If we are on dashboard, this container exists
    if (document.getElementById('multi-bed-requirements')) {
        initRecommendationFilters();
    }
    
    // Check for auto-search triggers from transfer timeouts
    const autoTrigger = localStorage.getItem('autoSearchTrigger');
    const autoSpeciality = localStorage.getItem('autoSearchSpeciality');

    if (autoTrigger === 'true') {
        // Clear the trigger
        localStorage.removeItem('autoSearchTrigger');
        
        // Set the speciality dropdown
        if (autoSpeciality) {
            const select = document.getElementById('specialityFilter');
            if (select) select.value = autoSpeciality;
        }
        
        // Auto-click Compute Best Fit after short delay
        setTimeout(() => {
            const btn = document.getElementById('computeBestFitBtn');
            if (btn) btn.click();
        }, 500);
    }

    const btn = document.getElementById('computeBestFitBtn');
    if (btn) {
        const originalOnClick = btn.onclick;
        btn.onclick = function(e) {
            localStorage.removeItem('triedHospitals');
            console.log('Manual search: cleared triedHospitals — all hospitals available');
            const activeId = localStorage.getItem('activeTransferId');
            if (activeId) {
                // For now clear on manual search
                localStorage.removeItem('activeTransferId');
                localStorage.removeItem('activeTransferSpeciality');
            }
            if (originalOnClick) originalOnClick.call(btn, e);
            else if (typeof fetchAIRecommendations === 'function') fetchAIRecommendations();
        };
    }
});

async function fetchAIRecommendations() {
    const hospitalId = getHospitalId();
    if (!hospitalId) return;

    const list = document.getElementById('recommendList');
    const panel = document.getElementById('smartRecommendationPanel');
    const dist = document.getElementById('filter-distance')?.value;
    
    if (list) {
        list.innerHTML = '<tr><td colspan="6" style="color:var(--text-muted);text-align:center;padding:40px;">🔄 Searching nearby hospitals with requirements...</td></tr>';
    }
    if (panel) panel.style.display = 'none';

    try {
        // Fix: The endpoint is /api/recommend/{hospitalId}, not /api/recommendations
        let url = `/recommend/${hospitalId}?`;
        
        // Add distance param if selected
        if (dist) url += `maxDistance=${dist}&`;

        // Add speciality param if selected
        const speciality = document.getElementById('filter-speciality')?.value;
        if (speciality) url += `speciality=${speciality}&`;

        // Collect bed requirements
        let hasRequirements = false;
        currentBedCategories.forEach(cat => {
            const name = cat.categoryName || cat.name;
            const val = parseInt(document.getElementById(`req-${name}`)?.value) || 0;
            if (val > 0) {
                // Backend expects req-CategoryName, and it will strip "Beds" if present
                url += `req-${name}=${val}&`;
                hasRequirements = true;
            }
        });

        // FEATURE 4: Filter out hospitals we've already tried
        try {
            const triedStr = localStorage.getItem('triedHospitals');
            if (triedStr) {
                const triedArr = JSON.parse(triedStr);
                if (Array.isArray(triedArr) && triedArr.length > 0) {
                    url += `excludeHospitalIds=${triedArr.join(',')}&`;
                }
            }
        } catch(e) {}

        if (url.endsWith('&') || url.endsWith('?')) {
            url = url.slice(0, -1);
        }

        if (!hasRequirements && !dist && !speciality) {
            list.innerHTML = `
                <tr>
                    <td colspan="6" style="color:var(--text-muted);text-align:center;padding:60px;">
                        <div style="font-size: 40px; margin-bottom: 12px;">🧭</div>
                        <div>Adjust filters and click <strong>Compute Best Fit</strong> for network optimization.</div>
                    </td>
                </tr>
            `;
            return;
        }

        const data = await apiGet(url);

        if (!data || data.length === 0) {
            list.innerHTML = '<tr><td colspan="6" style="color:var(--text-muted);text-align:center;padding:40px;">No nearby hospitals matching your criteria.</td></tr>';
            return;
        }

        const bestMatch = data[0];
        const hasSplitPlan = bestMatch.splitTransferPlan && bestMatch.splitTransferPlan.length > 0;

        if (hasSplitPlan) {
            lastSplitPlan = bestMatch.splitTransferPlan;
            renderSplitPlanCard(bestMatch.splitTransferPlan);
        } else {
            lastSplitPlan = null;
            renderSmartPanel(bestMatch);
        }

        list.innerHTML = data.map((h, index) => {
            const statusClass = h.utilizationStatus === 'UNDERUTILIZED' ? 'bg-blue-100 text-blue-700' :
                                h.utilizationStatus === 'MODERATE' ? 'bg-green-100 text-green-700' : 'bg-error/10 text-error';
            
            const isBestMatch = index === 0 && !hasSplitPlan;
            const badge = isBestMatch 
                ? `<span class="bg-primary text-white text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ml-2">Best Match</span>`
                : (index === 0 && hasSplitPlan)
                ? `<span class="bg-amber-100 text-amber-700 text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ml-2">Split Required</span>`
                : '';

            const safeName = (h.hospitalName || 'Unnamed Hospital').replace(/'/g, "\\'");

            return `
                <tr class="hover:bg-slate-50/50 transition-colors ${isBestMatch ? 'bg-primary/[0.02]' : ''}">
                    <td class="px-4 py-5">
                        <div class="flex items-center gap-3">
                            <span class="text-xl">🏥</span>
                            <div>
                                <div class="font-black text-slate-900 text-sm tracking-tight">${h.hospitalName || 'Unnamed Hospital'} ${badge}</div>
                                <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">${h.address || 'Network Facility'}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-4 py-5">
                        <div class="flex flex-col">
                            <span class="text-sm font-black text-slate-900">${h.distance || '0'} km</span>
                            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">${h.estimatedTravelTime || '—'} travel</span>
                        </div>
                    </td>
                    <td class="px-4 py-5">
                        <div class="flex flex-col">
                            <span class="text-sm font-black text-green-600">${h.availableBeds || '0'} Units</span>
                            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Score: ${Number(h.score || 0).toFixed(2)}</span>
                        </div>
                    </td>
                    <td class="px-2 py-5">
                        ${h.hasDoctor ? `
                            <div class="text-[11px] font-black text-slate-900">${h.availableDoctorName}</div>
                            <div class="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Capacity: ${h.doctorRemainingCapacity}</div>
                        ` : `
                        <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${statusClass}">
                            ${h.utilizationStatus || 'UNKNOWN'}
                        </span>
                        `}
                    </td>
                    <td class="px-2 py-5 text-right">
                        <div class="flex justify-end gap-1">
                            <button class="p-2 bg-slate-50 text-slate-400 hover:text-primary rounded-lg transition-colors" onclick="viewHospitalDetails(${h.id}, '${safeName}')">
                                <span class="material-symbols-outlined text-sm">info</span>
                            </button>
                            <button class="px-4 py-2 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg shadow-primary/10 hover:scale-[1.02] transition-all" onclick="openTransferModal(${h.id}, '${safeName}')">
                                Transfer
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        if (list) {
            list.innerHTML = `<tr><td colspan="6" style="color:var(--danger);text-align:center;padding:40px;">Failed to load recommended hospitals. Error: ${err.message}</td></tr>`;
        }
        console.error("Recommendation Error: ", err);
    }
}

function renderSplitPlanCard(plan) {
    const panel = document.getElementById('smartRecommendationPanel');
    if (!panel) return;

    panel.innerHTML = `
        <div class="glass-card p-8 rounded-2xl border-l-[6px] border-amber-500 shadow-ambient mb-10 overflow-hidden relative group">
            <div class="absolute -right-8 -top-8 w-32 h-32 bg-amber-50 rounded-full opacity-20 group-hover:scale-150 transition-transform duration-700"></div>
            <div class="relative z-10">
                <div class="flex items-center gap-3 mb-6">
                    <span class="bg-amber-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Distributed Logic</span>
                    <h4 class="text-xl font-black text-slate-900 tracking-tight">Composite Network Solution</h4>
                </div>
                <p class="text-sm text-slate-500 font-medium mb-8">No single facility meets total census requirements. Algorithm has computed an optimized multi-hospital requisition plan.</p>
                
                <div class="space-y-3 mb-8">
                    ${plan.map(p => {
                        const allocations = Object.entries(p.bedAllocations || {})
                            .map(([type, count]) => `<span class="bg-slate-50 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600">${count} ${type}</span>`)
                            .join(' ');
                        return `
                            <div class="flex justify-between items-center p-4 bg-slate-50/50 rounded-xl border border-white">
                                <div class="flex items-center gap-3">
                                    <span class="text-lg">🏥</span>
                                    <div>
                                        <div class="text-sm font-black text-slate-900">${p.hospitalName || 'Unnamed Hospital'}</div>
                                        <div class="flex gap-2 mt-1">${allocations}</div>
                                    </div>
                                </div>
                                <div class="text-right">
                                    <div class="text-lg font-black text-amber-600">${p.allocatedBeds || 0}</div>
                                    <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Allocation</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                
                <div class="flex justify-end">
                    <button class="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-8 py-4 rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-amber-500/20 hover:scale-[1.02] transition-all" onclick="confirmSplitTransfers()">
                        Confirm Distributed Transfer Plan
                    </button>
                </div>
            </div>
        </div>
    `;
    panel.style.display = 'block';
}

function renderSmartPanel(bestMatch) {
    const panel = document.getElementById('smartRecommendationPanel');
    if (!panel || !bestMatch) return;

    const safeName = (bestMatch.hospitalName || 'Unnamed Hospital').replace(/'/g, "\\'");

    panel.innerHTML = `
        <div class="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-8 rounded-2xl shadow-ambient mb-10 relative overflow-hidden group">
            <div class="absolute -right-12 -top-12 w-48 h-48 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-1000"></div>
            <div class="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                <div class="flex-1">
                    <div class="flex items-center gap-3 mb-3">
                        <span class="bg-primary text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Heuristic Best Fit</span>
                        <h4 class="text-2xl font-black text-slate-900 tracking-tight">${bestMatch.hospitalName || 'Unnamed Hospital'}</h4>
                    </div>
                    <p class="text-sm text-slate-500 font-medium mb-8 flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm">location_on</span>
                        ${bestMatch.address || 'Network Access Point'}
                    </p>
                    
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-6">
                        <div>
                            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Network Distance</p>
                            <p class="text-lg font-black text-slate-900">${bestMatch.distance || '0'} km</p>
                        </div>
                        <div>
                            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Transit Time</p>
                            <p class="text-lg font-black text-slate-900">${bestMatch.estimatedTravelTime || '—'}</p>
                        </div>
                        <div>
                            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Unit Availability</p>
                            <p class="text-lg font-black text-green-600">${bestMatch.availableBeds || '0'}</p>
                        </div>
                        <div>
                            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Match Index</p>
                            <p class="text-lg font-black text-primary">${Number(bestMatch.score || 0).toFixed(2)}</p>
                        </div>
                    </div>
                    ${bestMatch.hasDoctor ? `
                    <div class="mt-6 p-4 bg-white/50 rounded-xl border border-primary/10 flex items-center gap-4">
                        <div class="w-12 h-12 bg-white rounded-lg flex items-center justify-center text-primary shadow-sm">
                            <span class="material-symbols-outlined text-2xl">medical_services</span>
                        </div>
                        <div>
                            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Primary Expert Reserved</p>
                            <p class="text-sm font-black text-slate-900">${bestMatch.availableDoctorName}</p>
                            <p class="text-[10px] text-primary font-bold uppercase tracking-widest mt-0.5">${bestMatch.doctorRemainingCapacity} Additional Safe Transfers Possible</p>
                        </div>
                    </div>
                    ` : ''}
                </div>
                <div class="w-full md:w-auto text-center">
                    <button class="w-full md:w-auto bg-gradient-to-r from-primary to-primary-container text-white px-10 py-5 rounded-xl text-xs font-black uppercase tracking-widest shadow-2xl shadow-primary/30 hover:scale-105 transition-all flex items-center justify-center gap-3" onclick="openTransferModal(${bestMatch.id}, '${safeName}')">
                        <span class="material-symbols-outlined">move_group</span>
                        Initiate Requisition
                    </button>
                    <p class="mt-3 text-[10px] text-slate-400 font-bold uppercase tracking-widest italic">AI-Engine Optimization Level: 94%</p>
                </div>
            </div>
        </div>
    `;
    panel.style.display = 'block';
}

async function confirmSplitTransfers() {
    if (!lastSplitPlan || lastSplitPlan.length === 0) {
        showToast("No active split plan to confirm.", "error");
        return;
    }

    const fromId = getHospitalId();
    if (!fromId) {
        showToast("Session error: Hospital ID missing.", "error");
        return;
    }

    const isConfirmed = confirm(`This will initiate transfers to ${lastSplitPlan.length} different hospitals. Are you sure you want to proceed?`);
    if (!isConfirmed) return;

    showLoading(true);
    let successCount = 0;
    let failCount = 0;

    try {
        for (const allocation of lastSplitPlan) {
            const payload = {
                fromHospitalId: parseInt(fromId),
                toHospitalId: parseInt(allocation.id),
                patientCount: allocation.allocatedBeds,
                bedAllocations: allocation.bedAllocations,
                priority: "NORMAL"
            };

            try {
                const res = await apiPost('/transfer/request', payload);
                if (res && !res.error) {
                    successCount++;
                    console.log(`Successfully initiated transfer to hospital ${allocation.id}`);
                } else {
                    failCount++;
                    console.error(`Failed transfer to hospital ${allocation.id}:`, res?.error);
                }
            } catch (err) {
                failCount++;
                console.error(`Error initiating transfer to hospital ${allocation.id}:`, err);
            }
        }

        if (successCount > 0) {
            showToast(`Successfully initiated ${successCount} transfers. All receiving hospitals have been notified.`, "success");
            // Refresh transfer history if on that section
            if (typeof loadTransfers === 'function') loadTransfers();
            // Hide the split plan card after success
            const panel = document.getElementById('smartRecommendationPanel');
            if (panel) panel.style.display = 'none';
            lastSplitPlan = null;
        }
        
        if (failCount > 0) {
            showToast(`Failed to initiate ${failCount} transfers. Please check details.`, "error");
        }
    } finally {
        showLoading(false);
    }
}


async function viewHospitalDetails(hospitalId, hospitalName) {
    const modal = document.getElementById('hospitalDetailsModal');
    const content = document.getElementById('hospitalDetailsContent');
    const title = document.getElementById('detailHospitalTitle');
    const transferBtn = document.getElementById('detailTransferBtn');

    title.textContent = '🏥 ' + hospitalName;
    content.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:24px;">🔄 Loading hospital details...</p>';
    modal.classList.add('active');

    try {
        const data = await apiGet(`/hospital/${hospitalId}/details?fromHospitalId=${getHospitalId()}`);

        if (!data || data.error) {
            content.innerHTML = `<p class="text-error text-center py-8 font-bold">${data?.error || 'Network Error: Failed to fetch facility specifications'}</p>`;
            return;
        }

        const statusClass = data.utilizationStatus === 'UNDERUTILIZED' ? 'bg-blue-100 text-blue-700' :
                            data.utilizationStatus === 'MODERATE' ? 'bg-green-100 text-green-700' : 'bg-error/10 text-error';

        let bedRows = '';
        if (data.categories && data.categories.length > 0) {
            bedRows = data.categories.map(cat => {
                const pct = cat.total > 0 ? Math.round((cat.occupied / cat.total) * 100) : 0;
                const barColor = pct >= 85 ? 'bg-error' : pct >= 60 ? 'bg-amber-500' : 'bg-green-500';
                return `
                    <div class="py-4 border-b border-slate-50 last:border-0">
                        <div class="flex items-center gap-4 mb-3">
                            <span class="text-2xl w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">${cat.icon}</span>
                            <div class="flex-1">
                                <div class="flex justify-between items-end">
                                    <span class="text-sm font-black text-slate-800 uppercase tracking-tight">${cat.categoryName}</span>
                                    <span class="text-xs font-bold text-slate-400">${cat.occupied} / ${cat.total}</span>
                                </div>
                                <div class="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div class="h-full ${barColor} transition-all duration-1000" style="width: ${pct}%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        content.innerHTML = `
            <div class="flex justify-between items-center mb-8 pb-4 border-b border-slate-50">
                <div class="flex items-center gap-4">
                    <span class="bg-slate-50 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm">distance</span>
                        ${data.distance} km
                    </span>
                    <span class="bg-slate-50 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm">schedule</span>
                        ${data.estimatedTravelTime}
                    </span>
                </div>
                <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${statusClass}">
                    ${data.utilizationStatus}
                </span>
            </div>
            
            <div class="grid grid-cols-3 gap-4 mb-8">
                <div class="bg-slate-50 p-4 rounded-xl text-center">
                    <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total</p>
                    <p class="text-xl font-black text-slate-900">${data.totalBeds}</p>
                </div>
                <div class="bg-slate-50 p-4 rounded-xl text-center border border-error/5">
                    <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 text-error/60">Occupied</p>
                    <p class="text-xl font-black text-error">${data.occupiedBeds}</p>
                </div>
                <div class="bg-slate-50 p-4 rounded-xl text-center border border-green-500/5">
                    <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 text-green-600/60">Ready</p>
                    <p class="text-xl font-black text-green-600">${data.availableBeds}</p>
                </div>
            </div>
            
            <div class="space-y-1">
                <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Internal Census Metrics</h4>
                ${bedRows}
            </div>
        `;

        transferBtn.onclick = function() {
            closeModal('hospitalDetailsModal');
            openTransferModal(hospitalId, hospitalName);
        };

    } catch (err) {
        content.innerHTML = '<p style="color:var(--danger);text-align:center;padding:24px;">Error loading details: ' + err.message + '</p>';
        console.error("Hospital Details Error:", err);
    }
}

document.getElementById('hospitalDetailsModal')?.addEventListener('click', function (e) {
    if (e.target === this) closeModal('hospitalDetailsModal');
});
