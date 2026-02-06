// 1. Initialize Map
const map = L.map('map').setView([39.82, -98.57], 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let forecastChart;

// 2. Load Dam Data from CSV
async function loadDams() {
    try {
        const data = await d3.csv("full_lhd_website.csv");
        data.forEach(dam => {
            const lat = parseFloat(dam.Latitude);
            const lng = parseFloat(dam.Longitude);
            if (!isNaN(lat) && !isNaN(lng) && dam.LinkNo && dam.Qmin) {
                const marker = L.marker([lat, lng]).addTo(map);
                const popupContent = `
                    <div class="popup-content">
                        <strong>${dam.Dam_Name}</strong><br>
                        <b>LinkNo:</b> ${dam.LinkNo}<br>
                        <hr>
                        <b>Dangerous Range:</b> ${dam.Qmin} - ${dam.Qmax} cfs
                        <button class="btn-check" onclick="checkSafety('${dam.LinkNo}', ${dam.Qmin}, ${dam.Qmax}, '${dam.Dam_Name}')">
                            Check Live Forecast
                        </button>
                    </div>`;
                marker.bindPopup(popupContent);
            }
        });
    } catch (err) { 
        console.error("Error loading CSV:", err); 
    }
}

// 3. GEOGLOWS API Integration & Plotting
async function checkSafety(linkNo, qMin, qMax, damName) {
    const url = `https://geoglows.ecmwf.int/api/v2/forecast/${linkNo}?format=json`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data && data.flow_median && data.flow_median.length > 0) {
            
            // Convert CMS to CFS for Median and Uncertainty Bounds
            const cfsMedian = data.flow_median.map(cms => cms * 35.3147);
            const cfsUpper = (data.flow_uncertainty_upper || []).map(cms => cms * 35.3147);
            const cfsLower = (data.flow_uncertainty_lower || []).map(cms => cms * 35.3147);
            
            const currentCfs = cfsMedian[0];

            const labels = (data.datetime || []).map(timeStr => {
                const date = new Date(timeStr);
                return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit' });
            });

            // Update Text Display
            let statusText = `<strong>${damName} (LinkNo: ${linkNo})</strong><br>`;
            statusText += `Current Forecast: ${currentCfs.toFixed(2)} cfs | Range: ${qMin.toFixed(0)}-${qMax.toFixed(0)} cfs<br>`;
            
            if (currentCfs >= qMin && currentCfs <= qMax) {
                statusText += `<span style="color:red; font-weight:bold;">⚠️ WARNING: DANGEROUS CONDITION</span>`;
            } else {
                statusText += `<span style="color:green; font-weight:bold;">✅ Status: Safe</span>`;
            }

            document.getElementById('statusDisplay').innerHTML = statusText;
            document.getElementById('forecastModal').style.display = 'block';

            const ctx = document.getElementById('forecastChart').getContext('2d');
            if (forecastChart) forecastChart.destroy();

            forecastChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Max Dangerous Flow',
                            data: Array(cfsMedian.length).fill(qMax),
                            borderColor: '#e74c3c',
                            borderDash: [10, 5],
                            borderWidth: 2,
                            pointRadius: 0,
                            fill: false // This line stays on top
                        },
                        {
                            label: 'Dangerous Flow Range',
                            data: Array(cfsMedian.length).fill(qMin),
                            borderColor: '#e74c3c', 
                            borderDash: [10, 5],
                            borderWidth: 2,
                            pointRadius: 0,
                            fill: 0, // Fills UP to the first dataset (Max)
                            backgroundColor: 'rgba(231, 76, 60, 0.2)'
                        },
                        {
                            label: 'Median Forecast (cfs)',
                            data: cfsMedian,
                            borderColor: '#000000',
                            backgroundColor: 'transparent',
                            fill: false,
                            tension: 0.2,
                            borderWidth: 3,
                            pointRadius: 0
                        },
                        {
                            label: 'Forecast Uncertainty (Upper)',
                            data: cfsUpper,
                            borderColor: 'rgba(52, 152, 219, 0.5)',
                            borderWidth: 1,
                            pointRadius: 0,
                            fill: '+1',
                            backgroundColor: 'rgba(52, 152, 219, 0.2)'
                        },
                        {
                            label: 'Forecast Uncertainty (Lower)',
                            data: cfsLower,
                            borderColor: 'rgba(52, 152, 219, 0.5)',
                            borderWidth: 1,
                            pointRadius: 0,
                            fill: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    plugins: {
                        filler: { propagate: true }
                    },
                    scales: {
                        y: { 
                            beginAtZero: true,
                            title: { display: true, text: 'Discharge (cfs)' }
                        },
                        x: {
                            ticks: { maxTicksLimit: 10 }
                        }
                    }
                }
            });
        }
    } catch (err) {
        console.error("API Error:", err);
    }
}

loadDams();