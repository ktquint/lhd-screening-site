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
            // Note: If 'features' doesn't work, try 'streams' or the filename minus '.gpkg'
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
            
            // Round dangerous flow bounds to 0 decimals for the map popup
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
        console.log("Dam markers initialized.");
    } catch (err) { 
        console.error("Error loading CSV (Ensure you are using a local server like Live Server):", err); 
    }
}

// 3. GEOGLOWS API Integration & Plotting
async function checkSafety(linkNo, qMin, qMax, damName) {
    const url = `https://geoglows.ecmwf.int/api/v2/forecast/${linkNo}?format=json`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data && data.flow_median && data.flow_median.length > 0) {
            const cfsMedian = data.flow_median.map(cms => cms * 35.3147);
            const cfsUpper = (data.flow_uncertainty_upper || []).map(cms => cms * 35.3147);
            const cfsLower = (data.flow_uncertainty_lower || []).map(cms => cms * 35.3147);
            
            const currentCfs = cfsMedian[0];
            const labels = (data.datetime || []).map(timeStr => {
                const date = new Date(timeStr);
                return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit' });
            });

            // Update Status Display
            let statusText = `<strong>${damName} (LinkNo: ${linkNo})</strong><br>`;
            statusText += `Current Forecast: ${currentCfs.toFixed(2)} cfs | Range: ${qMin}-${qMax} cfs<br>`;
            statusText += (currentCfs >= qMin && currentCfs <= qMax) 
                ? `<span style="color:red; font-weight:bold;">⚠️ WARNING: DANGEROUS CONDITION</span>`
                : `<span style="color:green; font-weight:bold;">✅ Status: Safe</span>`;

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
                            label: 'Max Dangerous Boundary',
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
                            fill: 0, // Fills up to the Max boundary
                            backgroundColor: 'rgba(231, 76, 60, 0.2)'
                        },
                        {
                            label: 'Median Forecast (cfs)',
                            data: cfsMedian,
                            borderColor: '#000000',
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
                    plugins: { filler: { propagate: true } },
                    scales: {
                        y: { beginAtZero: true, title: { display: true, text: 'Discharge (cfs)' } },
                        x: { ticks: { maxTicksLimit: 10 } }
                    }
                }
            });
        }
    } catch (err) {
        console.error("API Error:", err);
        alert("Error connecting to the GEOGLOWS API.");
    }
}

// Initialize components
loadDams();
loadHydrography();