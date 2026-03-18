/**
 * HospiSync Dashboard
 * Stable Version
 */

// ==============================
// AUTH GUARD
// ==============================



// ==============================
// INIT
// ==============================

let dashboardData = null;
let lineChart, pieChart, barChart;

document.addEventListener("DOMContentLoaded", async () => {

    const name = getHospitalName() || "Hospital";

    const profileName = document.getElementById("profileName");
    const profileAvatar = document.getElementById("profileAvatar");

    if(profileName) profileName.textContent = name;
    if(profileAvatar) profileAvatar.textContent = name.charAt(0).toUpperCase();

    showLoading(true);

    await loadDashboard();
    await loadNotificationCount();

    showLoading(false);
});


// ==============================
// DASHBOARD DATA
// ==============================

async function submitAllBedUpdates() {
    const inputs = document.querySelectorAll('.occupancy-input');
    const capInputs = document.querySelectorAll('.capacity-input');
    const hospitalId = getHospitalId();
    
    showLoading(true);
    let successCount = 0;
    let hasError = false;

    // Reset all previous errors
    document.querySelectorAll('.bed-input-error').forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
    });

    try {
        for (let i = 0; i < inputs.length; i++) {
            const occInput = inputs[i];
            const catId = occInput.getAttribute('data-id');
            const newCapacity = parseInt(occInput.getAttribute('data-total'));
            const newOccupiedStr = occInput.value.trim();
            const errorEl = document.getElementById(`error_${catId}`);
            
            if (newOccupiedStr === "") {
                if (errorEl) {
                    errorEl.textContent = "Cannot be empty";
                    errorEl.style.display = 'block';
                }
                hasError = true;
                continue;
            }

            const newOccupied = parseInt(newOccupiedStr);
            
            if (isNaN(newOccupied)) {
                if (errorEl) {
                    errorEl.textContent = "Invalid number";
                    errorEl.style.display = 'block';
                }
                hasError = true;
                continue;
            }

            if (newOccupied < 0) {
                if (errorEl) {
                    errorEl.textContent = "Cannot be negative";
                    errorEl.style.display = 'block';
                }
                hasError = true;
                continue;
            }

            if (newOccupied > newCapacity) {
                if (errorEl) {
                    errorEl.textContent = `Exceeds capacity (${newCapacity})`;
                    errorEl.style.display = 'block';
                }
                hasError = true;
                continue;
            }

            const res = await apiPut(`/bed-categories/${hospitalId}/${catId}`, {
                totalCapacity: newCapacity,
                occupiedBeds: newOccupied,
                categoryName: occInput.getAttribute('data-name')
            });
            
            if (res && !res.error) successCount++;
        }
        
        if (successCount > 0) {
            showToast(`${successCount} categories updated successfully`, "success");
            await loadDashboard(); 
        } else if (!hasError) {
            showToast("No updates were made", "info");
        }
    } catch (err) {
        console.error("Batch update error:", err);
        showToast("Failed to update some beds", "error");
    } finally {
        showLoading(false);
    }
}

async function loadDashboard() {

    try {

        const hospitalId = getHospitalId();
        if (!hospitalId) {
            console.error("Hospital ID missing, dashboard load aborted");
            alert("Session expired or missing hospital ID. Please login again.");
            window.location.href = "/index.html";
            return;
        }

        const data = await apiGet(`/hospital/${hospitalId}/dashboard`);

        if (!data || data.error) {
            showToast("Failed to load dashboard data","error");
            return;
        }

        dashboardData = data;

        renderKPIs(data);
        renderUtilization(data);
        renderBedGrid(data);
        renderCharts(data);
        updateLastUpdated(data.lastUpdatedAgo);
        renderBedUpdateForm(data);

        loadMapAndAlerts(data);

    } catch(err) {

        console.error("Dashboard Error:",err);
        showToast("Failed to load dashboard data","error");

    }
}


// ==============================
// KPI CARDS
// ==============================

function renderKPIs(data){

    document.getElementById("kpiTotalBeds").textContent =
        data.totalBeds ?? 0;

    document.getElementById("kpiOccupied").textContent =
        data.occupiedBeds ?? 0;

    document.getElementById("kpiAvailable").textContent =
        data.availableBeds ?? 0;

    document.getElementById("kpiOccRate").textContent =
        (data.occupancyRate ?? 0) + "%";

}


// ==============================
// UTILIZATION STATUS
// ==============================

function renderUtilization(data){

    const badge = document.getElementById("utilizationBadge");
    const text = document.getElementById("utilizationText");

    if(!badge || !text) return;

    badge.className="status-badge";

    if(data.utilizationStatus==="UNDERUTILIZED"){
        badge.classList.add("underutilized");
        text.textContent="Underutilized";
    }
    else if(data.utilizationStatus==="MODERATE"){
        badge.classList.add("moderate");
        text.textContent="Moderate";
    }
    else{
        badge.classList.add("overutilized");
        text.textContent="Over Utilized";
    }

}


// ==============================
// BED GRID
// ==============================

function renderBedGrid(data){

    const grid=document.getElementById("bedGrid");
    const categories=data.categories || [];

    if(!grid) return;

    if(categories.length===0){
        grid.innerHTML=`<p>No Bed Categories Found</p>`;
        return;
    }

    grid.innerHTML=categories.map(cat=>{
        const name = cat.name || cat.categoryName;
        return `
        <div class="bed-card">
            <div style="position:absolute; top:10px; right:10px; display:flex; gap:6px;">
                 <button onclick="openEditCategoryModal(${cat.categoryId || cat.id}, '${name}', ${cat.total}, ${cat.occupied}, '${cat.icon}')" style="background:none; border:none; cursor:pointer; font-size:12px; opacity:0.6; hover:opacity:1;">✏️</button>
                 <button onclick="openDeleteCategoryModal(${cat.categoryId || cat.id}, '${name}')" style="background:none; border:none; cursor:pointer; font-size:12px; opacity:0.6; hover:opacity:1;">🗑️</button>
            </div>
            <div class="bed-icon">${cat.icon}</div>
            <div class="bed-name">${name}</div>
            <div class="bed-stat">
                ${cat.occupied}/${cat.total}
            </div>
            <div class="bed-available">
                ${cat.available} Available
            </div>
        </div>
        `;
    }).join("");

}


// ==============================
// CHARTS
// ==============================

function renderCharts(data){

    const ctx1=document.getElementById("pieChart");
    const ctx2=document.getElementById("barChart");

    if(!ctx1 || !ctx2) return;

    if(pieChart) pieChart.destroy();
    if(barChart) barChart.destroy();

    pieChart=new Chart(ctx1,{

        type:"doughnut",

        data:{
            labels:["Occupied","Available"],
            datasets:[{
                data:[data.occupiedBeds,data.availableBeds],
                backgroundColor:["#ef4444","#10b981"]
            }]
        }

    });

    const categories=data.categories || [];

    barChart=new Chart(ctx2,{
        type:"bar",
        data:{
            labels:categories.map(c=>c.name),
            datasets:[
                {
                    label:"Occupied",
                    data:categories.map(c=>c.occupied),
                    backgroundColor:"#ef4444"
                },
                {
                    label:"Available",
                    data:categories.map(c=>c.available),
                    backgroundColor:"#10b981"
                }
            ]
        }
    });

    const ctx3 = document.getElementById("lineChart");
    if (!ctx3) return;

    if (window.lineChartObj) window.lineChartObj.destroy();
    
    // Sample historical data if not provided by backend
    const historical = data.historicalOccupancy || [
        { date: "6h ago", value: Math.max(0, data.occupiedBeds - 5) },
        { date: "4h ago", value: Math.max(0, data.occupiedBeds - 2) },
        { date: "2h ago", value: data.occupiedBeds },
        { date: "Now", value: data.occupiedBeds }
    ];

    window.lineChartObj = new Chart(ctx3, {
        type: "line",
        data: {
            labels: historical.map(h => h.date),
            datasets: [{
                label: "Occupied Beds Over Time",
                data: historical.map(h => h.value),
                borderColor: "#4f46e5",
                backgroundColor: "rgba(79, 70, 229, 0.1)",
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}


// ==============================
// MAP
// ==============================

let mapInstance = null;

async function loadMapAndAlerts(currentHospital){

    try{
        const alertBanner = document.getElementById("capacityAlertBanner");
        
        // Hide by default
        if(alertBanner) alertBanner.style.setProperty('display', 'none', 'important');

        if (currentHospital.occupancyRate >= 85) {
            if(alertBanner) {
                alertBanner.style.setProperty('display', 'flex', 'important');
                document.getElementById("capacityAlertMsg").textContent = 
                    `Your hospital is at ${currentHospital.occupancyRate}% capacity. Consider transferring patients.`;
            }
        }

        const mapData=await apiGet("/hospital/map-data");
        if(!mapData) return;
        
        initLeafletMap(mapData, currentHospital);

    }catch(err){
        console.error("Map error",err);
    }

}

function initLeafletMap(hospitals, currentHospital) {
    const mapContainer = document.getElementById("hospital-map");
    if (!mapContainer) return;

    // Destroy existing map if it exists
    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }

    // Center on current hospital or first in list
    const centerLat = currentHospital.latitude || hospitals[0]?.latitude || 21.1458;
    const centerLng = currentHospital.longitude || hospitals[0]?.longitude || 79.0882;

    mapInstance = L.map('hospital-map').setView([centerLat, centerLng], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance);

    hospitals.forEach(h => {
        if (!h.latitude || !h.longitude) return;

        const isCurrent = h.id === currentHospital.id;
        const color = h.occupancyRate >= 90 ? '#ef4444' : (h.occupancyRate >= 70 ? '#f59e0b' : '#10b981');
        
        const markerIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color:${color}; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow:0 0 5px rgba(0,0,0,0.3);"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });

        const marker = L.marker([h.latitude, h.longitude], { icon: markerIcon }).addTo(mapInstance);
        
        let popupContent = `
            <div style="font-family:inherit; min-width:150px;">
                <div style="font-weight:700; margin-bottom:4px; color:var(--text-primary);">${h.hospitalName} ${isCurrent ? '(You)' : ''}</div>
                <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">Occupancy: ${h.occupancyRate}%</div>
                ${!isCurrent ? `<button class="btn btn-primary btn-sm" onclick="showSection('recommend'); openTransferModal(${h.id}, '${h.hospitalName.replace(/'/g, "\\'")}')" style="width:100%; font-size:11px; padding:4px;">Transfer Here</button>` : ''}
            </div>
        `;
        
        marker.bindPopup(popupContent);
    });
}

function renderBedUpdateForm(data) {
    const container = document.getElementById("bedUpdateForm");
    if (!container || !data.categories) return;

    container.innerHTML = data.categories.map(cat => `
        <div class="card" style="padding:16px; margin-bottom:12px; background:var(--bg-card);">
            <div style="font-weight:700; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between;">
                <span>${cat.icon} ${cat.name || cat.categoryName}</span>
                <span style="font-size:11px; color:var(--text-muted); font-weight:500;">Capacity: ${cat.total}</span>
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label style="font-size:11px; color:var(--text-muted);">Update Occupied beds</label>
                <input type="number" 
                       class="form-control occupancy-input" 
                       data-id="${cat.categoryId || cat.id}" 
                       data-total="${cat.total}"
                       data-name="${cat.name || cat.categoryName}"
                       value="${cat.occupied}" 
                       min="0"
                       oninput="validateOccupancyInput(this)">
                <div id="error_${cat.categoryId || cat.id}" class="bed-input-error" style="color:#f87171; font-size:10px; margin-top:4px; display:none; font-weight:600;"></div>
            </div>
        </div>
    `).join('');
}

function validateOccupancyInput(input) {
    const val = input.value.trim();
    const capacity = parseInt(input.getAttribute('data-total'));
    const catId = input.getAttribute('data-id');
    const errorEl = document.getElementById(`error_${catId}`);
    const updateBtn = document.getElementById('bedUpdateBtn');

    if (val === "") {
        if (errorEl) {
            errorEl.textContent = "Cannot be empty";
            errorEl.style.display = 'block';
        }
    } else {
        const num = parseInt(val);
        if (isNaN(num)) {
            if (errorEl) {
                errorEl.textContent = "Invalid number";
                errorEl.style.display = 'block';
            }
        } else if (num < 0) {
            if (errorEl) {
                errorEl.textContent = "Cannot be negative";
                errorEl.style.display = 'block';
            }
        } else if (num > capacity) {
            if (errorEl) {
                errorEl.textContent = `Exceeds capacity (${capacity})`;
                errorEl.style.display = 'block';
            }
        } else {
            if (errorEl) {
                errorEl.textContent = "";
                errorEl.style.display = 'none';
            }
        }
    }

    // Check if any errors exist to toggle update button
    const hasErrors = document.querySelectorAll('.bed-input-error[style*="display: block"]').length > 0;
    if (updateBtn) {
        if (hasErrors) {
            updateBtn.disabled = true;
            updateBtn.style.opacity = '0.5';
            updateBtn.style.cursor = 'not-allowed';
        } else {
            updateBtn.disabled = false;
            updateBtn.style.opacity = '1';
            updateBtn.style.cursor = 'pointer';
        }
    }
}


// ==============================
// LAST UPDATED
// ==============================

function updateLastUpdated(text){

    const el=document.getElementById("lastUpdatedText");

    if(el){
        el.textContent="Last Updated: "+(text || "Never");
    }

}


// ==============================
// NOTIFICATIONS
// ==============================

async function loadNotificationCount(){

    try{

        const hospitalId = getHospitalId();
        if(!hospitalId) return;

        const data=await apiGet(`/notifications/${hospitalId}`);

        if(!data) return;

        const badge=document.getElementById("headerNotifBadge");

        if(badge && data.unreadCount>0){

            badge.style.display="flex";
            badge.textContent=data.unreadCount;

        }

    }catch(err){

        console.error("Notification Error",err);

    }

}


// ==============================
// LOGOUT
// ==============================

function handleLogout(){
    clearAuth();
    window.location.href="/index.html";
}


// ==============================
// SIDEBAR
// ==============================

function toggleSidebar(){

    const sidebar=document.getElementById("sidebar");

    if(sidebar){
        sidebar.classList.toggle("open");
    }

}

function showSection(sectionId) {
    // Update Sidebar UI
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-section') === sectionId) {
            item.classList.add('active');
        }
    });

    // Toggle Sections
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none';
    });

    const target = document.getElementById(`section-${sectionId}`);
    if (target) {
        target.style.display = 'block';
        
        // Update Title
        const titleMap = {
            'overview': 'Dashboard',
            'beds': 'Bed Management',
            'forecast': 'Load Forecast',
            'recommend': 'Recommendations',
            'transfer': 'Patient Transfer',
            'notifications': 'Notifications'
        };
        document.getElementById('pageTitle').textContent = titleMap[sectionId] || 'Dashboard';

        // Trigger section-specific loads
        if (sectionId === 'forecast' && typeof loadForecast === 'function') loadForecast();
        if (sectionId === 'recommend' && typeof fetchAIRecommendations === 'function') fetchAIRecommendations();
        if (sectionId === 'transfer' && typeof loadTransfers === 'function') loadTransfers();
        if (sectionId === 'overview') {
            loadDashboard();
            if (mapInstance) setTimeout(() => mapInstance.invalidateSize(), 200);
        }
    }

    // Close sidebar on mobile after click
    if (window.innerWidth <= 1024) toggleSidebar();
}

// ==============================
// MODALS
// ==============================

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

// Add Category
function openAddCategoryModal() {
    document.getElementById('addCatName').value = '';
    document.getElementById('addCatCapacity').value = '10';
    document.getElementById('addCatIcon').value = '🛏️';
    document.getElementById('addCatError').style.display = 'none';
    openModal('addCategoryModal');
}

async function submitAddCategory() {
    const name = document.getElementById('addCatName').value.trim();
    const capacity = parseInt(document.getElementById('addCatCapacity').value);
    const icon = document.getElementById('addCatIcon').value.trim();
    const errorEl = document.getElementById('addCatError');

    if (!name || isNaN(capacity)) {
        errorEl.textContent = "Please fill all fields correctly.";
        errorEl.style.display = 'block';
        return;
    }

    try {
        showLoading(true);
        const res = await apiPost(`/bed-categories/${getHospitalId()}`, {
            categoryName: name,
            totalCapacity: capacity,
            icon: icon
        });

        if (res && !res.error) {
            showToast("Category added successfully", "success");
            closeModal('addCategoryModal');
            await loadDashboard();
        } else {
            errorEl.textContent = res.error || "Failed to add category";
            errorEl.style.display = 'block';
        }
    } catch (err) {
        errorEl.textContent = "Error adding category";
        errorEl.style.display = 'block';
    } finally {
        showLoading(false);
    }
}

// Edit Category
function openEditCategoryModal(id, name, capacity, occupied, icon) {
    document.getElementById('editCatId').value = id;
    document.getElementById('editCatName').value = name;
    document.getElementById('editCatCapacity').value = capacity;
    document.getElementById('editCatOccupied').value = occupied;
    document.getElementById('editCatIcon').value = icon;
    document.getElementById('editCatError').style.display = 'none';
    openModal('editCategoryModal');
}

async function submitEditCategory() {
    const id = document.getElementById('editCatId').value;
    const name = document.getElementById('editCatName').value.trim();
    const capacity = parseInt(document.getElementById('editCatCapacity').value);
    const occupied = parseInt(document.getElementById('editCatOccupied').value);
    const icon = document.getElementById('editCatIcon').value.trim();
    const errorEl = document.getElementById('editCatError');

    try {
        showLoading(true);
        const res = await apiPut(`/bed-categories/${getHospitalId()}/${id}`, {
            categoryName: name,
            totalCapacity: capacity,
            occupiedBeds: occupied,
            icon: icon
        });

        if (res && !res.error) {
            showToast("Category updated successfully", "success");
            closeModal('editCategoryModal');
            await loadDashboard();
        } else {
            errorEl.textContent = res.error || "Failed to update category";
            errorEl.style.display = 'block';
        }
    } catch (err) {
        errorEl.textContent = "Error updating category";
        errorEl.style.display = 'block';
    } finally {
        showLoading(false);
    }
}

// Delete Category
function openDeleteCategoryModal(id, name) {
    document.getElementById('deleteCatId').value = id;
    document.getElementById('deleteCatName').textContent = name;
    document.getElementById('deleteCatError').style.display = 'none';
    openModal('deleteCategoryModal');
}

async function submitDeleteCategory() {
    const id = document.getElementById('deleteCatId').value;
    const errorEl = document.getElementById('deleteCatError');

    try {
        showLoading(true);
        const res = await apiDelete(`/bed-categories/${getHospitalId()}/${id}`);

        if (res && !res.error) {
            showToast("Category deleted successfully", "success");
            closeModal('deleteCategoryModal');
            await loadDashboard();
        } else {
            errorEl.textContent = res.error || "Failed to delete category";
            errorEl.style.display = 'block';
        }
    } catch (err) {
        errorEl.textContent = "Error deleting category";
        errorEl.style.display = 'block';
    } finally {
        showLoading(false);
    }
}

// ==============================
// NOTIFICATIONS POPOVER
// ==============================

function toggleNotifications() {
    const popover = document.getElementById('notifPopover');
    if (popover) {
        const isVisible = popover.classList.contains('active');
        if (isVisible) {
            popover.classList.remove('active');
        } else {
            popover.classList.add('active');
            renderNotifications();
        }
    }
}

async function renderNotifications() {
    const list = document.getElementById('notifPopoverList');
    const fullList = document.getElementById('notificationsList');
    const hospitalId = getHospitalId();

    try {
        const data = await apiGet(`/notifications/${hospitalId}`);
        if (!data || !data.notifications) return;

        const html = data.notifications.length === 0 
            ? '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">No notifications</div>'
            : data.notifications.map(n => `
                <div class="notification-item ${n.isRead ? '' : 'unread'}" onclick="markAsRead(${n.id})">
                    <div class="notification-icon ${n.type.toLowerCase()}">
                        ${n.type === 'WARNING' ? '⚠️' : '🔔'}
                    </div>
                    <div class="notification-content">
                        <div class="notification-msg">${n.message}</div>
                        <div class="notification-time">${new Date(n.createdAt).toLocaleString()}</div>
                    </div>
                </div>
            `).join('');

        if (list) list.innerHTML = html;
        if (fullList) fullList.innerHTML = html;

        // Update badge
        const badge = document.getElementById('headerNotifBadge');
        const navBadge = document.getElementById('navNotifBadge');
        if (badge) {
            badge.textContent = data.unreadCount;
            badge.style.display = data.unreadCount > 0 ? 'flex' : 'none';
        }
        if (navBadge) {
            navBadge.textContent = data.unreadCount;
            navBadge.style.display = data.unreadCount > 0 ? 'flex' : 'none';
        }

    } catch (err) {
        console.error("Failed to render notifications:", err);
    }
}

async function markAsRead(id) {
    await apiPut(`/notifications/${id}/read`);
    renderNotifications();
}

// Global logout click listener
document.getElementById('logoutLink')?.addEventListener('click', handleLogout);
document.getElementById('profileLogoutBtn')?.addEventListener('click', handleLogout);