/**
 * HospiSync – Forecast Module
 * Fetches predictions and renders forecast chart
 */

let forecastChart = null;

async function loadForecast() {
    const spinner = document.getElementById('forecastLoadingSpinner');
    const errorBanner = document.getElementById('forecastErrorBanner');
    const errorMsg = document.getElementById('forecastErrorMsg');

    // Reset state
    if (spinner) spinner.style.display = 'flex';
    if (errorBanner) errorBanner.style.display = 'none';

    try {
        const data = await apiGet(`/forecast/next-day/${getHospitalId()}`);

        if (!data) {
            if (errorBanner) {
                if (errorMsg) errorMsg.textContent = 'No forecast data available. Add patient admission records to generate predictions.';
                errorBanner.style.display = 'block';
            }
            return;
        }

        // Update forecast cards
        document.getElementById('tomorrowForecast').textContent = data.predictedPatients ?? '0';

        // Update metrics
        document.getElementById('modelUsed').textContent = data.method || '—';
        document.getElementById('metricRmse').textContent = data.dataPointsUsed > 0 ? 'N/A' : '—';
        document.getElementById('metricMae').textContent = data.dataPointsUsed > 0 ? 'N/A' : '—';

        // Scarcity Alert Logic
        const warningPanel = document.getElementById('earlyWarningPanel');
        if (data.scarcityAlert) {
            document.getElementById('warningMessage').textContent = data.alertMessage;
            warningPanel.style.display = 'flex';
        } else {
            warningPanel.style.display = 'none';
        }

        // Render forecast chart
        renderForecastChart(data);

    } catch (err) {
        console.error('Forecast error:', err);
        if (errorBanner) {
            if (errorMsg) errorMsg.textContent = 'Failed to load forecast data. Please try again.';
            errorBanner.style.display = 'block';
        }
        showToast('Failed to load forecast', 'error');
    } finally {
        if (spinner) spinner.style.display = 'none';
    }
}

function renderForecastChart(data) {
    const canvas = document.getElementById('forecastChart');
    if (!canvas) return;

    if (forecastChart) forecastChart.destroy();

    // Historical data points
    let labels = [];
    let values = [];

    if (data.historicalData && data.historicalData.length > 0) {
        labels = data.historicalData.map(d => {
            const dt = new Date(d.timestamp);
            return dt.toLocaleDateString('en-US', { weekday: 'short' });
        });
        values = data.historicalData.map(d => d.occupancy);
    } else {
        // Generate sample labels if no data exists
        labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        values = [0, 0, 0, 0, 0, 0, 0];
    }

    // Add forecast point
    labels.push('Tomorrow (Forecast)');
    
    // Dataset for Chart.js
    // We want to connect the last historical point to the forecast point
    const historicalDataset = [...values, null];
    const forecastDataset = values.map(() => null);
    forecastDataset[values.length - 1] = values[values.length - 1]; // Connect last point
    forecastDataset.push(data.predictedPatients);

    forecastChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Historical Daily Admissions',
                    data: historicalDataset,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.06)',
                    fill: true,
                    tension: 0.1,
                    pointRadius: 4,
                    pointBackgroundColor: '#3b82f6',
                    borderWidth: 2
                },
                {
                    label: 'Forecast',
                    data: forecastDataset,
                    borderColor: '#10b981', // Green for forecast
                    backgroundColor: 'rgba(16, 185, 129, 0.06)',
                    fill: true,
                    tension: 0.1,
                    borderDash: [5, 5],
                    pointRadius: 6,
                    pointBackgroundColor: '#10b981',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } }
                }
            },
            scales: {
                x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: {
                    ticks: { color: '#64748b' },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    beginAtZero: true
                }
            }
        }
    });
}

