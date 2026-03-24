/**
 * HospiSync – Doctor Management Logic
 * Handles API integration, dynamic rendering, and local filtering
 * DEBUG VERSION: Fixed registration and enhanced logging
 */

let allDoctors = [];

document.addEventListener('DOMContentLoaded', () => {
    // Initial load
    initDashboardInfo();
    loadDoctors();

    // Form Toggle Logic
    const toggleBtn = document.getElementById('toggleAddFormBtn');
    const formContent = document.getElementById('addFormContent');
    const chevron = document.getElementById('addFormChevron');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            formContent.classList.toggle('expanded');
            chevron.textContent = formContent.classList.contains('expanded') ? 'remove_circle' : 'add_circle';
            chevron.classList.toggle('text-primary');
        });
    }

    // Form Submit
    const addDoctorForm = document.getElementById('addDoctorForm');
    if (addDoctorForm) {
        addDoctorForm.addEventListener('submit', handleAddDoctor);
    }

    // Filters
    ['filterSearch', 'filterSpeciality', 'filterStatus'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', applyFilters);
        if (el && el.tagName === 'SELECT') el.addEventListener('change', applyFilters);
    });
});

function initDashboardInfo() {
    const hospitalName = getHospitalName() || "Hospital Admin";
    const nameEl = document.getElementById('headerHospitalName');
    const avatarEl = document.getElementById('headerAvatar');
    if (nameEl) nameEl.textContent = hospitalName;
    if (avatarEl) avatarEl.textContent = hospitalName.charAt(0);
}

async function loadDoctors() {
    showLoading(true);
    try {
        const doctors = await apiGet('/doctors/all');
        allDoctors = doctors || [];
        renderStats(allDoctors);
        renderDoctors(allDoctors);
    } catch (err) {
        console.error("Failed to load doctors:", err);
        showToast("Error loading clinical roster", "error");
    } finally {
        showLoading(false);
    }
}

function renderStats(doctors) {
    const total = doctors.length;
    const available = doctors.filter(d => d.isAvailable).length;
    const atLimit = doctors.filter(d => d.availabilityStatus === 'AT_LIMIT').length;
    const specialities = new Set(doctors.map(d => d.speciality)).size;

    const els = {
        'statTotalDoctors': total,
        'statAvailable': available,
        'statAtLimit': atLimit,
        'statSpecialities': specialities
    };

    for (const [id, val] of Object.entries(els)) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

function renderDoctors(doctors) {
    const grid = document.getElementById('doctorGrid');
    const emptyState = document.getElementById('emptyState');
    const countText = document.getElementById('resultsCount');

    if (!grid || !emptyState) return;

    grid.innerHTML = '';
    if (countText) countText.textContent = `Showing ${doctors.length} doctors`;

    if (doctors.length === 0) {
        grid.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    grid.classList.remove('hidden');
    emptyState.classList.add('hidden');

    doctors.forEach(doctor => {
        const card = createDoctorCard(doctor);
        grid.appendChild(card);
    });
}

function createDoctorCard(doc) {
    const div = document.createElement('div');
    
    const isAtLimit = doc.availabilityStatus === 'AT_LIMIT' || doc.currentPatientCount >= doc.safeLimit;
    
    const loadPercent = Math.min(100, (doc.currentPatientCount / doc.safeLimit) * 100);
    let loadColor = 'bg-success';
    if (loadPercent >= 100) loadColor = 'bg-error';
    else if (loadPercent >= 80) loadColor = 'bg-warning';

    const remaining = Math.max(0, doc.safeLimit - doc.currentPatientCount);
    let limitText = `Can take ${remaining} more patients`;
    let limitColor = 'text-success';
    if (remaining === 0) {
        limitText = 'At safe limit';
        limitColor = 'text-error';
    } else if (remaining <= 3) {
        limitText = 'Almost full';
        limitColor = 'text-warning';
    }

    div.className = `bg-white p-6 rounded-xl shadow-ambient border ${isAtLimit ? 'border-error border-2' : 'border-slate-100'} hover:shadow-bold transition-all relative group`;
    
    const specialityColors = {
        'ICU': 'bg-red-100 text-red-700',
        'Cardiology': 'bg-blue-100 text-blue-700',
        'Neurology': 'bg-purple-100 text-purple-700',
        'General': 'bg-slate-100 text-slate-700',
        'Emergency': 'bg-orange-100 text-orange-700',
        'Child Care': 'bg-pink-100 text-pink-700',
        'Daycare': 'bg-teal-100 text-teal-700',
        'Essential Care': 'bg-indigo-100 text-indigo-700'
    };

    const specClass = specialityColors[doc.speciality] || 'bg-slate-100 text-slate-700';
    const initial = doc.name ? doc.name.charAt(0) : 'D';
    
    let availabilityBadge = '';
    if (doc.availabilityType === 'PRESENT') {
        availabilityBadge = `<span class="bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full flex items-center gap-1 text-[9px] font-black uppercase tracking-wider"><span class="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> PRESENT</span>`;
    } else if (doc.availabilityType === 'ON_CALL') {
        availabilityBadge = `<span class="bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1 text-[9px] font-black uppercase tracking-wider"><span class="w-1.5 h-1.5 bg-amber-500 rounded-full"></span> ON-CALL</span>`;
    } else {
        availabilityBadge = `<span class="bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1 text-[9px] font-black uppercase tracking-wider"><span class="w-1.5 h-1.5 bg-red-500 rounded-full"></span> OFF DUTY</span>`;
    }
    
    let manualOverrideHtml = `
        <select onchange="updateDocAvailabilityType(${doc.id}, this.value)" class="text-[10px] font-bold py-1 px-2 border-slate-200 rounded-lg text-slate-600 bg-white shadow-sm focus:ring-1 focus:ring-primary focus:border-primary">
            <option value="PRESENT" ${doc.availabilityType==='PRESENT'?'selected':''}>🟢 PRESENT</option>
            <option value="ON_CALL" ${doc.availabilityType==='ON_CALL'?'selected':''}>🟡 ON-CALL</option>
            <option value="OFF_DUTY" ${doc.availabilityType==='OFF_DUTY'?'selected':''}>🔴 OFF DUTY</option>
        </select>
    `;

    div.innerHTML = `
        <div class="flex items-start justify-between mb-6">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-xl font-black ${specClass.split(' ')[0]} ${specClass.split(' ')[1]}">
                    ${initial}
                </div>
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <h4 class="font-bold text-slate-900 tracking-tight">${doc.name}</h4>
                        ${availabilityBadge}
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${specClass}">
                        ${doc.speciality}
                    </span>
                    <p class="text-[10px] text-slate-500 mt-1 font-bold">Shift: ${doc.shiftInfo || 'N/A'}</p>
                </div>
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${specClass}">
                        ${doc.speciality}
                    </span>
                </div>
            </div>
            <button onclick="confirmDelete(${doc.id})" class="text-slate-300 hover:text-error transition-colors p-1">
                <span class="material-symbols-outlined text-sm">delete</span>
            </button>
        </div>

        <div class="mb-4">
            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Qualifications</p>
            <p class="text-xs text-slate-600 font-medium">${doc.qualification || 'N/A'} • ${doc.experienceYears || 0} Years Exp</p>
        </div>

        <div class="space-y-3 mb-4">
            <div class="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span>Patient Load</span>
                <span class="${isAtLimit ? 'text-error' : 'text-slate-600'}">${doc.currentPatientCount} / ${doc.safeLimit}</span>
            </div>
            <div class="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div class="${loadColor} h-full transition-all duration-500" style="width: ${loadPercent}%"></div>
            </div>
            <p class="text-[11px] font-bold ${limitColor}">
                ${limitText}
            </p>
        </div>
        
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6">
            <label class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3 block">Update current patients:</label>
            <div class="flex items-center gap-3">
                <button onclick="decrementLoad(${doc.id})" class="w-8 h-8 rounded-full border border-slate-200 bg-white text-slate-600 text-lg flex items-center justify-center hover:bg-slate-100 transition-colors">−</button>
                <input type="number" id="loadInput-${doc.id}" value="${doc.currentPatientCount}" min="0" max="${doc.safeLimit}" class="w-16 text-center border border-slate-200 rounded-lg py-1.5 font-bold text-slate-700 text-sm focus:ring-1 focus:ring-primary outline-none">
                <button onclick="incrementLoad(${doc.id})" class="w-8 h-8 rounded-full border border-slate-200 bg-white text-slate-600 text-lg flex items-center justify-center hover:bg-slate-100 transition-colors">+</button>
                <button onclick="saveLoad(${doc.id})" class="ml-2 px-4 py-1.5 bg-primary text-white border-none rounded-lg text-xs font-bold shadow-sm hover:bg-primary-container transition-colors active:scale-95">Save</button>
            </div>
            <div class="text-[10px] text-slate-400 font-bold uppercase mt-2 text-right">Safe limit: ${doc.safeLimit}</div>
        </div>

        <div class="pt-4 border-t border-slate-50 flex items-center justify-between">
            ${manualOverrideHtml}
            <span class="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">ID: DOC-${doc.id}</span>
        </div>
    `;

    return div;
}

/**
 * Handle Add Doctor with enhanced logging as requested by user
 */
async function handleAddDoctor(e) {
    if (e) e.preventDefault();
    
    // Exact localStorage key from api.js is 'token'
    const token = localStorage.getItem('token');
    
    const doctorName = document.getElementById('doctorName').value;
    const doctorEmail = document.getElementById('doctorEmail').value;
    const doctorPhone = document.getElementById('doctorPhone').value;
    const doctorSpeciality = document.getElementById('doctorSpeciality').value;
    const doctorQualification = document.getElementById('doctorQualification').value;
    const doctorExperience = document.getElementById('doctorExperience').value;
    const doctorSafeLimit = document.getElementById('doctorSafeLimit').value;
    const doctorShiftStartTime = document.getElementById('doctorShiftStart')?.value || '08:00';
    const doctorShiftEndTime = document.getElementById('doctorShiftEnd')?.value || '16:00';
    const doctorWorkDays = document.getElementById('doctorWorkDays')?.value || 'MON,TUE,WED,THU,FRI';

    const payload = {
        name: doctorName,
        email: doctorEmail,
        phone: doctorPhone,
        speciality: doctorSpeciality,
        qualification: doctorQualification,
        experienceYears: parseInt(doctorExperience) || 0,
        safeLimit: parseInt(doctorSafeLimit) || 12,
        shiftStartTime: doctorShiftStartTime + (doctorShiftStartTime.split(':').length === 2 ? ':00' : ''),
        shiftEndTime: doctorShiftEndTime + (doctorShiftEndTime.split(':').length === 2 ? ':00' : ''),
        workDays: doctorWorkDays.toUpperCase()
    };

    console.log("Attempting to add doctor with payload:", payload);

    showLoading(true);
    let response;
    try {
        // Direct fetch call as requested for better debugging
        response = await fetch('/api/doctors/add', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log("Response status:", response.status);

        if (response.ok) {
            const data = await response.json();
            console.log("Success response data:", data);
            showToast("Medical professional onboarded successfully", "success");
            document.getElementById('addDoctorForm').reset();
            const content = document.getElementById('addFormContent');
            if (content && content.classList.contains('expanded')) {
                document.getElementById('toggleAddFormBtn').click();
            }
            await loadDoctors();
        } else {
            const errorText = await response.text();
            console.error('Server error response:', errorText);
            
            // Try to parse JSON error if available
            try {
                const errorJson = JSON.parse(errorText);
                showToast("Failed: " + (errorJson.message || errorJson.error || "Validation error"), "error");
            } catch (pErr) {
                showToast("Registration failed. Status: " + response.status, "error");
            }
        }
    } catch (error) {
        console.error('Add doctor fetch error:', error);
        console.error('Response status context:', response?.status);
        showToast('Connection error: ' + error.message, "error");
    } finally {
        showLoading(false);
    }
}

async function updateDocAvailabilityType(id, type) {
    const token = localStorage.getItem('token');
    try {
        const response = await fetch('/api/doctors/' + id + '/availability-type', {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ availabilityType: type })
        });
        if (response.ok) {
            const res = await response.json();
            const idx = allDoctors.findIndex(d => d.id === id);
            if (idx !== -1) {
                allDoctors[idx] = res;
                renderStats(allDoctors);
                renderDoctors(allDoctors);
            }
            showToast("Doctor availability overriden", "success");
        } else {
            showToast("Failed to override availability", "error");
        }
    } catch (err) {
        console.error("Update error:", err);
        showToast("Connection issue. Try again.", "error");
    }
}

function confirmDelete(id) {
    if (confirm("Are you sure you want to remove this doctor from the registry? This action cannot be undone.")) {
        handleDelete(id);
    }
}

async function handleDelete(id) {
    showLoading(true);
    try {
        await apiDelete(`/doctors/${id}`);
        showToast("Doctor record removed", "success");
        allDoctors = allDoctors.filter(d => d.id !== id);
        renderStats(allDoctors);
        renderDoctors(allDoctors);
    } catch (err) {
        console.error("Delete error:", err);
        showToast("Delete operation failed", "error");
    } finally {
        showLoading(false);
    }
}

function applyFilters() {
    const search = document.getElementById('filterSearch').value.toLowerCase();
    const speciality = document.getElementById('filterSpeciality').value;
    const status = document.getElementById('filterStatus').value;

    const filtered = allDoctors.filter(doc => {
        const matchesSearch = doc.name.toLowerCase().includes(search);
        const matchesSpec = !speciality || doc.speciality === speciality;
        
        let matchesStatus = true;
        if (status === 'AVAILABLE') matchesStatus = doc.isAvailable && doc.availabilityStatus === 'AVAILABLE';
        else if (status === 'NEAR_LIMIT') matchesStatus = doc.availabilityStatus === 'NEAR_LIMIT';
        else if (status === 'AT_LIMIT') matchesStatus = doc.availabilityStatus === 'AT_LIMIT';
        
        return matchesSearch && matchesSpec && matchesStatus;
    });

    renderDoctors(filtered);
}

function incrementLoad(doctorId) {
    const input = document.getElementById('loadInput-' + doctorId);
    if (!input) return;
    const max = parseInt(input.getAttribute('max'));
    let val = parseInt(input.value) || 0;
    if (val < max) {
        input.value = val + 1;
    }
}

function decrementLoad(doctorId) {
    const input = document.getElementById('loadInput-' + doctorId);
    if (!input) return;
    let val = parseInt(input.value) || 0;
    if (val > 0) {
        input.value = val - 1;
    }
}

async function saveLoad(doctorId) {
    const input = document.getElementById('loadInput-' + doctorId);
    if (!input) return;
    
    const count = parseInt(input.value) || 0;
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch('/api/doctors/' + doctorId + '/update-load', {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ currentPatientCount: count })
        });
        
        if (response.ok) {
            showToast('Doctor load updated successfully', 'success');
            if (typeof loadDoctors === 'function') {
                loadDoctors();
            }
            if (typeof loadDoctorsForBedsTab === 'function') {
                loadDoctorsForBedsTab(); // Will update Dashboard view if running from there
            }
        } else {
            const err = await response.json();
            showToast(err.message || err.error || 'Update failed', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Error updating load', 'error');
    }
}
