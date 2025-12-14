// --- UI Logic ---

function updateStatus(msg) {
    const el = document.getElementById('status-bar');
    if (el) el.innerText = msg;
}

function updateVisibleLines() {
    if (!map) return;
    
    // Get all rendered features from the core line layer
    const features = map.queryRenderedFeatures({ layers: ['rail-lines-core'] });
    
    // Deduplicate by lineCd
    const uniqueLines = new Map();
    features.forEach(f => {
        const lineCd = f.properties.lineCd;
        if (lineCd && !uniqueLines.has(lineCd)) {
            uniqueLines.set(lineCd, {
                lineCd: lineCd,
                lineName: f.properties.lineName,
                color: f.properties.color
            });
        }
    });

    const list = document.getElementById('visible-line-list');
    const countEl = document.getElementById('line-count');
    
    if (!list || !countEl) return;

    // Update count
    countEl.innerText = `${uniqueLines.size}路線`;

    // If no lines, show placeholder
    if (uniqueLines.size === 0) {
        list.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #999; font-size: 13px;">
                マップを移動すると<br>路線が表示されます
            </div>`;
        return;
    }

    // Sort by line name
    const sortedLines = Array.from(uniqueLines.values()).sort((a, b) => a.lineName.localeCompare(b.lineName));

    // Preserve active states if possible
    const activeIds = new Set();
    document.querySelectorAll('.line-item.active').forEach(el => activeIds.add(el.dataset.lineCd));

    list.innerHTML = '';
    
    sortedLines.forEach(line => {
        const item = document.createElement('div');
        item.className = 'line-item';
        if (activeIds.has(line.lineCd)) item.classList.add('active');
        item.dataset.lineCd = line.lineCd;
        item.dataset.color = line.color; // Store color for stations
        
        // Get Logo
        const cleanName = normalizeLineName(line.lineName);
        const meta = externalLineData[cleanName] || externalLineData[line.lineName] || {};
        const logoUrl = meta.logo;
        const code = meta.code;
        
        let logoHtml = '';
        if (logoUrl) {
            logoHtml = `<div class="line-logo-small" style="background: transparent;"><img src="${logoUrl}" style="width:100%; height:100%; object-fit:contain;"></div>`;
        } else {
            const genHtml = generateFallbackLogoHTML(line.lineName, line.color, code);
            // Wrap in small container
            logoHtml = `<div class="line-logo-small">${genHtml}</div>`;
        }

        item.innerHTML = `
            <div class="line-item-header" onclick="toggleLineAccordion('${line.lineCd}')">
                ${logoHtml}
                <div class="line-name">${line.lineName}</div>
            </div>
            <div class="line-stations" id="stations-${line.lineCd}">
                <!-- Stations loaded on click -->
            </div>
        `;
        list.appendChild(item);

        // If it was active, we need to re-populate stations immediately
        if (activeIds.has(line.lineCd)) {
            populateStations(line.lineCd, line.color);
        }
    });
}

function toggleLineAccordion(lineCd) {
    const item = document.querySelector(`.line-item[data-line-cd="${lineCd}"]`);
    if (!item) return;
    
    const isActive = item.classList.contains('active');
    
    if (isActive) {
        item.classList.remove('active');
    } else {
        item.classList.add('active');
        const color = item.dataset.color;
        populateStations(lineCd, color);
        
        // Scroll into view if needed
        setTimeout(() => {
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }
}

function populateStations(lineCd, color) {
    const container = document.getElementById(`stations-${lineCd}`);
    if (!container || container.children.length > 0) return; // Already populated

    const data = lineDataCache[lineCd];
    if (data && data.station_l) {
        data.station_l.forEach(st => {
            const stItem = document.createElement('div');
            stItem.className = 'station-item';
            stItem.innerHTML = `
                <div class="station-marker" style="background: ${color || '#ccc'};"></div>
                <div>${st.station_name}</div>
            `;
            stItem.onclick = (e) => {
                e.stopPropagation(); // Prevent accordion toggle
                map.flyTo({ center: [st.lon, st.lat], zoom: 14 });
            };
            container.appendChild(stItem);
        });
    } else {
        container.innerHTML = '<div style="padding:10px; color:#999; font-size:12px; text-align:center;">駅データなし</div>';
    }
}

function toggleMode() {
    if (!map) return;
    isUnderground = !isUnderground;
    const body = document.body;
    const labelDay = document.getElementById('label-day');
    const labelNight = document.getElementById('label-night');
    
    if (isUnderground) {
        body.classList.add('dark-mode');
        labelDay.classList.remove('active'); labelDay.classList.add('inactive');
        labelNight.classList.add('active'); labelNight.classList.remove('inactive');
        
        // Switch Base Tile
        if (map.getLayer('base-tiles')) map.removeLayer('base-tiles');
        map.addLayer({
            id: 'base-tiles',
            type: 'raster',
            source: 'carto-dark',
            minzoom: 0,
            maxzoom: 22
        }, 'real-tracks'); // Insert before tracks

        // Update Styles for Night
        map.setPaintProperty('stations-points', 'circle-color', '#fff'); // Neutral white
        map.setPaintProperty('stations-points', 'circle-stroke-color', '#fff');
        map.setPaintProperty('stations-labels', 'text-color', '#fff');
        map.setPaintProperty('stations-labels', 'text-halo-color', '#000');
        map.setPaintProperty('real-tracks', 'line-color', '#444');

        // Filter: Show Subways Only
        map.setFilter('rail-lines-core', ['==', 'type', 'subway']);
        map.setFilter('rail-lines-glow', ['==', 'type', 'subway']);
        map.setFilter('stations-points', ['in', ['get', 'visibleIn'], ['literal', ['subway', 'both']]]);
        map.setFilter('stations-labels', ['in', ['get', 'visibleIn'], ['literal', ['subway', 'both']]]);

    } else {
        body.classList.remove('dark-mode');
        labelDay.classList.add('active'); labelDay.classList.remove('inactive');
        labelNight.classList.remove('active'); labelNight.classList.add('inactive');

        // Switch Base Tile
        if (map.getLayer('base-tiles')) map.removeLayer('base-tiles');
        map.addLayer({
            id: 'base-tiles',
            type: 'raster',
            source: 'carto-light',
            minzoom: 0,
            maxzoom: 22
        }, 'real-tracks');

        // Update Styles for Day
        map.setPaintProperty('stations-points', 'circle-color', '#fff');
        map.setPaintProperty('stations-points', 'circle-stroke-color', '#555');
        map.setPaintProperty('stations-labels', 'text-color', '#000');
        map.setPaintProperty('stations-labels', 'text-halo-color', '#fff');
        map.setPaintProperty('real-tracks', 'line-color', '#888');

        // Filter: Show Ground Only
        map.setFilter('rail-lines-core', ['==', 'type', 'ground']);
        map.setFilter('rail-lines-glow', ['==', 'type', 'ground']);
        map.setFilter('stations-points', ['in', ['get', 'visibleIn'], ['literal', ['ground', 'both']]]);
        map.setFilter('stations-labels', ['in', ['get', 'visibleIn'], ['literal', ['ground', 'both']]]);
    }
    
    // Update visible lines list after mode change
    setTimeout(updateVisibleLines, 100);
}

// --- Editor Logic ---

function startLineCreation() {
    isEditMode = true;
    draftLine = {
        points: [],
        stations: [],
        markers: []
    };
    
    document.getElementById("editor-panel").style.display = "block";
    document.getElementById("btn-create-line").style.display = "none";
    document.getElementById("edit-line-name").value = "";
    document.getElementById("edit-line-color").value = "#ff0000";
    document.getElementById("edit-station-count").innerText = "0";
    
    // Change cursor
    map.getCanvas().style.cursor = "crosshair";
    
    // Add temporary source/layer for draft line if not exists
    if (!map.getSource("draft-line")) {
        map.addSource("draft-line", {
            type: "geojson",
            data: {
                type: "Feature",
                geometry: { type: "LineString", coordinates: [] }
            }
        });
        map.addLayer({
            id: "draft-line-layer",
            type: "line",
            source: "draft-line",
            paint: {
                "line-color": "#ff0000",
                "line-width": 4,
                "line-dasharray": [2, 1]
            }
        });
    }
}

function cancelLineCreation() {
    isEditMode = false;
    
    // Clear markers
    draftLine.markers.forEach(m => m.remove());
    draftLine.markers = [];
    
    // Clear draft line on map
    if (map.getSource("draft-line")) {
        map.getSource("draft-line").setData({
            type: "Feature",
            geometry: { type: "LineString", coordinates: [] }
        });
    }
    
    document.getElementById("editor-panel").style.display = "none";
    document.getElementById("btn-create-line").style.display = "block";
    map.getCanvas().style.cursor = "";
}

function finishLineCreation() {
    const name = document.getElementById("edit-line-name").value;
    const color = document.getElementById("edit-line-color").value;
    
    if (!name) {
        alert("路線名を入力してください");
        return;
    }
    if (draftLine.points.length < 2) {
        alert("駅を2つ以上追加してください");
        return;
    }
    
    // Create GeoJSON Feature
    // 1. LineString
    const lineFeature = {
        type: "Feature",
        geometry: {
            type: "LineString",
            coordinates: draftLine.points
        },
        properties: {
            type: "ground", // Default to ground for now
            color: color,
            lineCd: "user-" + Date.now(), // Unique ID
            lineName: name
        }
    };
    
    // 2. Stations
    const stationFeatures = draftLine.stations.map((st, idx) => {
        return {
            type: "Feature",
            geometry: { type: "Point", coordinates: [st.lon, st.lat] },
            properties: {
                type: "station",
                color: "#fff",
                strokeColor: "#555",
                name: st.name || `駅${idx+1}`,
                visibleIn: "both",
                lines: JSON.stringify([{ name: name, color: color }])
            }
        };
    });
    
    // Add to main GeoJSON
    geojsonData.features.push(lineFeature, ...stationFeatures);
    map.getSource("railways").setData(geojsonData);
    
    // Cleanup
    cancelLineCreation(); // Resets UI and clears draft
    
    // Refresh List
    updateVisibleLines();
    
    alert(`「${name}」を作成しました！`);
}

function updateEditorUI() {
    document.getElementById("edit-station-count").innerText = draftLine.stations.length;
    
    // Update draft line color
    const color = document.getElementById("edit-line-color").value;
    if (map.getLayer("draft-line-layer")) {
        map.setPaintProperty("draft-line-layer", "line-color", color);
    }

    // Update Station List
    const list = document.getElementById('edit-station-list');
    if (list) {
        list.innerHTML = '';
        draftLine.stations.forEach((st, i) => {
            const row = document.createElement('div');
            row.className = 'editor-station-row';
            row.innerHTML = `
                <span class="station-num">${i+1}</span>
                <input type="text" value="${st.name}" placeholder="駅名" onchange="updateStationName(${i}, this.value)">
                <button onclick="removeStation(${i})" class="btn-remove-station">×</button>
            `;
            list.appendChild(row);
        });
    }
}


function updateStationName(index, newName) {
    if (draftLine.stations[index]) {
        draftLine.stations[index].name = newName;
    }
}

function removeStation(index) {
    // Remove marker
    if (draftLine.markers[index]) {
        draftLine.markers[index].remove();
    }
    
    // Remove data
    draftLine.markers.splice(index, 1);
    draftLine.stations.splice(index, 1);
    draftLine.points.splice(index, 1);
    
    // Update Map Line
    if (map.getSource("draft-line")) {
        map.getSource("draft-line").setData({
            type: "Feature",
            geometry: { type: "LineString", coordinates: draftLine.points }
        });
    }
    
    updateEditorUI();
}

