// --- Helpers ---

function normalizeLineName(name) {
    if (!name) return "";
    return name
        .replace(/^JR/, '')
        .replace(/^大阪メトロ/, '')
        .replace(/^東京メトロ/, '')
        .replace(/^都営/, '')
        .replace(/^近鉄/, '')
        .replace(/^名鉄/, '')
        .replace(/^西鉄/, '')
        .replace(/^阪急/, '')
        .replace(/^阪神/, '')
        .replace(/^京阪/, '')
        .replace(/^南海/, '')
        .replace(/^相鉄/, '')
        .replace(/^京急/, '')
        .replace(/^東急/, '')
        .replace(/^小田急/, '')
        .replace(/^京王/, '')
        .replace(/^西武/, '')
        .replace(/^東武/, '')
        .replace(/^京成/, '')
        .replace(/線$/, '')
        .replace(/[（\(].*?[）\)]/g, '')
        .trim();
}

function getLineColor(name) {
    // Normalize input name for matching
    const normName = normalizeLineName(name);
    
    // 1. Try Normalized Match
    if (externalLineData[normName] && externalLineData[normName].color) {
        return externalLineData[normName].color;
    }
    
    // 2. Try Exact Match (Fallback)
    if (externalLineData[name] && externalLineData[name].color) {
        return externalLineData[name].color;
    }

    // 3. Fallback Heuristics (Generic)
    if (name.includes("JR")) return "#2ecc71"; // Generic JR Green
    if (name.includes("地下鉄") || name.includes("メトロ")) return "#999"; // Generic Subway Gray
    if (name.includes("新幹線")) return "#1E3586"; // Generic Shinkansen Blue
    
    // 4. Deterministic Random Color (Fallback)
    return stringToColor(name);
}

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Generate a color with consistent saturation and lightness
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 65%, 45%)`;
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

function getCatmullRomSpline(points, numSegments) {
    if (points.length < 2) return points;
    const spline = [];
    const p = [points[0], ...points, points[points.length - 1]];
    for (let i = 0; i < p.length - 3; i++) {
        const p0 = p[i], p1 = p[i+1], p2 = p[i+2], p3 = p[i+3];
        for (let t = 0; t < 1; t += 1/numSegments) {
            const t2 = t*t, t3 = t2*t;
            const x = 0.5 * ((2*p1[0]) + (-p0[0]+p2[0])*t + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3);
            const y = 0.5 * ((2*p1[1]) + (-p0[1]+p2[1])*t + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3);
            spline.push([x, y]);
        }
    }
    spline.push(points[points.length - 1]);
    return spline;
}

function generateFallbackLogoHTML(lineName, color, code) {
    // 1. Determine Style (Square for JR/Private, Circle for Subway)
    const isSubway = lineName.includes("地下鉄") || lineName.includes("メトロ") || lineName.includes("都営") || lineName.includes("市営");
    
    // 2. Determine Text (Code > Initial > Kanji)
    let text = code;
    if (!text) {
        // Try to guess initial from common names if no code provided
        
        // --- Tokyo ---
        if (lineName.includes("山手")) text = "JY";
        else if (lineName.includes("京浜東北")) text = "JK";
        else if (lineName.includes("中央")) text = "JC";
        else if (lineName.includes("総武")) text = "JB";
        else if (lineName.includes("常磐")) text = "JJ";
        else if (lineName.includes("銀座")) text = "G";
        else if (lineName.includes("丸ノ内")) text = "M";
        else if (lineName.includes("日比谷")) text = "H";
        else if (lineName.includes("東西") && lineName.includes("東京")) text = "T";
        else if (lineName.includes("千代田")) text = "C";
        else if (lineName.includes("有楽町")) text = "Y";
        else if (lineName.includes("半蔵門")) text = "Z";
        else if (lineName.includes("南北") && lineName.includes("東京")) text = "N";
        else if (lineName.includes("副都心")) text = "F";
        else if (lineName.includes("新宿") && lineName.includes("都営")) text = "S";
        else if (lineName.includes("浅草")) text = "A";
        else if (lineName.includes("三田")) text = "I";
        else if (lineName.includes("大江戸")) text = "E";

        // --- Osaka (Osaka Metro) ---
        else if (lineName.includes("御堂筋")) text = "M";
        else if (lineName.includes("谷町")) text = "T";
        else if (lineName.includes("四つ橋")) text = "Y";
        else if (lineName.includes("中央") && !lineName.includes("総武")) text = "C";
        else if (lineName.includes("千日前")) text = "S";
        else if (lineName.includes("堺筋")) text = "K";
        else if (lineName.includes("長堀鶴見緑地")) text = "N";
        else if (lineName.includes("今里筋")) text = "I";
        else if (lineName.includes("南港ポートタウン")) text = "P";

        // --- Nagoya ---
        else if (lineName.includes("東山")) text = "H";
        else if (lineName.includes("名城")) text = "M";
        else if (lineName.includes("名港")) text = "E";
        else if (lineName.includes("鶴舞")) text = "T";
        else if (lineName.includes("桜通")) text = "S";
        else if (lineName.includes("上飯田")) text = "K";

        // --- Fukuoka ---
        else if (lineName.includes("空港線") && (lineName.includes("福岡") || lineName.includes("地下鉄"))) text = "K";
        else if (lineName.includes("箱崎")) text = "H";
        else if (lineName.includes("七隈")) text = "N";

        // --- Sapporo ---
        else if (lineName.includes("南北") && lineName.includes("札幌")) text = "N";
        else if (lineName.includes("東西") && lineName.includes("札幌")) text = "T";
        else if (lineName.includes("東豊")) text = "H";

        // --- Sendai ---
        else if (lineName.includes("南北") && lineName.includes("仙台")) text = "N";
        else if (lineName.includes("東西") && lineName.includes("仙台")) text = "T";

        // --- Kyoto ---
        else if (lineName.includes("烏丸")) text = "K";
        else if (lineName.includes("東西") && lineName.includes("京都")) text = "T";

        // --- Kobe ---
        else if (lineName.includes("西神")) text = "S";
        else if (lineName.includes("海岸")) text = "K";

        // --- Yokohama ---
        else if (lineName.includes("ブルーライン")) text = "B";
        else if (lineName.includes("グリーンライン")) text = "G";

        else {
            // Fallback to first character (Kanji)
            // Remove common prefixes
            let clean = lineName
                .replace(/^JR/, '')
                .replace(/^東武/, '')
                .replace(/^西武/, '')
                .replace(/^京成/, '')
                .replace(/^京王/, '')
                .replace(/^小田急/, '')
                .replace(/^東急/, '')
                .replace(/^京急/, '')
                .replace(/^相鉄/, '')
                .replace(/^名鉄/, '')
                .replace(/^近鉄/, '')
                .replace(/^阪急/, '')
                .replace(/^阪神/, '')
                .replace(/^南海/, '')
                .replace(/^西鉄/, '')
                .replace(/^大阪メトロ/, '')
                .replace(/^東京メトロ/, '')
                .replace(/^都営/, '');
                
            text = clean.charAt(0);
        }
    }

    // 3. Generate HTML
    if (isSubway) {
        // Circle Style (Tokyo Metro / Toei style)
        // Outer circle: Color
        // Inner circle: White
        // Text: Color or Black
        return `
            <div style="
                width: 100%; height: 100%;
                background: ${color};
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            ">
                <div style="
                    width: 75%; height: 75%;
                    background: white;
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    color: #333;
                    font-family: 'Arial', sans-serif;
                    font-weight: 900;
                    font-size: 16px;
                ">${text}</div>
            </div>
        `;
    } else {
        // Square Style (JR style)
        // Rounded square: Color
        // Text: White (or Black if color is too light)
        return `
            <div style="
                width: 100%; height: 100%;
                background: ${color};
                border-radius: 6px;
                display: flex; align-items: center; justify-content: center;
                color: white;
                font-family: 'Arial', sans-serif;
                font-weight: bold;
                font-size: 18px;
                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            ">
                ${text}
            </div>
        `;
    }
}
