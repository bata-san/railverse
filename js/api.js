// --- API & Data Loading ---

async function fetchExternalMetadata() {
    updateStatus("外部メタデータ(Wikidata等)を取得中...");
    try {
        // 1. Fetch Colors from Mini Tokyo 3D (High quality for Tokyo)
        const colorRes = await fetch('https://raw.githubusercontent.com/nagix/mini-tokyo-3d/master/data/railways.json');
        const colorData = await colorRes.json();

        // 2. Fetch Logos from Open Data JP Railway Lines
        const logoRes = await fetch('https://raw.githubusercontent.com/piuccio/open-data-jp-railway-lines/master/lines.json');
        const logoData = await logoRes.json();

        // 3. Fetch Nationwide Data from Wikidata (SPARQL)
        // Gets line colors (P465), logos (P154), and route numbers (P1671/P1801)
        const sparqlQuery = `
            SELECT DISTINCT ?lineLabel ?hexColor ?logo ?code WHERE {
              ?line wdt:P31/wdt:P279* wd:Q1142127;
                    wdt:P17 wd:Q17.
              OPTIONAL { ?line wdt:P465 ?hexColor. }
              OPTIONAL { ?line wdt:P154 ?logo. }
              OPTIONAL { ?line wdt:P1671 ?code. }
              OPTIONAL { ?line wdt:P1801 ?code. }
              SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". }
            }
            LIMIT 5000
        `;
        const wikidataUrl = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparqlQuery)}&format=json`;
        
        let wikidataItems = [];
        try {
            const wdRes = await fetch(wikidataUrl, { headers: { 'Accept': 'application/sparql-results+json' } });
            if (wdRes.ok) {
                const wdJson = await wdRes.json();
                wikidataItems = wdJson.results.bindings;
                console.log(`Wikidata loaded: ${wikidataItems.length} items`);
            }
        } catch (e) {
            console.warn("Wikidata fetch failed", e);
        }

        // 4. Build Lookup Map
        // Priority: Mini Tokyo 3D > Wikidata > Open Data JP
        
        // Helper to normalize names for matching
        const normalize = normalizeLineName;

        // Process Wikidata (Base Layer)
        wikidataItems.forEach(item => {
            const name = item.lineLabel.value;
            const normName = normalize(name);
            
            if (!externalLineData[normName]) externalLineData[normName] = {};
            
            if (item.hexColor) {
                externalLineData[normName].color = '#' + item.hexColor.value;
            }
            if (item.logo) {
                externalLineData[normName].logo = item.logo.value;
            }
            if (item.code) {
                externalLineData[normName].code = item.code.value;
            }
        });

        // Process Open Data JP (Middle Layer)
        logoData.forEach(line => {
            if (line.name_ja) {
                const normName = normalize(line.name_ja);
                if (!externalLineData[normName]) externalLineData[normName] = {};
                if (line.logo) externalLineData[normName].logo = line.logo;
            }
        });

        // Process Mini Tokyo 3D (Top Layer - Best Colors for Tokyo)
        colorData.forEach(line => {
            if (line.title && line.title.ja) {
                const name = line.title.ja;
                const normName = normalize(name);
                
                if (!externalLineData[normName]) externalLineData[normName] = {};
                externalLineData[normName].color = line.color;
                
                if (line.id.includes("JR-East")) externalLineData[normName].company = "JR東日本";
                else if (line.id.includes("TokyoMetro")) externalLineData[normName].company = "東京メトロ";
                else if (line.id.includes("Toei")) externalLineData[normName].company = "都営地下鉄";
            }
        });

        console.log("External metadata loaded:", Object.keys(externalLineData).length, "lines");
        updateStatus("外部メタデータの読み込み完了");

    } catch (e) {
        console.error("Failed to load external metadata", e);
        updateStatus("外部メタデータの読み込みに失敗しました (デフォルト色を使用)");
    }
}

async function loadAllRailways() {
    updateStatus("全国の路線データを読み込み開始...");
    
    // Iterate through all prefectures (1 to 47)
    // To avoid freezing the UI, we process them in chunks
    const PREF_COUNT = 47;
    let totalLines = 0;

    for (let prefCode = 1; prefCode <= PREF_COUNT; prefCode++) {
        updateStatus(`都道府県データ読み込み中: ${prefCode}/${PREF_COUNT}`);
        const count = await fetchPrefectureLines(prefCode);
        totalLines += count;
        
        // Update visible lines list
        updateVisibleLines();
        
        // Small delay to let UI breathe
        if (prefCode % 5 === 0) await new Promise(r => setTimeout(r, 100));
    }
    
    updateStatus(`全データ読み込み完了: ${totalLines}路線`);
    // Trigger initial Overpass load
    loadRealTracksInView();
    updateVisibleLines();
}

async function fetchPrefectureLines(prefCode) {
    const url = `https://ny-a.github.io/ekidata/api/p/${prefCode}.json`;
    try {
        const response = await fetch(url);
        if (!response.ok) return 0;
        
        const data = await response.json();
        const lines = data.line;
        if (!lines) return 0;

        const BATCH_SIZE = 50; 
        let newFeatures = [];

        for (let i = 0; i < lines.length; i += BATCH_SIZE) {
            const batch = lines.slice(i, i + BATCH_SIZE);
            const batchFeatures = await Promise.all(batch.map(l => fetchLineDetails(l.line_cd, l.line_name)));
            
            batchFeatures.flat().forEach(f => {
                if (f) newFeatures.push(f);
            });

            if (newFeatures.length > 0) {
                geojsonData.features.push(...newFeatures);
                map.getSource('railways').setData(geojsonData);
                newFeatures = [];
            }
            await new Promise(r => setTimeout(r, 10));
        }
        return lines.length;
    } catch (e) {
        console.warn(`Failed to load pref ${prefCode}`, e);
        return 0;
    }
}

async function fetchLineDetails(lineCd, lineName) {
    const url = `https://ny-a.github.io/ekidata/api/l/${lineCd}.json`;
    try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        const stations = data.station_l;
        if (!stations) return [];

        // Cache data for UI
        lineDataCache[lineCd] = data;

        const color = getLineColor(lineName);
        const isSubway = lineName.includes("地下鉄") || lineName.includes("メトロ") || lineName.includes("都営") || lineName.includes("市営");
        const lineMode = isSubway ? 'subway' : 'ground';
        
        const rawPath = [];
        const features = [];

        stations.forEach(st => {
            rawPath.push([st.lon, st.lat]);
            
            // Station Merging Logic
            const stName = st.station_name;
            let existing = stationRegistry.get(stName);
            
            // Check if existing station is close enough (e.g. < 500m)
            if (existing) {
                const dist = getDistanceKm(existing.lat, existing.lon, st.lat, st.lon);
                if (dist > 0.5) {
                    existing = null; // Too far, treat as different station with same name
                }
            }

            if (existing) {
                // Update existing station
                existing.modes.add(lineMode);
                existing.lines.push({ name: lineName, color: color });

                // Update feature property
                const feat = geojsonData.features[existing.featureIndex];
                if (feat) {
                    feat.properties.visibleIn = existing.modes.has('ground') && existing.modes.has('subway') ? 'both' : (existing.modes.has('ground') ? 'ground' : 'subway');
                    feat.properties.lines = JSON.stringify(existing.lines);
                }
            } else {
                // Create new station feature
                const linesList = [{ name: lineName, color: color }];
                const newFeature = {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [st.lon, st.lat] },
                    properties: {
                        type: 'station',
                        color: '#fff', // Neutral color for merged stations
                        strokeColor: '#555',
                        name: stName,
                        visibleIn: lineMode, // 'ground', 'subway', or 'both'
                        lines: JSON.stringify(linesList)
                    }
                };
                
                geojsonData.features.push(newFeature);
                const newIndex = geojsonData.features.length - 1;
                
                stationRegistry.set(stName, {
                    lat: st.lat,
                    lon: st.lon,
                    modes: new Set([lineMode]),
                    lines: linesList,
                    featureIndex: newIndex
                });
            }
        });

        if (rawPath.length > 1) {
            // Hide schematic lines for long-distance trains or sparse stops to avoid "straight line" artifacts
            // These will be covered by Overpass (Real Tracks)
            if (lineName.includes("成田エクスプレス") || 
                lineName.includes("新幹線") || 
                lineName.includes("特急") || 
                lineName.includes("ライナー")) {
                return features;
            }

            // Split path into segments based on distance to prevent "jumps" (e.g. complex branching lines like JR Narita Line)
            const segments = [];
            let currentSegment = [rawPath[0]];
            const DISTANCE_THRESHOLD_KM = 15; // Break line if stations are > 15km apart

            for (let i = 1; i < rawPath.length; i++) {
                const prev = rawPath[i-1];
                const curr = rawPath[i];
                const dist = getDistanceKm(prev[1], prev[0], curr[1], curr[0]);

                if (dist > DISTANCE_THRESHOLD_KM) {
                    // End current segment
                    if (currentSegment.length > 1) segments.push(currentSegment);
                    // Start new segment
                    currentSegment = [curr];
                } else {
                    currentSegment.push(curr);
                }
            }
            if (currentSegment.length > 1) segments.push(currentSegment);

            // Generate Splines for each segment
            segments.forEach(seg => {
                const smoothedPath = getCatmullRomSpline(seg, 4);
                features.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: smoothedPath },
                    properties: {
                        type: isSubway ? 'subway' : 'ground',
                        color: color,
                        lineCd: lineCd,
                        lineName: lineName
                    }
                });
            });
        }
        return features;

    } catch (e) {
        return [];
    }
}

async function loadRealTracksInView() {
    if (isOverpassLoading) return;

    const zoom = map.getZoom();
    // Safety check: Don't load Overpass if zoom is too low (too much data)
    if (zoom < 7) return;

    const bounds = map.getBounds();
    const center = bounds.getCenter();
    
    // Check if current view is already covered by loaded extents
    const isLoaded = loadedRealTrackExtents.some(b => b.contains(center));
    if (isLoaded) return;

    isOverpassLoading = true;
    updateStatus("詳細線路データを取得中 (Overpass API)...");

    // Expand bounds slightly to avoid frequent re-fetching
    const expandedBounds = new maplibregl.LngLatBounds(
        [bounds.getWest() - 0.02, bounds.getSouth() - 0.02],
        [bounds.getEast() + 0.02, bounds.getNorth() + 0.02]
    );
    
    const bbox = `${expandedBounds.getSouth()},${expandedBounds.getWest()},${expandedBounds.getNorth()},${expandedBounds.getEast()}`;
    const query = `
        [out:json][timeout:25];
        (
          way["railway"~"^(rail|subway|monorail)$"]["service"!~"^(yard|siding|spur)$"](${bbox});
        );
        out geom;
    `;
    
    try {
        const response = await fetch("https://overpass-api.de/api/interpreter", { method: 'POST', body: query });
        if (!response.ok) {
            if (response.status === 429) {
                console.warn("Overpass API rate limit exceeded. Retrying later.");
            }
            throw new Error("Overpass API request failed");
        }
        
        const data = await response.json();
        const newFeatures = [];
        
        data.elements.forEach(element => {
            if (element.type === 'way' && element.geometry) {
                const coords = element.geometry.map(pt => [pt.lon, pt.lat]);
                newFeatures.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: coords },
                    properties: {
                        type: 'real-track',
                        color: '#888'
                    }
                });
            }
        });
        
        if (newFeatures.length > 0) {
            geojsonData.features.push(...newFeatures);
            map.getSource('railways').setData(geojsonData);
            updateStatus(`実形状データ: ${newFeatures.length}件を追加読み込みしました`);
            loadedRealTrackExtents.push(expandedBounds);
        } else {
            updateStatus("実形状データ: 範囲内に見つかりませんでした");
        }
        
    } catch (e) {
        console.warn("Dynamic Overpass fetch failed", e);
        updateStatus("詳細データの取得に失敗しました");
    } finally {
        isOverpassLoading = false;
    }
}
