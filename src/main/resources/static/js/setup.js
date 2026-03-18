/**
 * HospiSync – Setup Wizard Logic
 */

let currentStep = 1;
const totalSteps = 3;
const selectedDepts = new Set();

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

document.addEventListener('DOMContentLoaded', () => {
    if (!isLoggedIn()) {
        window.location.href = '/index.html';
        return;
    }
    
    const hospital = JSON.parse(localStorage.getItem("hospital"));
    if (hospital && hospital.setupCompleted === true) {
        window.location.href = "/dashboard.html";
        return;
    }
    
    renderDeptGrid();
});

function renderDeptGrid() {
    const grid = document.getElementById('deptGrid');
    grid.innerHTML = DEPARTMENTS.map(dept => `
        <div class="dept-card ${dept.default ? 'selected' : ''}" onclick="toggleDept('${dept.id}')" id="dept-${dept.id}">
            <span class="dept-icon">${dept.icon}</span>
            <span class="dept-name">${dept.name}</span>
        </div>
    `).join('');
    
    DEPARTMENTS.filter(d => d.default).forEach(d => selectedDepts.add(d.id));
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
        <div class="capacity-item" style="flex-direction: column; align-items: stretch; gap: 10px;">
            <div class="capacity-info">
                <span style="font-size: 1.5rem;">${dept.icon}</span>
                <div>
                    <strong>${dept.name}</strong>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">Enter total beds available in this department</div>
                </div>
            </div>
            <input type="number" id="cap-${dept.id}" placeholder="Enter number of beds" min="1" style="width: 100%; text-align: left; padding: 12px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--surface-light); color: var(--text-main);">
        </div>
    `).join('');
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
        // Validation: Check if all capacities are valid positive integers
        let isValid = true;
        const selectedList = DEPARTMENTS.filter(d => selectedDepts.has(d.id));
        
        for (const dept of selectedList) {
            const input = document.getElementById(`cap-${dept.id}`);
            const val = input.value;
            
            // Check if empty, negative, zero, or decimal
            if (!val || val.trim() === '' || isNaN(val) || parseInt(val) <= 0 || !Number.isInteger(Number(val))) {
                isValid = false;
                break;
            }
        }
        
        if (!isValid) {
            showToast('Please enter a valid number of beds (positive integer only).', 'error');
            return;
        }
        
        goToStep(3);
    } else if (currentStep === 3) {
        await finishSetup();
    }
}

function prevStep() {
    if (currentStep > 1) {
        goToStep(currentStep - 1);
    }
}

function goToStep(step) {
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.step-indicator').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`step${step}`).classList.add('active');
    document.getElementById(`step${step}-indicator`).classList.add('active');
    
    currentStep = step;
    
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    
    btnPrev.style.visibility = step === 1 ? 'hidden' : 'visible';
    btnNext.textContent = step === 3 ? 'Finish Setup' : 'Continue';
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
    
    // Automatically select the newly created department
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
            const hospital = JSON.parse(localStorage.getItem("hospital"));
            if (hospital) {
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
