/**
 * HospiSync – Setup Wizard Logic
 */

let currentStep = 1;
const totalSteps = 4;
const selectedDepts = new Set();
let addedDoctors = []; // Track doctors added during wizard

const DEPARTMENTS = [
    { id: 'icu', name: 'ICU', icon: '🏥', default: true },
    { id: 'daycare', name: 'Daycare', icon: '☀️', default: true },
    { id: 'general', name: 'General Ward', icon: '🛏️', default: true },
    { id: 'childcare', name: 'Child Care', icon: '👶', default: false },
    { id: 'essential', name: 'Essential Care', icon: '🩹', default: false },
    { id: 'emergency', name: 'Emergency', icon: '🚨', default: false },
    { id: 'cardiology', name: 'Cardiology', icon: '❤️', default: false },
    { id: 'neurology', name: 'Neurology', icon: '🧠', default: false }
];

const SPECIALITIES = [
    'ICU', 'Cardiology', 'Neurology', 'General', 
    'Emergency', 'Child Care', 'Daycare', 'Essential Care'
];

document.addEventListener('DOMContentLoaded', () => {
    if (!isLoggedIn()) {
        window.location.href = '/login.html';
        return;
    }

    let hospital = null;
    try {
        const hospitalStr = localStorage.getItem("hospital");
        hospital = hospitalStr ? JSON.parse(hospitalStr) : null;
    } catch (e) {}

    if (hospital && hospital.setupCompleted === true) {
        window.location.href = "/dashboard.html";
        return;
    }
    
    selectedDepts.clear();
    DEPARTMENTS.forEach(dept => {
        if (dept.default) {
            selectedDepts.add(dept.id);
        }
    });

    renderDeptGrid();
});

function renderDeptGrid() {
    const grid = document.getElementById('deptGrid');
    if (!grid) return;
    
    grid.innerHTML = DEPARTMENTS.map(dept => `
        <div class="dept-card relative flex flex-col items-center justify-center p-6 bg-white border border-surface-container-high rounded-2xl cursor-pointer hover:bg-surface-container-low transition-all duration-200 group ${selectedDepts.has(dept.id) ? 'selected' : ''}" onclick="toggleDept('${dept.id}')" id="dept-${dept.id}">
            <div class="absolute top-3 right-3 w-6 h-6 bg-primary rounded-full flex items-center justify-center opacity-0 group-[.selected]:opacity-100 transition-opacity">
                <span class="material-symbols-outlined text-[14px] text-white font-bold">check</span>
            </div>
            <span class="text-4xl mb-3">${dept.icon}</span>
            <span class="text-[11px] font-black uppercase tracking-[0.15em] text-on-surface-variant group-[.selected]:text-primary text-center">${dept.name}</span>
        </div>
    `).join('');
}

function toggleDept(id) {
    const el = document.getElementById(`dept-${id}`);
    if (selectedDepts.has(id)) {
        selectedDepts.delete(id);
        el.classList.remove('selected');
    } else {
        selectedDepts.add(id);
        el.classList.add('selected');
    }
}

function renderCapacityGrid() {
    const grid = document.getElementById('capacityGrid');
    const selectedList = DEPARTMENTS.filter(d => selectedDepts.has(d.id));
    
    grid.innerHTML = selectedList.map(dept => `
        <div class="bg-white p-5 rounded-2xl border border-surface-container-high flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow-ambient transition-all">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 bg-surface-container-low rounded-xl flex items-center justify-center text-2xl">${dept.icon}</div>
                <div>
                    <h4 class="text-sm font-black text-on-surface uppercase tracking-widest">${dept.name}</h4>
                    <p class="text-[9px] text-on-surface-variant font-black uppercase tracking-tighter">Operational Bed Metric</p>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <label for="cap-${dept.id}" class="text-[10px] font-black text-outline uppercase tracking-[0.1em]">Total Units</label>
                <input type="number" 
                       id="cap-${dept.id}" 
                       placeholder="0" 
                       min="1" 
                       class="w-24 bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm font-black text-primary text-center focus:ring-2 focus:ring-primary/10 outline-none">
            </div>
        </div>
    `).join('');
}

function renderDoctorSpecialityOptions() {
    const select = document.getElementById('docSpeciality');
    if (!select) return;
    
    // Get currently selected department names
    const selectedDeptNames = DEPARTMENTS
        .filter(d => selectedDepts.has(d.id))
        .map(d => d.name.toUpperCase());
        
    let html = `<option value="" disabled selected>Select a speciality...</option>`;
    
    // Group specialities into "In your hospital" and "Other"
    let inHospital = [];
    let others = [];
    
    SPECIALITIES.forEach(s => {
        let isSelected = selectedDeptNames.some(name => name.includes(s.toUpperCase()) || s.toUpperCase().includes(name));
        if (s.toUpperCase() === 'GENERAL' && selectedDeptNames.some(n => n.includes('GENERAL WARD'))) isSelected = true;
        
        if (isSelected) {
            inHospital.push(s);
        } else {
            others.push(s);
        }
    });
    
    if (inHospital.length > 0) {
        html += `<optgroup label="Your Selected Departments">`;
        inHospital.forEach(s => {
            html += `<option value="${s.toUpperCase()}">${s}</option>`;
        });
        html += `</optgroup>`;
    }
    
    if (others.length > 0) {
        html += `<optgroup label="Other Available Specialities">`;
        others.forEach(s => {
            html += `<option value="${s.toUpperCase()}">${s}</option>`;
        });
        html += `</optgroup>`;
    }
    
    select.innerHTML = html;
}

async function addDoctorSetup(event) {
    event.preventDefault();
    
    const btn = event.submitter;
    const origText = btn.innerHTML;
    btn.innerHTML = `<div class="loader" style="width:20px;height:20px;border-width:2px;"></div>`;
    btn.disabled = true;
    
    const docData = {
        name: document.getElementById('docName').value.trim(),
        speciality: document.getElementById('docSpeciality').value,
        qualification: document.getElementById('docQualification').value.trim(),
        phone: document.getElementById('docPhone').value.trim(),
        experienceYears: parseInt(document.getElementById('docExperience').value) || 0,
        safeLimit: parseInt(document.getElementById('docSafeLimit').value) || 12,
        shiftStart: document.getElementById('docShiftStart')?.value || '08:00',
        shiftEnd: document.getElementById('docShiftEnd')?.value || '16:00',
        workDays: Array.from(document.querySelectorAll('.work-day-cb:checked')).map(cb => cb.value).join(',') || 'MON,TUE,WED,THU,FRI',
        availabilityType: document.querySelector('input[name="docAvailabilityType"]:checked')?.value || 'PRESENT'
    };
    
    try {
        const response = await fetch('/api/doctors/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + getToken()
            },
            body: JSON.stringify(docData)
        });
        
        const data = await response.json();
        if (response.ok) {
            addedDoctors.push(data);
            document.getElementById('addDoctorForm').reset();
            renderAddedDoctors();
            showToast('Doctor added successfully!', 'success');
        } else {
            showToast(data.error || 'Failed to add doctor', 'error');
        }
    } catch (e) {
        console.error("Error adding doctor", e);
        showToast('Network error while adding doctor', 'error');
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
    }
}

async function removeDoctorAdded(doctorId) {
    if(!confirm("Remove this doctor?")) return;
    
    try {
        const response = await fetch(`/api/doctors/${doctorId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        
        if (response.ok || response.status === 204) {
            addedDoctors = addedDoctors.filter(d => d.id !== doctorId);
            renderAddedDoctors();
            showToast('Doctor removed', 'success');
        } else {
            showToast('Failed to remove doctor', 'error');
        }
    } catch(e) {
        console.error(e);
        showToast('Network error', 'error');
    }
}

function getSpecialityColor(speciality) {
    const colors = {
        'ICU': '#ef4444',
        'CARDIOLOGY': '#f43f5e',
        'NEUROLOGY': '#8b5cf6',
        'GENERAL': '#3b82f6',
        'DAYCARE': '#f59e0b',
        'CHILD CARE': '#10b981',
        'EMERGENCY': '#ea580c'
    };
    return colors[speciality] || '#64748b';
}

function renderAddedDoctors() {
    const grid = document.getElementById('doctorsGrid');
    if (!grid) return;
    
    if (addedDoctors.length === 0) {
        grid.innerHTML = `
            <div class="col-span-1 sm:col-span-2 border border-dashed border-outline-variant/60 rounded-xl p-6 flex flex-col items-center justify-center text-center bg-surface-container-lowest/50">
                <span class="material-icons text-outline-variant mb-2 text-3xl">medical_information</span>
                <p class="text-sm font-bold text-on-surface-variant relative">No doctors added yet.</p>
                <p class="text-xs text-outline mt-1">Add at least one doctor to continue.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = addedDoctors.map(doc => {
        const initial = doc.name.replace('Dr. ', '').charAt(0).toUpperCase();
        const color = getSpecialityColor(doc.speciality);
        
        return `
        <div class="bg-white rounded-xl p-4 border border-surface-container-high shadow-sm flex items-start gap-4 relative">
            <button onclick="removeDoctorAdded(${doc.id})" class="absolute top-2 right-2 text-outline hover:text-error bg-surface-container-low hover:bg-error/10 w-6 h-6 rounded-full flex items-center justify-center transition-colors">
                <span class="material-icons text-[14px]">close</span>
            </button>
            <div class="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-lg" style="background-color: ${color}">
                ${initial}
            </div>
            <div>
                <h4 class="text-sm font-bold text-on-surface line-clamp-1 pr-6">${doc.name}</h4>
                <div class="inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider mt-1 mb-1" style="background-color: ${color}15; color: ${color}">
                    ${doc.speciality}
                </div>
                <p class="text-xs text-on-surface-variant line-clamp-1">
                    ${doc.qualification || 'Doctor'} &bull; ${doc.experienceYears || 0} yrs exp
                </p>
            </div>
        </div>
        `;
    }).join('');
}

function prepareSummary() {
    const deptsCount = selectedDepts.size;
    let totalBeds = 0;
    
    const selectedList = DEPARTMENTS.filter(d => selectedDepts.has(d.id));
    for (const dept of selectedList) {
        const input = document.getElementById(`cap-${dept.id}`);
        if(input && input.value) {
            totalBeds += parseInt(input.value) || 0;
        }
    }
    
    document.getElementById('summary-depts').textContent = deptsCount;
    document.getElementById('summary-beds').textContent = totalBeds;
    
    const docsContainer = document.getElementById('summary-doctors-container');
    const noDocsContainer = document.getElementById('summary-no-doctors-container');
    
    if (addedDoctors.length > 0) {
        document.getElementById('summary-doctors').textContent = addedDoctors.length;
        docsContainer.classList.remove('hidden');
        noDocsContainer.classList.add('hidden');
    } else {
        docsContainer.classList.add('hidden');
        noDocsContainer.classList.remove('hidden');
    }
}

async function nextStep() {
    if (currentStep === 1) {
        if (selectedDepts.size === 0) {
            showToast('Please select at least one department', 'error');
            return;
        }
        renderCapacityGrid();
        goToStep(2);
    } else if (currentStep === 2) {
        let isValid = true;
        const selectedList = DEPARTMENTS.filter(d => selectedDepts.has(d.id));
        
        for (const dept of selectedList) {
            const input = document.getElementById(`cap-${dept.id}`);
            const val = input.value;
            
            if (!val || val.trim() === '' || isNaN(val) || parseInt(val) <= 0 || !Number.isInteger(Number(val))) {
                isValid = false;
                break;
            }
        }
        
        if (!isValid) {
            showToast('Please enter a valid number of beds (positive integer only).', 'error');
            return;
        }
        
        renderDoctorSpecialityOptions();
        renderAddedDoctors();
        goToStep(3);
    } else if (currentStep === 3) {
        if (addedDoctors.length === 0) {
            showToast('No doctors added. You can add them later.', 'warning');
        }
        prepareSummary();
        goToStep(4);
    } else if (currentStep === 4) {
        await finishSetup();
    }
}

function skipStep3() {
    showToast('You can add doctors later from the Doctors section.', 'warning');
    prepareSummary();
    goToStep(4);
}

function prevStep() {
    if (currentStep > 1) {
        goToStep(currentStep - 1);
    }
}

function goToStep(step) {
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active'));
    
    document.querySelectorAll('.step-indicator').forEach(el => {
        el.classList.remove('active');
        const circle = el.querySelector('.step-circle');
        const label = el.querySelector('span:last-child');
        
        if (circle) {
            circle.className = 'step-circle w-10 h-10 rounded-full bg-white border-2 border-outline-variant flex items-center justify-center ring-4 ring-white transition-all';
            const circleSpan = circle.querySelector('span');
            if (circleSpan) circleSpan.className = 'text-outline text-sm font-bold';
        }
        
        if (label && !el.classList.contains('sidebar-nav-item')) {
            label.className = 'text-xs font-medium text-outline';
        }
    });
    
    const targetStepEl = document.getElementById(`step${step}`);
    if (targetStepEl) targetStepEl.classList.add('active');
    
    const mainIndicator = document.getElementById(`step${step}-indicator`);
    const sidebarIndicator = document.getElementById(`step${step}-nav`);
    
    if (mainIndicator) {
        mainIndicator.classList.add('active');
        const circle = mainIndicator.querySelector('.step-circle');
        const label = mainIndicator.querySelector('span:last-child');
        
        if (circle) {
            circle.className = 'step-circle w-10 h-10 rounded-full bg-primary flex items-center justify-center ring-4 ring-white shadow-sm transition-all';
            const circleSpan = circle.querySelector('span');
            if (circleSpan) circleSpan.className = 'text-white text-sm font-bold';
        }
        if (label) label.className = 'text-xs font-bold text-primary';
    }
    
    if (sidebarIndicator) {
        sidebarIndicator.classList.add('active');
    }
    
    currentStep = step;
    
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    const btnSkip = document.getElementById('btnSkip');
    const btnNextText = document.getElementById('btnNextText');
    const btnNextIcon = document.getElementById('btnNextIcon');
    
    if (btnPrev) btnPrev.style.visibility = step === 1 ? 'hidden' : 'visible';
    
    if (btnSkip) {
        if (step === 3) {
            btnSkip.classList.remove('hidden');
        } else {
            btnSkip.classList.add('hidden');
        }
    }
    
    if (btnNext && btnNextText && btnNextIcon) {
        if (step === 4) {
            btnNextText.textContent = 'Go to Dashboard';
            btnNextIcon.textContent = 'check_circle';
        } else {
            btnNextText.textContent = step === 1 ? 'Continue' : 'Next Step';
            btnNextIcon.textContent = 'arrow_forward';
        }
    }
}

function addCustomDepartment() {
    const input = document.getElementById('customDeptName');
    const name = input.value.trim();
    
    if (!name) {
        showToast('Please enter a department name', 'error');
        return;
    }
    
    const id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    if (DEPARTMENTS.some(d => d.id === id)) {
        showToast('This department already exists', 'error');
        return;
    }
    
    const newDept = { id: id, name: name, icon: '🏥', default: false };
    DEPARTMENTS.push(newDept);
    
    selectedDepts.add(id);
    
    input.value = '';
    renderDeptGrid();
    showToast('Custom department added', 'success');
}

async function finishSetup() {
    showLoading(true);
    
    const departments = Array.from(selectedDepts).map(deptId => {
        const dept = DEPARTMENTS.find(d => d.id === deptId);
        return {
            name: dept.name,
            beds: parseInt(document.getElementById(`cap-${deptId}`).value),
            icon: dept.icon
        };
    });
    
    const hospitalId = getHospitalId();
    
    try {
        const response = await fetch(`/api/hospital/setup-complete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + getToken()
            },
            body: JSON.stringify({ hospitalId, departments })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const hospitalStr = localStorage.getItem("hospital");
            if (hospitalStr) {
                const hospital = JSON.parse(hospitalStr);
                hospital.setupCompleted = true;
                localStorage.setItem("hospital", JSON.stringify(hospital));
            }
            showToast('Setup completed successfully!', 'success');
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 1000);
        } else {
            showToast(data.error || 'Setup failed', 'error');
        }
    } catch (err) {
        console.error("Setup error:", err);
        showToast('Network error during setup', 'error');
    } finally {
        showLoading(false);
    }
}
