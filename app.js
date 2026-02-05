// 1. Initialize Map
const map = L.map('map').setView([39.82, -98.57], 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let forecastChart; // Store chart instance globally to refresh it

// 2. Load your specific CSV
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
                        <strong style="font-size:1.1em;">${dam.Dam_Name}</strong><br>
                        <b>Stream:</b> ${dam['River/Stream']}<br>
                        <b>LinkNo:</b> ${dam.LinkNo}<br>
                        <hr>
                        <b>Dangerous Range:</b> ${dam.Qmin} - ${dam.Qmax} cfs
                        <button class="btn-check" onclick="checkSafety('${dam.LinkNo}', ${dam.Qmin}, ${dam.Qmax}, '${dam.Dam_Name}')">
                            Check Live Forecast
                        </button>
                    </div>
                `;
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
            
            // 1. Convert all forecast data points to CFS
            const cfsData = data.flow_median.map(cms => cms * 35.3147);
            const currentCfs = cfsData[0]; 
            const labels = data.forecast_time || cfsData.map((_, i) => `Step ${i}`);

            // 2. Prepare Status Text
            let statusText = `<strong>${damName} (LinkNo: ${linkNo})</strong>\n`;
            statusText += `Current Forecast: ${currentCfs.toFixed(2)} cfs\n`;
            
            if (currentCfs >= qMin && currentCfs <= qMax) {
                statusText += `<span style="color:red; font-weight:bold;">⚠️ WARNING: Condition is DANGEROUS.</span>`;
            } else if (currentCfs > qMax) {
                statusText += `<span style="color:green; font-weight:bold;">✅ Status: Safe (Drowned Out).</span>`;
            } else {
                statusText += `<span style="color:green; font-weight:bold;">✅ Status: Safe (Low Flow).</span>`;
            }

            // 3. Update Modal and Display
            document.getElementById('statusDisplay').innerHTML = statusText;
            document.getElementById('forecastModal').style.display = 'block';

            // 4. Create/Update Chart
            const ctx = document.getElementById('forecastChart').getContext('2d');
            if (forecastChart) forecastChart.destroy(); // Destroy previous chart if it exists

            forecastChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Flow Forecast (cfs)',
                            data: cfsData,
                            borderColor: '#3498db',
                            backgroundColor: 'rgba(52, 152, 219, 0.1)',
                            fill: true,
                            tension: 0.1
                        },
                        {
                            label: 'Min Dangerous Flow',
                            data: Array(cfsData.length).fill(qMin),
                            borderColor: '#e67e22',
                            borderDash: [10, 5],
                            pointRadius: 0,
                            fill: false
                        },
                        {
                            label: 'Max Dangerous Flow',
                            data: Array(cfsData.length).fill(qMax),
                            borderColor: '#e74c3c',
                            borderDash: [10, 5],
                            pointRadius: 0,
                            fill: false
                        }
                    ]
                },
                options: {
                    responsive: true,
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
        } else {
            alert(`No flow data found for LinkNo: ${linkNo}.`);
        }
    } catch (err) {
        console.error("Connection Error:", err);
        alert("Error connecting to the GEOGLOWS API.");
    }
}

loadDams();