let currentBedCategories = []; // Will be populated dynamically

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
            <div class="filter-item">
                <label style="display:block; font-size:11px; margin-bottom:4px; color:var(--text-secondary);">${cat.categoryName || cat.name} Beds</label>
                <input type="number" id="req-${cat.categoryName || cat.name}" class="form-control" value="0" min="0" style="width:100%;">
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
});

async function fetchAIRecommendations() {
    const hospitalId = getHospitalId();
    if (!hospitalId) return;

    const list = document.getElementById('recommendList');
    const panel = document.getElementById('smartRecommendationPanel');
    
    if (list) {
        list.innerHTML = '<tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:40px;">🔄 Searching nearby hospitals with bed requirements...</td></tr>';
    }
    if (panel) panel.style.display = 'none';

    try {
        // Fix: The endpoint is /api/recommend/{hospitalId}, not /api/recommendations
        let url = `/recommend/${hospitalId}?`;
        
        // Add distance param if selected
        const dist = document.getElementById('filter-distance')?.value;
        if (dist) url += `maxDistance=${dist}&`;

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

        // Clean up trailing & if any
        if (url.endsWith('&')) {
            url = url.slice(0, -1);
        }

        if (!hasRequirements && !dist) {
            list.innerHTML = `
                <tr>
                    <td colspan="5" style="color:var(--text-muted);text-align:center;padding:60px;">
                        <div style="font-size: 40px; margin-bottom: 12px;">🧭</div>
                        <div>Adjust filters and click <strong>Apply Smart Recommendation</strong> to find the best hospital match.</div>
                    </td>
                </tr>
            `;
            return;
        }

        const data = await apiGet(url);

        if (!data || data.length === 0) {
            list.innerHTML = '<tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:40px;">No nearby hospitals matching your criteria.</td></tr>';
            return;
        }

        const bestMatch = data[0];
        const hasSplitPlan = bestMatch.splitTransferPlan && bestMatch.splitTransferPlan.length > 0;

        if (hasSplitPlan) {
            renderSplitPlanCard(bestMatch.splitTransferPlan);
        } else {
            renderSmartPanel(bestMatch);
        }

        list.innerHTML = data.map((h, index) => {
            const statusClass = h.utilizationStatus === 'UNDERUTILIZED' ? 'underutilized' :
                                h.utilizationStatus === 'MODERATE' ? 'moderate' : 'overutilized';
            
            const isBestMatch = index === 0 && !hasSplitPlan;
            const badge = isBestMatch 
                ? `<span style="background:var(--primary); color:white; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:700; margin-left:8px;">BEST MATCH</span>`
                : (index === 0 && hasSplitPlan)
                ? `<span style="background:var(--warning); color:black; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:700; margin-left:8px;">SPLIT REQUIRED</span>`
                : '';

            const safeName = (h.hospitalName || 'Unnamed Hospital').replace(/'/g, "\\'");

            return `
                <tr class="animate-in" style="${isBestMatch ? 'background: rgba(79, 70, 229, 0.05);' : ''}">
                    <td style="padding:14px 12px;">
                        <div style="font-weight:600;color:var(--text-primary);">${h.hospitalName || 'Unnamed Hospital'} ${badge}</div>
                        <div style="font-size:11px; color:var(--text-muted);">${h.address || ''}</div>
                    </td>
                    <td style="padding:14px 12px;">
                        <div style="font-weight:600;">${h.distance || '0'} km</div>
                        <div style="color:var(--text-muted);font-size:12px;">(${h.estimatedTravelTime || '—'})</div>
                    </td>
                    <td style="padding:14px 12px;">
                        <div style="font-weight:700; color:var(--success);">${h.availableBeds || '0'} total avail.</div>
                        <div style="font-size:11px; color:var(--text-muted);">Score: ${Number(h.score || 0).toFixed(2)}</div>
                    </td>
                    <td style="padding:14px 12px;">
                        <span class="status-badge ${statusClass}">
                            <span class="status-dot"></span> ${h.utilizationStatus || 'UNKNOWN'}
                        </span>
                    </td>
                    <td style="padding:12px; vertical-align: middle;">
                        <div style="display:flex; gap:8px;">
                            <button class="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all" onclick="viewHospitalDetails(${h.id}, '${safeName}')">
                                Details
                            </button>
                            <button class="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-all" onclick="openTransferModal(${h.id}, '${safeName}')">
                                Transfer →
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        if (list) {
            list.innerHTML = `<tr><td colspan="5" style="color:var(--danger);text-align:center;padding:40px;">Failed to load recommended hospitals. Error: ${err.message}</td></tr>`;
        }
        console.error("Recommendation Error: ", err);
    }
}

function renderSplitPlanCard(plan) {
    const panel = document.getElementById('smartRecommendationPanel');
    if (!panel) return;

    panel.innerHTML = `
        <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(251, 191, 36, 0.1) 100%); border: 1px solid #f59e0b; border-radius: 16px; padding: 24px; margin-bottom: 24px; position: relative; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);">
            <div style="position: absolute; top: -10px; right: -10px; font-size: 80px; opacity: 0.1;">🚑</div>
            <div style="position: relative; z-index: 1;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                    <span style="background: #f59e0b; color: black; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Split Plan Required</span>
                    <h4 style="font-size: 18px; font-weight: 800; color: #f59e0b; margin: 0;">No single hospital can accommodate all requirements.</h4>
                </div>
                <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 20px;">We have generated an optimized multi-hospital transfer plan based on score and proximity.</p>
                
                <div style="background: rgba(0,0,0,0.2); border-radius: 12px; padding: 16px;">
                    <h5 style="font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px;">Suggested Transfer Allocation:</h5>
                    <div style="display: grid; gap: 10px;">
                        ${plan.map(p => {
                            const allocations = Object.entries(p.bedAllocations || {})
                                .map(([type, count]) => `<span>${count} ${type}</span>`)
                                .join(', ');
                            return `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <span style="font-size: 16px;">🏥</span>
                                        <div>
                                            <div style="font-weight: 600; color: var(--text-primary);">${p.hospitalName || 'Unnamed Hospital'}</div>
                                            <div style="font-size: 11px; color: var(--text-muted);">${allocations}</div>
                                        </div>
                                    </div>
                                    <div style="font-weight: 800; color: #f59e0b; font-size: 15px;">${p.allocatedBeds || 0} Total</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
                    <button class="px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-black font-bold rounded-xl shadow-lg hover:from-amber-600 hover:to-orange-700 transition-all transform hover:scale-105" onclick="showToast('Protocol initiated. Coordinate with receiving hospitals.', 'info')">
                        ✅ Confirm All Transfers
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
        <div style="background: linear-gradient(135deg, rgba(79, 70, 229, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%); border: 1px solid var(--primary-500); border-radius: 16px; padding: 24px; margin-bottom: 24px; position: relative; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);">
            <div style="position: absolute; top: -10px; right: -10px; font-size: 80px; opacity: 0.1;">✨</div>
            <div style="display: flex; justify-content: space-between; align-items: start; position: relative; z-index: 1;">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="background: var(--primary-600); color: white; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Best Match</span>
                        <h4 style="font-size: 20px; font-weight: 800; color: var(--text-primary); margin: 0;">${bestMatch.hospitalName || 'Unnamed Hospital'}</h4>
                    </div>
                    <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 20px; display: flex; align-items: center; gap: 4px;">📍 ${bestMatch.address || ''}</p>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 20px;">
                        <div>
                            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Distance</div>
                            <div style="font-weight: 800; color: var(--text-primary); font-size: 16px;">${bestMatch.distance || '0'} km</div>
                        </div>
                        <div>
                            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Travel Time</div>
                            <div style="font-weight: 800; color: var(--text-primary); font-size: 16px;">${bestMatch.estimatedTravelTime || '—'}</div>
                        </div>
                        <div>
                            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Available Beds</div>
                            <div style="font-weight: 800; color: var(--success); font-size: 16px;">${bestMatch.availableBeds || '0'}</div>
                        </div>
                        <div>
                            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Recommendation Score</div>
                            <div style="font-weight: 800; color: var(--primary-400); font-size: 16px;">${Number(bestMatch.score || 0).toFixed(2)}</div>
                        </div>
                    </div>
                </div>
                <div style="text-align: right; min-width: 200px;">
                    <button class="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl shadow-lg px-6 py-4 font-bold transition-all duration-200 flex items-center justify-center gap-2 transform hover:scale-105 active:scale-95" onclick="openTransferModal(${bestMatch.id}, '${safeName}')">
                        🚑 Start Patient Transfer
                    </button>
                    <div style="margin-top: 12px; font-size: 12px; color: var(--text-muted);">AI-optimized matching result</div>
                </div>
            </div>
        </div>
    `;
    panel.style.display = 'block';
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
            content.innerHTML = `<p style="color:var(--danger);text-align:center;padding:24px;">Failed to load hospital details: ${data?.error || 'API request failed'}</p>`;
            return;
        }

        const statusClass = data.utilizationStatus === 'UNDERUTILIZED' ? 'underutilized' :
                            data.utilizationStatus === 'MODERATE' ? 'moderate' : 'overutilized';

        let bedRows = '';
        if (data.categories && data.categories.length > 0) {
            bedRows = data.categories.map(cat => {
                const pct = cat.total > 0 ? Math.round((cat.occupied / cat.total) * 100) : 0;
                const barColor = pct >= 85 ? 'var(--danger)' : pct >= 60 ? '#f59e0b' : 'var(--success)';
                return `
                    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
                        <span style="font-size:20px;width:32px;text-align:center;">${cat.icon}</span>
                        <div style="flex:1;">
                            <div style="font-weight:600;font-size:13px;color:var(--text-primary);margin-bottom:4px;">${cat.categoryName}</div>
                            <div style="display:flex;gap:16px;font-size:12px;color:var(--text-secondary);">
                                <span>Total: <strong>${cat.total}</strong></span>
                                <span>Occupied: <strong>${cat.occupied}</strong></span>
                                <span style="color:var(--success);">Available: <strong>${cat.available}</strong></span>
                            </div>
                            <div style="margin-top:6px;height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden;">
                                <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;transition:width 0.6s ease;"></div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        content.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <div>
                    <span style="font-size:13px;color:var(--text-secondary);">📍 Distance:</span>
                    <strong style="margin-left:4px;">${data.distance} km</strong>
                    <span style="color:var(--text-muted);font-size:12px;margin-left:4px;">(${data.estimatedTravelTime})</span>
                </div>
                <span class="status-badge ${statusClass}">
                    <span class="status-dot"></span> ${data.utilizationStatus}
                </span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">
                <div style="background:var(--bg-input);border-radius:var(--radius-sm);padding:12px;text-align:center;">
                    <div style="font-size:20px;font-weight:700;color:var(--primary);">${data.totalBeds}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Total Beds</div>
                </div>
                <div style="background:var(--bg-input);border-radius:var(--radius-sm);padding:12px;text-align:center;">
                    <div style="font-size:20px;font-weight:700;color:var(--danger);">${data.occupiedBeds}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Occupied</div>
                </div>
                <div style="background:var(--bg-input);border-radius:var(--radius-sm);padding:12px;text-align:center;">
                    <div style="font-size:20px;font-weight:700;color:var(--success);">${data.availableBeds}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Available</div>
                </div>
            </div>
            <h4 style="font-size:14px;color:var(--text-primary);margin-bottom:8px;">Bed Availability Breakdown</h4>
            ${bedRows}
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
