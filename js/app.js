// ==========================================
// 🚀 TerraTrace Web Engine (Core Logic)
// ==========================================

// --- グローバル変数 ---
let routeCoordinates = [];
let totalOdometer = 0.0;
let tripOffset = parseFloat(localStorage.getItem('terraTrace_TripOffset')) || 0.0;
let lastLocation = null;
let lastLogTime = 0; // 最後に記録した時間

let map;
let routePolyline;
let isRealMode = false;

// ユーザー専用のストレージキー
function getDeviceId() {
    let deviceId = localStorage.getItem('terraTrace_DeviceID');
    if (!deviceId) {
        deviceId = 'agent_' + Math.random().toString(36).substr(2, 10);
        localStorage.setItem('terraTrace_DeviceID', deviceId);
    }
    return deviceId;
}
const CSV_STORAGE_KEY = `terraTrace_CSV_${getDeviceId()}`;

// ==========================================
// 🌍 1. マップの初期化＆モード切り替え
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // Leaflet初期化
    map = L.map('osmMap', { zoomControl: false }).setView([35.168999, 136.853760], 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 20
    }).addTo(map);

    routePolyline = L.polyline([], {
        color: '#00FF00', weight: 4, opacity: 0.8, lineCap: 'round', lineJoin: 'round'
    }).addTo(map);

    // 過去のデータをロード
    autoLoadLog();
    drawCyberMeter(0); // メーターの初期描画

    // 🕹 モード切り替えボタン（ズーム補正版！）
    const modeToggleBtn = document.getElementById('modeToggleBtn');
    modeToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        isRealMode = !isRealMode; 
        document.getElementById('tacticalContainer').style.display = isRealMode ? 'none' : 'block';
        document.getElementById('realContainer').style.display = isRealMode ? 'block' : 'none';
        modeToggleBtn.textContent = isRealMode ? 'MODE: REAL' : 'MODE: TACTICAL'; 
        
        if (isRealMode && map) {
            // 🔥 魔法の3ステップでズームを最適化！
            setTimeout(() => {
                // 1. まず地図のサイズを再計算
                map.invalidateSize(); 
                
                if (lastLocation) {
                    // 2. 現在地があるなら、そこを中心にズーム16（街路がよく見えるレベル）でジャンプ！
                    map.setView([lastLocation.lat, lastLocation.lng], 16, { animate: true });
                } else if (routeCoordinates.length > 0) {
                    // 3. 現在地が取れてなければ、これまでの軌跡全体を収める
                    map.fitBounds(routePolyline.getBounds());
                }
            }, 100);
        } else {
            drawTacticalMap();
        }
    });
});

// ==========================================
// 🟩 2. タクティカルマップの描画
// ==========================================
function drawTacticalMap() {
    const canvas = document.getElementById('tacticalCanvas');
    if (!canvas || routeCoordinates.length === 0 || isRealMode) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const lats = routeCoordinates.map(c => c.lat);
    const lngs = routeCoordinates.map(c => c.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

    const spanDist = (maxLng - minLng) * 91000;
    document.getElementById('areaWidthText').textContent = spanDist >= 1000 ? `${(spanDist/1000).toFixed(1)} km` : `${spanDist.toFixed(0)} m`;

    const latRange = (maxLat - minLat) || 0.001;
    const lngRange = ((maxLng - minLng) * 0.82) || 0.001;
    const scale = Math.min(rect.width / lngRange, rect.height / latRange) * 0.85; 

    const offsetX = (rect.width - lngRange * scale) / 2;
    const offsetY = (rect.height - latRange * scale) / 2;

    ctx.shadowColor = 'rgba(0, 255, 0, 0.8)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    ctx.beginPath();
    routeCoordinates.forEach((coord, i) => {
        const x = ((coord.lng - minLng) * 0.82) * scale + offsetX;
        const y = rect.height - ((coord.lat - minLat) * scale + offsetY); 
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

// ==========================================
// 🔴 3. サイバーメーターの描画（レイヤー順 完璧版！）
// ==========================================
function drawCyberMeter(speed) {
    const canvas = document.getElementById('analogMeter');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');

    const logicalWidth = 400, logicalHeight = 300;
    const dpr = Math.max(window.devicePixelRatio || 1, 3);
    canvas.width = logicalWidth * dpr; canvas.height = logicalHeight * dpr;
    canvas.style.width = `${logicalWidth}px`; canvas.style.height = `${logicalHeight}px`;
    ctx.scale(dpr, dpr);

    const cx = logicalWidth / 2, cy = logicalHeight * 0.75, radius = logicalWidth * 0.42;
    const toRad = (deg) => deg * (Math.PI / 180);

    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    
    const maxSpeed = 180;
    const currentSpeed = Math.min(Math.max(speed, 0), maxSpeed);

    // 【第1層】外側のダミーリング
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, radius + 8, toRad(180), toRad(360));
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(0,255,0,0.3)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();

    // 【第2層】ベースの半円（グレー背景）
    ctx.beginPath(); ctx.arc(cx, cy, radius, toRad(180), toRad(360));
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 12; ctx.stroke();

    // 【第3層】グラデーション弧（目盛りの下に敷く！！）
    let endDegree = 180 + (currentSpeed / maxSpeed) * 180;
    ctx.shadowColor = 'rgba(0,255,0,0.5)'; ctx.shadowBlur = 15;
    ctx.lineCap = 'butt'; // 筆をスパッと切り落とす

    for (let a = 180; a < endDegree; a += 1) {
        let t = (a - 180) / 180;
        let r = t < 0.5 ? Math.floor(t * 2 * 255) : 255;
        let g = t < 0.5 ? 255 : Math.floor((1 - (t - 0.5) * 2) * 255);
        ctx.beginPath(); ctx.arc(cx, cy, radius, toRad(a), toRad(a + 1.5));
        ctx.strokeStyle = `rgb(${r},${g},0)`; ctx.lineWidth = 12; ctx.stroke();
    }
    ctx.shadowBlur = 0; // 一旦影をリセット

    // 【第4層】目盛りと数字（グラデーションの上にパキッと描画！）
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 14px monospace'; ctx.lineCap = 'square';
    for (let v = 0; v <= 180; v += 10) {
        let isMajor = (v % 30 === 0), isSuperMajor = (v === 0 || v === 90 || v === 180);
        let tl = isMajor ? 20 : 10, er = isSuperMajor ? radius + 8 : radius;
        let sx = cx + (radius - tl) * Math.cos(toRad(v + 180)), sy = cy + (radius - tl) * Math.sin(toRad(v + 180));
        let ex = cx + er * Math.cos(toRad(v + 180)), ey = cy + er * Math.sin(toRad(v + 180));
        
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey);
        // 背景が明るいグラデーションになるので、目盛り自体を少し白く強くする！
        ctx.strokeStyle = isMajor ? '#ffffff' : 'rgba(255, 255, 255, 0.6)'; 
        ctx.lineWidth = isSuperMajor ? 4 : (isMajor ? 3 : 1); ctx.stroke();
        
        if (isMajor) {
            ctx.fillStyle = '#ffffff'; 
            // 🔥 魔法：数字がグラデーションに溶け込まないように、うっすら黒い影を落とす！
            ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
            ctx.fillText(v.toString(), cx + (radius - 35) * Math.cos(toRad(v + 180)), cy + (radius - 35) * Math.sin(toRad(v + 180)));
            ctx.shadowBlur = 0; // 影をリセット
        }
    }

    // 【第5層】赤い針（一番上！！）
    let nx = cx + (radius + 5) * Math.cos(toRad(endDegree)), ny = cy + (radius + 5) * Math.sin(toRad(endDegree));
    let sx = cx + (radius - 60) * Math.cos(toRad(endDegree)), sy = cy + (radius - 60) * Math.sin(toRad(endDegree));
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(nx, ny); ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 4; ctx.stroke();
}


// ==========================================
// 🧮 4. 距離計算 ＆ UI更新
// ==========================================
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function updateDistanceUI() {
    const odoKm = (totalOdometer / 1000).toFixed(1).padStart(7, '0');
    let tripDist = totalOdometer - tripOffset;
    if(tripDist < 0) tripDist = 0;
    const tripKm = (tripDist / 1000).toFixed(1).padStart(5, '0');
    document.getElementById('odometer').textContent = `${odoKm} km`;
    document.getElementById('trip').textContent = `${tripKm} km`;
}

document.getElementById('tripContainer').addEventListener('click', () => {
    tripOffset = totalOdometer; 
    localStorage.setItem('terraTrace_TripOffset', tripOffset.toString());
    updateDistanceUI();
});

// ==========================================
// 💾 5. ストレージエンジン (ロード＆セーブ)
// ==========================================
function autoLoadLog() {
    const savedCsv = localStorage.getItem(CSV_STORAGE_KEY);
    if (savedCsv) {
        savedCsv.split('\n').forEach(line => {
            const pts = line.split(',');
            if (pts.length >= 2) {
                const lat = parseFloat(pts[0]), lng = parseFloat(pts[1]);
                if (!isNaN(lat) && !isNaN(lng)) {
                    routeCoordinates.push({ lat, lng });
                    if (lastLocation) totalOdometer += getDistanceInMeters(lastLocation.lat, lastLocation.lng, lat, lng);
                    lastLocation = { lat, lng };
                }
            }
        });
        updateDistanceUI(); drawTacticalMap();
        if (routeCoordinates.length > 0 && map) {
            routePolyline.setLatLngs(routeCoordinates); map.fitBounds(routePolyline.getBounds());
        }
    }
}

function appendLogToStorage(lat, lng, speed) {
    let csv = localStorage.getItem(CSV_STORAGE_KEY) || '';
    csv += `${lat},${lng},${speed}\n`;
    localStorage.setItem(CSV_STORAGE_KEY, csv);
}

// ==========================================
// 📡 6. GPSエンジン（iOSアプリの魂を継承！）
// ==========================================
if (navigator.geolocation) {
    document.getElementById('accuracy').textContent = `SEARCHING...`;
    
    navigator.geolocation.watchPosition((success) => {
        const lat = success.coords.latitude;
        const lng = success.coords.longitude;
        const speed = Math.floor((success.coords.speed || 0) * 3.6);
        const acc = success.coords.accuracy;
        
        document.getElementById('speed').textContent = speed;
        document.getElementById('accuracy').textContent = `±${acc.toFixed(1)} m`;
        if(speed >= 180) { document.getElementById('speed').style.color = 'red'; } 
        else { document.getElementById('speed').style.color = 'white'; }
        
        drawCyberMeter(speed);

        let movedDist = 0;
        if (lastLocation) {
            movedDist = getDistanceInMeters(lastLocation.lat, lastLocation.lng, lat, lng);
            if (movedDist < 2.0) movedDist = 0; 
        }

        if (movedDist > 0) {
            totalOdometer += movedDist;
            updateDistanceUI();
        }
        lastLocation = { lat, lng };

        // 🔥 修正完了：徒歩でも記録されるように「0.5km/h以上」に変更！
        const now = Date.now();
        if (speed >= 0.5 && (now - lastLogTime) >= 5000) {
            routeCoordinates.push({ lat, lng });
            appendLogToStorage(lat, lng, speed);
            drawTacticalMap();
            if (routePolyline && map) {
                routePolyline.addLatLng([lat, lng]);
                map.panTo([lat, lng]); 
            }
            lastLogTime = now;
        }
    }, (error) => {
        document.getElementById('accuracy').textContent = "GPS ERROR";
        document.getElementById('accuracy').style.color = "red";
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

// ==========================================
// 📂 7. CSVインポート（M5Stack用）
// ==========================================
document.getElementById('importCsvBtn').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('csvFileInput').click(); });
document.getElementById('csvFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        event.target.result.split('\n').forEach(line => {
            const pts = line.split(',');
            if (pts.length >= 2) {
                const lat = parseFloat(pts[0]), lng = parseFloat(pts[1]);
                if (!isNaN(lat) && !isNaN(lng)) {
                    routeCoordinates.push({ lat, lng });
                    if (lastLocation) totalOdometer += getDistanceInMeters(lastLocation.lat, lastLocation.lng, lat, lng);
                    lastLocation = { lat, lng };
                }
            }
        });
        updateDistanceUI(); drawTacticalMap();
        if (routeCoordinates.length > 0 && map) {
            routePolyline.setLatLngs(routeCoordinates); map.fitBounds(routePolyline.getBounds());
        }
        localStorage.setItem(CSV_STORAGE_KEY, routeCoordinates.map(c => `${c.lat},${c.lng},0`).join('\n'));
    };
    reader.readAsText(file, 'UTF-8');
});