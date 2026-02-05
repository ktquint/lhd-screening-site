// 1. Initialize Map
const map = L.map('map').setView([39.82, -98.57], 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// 2. Load your specific CSV
async function loadDams() {
    try {
        const data = await d3.csv("full_lhd_website.csv"); // Matches your filename
        
        data.forEach(dam => {
            const lat = parseFloat(dam.Latitude);
            const lng = parseFloat(dam.Longitude);

            // Only map dams that have a LinkNo and calculated thresholds
            if (!isNaN(lat) && !isNaN(lng) && dam.LinkNo && dam.Qmin) {
                const marker = L.marker([lat, lng]).addTo(map);
                
                const popupContent = `
                    <div class="popup-content">
                        <strong style="font-size:1.1em;">${dam.Dam_Name}</strong><br>
                        <b>Stream:</b> ${dam['River/Stream']}<br>
                        <b>LinkNo:</b> ${dam.LinkNo}<br>
                        <hr>
                        <b>Dangerous Range:</b> ${dam.Qmin} - ${dam.Qmax} cfs
                        <button class="btn-check" onclick="checkSafety('${dam.LinkNo}', ${dam.Qmin}, ${dam.Qmax})">
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

// 3. GEOGLOWS API Integration
async function checkSafety(linkNo, qMin, qMax) {
    const url = `https://geoglows.ecmwf.int/api/v2/forecast/${linkNo}?format=json`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();

        // Updated check for GEOGLOWS v2 array structure
        if (data && data.flow_median && data.flow_median.length > 0) {
            
            // Get the first value from the flow_median array
            const currentCms = data.flow_median[0]; 
            
            // Convert Metric (cms) to English (cfs)
            const currentCfs = currentCms * 35.3147; 

            let resultMsg = `LinkNo: ${linkNo}\n`;
            resultMsg += `Current Forecasted Flow: ${currentCfs.toFixed(2)} cfs\n`;
            resultMsg += `Dangerous Range: ${qMin} - ${qMax} cfs\n\n`;
            
            // Safety Comparison
            if (currentCfs >= qMin && currentCfs <= qMax) {
                resultMsg += "⚠️ WARNING: Condition is DANGEROUS.\nSubmerged Hydraulic Jump likely.";
            } else if (currentCfs > qMax) {
                resultMsg += "✅ Status: Safe (Drowned Out/Fully Submerged).";
            } else {
                resultMsg += "✅ Status: Safe (Low Flow).";
            }
            
            alert(resultMsg);
        } else {
            alert(`API connected but no flow data found for LinkNo: ${linkNo}.`);
        }
    } catch (err) {
        console.error("Connection Error:", err);
        alert("Error connecting to the GEOGLOWS API.");
    }
}

loadDams();