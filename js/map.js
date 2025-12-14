// --- Map Initialization ---

function initMap() {
    map = new maplibregl.Map({
        container: 'map',
        // Use local fonts for CJK to improve performance and avoid 404s
        localIdeographFontFamily: "'Meiryo', 'Hiragino Kaku Gothic ProN', 'MS PGothic', 'sans-serif'",
        style: {
            version: 8,
            // Use Geolonia's public glyphs for reliable Japanese font support
            glyphs: "https://glyphs.geolonia.com/{fontstack}/{range}.pbf",
            sources: {
                'carto-light': {
                    type: 'raster',
                    tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
                    tileSize: 256,
                    attribution: '&copy; OSM &copy; CARTO'
                },
                'carto-dark': {
                    type: 'raster',
                    tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
                    tileSize: 256,
                    attribution: '&copy; OSM &copy; CARTO'
                },
                'railways': {
                    type: 'geojson',
                    data: geojsonData
                }
            },
            layers: [
                {
                    id: 'base-tiles',
                    type: 'raster',
                    source: 'carto-light',
                    minzoom: 0,
                    maxzoom: 22
                },
                // --- Real Tracks (Overpass) ---
                {
                    id: 'real-tracks',
                    type: 'line',
                    source: 'railways',
                    filter: ['==', ['get', 'type'], 'real-track'],
                    paint: {
                        'line-color': '#888',
                        'line-width': 1,
                        'line-opacity': 0.6
                    }
                },
                // --- Spline Lines (Glow/Casing) ---
                {
                    id: 'rail-lines-glow',
                    type: 'line',
                    source: 'railways',
                    filter: ['==', ['get', 'type'], 'ground'], // Default to ground
                    paint: {
                        'line-color': ['get', 'color'],
                        'line-width': [
                            'interpolate', ['linear'], ['zoom'],
                            5, 2,
                            12, 8
                        ],
                        'line-opacity': 0.3,
                        'line-blur': 2
                    }
                },
                // --- Spline Lines (Core) ---
                {
                    id: 'rail-lines-core',
                    type: 'line',
                    source: 'railways',
                    filter: ['==', ['get', 'type'], 'ground'], // Default to ground
                    paint: {
                        'line-color': ['get', 'color'],
                        'line-width': [
                            'interpolate', ['linear'], ['zoom'],
                            5, 1,
                            12, 3
                        ]
                    }
                },
                // --- Stations (Points) ---
                {
                    id: 'stations-points',
                    type: 'circle',
                    source: 'railways',
                    filter: ['in', ['get', 'visibleIn'], ['literal', ['ground', 'both']]], // Default to ground
                    minzoom: 9, // Performance: Only show dots when zoomed in
                    paint: {
                        'circle-radius': [
                            'interpolate', ['linear'], ['zoom'],
                            9, 2,
                            14, 5
                        ],
                        'circle-color': '#fff',
                        'circle-stroke-width': 1,
                        'circle-stroke-color': '#555'
                    }
                },
                // --- Station Labels ---
                {
                    id: 'stations-labels',
                    type: 'symbol',
                    source: 'railways',
                    filter: ['in', ['get', 'visibleIn'], ['literal', ['ground', 'both']]], // Default to ground
                    minzoom: 12, // Performance: Only show text when very close
                    layout: {
                        'text-field': ['get', 'name'],
                        // Use Noto Sans CJK JP Bold which is available on Geolonia's server
                        'text-font': ['Noto Sans CJK JP Bold'],
                        'text-size': 12,
                        'text-offset': [0, 1.2],
                        'text-anchor': 'top'
                    },
                    paint: {
                        'text-color': '#000',
                        'text-halo-color': '#fff',
                        'text-halo-width': 2
                    }
                }
            ]
        },
        center: [139.7671, 35.6812], // Default to Tokyo
        zoom: 10
    });

    // Popup
    const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false
    });

    map.on('mouseenter', 'stations-points', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const coordinates = e.features[0].geometry.coordinates.slice();
        const props = e.features[0].properties;
        const name = props.name;
        
        let linesHtml = '';
        if (props.lines) {
            try {
                const lines = JSON.parse(props.lines);
                // Deduplicate lines
                const uniqueLines = new Map();
                lines.forEach(l => uniqueLines.set(l.name, l.color));
                
                linesHtml = '<div style="margin-top:5px; font-size:11px; line-height:1.4; max-height:150px; overflow-y:auto;">';
                // Sort lines by name
                const sortedLines = Array.from(uniqueLines.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                
                sortedLines.forEach(([name, color]) => {
                    linesHtml += `<div style="display:flex; align-items:center; margin-bottom:2px;"><span style="display:inline-block; width:8px; height:8px; background:${color}; border-radius:50%; margin-right:6px; flex-shrink:0;"></span>${name}</div>`;
                });
                linesHtml += '</div>';
            } catch(e) { console.error(e); }
        }

        const description = `<div style="font-weight:bold; font-size:14px; margin-bottom:4px;">${name}</div>${linesHtml}`;
        popup.setLngLat(coordinates).setHTML(description).addTo(map);
    });

    map.on('mouseleave', 'stations-points', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
    });

    // Dynamic Loading (Global) with Debounce
    map.on('moveend', () => {
        if (overpassDebounceTimer) clearTimeout(overpassDebounceTimer);
        overpassDebounceTimer = setTimeout(loadRealTracksInView, 500); // Wait 500ms after move ends
        
        // Update visible line list immediately (or debounced if needed)
        updateVisibleLines();
    });

    // Click Listeners for Line Details
    const lineLayers = ['rail-lines-core', 'rail-lines-glow'];
    lineLayers.forEach(layerId => {
        map.on('click', layerId, (e) => {
            const props = e.features[0].properties;
            if (props.lineCd) {
                toggleLineAccordion(props.lineCd);
            }
        });
        
        // Change cursor on hover
        map.on('mouseenter', layerId, () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
            map.getCanvas().style.cursor = '';
        });
    });

    // --- Editor Click Listener ---
    map.on('click', (e) => {
        if (!isEditMode) return;
        
        const coords = [e.lngLat.lng, e.lngLat.lat];
        
        // Add point to path
        draftLine.points.push(coords);
        
        // Add station marker
        const marker = new maplibregl.Marker({ 
            color: document.getElementById('edit-line-color').value,
            draggable: true
        })
            .setLngLat(coords)
            .addTo(map);
            
        // Handle Drag
        marker.on('dragend', () => {
            const lngLat = marker.getLngLat();
            const index = draftLine.markers.indexOf(marker);
            if (index !== -1) {
                draftLine.points[index] = [lngLat.lng, lngLat.lat];
                draftLine.stations[index].lon = lngLat.lng;
                draftLine.stations[index].lat = lngLat.lat;
                
                // Update Line String
                if (map.getSource('draft-line')) {
                    map.getSource('draft-line').setData({
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: draftLine.points }
                    });
                }
            }
        });

        draftLine.markers.push(marker);
        
        // Add station data
        draftLine.stations.push({
            name: "", 
            lon: coords[0],
            lat: coords[1]
        });
        
        // Update Draft Line Source
        if (map.getSource('draft-line')) {
            map.getSource('draft-line').setData({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: draftLine.points
                }
            });
        }
        
        updateEditorUI();
    });
}
