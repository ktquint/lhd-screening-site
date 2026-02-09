// 1. Initialize Map with Canvas preference for better performance
const map = L.map('map', { preferCanvas: true }).setView([39.82, -98.57], 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let forecastChart;

// --- Background Hydrography (.gpkg) Loading ---
const hydroFiles = [
    'streams_702.gpkg', 'streams_703.gpkg', 'streams_704.gpkg',
    'streams_706.gpkg', 'streams_709.gpkg', 'streams_712.gpkg',
    'streams_713.gpkg', 'streams_714.gpkg', 'streams_715.gpkg'
];

async function loadHydrography() {
    hydroFiles.forEach(filename => {
        try {
            L.geoPackageFeatureLayer([], {
                geoPackageUrl: `hydrography/${filename}`,
                layerName: 'features', 
                style: { color: '#3498db', weight: 1.2, opacity: 0.5 }
            }).addTo(map);
        } catch (err) {
            console.warn(`Could not load background layer ${filename}:`, err);
        }
    });
}

// 2. Load Dam Data from CSV
async function loadDams() {
    try {
        const data = await d3.csv("full_lhd_website.csv");
        data.forEach(dam => {
            const lat = parseFloat(dam.Latitude);
            const lng = parseFloat(dam.Longitude);
            
            const qMinVal = Math.round(parseFloat(dam.Qmin));
            const qMaxVal = Math.round(parseFloat(dam.Qmax));

            if (!isNaN(lat) && !isNaN(lng) && dam.LinkNo && !isNaN(qMinVal)) {
                const marker = L.marker([lat, lng]).addTo(map);
                const popupContent = `
                    <div class="popup-content">
                        <strong>${dam.Dam_Name}</strong><br>
                        <b>LinkNo:</b> ${dam.LinkNo}<br>
                        <hr>
                        <b>Dangerous Range:</b> ${qMinVal} - ${qMaxVal} cfs
                        <button class="btn-check" onclick="checkSafety('${dam.LinkNo}', ${qMinVal}, ${qMaxVal}, '${dam.Dam_Name}')">
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
            
            // --- Align Start Time to Local Current Hour ---
            const nowLocal = new Date();
            nowLocal.setMinutes(0, 0, 0);

            // Find the data point that matches or follows the current hour
            const startIndex = data.datetime.findIndex(timeStr => new Date(timeStr).getTime() >= nowLocal.getTime());
            const finalStart = startIndex === -1 ? 0 : startIndex;

            // Slice arrays to start from the current hour
            const slicedMedian = data.flow_median.slice(finalStart);
            const slicedUpper = (data.flow_uncertainty_upper || []).slice(finalStart);
            const slicedLower = (data.flow_uncertainty_lower || []).slice(finalStart);
            const slicedDatetime = (data.datetime || []).slice(finalStart);

            // Convert CMS to CFS
            const cfsMedian = slicedMedian.map(cms => cms * 35.3147);
            const cfsUpper = slicedUpper.map(cms => cms * 35.3147);
            const cfsLower = slicedLower.map(cms => cms * 35.3147);
            
            const currentCfs = cfsMedian[0];

            // Check if any part of the forecast range overlaps the danger zone
            const isAnyDangerous = cfsMedian.some((_, i) => {
                const low = cfsLower[i];
                const high = cfsUpper[i];
                return high >= qMin && low <= qMax;
            });

            // Format labels to match local browser time
            const labels = slicedDatetime.map(timeStr => {
                const date = new Date(timeStr);
                return date.toLocaleString([], { 
                    month: 'short', 
                    day: 'numeric', 
                    hour: '2-digit'
                });
            });

            // Update Text Display
            let statusText = `<strong>${damName} (LinkNo: ${linkNo})</strong><br>`;
            statusText += `Current Forecast: ${currentCfs.toFixed(2)} cfs | Range: ${qMin.toFixed(0)}-${qMax.toFixed(0)} cfs<br>`;
            
            if (isAnyDangerous) {
                statusText += `<span style="color:red; font-weight:bold;">⚠️ WARNING: DANGEROUS CONDITIONS FORECASTED</span>`;
            } else {
                statusText += `<span style="color:green; font-weight:bold;">✅ Status: Safe for Forecast Period</span>`;
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
                            fill: false
                        },
                        {
                            label: 'Dangerous Flow Range',
                            data: Array(cfsMedian.length).fill(qMin),
                            borderColor: '#e74c3c', 
                            borderDash: [10, 5],
                            borderWidth: 2,
                            pointRadius: 0,
                            fill: 0,
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

// Initialize components
loadDams();
loadHydrography();