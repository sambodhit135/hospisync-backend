/**
 * HospiSync – Authentication Module
 */

document.addEventListener('DOMContentLoaded', () => {

    /* ===============================
       SESSION EXPIRED MESSAGE
    =============================== */

    const urlParams = new URLSearchParams(window.location.search);

    if (urlParams.get('expired') === 'true') {

        showToast('Session expired. Please login again.', 'error');

        window.history.replaceState({}, document.title, window.location.pathname);

    }

    /* ===============================
       AUTO REDIRECT IF LOGGED IN
    =============================== */

    if (
        isLoggedIn() &&
        !window.location.pathname.includes('dashboard') &&
        !window.location.pathname.includes('setup')
    ) {

        if (isSetupComplete()) {

            window.location.href = '/dashboard.html';

        } else {

            window.location.href = '/setup.html';

        }

        return;

    }

    /* ===============================
       LOGIN FORM
    =============================== */

    const loginForm = document.getElementById('loginForm');

    if (loginForm) {

        loginForm.addEventListener('submit', async (e) => {

            e.preventDefault();
            await loginUser();

        });

    }

    /* ===============================
       REGISTER FORM
    =============================== */

    const registerForm = document.getElementById('registerForm');

    if (registerForm) {
        initMap();

        registerForm.addEventListener('submit', async (e) => {

            e.preventDefault();
            await handleRegister();

        });

    }

});

/* ===============================
   MAP INITIALIZATION & SEARCH
================================ */

let map, marker;
let searchTimeout;

function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    // Default coordinates (e.g., New Delhi)
    const latInput = document.getElementById('latitude');
    const lngInput = document.getElementById('longitude');
    const defaultLat = parseFloat(latInput.value) || 28.6139;
    const defaultLng = parseFloat(lngInput.value) || 77.2090;

    map = L.map('map').setView([defaultLat, defaultLng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    marker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(map);

    marker.on('dragend', function(e) {
        const position = marker.getLatLng();
        updateMapLocation(position.lat, position.lng);
    });

    // Only geocode if we actually have values (from setup or previous entry)
    if (latInput.value && lngInput.value) {
        reverseGeocode(parseFloat(latInput.value), parseFloat(lngInput.value));
    }

    // Map Click event
    map.on('click', function(e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;

        updateMapLocation(lat, lng);
    });

    // Nominatim Address Search
    const searchInput = document.getElementById('mapSearch');
    const suggestionsList = document.getElementById('searchSuggestions');

    if (searchInput && suggestionsList) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();

            if (query.length < 3) {
                suggestionsList.style.display = 'none';
                return;
            }

            searchTimeout = setTimeout(() => fetchNominatimLocations(query, suggestionsList), 500);
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !suggestionsList.contains(e.target)) {
                suggestionsList.style.display = 'none';
            }
        });
    }

    // Proactively request location on load after a short delay
    console.log("Initializing map and requesting location...");
    setTimeout(() => {
        if (typeof useMyLocation === 'function') {
            useMyLocation();
        }
    }, 1500);
}

function setLatitude(lat) {
    document.getElementById('latitude').value = parseFloat(lat).toFixed(6);
}

function setLongitude(lng) {
    document.getElementById('longitude').value = parseFloat(lng).toFixed(6);
}

function updateMapLocation(lat, lng) {
    setLatitude(lat);
    setLongitude(lng);

    marker.setLatLng([lat, lng]);
    map.setView([lat, lng], 15);
    
    // Auto-fill address with feedback
    const addressInput = document.getElementById('address');
    const searchInput = document.getElementById('mapSearch');
    if (addressInput) addressInput.value = "📍 Detecting address...";
    if (searchInput) searchInput.value = "📍 Detecting address...";
    
    reverseGeocode(lat, lng);
}

async function reverseGeocode(lat, lng) {
    console.log(`Reverse geocoding: ${lat}, ${lng}`);
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
            headers: {
                'User-Agent': 'HospiSync/1.0'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        console.log("Reverse geocode response:", data);
        
        if (data && data.display_name) {
            const address = data.display_name;
            const addressInput = document.getElementById('address');
            const searchInput = document.getElementById('mapSearch');
            
            if (addressInput) {
                addressInput.value = address;
                console.log("Updated address field");
            }
            if (searchInput) {
                searchInput.value = address;
                console.log("Updated search field");
            }
        } else {
            console.warn("No address found for these coordinates.");
        }
    } catch (err) {
        console.error('Error in reverse geocoding:', err);
        const locationStatus = document.getElementById('locationStatus');
        if (locationStatus) {
            locationStatus.style.display = 'block';
            locationStatus.innerHTML = `<span class="text-red-400">Address detection failed: ${err.message}</span>`;
            setTimeout(() => { locationStatus.style.display = 'none'; }, 5000);
        }
    }
}

function useMyLocation() {
    if (!navigator.geolocation) {
        console.warn('Geolocation is not supported by your browser.');
        return;
    }

    const btn = document.getElementById('geolocateBtn');
    const locationStatus = document.getElementById('locationStatus');
    const addressInput = document.getElementById('address');
    const searchInput = document.getElementById('mapSearch');
    
    if (btn) btn.innerHTML = '<span class="animate-spin inline-block">⏳</span> Detecting...';
    if (locationStatus) {
        locationStatus.style.display = 'block';
        locationStatus.className = "text-xs font-medium px-4 py-2 rounded-lg bg-blue-900/40 border border-blue-500/30 text-blue-200 mb-4 animate-pulse";
        locationStatus.innerHTML = '<span>📡</span> Detecting your location precisely...';
    }

    if (addressInput) addressInput.value = "📍 Determining location...";
    if (searchInput) searchInput.value = "📍 Determining location...";

    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            console.log(`Success: ${lat}, ${lng}`);
            updateMapLocation(lat, lng);

            if (btn) btn.innerHTML = '<span>✅</span> Location Found';
            setTimeout(() => {
                if (btn) btn.innerHTML = '<span>📍</span> Use My Current Location';
            }, 3000);

            if (locationStatus) {
                locationStatus.innerHTML = '<span class="text-green-400">✅ Location detected successfully!</span>';
                showToast("Location detected! Please confirm the address or adjust on the map if needed.", "success");
                setTimeout(() => {
                    locationStatus.style.display = 'none';
                }, 5000);
            }
        },
        function(err) {
            if (btn) btn.innerHTML = '<span>📍</span> Use My Current Location';
            if (locationStatus) {
                locationStatus.className = "text-xs font-medium px-4 py-2 rounded-lg bg-red-900/40 border border-red-500/30 text-red-200 mb-4";
                locationStatus.innerHTML = '<span class="text-red-400">❌ Error: ' + err.message + '. Please pick on map manually.</span>';
            }
            if (addressInput && addressInput.value.includes("Determining")) addressInput.value = "";
            if (searchInput && searchInput.value.includes("Determining")) searchInput.value = "";
            console.warn('Geolocation error:', err.message);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
}

async function fetchNominatimLocations(query, suggestionsList) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`);
        const data = await response.json();

        suggestionsList.innerHTML = '';

        if (data.length > 0) {
            data.forEach(item => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                
                div.innerHTML = `
                    <div class="s-name">${item.display_name.split(',')[0]}</div>
                    <div class="s-detail">${item.display_name}</div>
                `;

                div.addEventListener('click', () => {
                    document.getElementById('mapSearch').value = item.display_name;
                    suggestionsList.style.display = 'none';

                    updateMapLocation(parseFloat(item.lat), parseFloat(item.lon));
                    map.setView([parseFloat(item.lat), parseFloat(item.lon)], 16);
                });

                suggestionsList.appendChild(div);
            });
            suggestionsList.style.display = 'block';
        } else {
            suggestionsList.style.display = 'none';
        }
    } catch (err) {
        console.error('Error fetching locations:', err);
    }
}

/* ===============================
   LOGIN
================================ */

async function loginUser() {

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    const errorEl = document.getElementById('loginError');

    if (!email || !password) {

        errorEl.textContent = 'Please fill in all fields';
        errorEl.classList.add('active');
        return;

    }

    errorEl.classList.remove('active');

    showLoading(true);

    try {

        const response = await fetch('/api/auth/login', {

            method: 'POST',

            headers: {
                'Content-Type': 'application/json'
            },

            body: JSON.stringify({
                email,
                password
            })

        });

        const data = await response.json();

        if (response.ok && data && data.token) {

            setAuth(data);

            showToast('Login successful!', 'success');

            setTimeout(() => {

                if (data.setupCompleted === true) {

                    window.location.href = '/dashboard.html';

                } else {

                    window.location.href = '/setup.html';

                }

            }, 500);

        } else {

            errorEl.textContent = data.error || 'Invalid credentials';
            errorEl.classList.add('active');

            showToast(data.error || 'Login failed', 'error');

        }

    } catch (err) {

        errorEl.textContent = 'Network error. Please try again.';
        errorEl.classList.add('active');

        showToast('Connection error', 'error');

    } finally {

        showLoading(false);

    }

}

/* ===============================
   REGISTER
================================ */

async function handleRegister() {

    const fields = {

        hospitalName: document.getElementById('hospitalName')?.value.trim(),
        email: document.getElementById('email')?.value.trim(),
        password: document.getElementById('password')?.value,
        govId: document.getElementById('govId')?.value.trim(),
        contactNumber: document.getElementById('contactNumber')?.value.trim(),
        address: document.getElementById('address')?.value.trim(),
        latitude: parseFloat(document.getElementById('latitude')?.value),
        longitude: parseFloat(document.getElementById('longitude')?.value)

    };

    const errorEl = document.getElementById('registerError');

    if (!fields.hospitalName || !fields.email || !fields.password || !fields.govId) {

        errorEl.textContent = 'Please fill in all required fields';
        errorEl.classList.add('active');
        return;

    }

    if (fields.password.length < 6) {

        errorEl.textContent = 'Password must be at least 6 characters';
        errorEl.classList.add('active');
        return;

    }

    errorEl.classList.remove('active');

    showLoading(true);

    try {

        const response = await fetch('/api/auth/register', {

            method: 'POST',

            headers: {
                'Content-Type': 'application/json'
            },

            body: JSON.stringify(fields)

        });

        const data = await response.json();

        if (response.ok && data.token) {

            setAuth(data);

            showToast('Hospital registered successfully!', 'success');

            setTimeout(() => {

                window.location.href = '/setup.html';

            }, 500);

        } else {

            errorEl.textContent = data.error || 'Registration failed';
            errorEl.classList.add('active');

            showToast(data.error || 'Registration failed', 'error');

        }

    } catch (err) {

        errorEl.textContent = 'Network error. Please try again.';
        errorEl.classList.add('active');

        showToast('Connection error', 'error');

    } finally {

        showLoading(false);

    }

}

/* ===============================
   LOGOUT
================================ */

function handleLogout() {

    clearAuth();
    window.location.href = '/index.html';

}

/* ===============================
   ENTER KEY SUPPORT
================================ */

document.addEventListener('keydown', function(e) {

    if (e.key === 'Enter') {

        if (document.getElementById('loginForm')) {
            loginUser();
        }

        if (document.getElementById('registerForm')) {
            handleRegister();
        }

    }

});