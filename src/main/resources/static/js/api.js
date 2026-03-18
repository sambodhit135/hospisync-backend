/**
 * HospiSync – API Utility Module
 * Centralized API wrapper with JWT authentication
 */

const API_BASE = '/api';

/* ===============================
   AUTH STORAGE
================================ */

function getToken() {
    return localStorage.getItem('token');
}

function getHospital() {
    const hospital = localStorage.getItem('hospital');
    return hospital ? JSON.parse(hospital) : null;
}

function getHospitalId() {
    const hospital = getHospital();
    let id = null;
    
    if (hospital) {
        id = hospital.hospitalId || hospital.id;
    }
    
    if (!id) {
        id = localStorage.getItem('hospitalId');
    }
    
    // Strict sanitization for stringified falsy values and numeric checks
    if (!id || String(id) === "undefined" || String(id) === "null" || String(id).trim() === "") {
        console.warn("getHospitalId: Hospital ID is invalid/missing", id);
        return null;
    }
    
    return id;
}

function getHospitalName() {
    const hospital = getHospital();
    return hospital ? hospital.hospitalName : null;
}

/* ===============================
   AUTH MANAGEMENT
================================ */

function setAuth(data) {

    if (!data || !data.token) {
        console.error("Invalid auth data");
        return;
    }

    localStorage.setItem('token', data.token);

    const hospitalId = data.id || data.hospitalId;
    if (hospitalId) {
        localStorage.setItem('hospitalId', hospitalId);
    }

    localStorage.setItem('hospital', JSON.stringify({
        hospitalId: hospitalId,
        id: hospitalId,
        hospitalName: data.hospitalName,
        email: data.email,
        setupCompleted: data.setupCompleted
    }));
}

function clearAuth() {

    localStorage.removeItem('token');
    localStorage.removeItem('hospital');
    localStorage.removeItem('hospitalId');

}

function isLoggedIn() {

    const token = getToken();

    return token !== null && token !== undefined && token !== "";

}

function isSetupComplete() {

    const hospital = getHospital();

    return hospital && hospital.setupCompleted === true;

}

/* ===============================
   API REQUEST WRAPPERS
================================ */

async function apiRequest(path, options = {}) {

    const token = getToken();

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers['Authorization'] = 'Bearer ' + token;
    }

    const response = await fetch(API_BASE + path, {
        ...options,
        headers
    });

    if (response.status === 401) {
        clearAuth();
        window.location.href = '/index.html?expired=true';
    }

    if (!response.ok) {
        throw new Error("API request failed");
    }

    const contentType = response.headers.get("content-type");

    if (contentType && contentType.includes("application/json")) {
        return await response.json();
    }

    return null;

}

/* ===============================
   SHORTCUT METHODS
================================ */

function apiGet(path) {

    return apiRequest(path, {
        method: 'GET'
    });

}

function apiPost(path, body) {

    return apiRequest(path, {
        method: 'POST',
        body: JSON.stringify(body)
    });

}

function apiPut(path, body) {

    return apiRequest(path, {
        method: 'PUT',
        body: JSON.stringify(body)
    });

}

function apiDelete(path) {

    return apiRequest(path, {
        method: 'DELETE'
    });

}

/* ===============================
   UI HELPERS
================================ */

function showToast(message, type = 'info') {

    const toast = document.getElementById('toast');

    if (!toast) return;

    toast.className = 'toast active ' + type;

    const icon =
        type === 'success' ? '✅' :
        type === 'error' ? '❌' :
        'ℹ️';

    toast.innerHTML = icon + ' ' + message;

    setTimeout(() => {

        toast.className = 'toast';

    }, 4000);

}

function showLoading(show) {

    const overlay = document.getElementById('loadingOverlay');

    if (!overlay) return;

    overlay.classList.toggle('active', show);

}