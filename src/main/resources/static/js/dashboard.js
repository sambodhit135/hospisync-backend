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

    // Deep Linking Support (query param and hash)
    const urlParams = new URLSearchParams(window.location.search);
    const section = urlParams.get('section');
    if (section) {
        showSection(section);
    } else if (window.location.hash) {
        const hashSection = window.location.hash.replace('#', '').replace('transfers', 'transfer');
        if (hashSection) showSection(hashSection);
    }

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

    // Use classList instead of overwriting className
    badge.classList.remove("underutilized", "moderate", "overutilized");

    if(data.utilizationStatus==="UNDERUTILIZED"){
        badge.classList.add("bg-blue-100", "text-blue-700");
        text.textContent="Optimized Load";
    }
    else if(data.utilizationStatus==="MODERATE"){
        badge.classList.add("bg-green-100", "text-green-700");
        text.textContent="Stable Throughput";
    }
    else{
        badge.classList.add("bg-error/10", "text-error");
        text.textContent="High Saturation";
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
        grid.innerHTML=`<div class="col-span-full py-12 text-center text-slate-400 font-bold uppercase tracking-widest">No Active Bed Units Found</div>`;
        return;
    }

    grid.innerHTML=categories.map(cat=>{
        const name = cat.name || cat.categoryName;
        const availPercent = Math.round((cat.available / cat.total) * 100);
        const statusColor = cat.available > 0 ? 'text-green-600' : 'text-error';
        
        return `
        <div class="bg-white p-6 rounded-xl shadow-ambient border border-white hover:shadow-lg transition-all relative group">
            <div class="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button onclick="openEditCategoryModal(${cat.categoryId || cat.id}, '${name}', ${cat.total}, ${cat.occupied}, '${cat.icon}')" class="p-1.5 bg-slate-50 rounded-lg text-slate-400 hover:text-primary transition-colors">
                    <span class="material-symbols-outlined text-sm">edit</span>
                 </button>
                 <button onclick="openDeleteCategoryModal(${cat.categoryId || cat.id}, '${name}')" class="p-1.5 bg-slate-50 rounded-lg text-slate-400 hover:text-error transition-colors">
                    <span class="material-symbols-outlined text-sm">delete</span>
                 </button>
            </div>
            <div class="text-3xl mb-4">${cat.icon}</div>
            <div class="text-sm font-black text-slate-900 uppercase tracking-tight mb-4">${name}</div>
            
            <div class="space-y-3">
                <div class="flex justify-between items-end">
                    <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Census</span>
                    <span class="text-lg font-black text-slate-900">${cat.occupied}/${cat.total}</span>
                </div>
                <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full bg-primary" style="width: ${100 - availPercent}%"></div>
                </div>
                <div class="flex justify-between items-center pt-1">
                    <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Availability</span>
                    <span class="text-[11px] font-bold ${statusColor}">${cat.available} Units</span>
                </div>
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
                backgroundColor:["#00387a","#10b981"],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            cutout: '75%',
            plugins: {
                legend: { display: false }
            }
        }
    });

    const categories=data.categories || [];

    barChart=new Chart(ctx2,{
        type:"bar",
        data:{
            labels:categories.map(c=>c.name || c.categoryName),
            datasets:[
                {
                    label:"Occupied",
                    data:categories.map(c=>c.occupied),
                    backgroundColor:"#ef4444", // Red
                    borderRadius: 6,
                    barThickness: 30,
                },
                {
                    label:"Available",
                    data:categories.map(c=>c.available),
                    backgroundColor:"#22c55e", // Green
                    borderRadius: 6,
                    barThickness: 30,
                }
            ]
        },
        options: {
            indexAxis: 'x',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { 
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        usePointStyle: true,
                        font: { size: 11, weight: 'bold' }
                    }
                } 
            },
            scales: {
                x: { 
                    grid: { display: false },
                    ticks: { font: { size: 11, weight: 'bold' } }
                },
                y: { 
                    beginAtZero: true,
                    grid: { color: "rgba(0,0,0,0.02)" },
                    ticks: { font: { size: 10 } }
                }
            }
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
            plugins: {
                legend: {
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 20,
                        font: { size: 10, weight: 'bold' }
                    }
                }
            },
            scales: {
                y: { 
                   beginAtZero: true,
                   grid: { color: "#f8fafc" },
                   ticks: { font: { size: 10 } }
                },
                x: {
                   grid: { display: false },
                   ticks: { font: { size: 10 } }
                }
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
        <div class="bg-white p-6 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
            <div class="flex items-center justify-between mb-4">
                <span class="text-xl">${cat.icon}</span>
                <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cap: ${cat.total}</span>
            </div>
            <div class="mb-2">
                <p class="text-[11px] font-black text-slate-900 uppercase tracking-tighter truncate">${cat.name || cat.categoryName}</p>
                <p class="text-[9px] text-slate-500 font-bold">In-Patient Unit</p>
            </div>
            <div class="relative mt-4">
                <input type="number" 
                       class="w-full bg-slate-50 border-none rounded-lg py-3 px-4 text-sm font-black text-primary focus:ring-2 focus:ring-primary/20 transition-all occupancy-input" 
                       data-id="${cat.categoryId || cat.id}" 
                       data-total="${cat.total}"
                       data-name="${cat.name || cat.categoryName}"
                       value="${cat.occupied}" 
                       min="0"
                       oninput="validateOccupancyInput(this)">
                <span class="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300 uppercase">OCC</span>
            </div>
            <div id="error_${cat.categoryId || cat.id}" class="bed-input-error mt-2 p-2 bg-error/5 text-error text-[10px] font-bold rounded hidden animate-pulse"></div>
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
        if (sectionId === 'transfer') {
            if (typeof loadTransfers === 'function') loadTransfers();
            if (typeof initTransferPage === 'function') initTransferPage();
        }
        if (sectionId === 'notifications' && typeof renderNotifications === 'function') renderNotifications();
        if (sectionId === 'overview') {
            loadDashboard();
            if (mapInstance) setTimeout(() => mapInstance.invalidateSize(), 200);
        }
        if (sectionId === 'beds' && typeof loadDoctorsForBedsTab === 'function') {
            loadDoctorsForBedsTab();
        }
    }

    // Close sidebar on mobile after click
    if (window.innerWidth <= 1024) toggleSidebar();
}
window.showSection = showSection;

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
        const isHidden = popover.classList.contains('hidden');
        if (!isHidden) {
            popover.classList.add('hidden');
        } else {
            popover.classList.remove('hidden');
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

// ==============================
// DOCTOR LOAD UPDATE (BEDS TAB)
// ==============================

async function loadDoctorsForBedsTab() {
    const list = document.getElementById('dashboardDoctorList');
    if (!list) return;
    
    try {
        const hospitalId = getHospitalId();
        if(!hospitalId) return;

        const data = await apiGet(`/doctors/all?hospitalId=${hospitalId}`);
        if (!data || data.error) {
            list.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-error text-xs">Failed to load doctors</td></tr>`;
            return;
        }

        if (data.length === 0) {
            list.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 text-xs">No doctors found for this facility</td></tr>`;
            return;
        }

        list.innerHTML = data.map(doc => {
            const isAtLimit = doc.availabilityStatus === 'AT_LIMIT' || doc.currentPatientCount >= doc.safeLimit;
            let statusBadge = '';
            
            if (isAtLimit) {
                statusBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-error/10 text-error">AT CAPACITY</span>`;
            } else if (!doc.isAvailable) {
                statusBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-500">UNAVAILABLE</span>`;
            } else {
                statusBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-success/10 text-success">AVAILABLE</span>`;
            }

            return `
                <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="px-4 py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs">${doc.name.charAt(0)}</div>
                            <span class="font-bold text-slate-900 text-sm">${doc.name}</span>
                        </div>
                    </td>
                    <td class="px-4 py-4 text-xs font-medium text-slate-600">${doc.speciality}</td>
                    <td class="px-4 py-4">
                        <div class="flex flex-col gap-1 items-start">
                            ${statusBadge}
                            <span class="text-[10px] text-slate-400 font-bold">Load: ${doc.currentPatientCount} / ${doc.safeLimit}</span>
                        </div>
                    </td>
                    <td class="px-4 py-4 text-right">
                        <div class="flex items-center justify-end gap-2">
                            <button onclick="decrementLoad(${doc.id})" class="w-7 h-7 rounded-full border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:bg-slate-100 transition-colors">−</button>
                            <input type="number" id="loadInput-${doc.id}" value="${doc.currentPatientCount}" min="0" max="${doc.safeLimit}" class="w-12 text-center border border-slate-200 rounded text-xs py-1 outline-none font-bold">
                            <button onclick="incrementLoad(${doc.id})" class="w-7 h-7 rounded-full border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:bg-slate-100 transition-colors">+</button>
                            <button onclick="saveLoad(${doc.id})" class="ml-1 px-3 py-1 bg-primary text-white rounded text-[10px] font-bold shadow-sm hover:brightness-110 transition-all">Save</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error(e);
        list.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-error text-xs">Error loading doctors</td></tr>`;
    }
}