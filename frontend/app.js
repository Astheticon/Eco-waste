// ============================================================
// API KEY MANAGEMENT
// ============================================================
let ANTHROPIC_API_KEY = '';

function getApiKey() { return ANTHROPIC_API_KEY; }

function setApiKey(key) {
    ANTHROPIC_API_KEY = (key || '').trim();
    if (ANTHROPIC_API_KEY) {
        sessionStorage.setItem('ewp_api_key', ANTHROPIC_API_KEY);
    }
}

/** Build headers for every Anthropic API call */
function anthropicHeaders(extra = {}) {
    const h = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        ...extra
    };
    if (ANTHROPIC_API_KEY) h['x-api-key'] = ANTHROPIC_API_KEY;
    return h;
}

/** Show the API-key modal; resolves when a key is saved or skipped */
function promptForApiKey() {
    return new Promise(resolve => {
        // Don't show if already set
        if (ANTHROPIC_API_KEY) { resolve(); return; }
        const existing = sessionStorage.getItem('ewp_api_key');
        if (existing) { ANTHROPIC_API_KEY = existing; resolve(); return; }

        const overlay = document.createElement('div');
        overlay.id = 'apiKeyOverlay';
        overlay.innerHTML = `
          <div style="position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:99999;display:flex;align-items:center;justify-content:center;padding:1rem">
            <div style="background:#fff;border-radius:18px;padding:2rem 1.75rem;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.35);font-family:inherit">
              <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.25rem">
                <span style="font-size:2rem">🔑</span>
                <div>
                  <div style="font-weight:700;font-size:1.15rem;color:#1b5e20">Anthropic API Key</div>
                  <div style="font-size:0.78rem;color:#666">Required to enable live AI features</div>
                </div>
              </div>
              <p style="font-size:0.85rem;color:#444;margin:0 0 1rem;line-height:1.55">
                EcoWaste Pro uses Claude for waste scanning, EcoBot, AI ETA, and insights.
                Paste your <strong>Anthropic API key</strong> below — it stays in this browser tab only and is never stored on any server.
              </p>
              <input id="apiKeyInput" type="password" placeholder="sk-ant-api03-…"
                style="width:100%;box-sizing:border-box;padding:0.65rem 0.9rem;border:1.5px solid #c8e6c9;border-radius:10px;font-size:0.9rem;outline:none;margin-bottom:0.5rem;font-family:monospace"/>
              <div id="apiKeyError" style="font-size:0.78rem;color:#c62828;min-height:1.2em;margin-bottom:0.75rem"></div>
              <div style="display:flex;gap:0.75rem">
                <button id="apiKeySave"
                  style="flex:1;background:linear-gradient(135deg,#2e7d32,#66bb6a);color:#fff;border:none;border-radius:10px;padding:0.7rem;font-size:0.9rem;font-weight:600;cursor:pointer">
                  ✅ Enable Live AI
                </button>
                <button id="apiKeySkip"
                  style="background:#f5f5f5;color:#555;border:none;border-radius:10px;padding:0.7rem 1rem;font-size:0.85rem;cursor:pointer">
                  Skip
                </button>
              </div>
              <p style="font-size:0.72rem;color:#999;margin:0.85rem 0 0;text-align:center">
                Get a key at <a href="https://console.anthropic.com" target="_blank" style="color:#2e7d32">console.anthropic.com</a> · Stored in sessionStorage only
              </p>
            </div>
          </div>`;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('#apiKeyInput');
        const errEl = overlay.querySelector('#apiKeyError');

        function dismiss() {
            overlay.remove();
            resolve();
        }

        overlay.querySelector('#apiKeySave').addEventListener('click', () => {
            const val = input.value.trim();
            if (!val.startsWith('sk-ant-')) {
                errEl.textContent = 'Key should start with "sk-ant-…" — check and try again.';
                input.style.borderColor = '#e53935';
                return;
            }
            setApiKey(val);
            dismiss();
        });

        overlay.querySelector('#apiKeySkip').addEventListener('click', dismiss);

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') overlay.querySelector('#apiKeySave').click();
            errEl.textContent = '';
            input.style.borderColor = '#c8e6c9';
        });

        // Auto-focus
        setTimeout(() => input.focus(), 80);
    });
}

// ============================================================
// GLOBAL STATE
// ============================================================
let map = null;
let mapInitialized = false;
let userPoints = 0;
let currentImage = null;
let recentScans = [];
let currentUser = null;
let bins = [
    { id: 1, type: 'General Waste',  icon: '🗑️', fillLevel: 10,  capacity: '240L', lastCollection: 'Never' },
    { id: 2, type: 'Recyclables',    icon: '♻️', fillLevel: 15,  capacity: '240L', lastCollection: 'Never' },
    { id: 3, type: 'Organic Waste',  icon: '🌿', fillLevel: 5,   capacity: '120L', lastCollection: 'Never' },
    { id: 4, type: 'Glass & Metal',  icon: '🍾', fillLevel: 8,   capacity: '120L', lastCollection: 'Never' },
    { id: 5, type: 'Medical Waste',  icon: '🏥', fillLevel: 12,  capacity: '60L',  lastCollection: 'Never' }
];
let pickupRequests = [];
let requestHistory = [];

// ============================================================
// CITY DASHBOARD — bin nodes scattered around user location
// ============================================================
const CITY_BIN_NODES = [
    { id:'B1', label:'Bin Cluster A', subtype:'General', icon:'🗑️', latOff:  0.000, lngOff:  0.000, fill: 10  }, // home
    { id:'B2', label:'Bin Cluster B', subtype:'Recycling', icon:'♻️', latOff:  0.003, lngOff:  0.005, fill: 68  },
    { id:'B3', label:'Bin Cluster C', subtype:'Organic', icon:'🌿', latOff: -0.004, lngOff:  0.003, fill: 92  }, // critical
    { id:'B4', label:'Bin Cluster D', subtype:'General', icon:'🗑️', latOff:  0.005, lngOff: -0.004, fill: 48  },
    { id:'B5', label:'Bin Cluster E', subtype:'E-Waste',  icon:'🔋', latOff: -0.002, lngOff: -0.006, fill: 77  }, // warning
    { id:'B6', label:'Bin Cluster F', subtype:'Recycling',icon:'♻️', latOff:  0.007, lngOff:  0.002, fill: 35  },
    { id:'B7', label:'Bin Cluster G', subtype:'Hazardous',icon:'⚠️', latOff: -0.006, lngOff:  0.006, fill: 88  }, // critical
    { id:'B8', label:'Bin Cluster H', subtype:'General', icon:'🗑️', latOff:  0.001, lngOff: -0.008, fill: 22  },
    { id:'B9', label:'Bin Cluster I', subtype:'Medical',  icon:'🏥', latOff: -0.008, lngOff: -0.003, fill: 61  }, // warning
    { id:'B10',label:'Bin Cluster J', subtype:'Organic', icon:'🌿', latOff:  0.009, lngOff: -0.002, fill: 14  },
    { id:'B11',label:'Bin Cluster K', subtype:'General', icon:'🗑️', latOff: -0.003, lngOff:  0.009, fill: 55  },
    { id:'B12',label:'Bin Cluster L', subtype:'Recycling',icon:'♻️', latOff:  0.006, lngOff:  0.008, fill: 97  }, // critical
];
const CITY_TRUCKS = [
    { id:'T1', label:'Truck GCC-01', subtype:'General Waste',  latOff:  0.004,  lngOff:  0.006, targetBin: null, collecting: false, eta: null },
    { id:'T2', label:'Truck GCC-07', subtype:'Recycling',      latOff: -0.005,  lngOff: -0.005, targetBin: null, collecting: false, eta: null },
    { id:'T3', label:'Truck GCC-12', subtype:'Organic',        latOff:  0.006,  lngOff: -0.007, targetBin: null, collecting: false, eta: null },
];
let cityBinMarkers   = [];
let cityTruckMarkers = [];
let cityRouteLines   = {}; // truckId -> L.polyline
let cityClockInterval = null;
let liveSimInterval   = null;
let truckMoveInterval = null;
let baseLat = 13.0827, baseLng = 80.2707; // updated when map builds
let simTick = 0;
let alertedBins = new Set(); // track bins we already alerted

function getBinStatus(fill) {
    if (fill >= 85) return 'crit';
    if (fill >= 60) return 'warn';
    return 'ok';
}
function getBinStatusLabel(fill) {
    if (fill >= 85) return 'CRITICAL';
    if (fill >= 60) return 'WARNING';
    return 'OK';
}
let prevCritCount = 0;
function updateCityKPIs() {
    let crit = 0, warn = 0, ok = 0;
    CITY_BIN_NODES.forEach(b => {
        const s = getBinStatus(b.fill);
        if (s === 'crit') crit++;
        else if (s === 'warn') warn++;
        else ok++;
    });
    document.getElementById('kpiCrit').textContent = crit;
    document.getElementById('kpiWarn').textContent = warn;
    document.getElementById('kpiOk').textContent = ok;
    // Count dispatched trucks
    const dispatched = CITY_TRUCKS.filter(t => t.targetBin).length;
    document.getElementById('kpiTrucks').textContent = CITY_TRUCKS.length;

    // Animate the critical KPI pill when count increases
    if (crit > prevCritCount) {
        const pill = document.getElementById('kpiCrit').parentElement;
        if (pill) {
            pill.style.borderColor = 'rgba(255,23,68,0.8)';
            pill.style.background  = 'rgba(255,23,68,0.15)';
            pill.style.transition  = 'all 0.3s';
            setTimeout(() => { pill.style.borderColor = ''; pill.style.background = ''; }, 1800);
        }
    }
    prevCritCount = crit;
}
function makeBinMarkerHTML(status, fill) {
    const label = (fill !== undefined) ? `<div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);white-space:nowrap;font-family:'Space Mono',monospace;font-size:9px;font-weight:700;color:${status==='crit'?'#ff5252':status==='warn'?'#ffab40':'#69f0ae'};text-shadow:0 1px 3px rgba(0,0,0,0.9);letter-spacing:0.04em">${fill}%</div>` : '';
    return `<div class="bin-marker-wrap" style="position:relative">
                ${label}
                <div class="bin-pulse-ring ${status}"></div>
                <div class="bin-pulse-ring2 ${status}"></div>
                <div class="bin-dot ${status}" style="font-size:${status==='crit'?'1.05':'0.95'}rem">&#x1F5D1;</div>
            </div>`;
}
function makeTruckMarkerHTML() {
    return `<div class="truck-marker-wrap"><div class="truck-dot">🚛</div></div>`;
}
function makeBinPopupHTML(node) {
    const status = getBinStatus(node.fill);
    const fillBarClass = status === 'crit' ? 'fill-bar-crit' : status === 'warn' ? 'fill-bar-warn' : 'fill-bar-ok';
    const statusLabel = getBinStatusLabel(node.fill);
    const dispatchedTruck = CITY_TRUCKS.find(t => t.targetBin === node.id);
    const truckRow = dispatchedTruck
        ? `<div style="margin-top:6px;background:rgba(255,200,0,0.15);border-radius:6px;padding:4px 6px;font-size:0.78rem;color:#ffd600;font-weight:700">
               &#x1F69B; ${dispatchedTruck.label} en route &bull; ETA ${dispatchedTruck.eta} min
           </div>`
        : '';
    return `<div class="bin-popup">
                <div class="bin-popup-header">
                    <div class="icon">${node.icon}</div>
                    <div>
                        <h3>${node.label}</h3>
                        <span class="type-badge ${status}">${statusLabel}</span>
                    </div>
                </div>
                <div class="bin-popup-fill-label">Fill Level &mdash; <span style="color:${status==='crit'?'#ff5252':status==='warn'?'#ffab40':'#69f0ae'};font-weight:700">${node.fill}%</span></div>
                <div class="bin-popup-fill-bar">
                    <div class="bin-popup-fill-inner ${fillBarClass}" style="width:${node.fill}%"></div>
                </div>
                <div class="bin-popup-meta">
                    Type: <span>${node.subtype}</span><br>
                    ID: <span>${node.id}</span>
                </div>
                ${truckRow}
            </div>`;
}
function buildCityMap(lat, lng) {
    if (liveSimInterval)  clearInterval(liveSimInterval);
    if (truckMoveInterval) clearInterval(truckMoveInterval);
    Object.values(cityRouteLines).forEach(l => { try { l.remove(); } catch(e){} });
    cityRouteLines = {};
    if (map) { map.remove(); map = null; }
    map = L.map('map', { zoomControl: true, attributionControl: false }).setView([lat, lng], 15);

    // Dark-tinted tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        className: 'map-tiles'
    }).addTo(map);

    // Add custom attribution
    L.control.attribution({ prefix: false }).addTo(map);

    // Home marker
    const homeIcon = L.divIcon({
        html: `<div style="font-size:1.8rem;filter:drop-shadow(0 0 8px rgba(46,204,113,0.9)) drop-shadow(0 2px 4px rgba(0,0,0,0.5))">🏠</div>`,
        className: '', iconSize: [36,36], iconAnchor: [18,18]
    });
    L.marker([lat, lng], { icon: homeIcon })
        .bindPopup(`<div class="bin-popup"><div class="bin-popup-header"><div class="icon">🏠</div><div><h3>Your Location</h3><span class="type-badge ok">HOME</span></div></div><div class="bin-popup-meta">Ward: <span>12 — Anna Nagar East</span><br>Chennai, Tamil Nadu</div></div>`)
        .addTo(map);

    // Accuracy circle
    L.circle([lat, lng], { color: 'rgba(46,204,113,0.6)', fillColor: 'rgba(46,204,113,0.08)', fillOpacity: 1, radius: 80, weight: 1 }).addTo(map);

    // Bin nodes
    cityBinMarkers = [];
    CITY_BIN_NODES.forEach(node => {
        const status = getBinStatus(node.fill);
        const nodeIcon = L.divIcon({ html: makeBinMarkerHTML(status, node.fill), className: '', iconSize: [36,36], iconAnchor: [18,18] });
        const m = L.marker([lat + node.latOff, lng + node.lngOff], { icon: nodeIcon })
            .bindPopup(makeBinPopupHTML(node), { maxWidth: 220 })
            .addTo(map);
        cityBinMarkers.push({ node, marker: m });
    });

    // Truck markers
    cityTruckMarkers = [];
    CITY_TRUCKS.forEach(truck => {
        const truckIcon = L.divIcon({ html: makeTruckMarkerHTML(), className: '', iconSize: [38,38], iconAnchor: [19,19] });
        const m = L.marker([lat + truck.latOff, lng + truck.lngOff], { icon: truckIcon })
            .bindPopup(`<div class="bin-popup"><div class="bin-popup-header"><div class="icon">🚛</div><div><h3>${truck.label}</h3><span class="type-badge ok">EN ROUTE</span></div></div><div class="bin-popup-meta">Type: <span>${truck.subtype}</span><br>Status: <span>Active · GPS Tracked</span></div></div>`)
            .addTo(map);
        cityTruckMarkers.push({ truck, marker: m });
    });

    updateCityKPIs();
    startCityClock();
    startLiveSimulation(lat, lng);
}

function startCityClock() {
    if (cityClockInterval) clearInterval(cityClockInterval);
    function tick() {
        const el = document.getElementById('cityClockEl');
        if (el) el.textContent = new Date().toLocaleTimeString('en-IN', { hour12: false });
    }
    tick();
    cityClockInterval = setInterval(tick, 1000);
}

// ============================================================
// LIVE REAL-TIME SIMULATION ENGINE
// ============================================================
function startLiveSimulation(lat, lng) {
    baseLat = lat; baseLng = lng;

    // Clear any old intervals
    if (liveSimInterval)  clearInterval(liveSimInterval);
    if (truckMoveInterval) clearInterval(truckMoveInterval);
    alertedBins.clear();
    simTick = 0;

    // ── Bin fill simulation: every 4 s, random bins get fuller ──
    liveSimInterval = setInterval(() => {
        simTick++;
        CITY_BIN_NODES.forEach(node => {
            // Skip bins a truck is actively collecting
            const beingServiced = CITY_TRUCKS.some(t => t.targetBin === node.id && t.collecting);
            if (beingServiced) return;

            // Random fill increase (some bins fill faster)
            const chance = node.subtype === 'Organic' ? 0.55 : node.subtype === 'General' ? 0.5 : 0.35;
            if (Math.random() < chance) {
                const increment = Math.floor(Math.random() * 4) + 1;
                node.fill = Math.min(100, node.fill + increment);
            }
        });

        // Sync city bin markers + KPIs
        refreshCityBinMarkers();
        updateCityKPIs();

        // Check for newly critical bins → dispatch truck
        dispatchTrucksToCritical();

        // Sync My Bins tab fill levels (link first 5 city nodes → bins array)
        syncMyBins();

    }, 4000);

    // ── Smooth truck movement: every 1.2 s ──
    truckMoveInterval = setInterval(() => {
        moveTrucksOneStep();
    }, 1200);
}

// Refresh bin marker icons & popups on the map
function refreshCityBinMarkers() {
    cityBinMarkers.forEach(({ node, marker }) => {
        const status = getBinStatus(node.fill);
        const newHtml = makeBinMarkerHTML(status, node.fill);
        marker.setIcon(L.divIcon({ html: newHtml, className: '', iconSize: [36,36], iconAnchor: [18,18] }));
        marker.setPopupContent(makeBinPopupHTML(node));
    });
}

// Dispatch available trucks toward critical bins
function dispatchTrucksToCritical() {
    const criticalBins = CITY_BIN_NODES
        .filter(n => n.fill >= 85)
        .sort((a, b) => b.fill - a.fill); // highest first

    criticalBins.forEach(bin => {
        // Is a truck already heading here?
        const alreadyTargeted = CITY_TRUCKS.some(t => t.targetBin === bin.id);
        if (alreadyTargeted) return;

        // Find the nearest free truck
        const freeTruck = CITY_TRUCKS.find(t => !t.targetBin);
        if (!freeTruck) return;

        // Dispatch!
        freeTruck.targetBin = bin.id;
        freeTruck.collecting = false;
        freeTruck.eta = Math.floor(Math.random() * 8) + 4; // 4-12 min ETA

        // Show dramatic alert toast (only once per bin going critical)
        if (!alertedBins.has(bin.id)) {
            alertedBins.add(bin.id);
            showCriticalAlert(bin, freeTruck);
        }

        // Update truck popup
        updateTruckPopup(freeTruck, bin);
    });
}

// Move each truck one step toward its target bin
function moveTrucksOneStep() {
    cityTruckMarkers.forEach(({ truck, marker }) => {
        const currentPos = marker.getLatLng();

        if (truck.targetBin) {
            // Move toward target bin
            const targetNode = CITY_BIN_NODES.find(n => n.id === truck.targetBin);
            if (!targetNode) return;
            const targetLat = baseLat + targetNode.latOff;
            const targetLng = baseLng + targetNode.lngOff;

            const dLat = targetLat - currentPos.lat;
            const dLng = targetLng - currentPos.lng;
            const dist  = Math.sqrt(dLat * dLat + dLng * dLng);

            const stepSize = 0.0006; // ~60m per step

            if (dist < 0.0008) {
                // Arrived! Remove route line, start collection
                if (cityRouteLines[truck.id]) { cityRouteLines[truck.id].remove(); delete cityRouteLines[truck.id]; }
                if (!truck.collecting) {
                    truck.collecting = true;
                    marker.setLatLng([targetLat, targetLng]);
                    showCollectionAnimation(targetNode, truck, marker);
                }
            } else {
                // Move toward target
                const ratio = stepSize / dist;
                const newLat = currentPos.lat + dLat * ratio;
                const newLng = currentPos.lng + dLng * ratio;
                marker.setLatLng([newLat, newLng]);

                // Draw / update dashed route line
                if (map) {
                    if (cityRouteLines[truck.id]) cityRouteLines[truck.id].remove();
                    cityRouteLines[truck.id] = L.polyline(
                        [[newLat, newLng], [targetLat, targetLng]],
                        { color: '#ffd600', weight: 2, opacity: 0.7, dashArray: '6 5' }
                    ).addTo(map);
                }
            }
        } else {
            // Patrol: gentle circular path
            const i   = CITY_TRUCKS.indexOf(truck);
            const t   = simTick * 0.04;
            const r   = 0.0018 + i * 0.001;
            const ang = t + i * 2.094; // 120° apart
            const newLat = baseLat + truck.latOff + Math.sin(ang) * r;
            const newLng = baseLng + truck.lngOff + Math.cos(ang) * r;
            marker.setLatLng([newLat, newLng]);
        }
    });
}

// Collection animation: empty the bin, free the truck
function showCollectionAnimation(node, truck, marker) {
    // Make truck icon pulse/flash
    marker.setIcon(L.divIcon({
        html: `<div class="truck-marker-wrap"><div class="truck-dot" style="background:rgba(255,200,0,0.95);box-shadow:0 0 20px rgba(255,200,0,0.8);animation:truckBob 0.4s ease-in-out infinite">&#x1F69B;</div></div>`,
        className: '', iconSize: [38,38], iconAnchor: [19,19]
    }));

    showNotification('🗑️', `${truck.label} is emptying ${node.label}`);

    // Drain the bin over 3 seconds
    let drainFill = node.fill;
    const drainInterval = setInterval(() => {
        drainFill = Math.max(0, drainFill - 12);
        node.fill = drainFill;
        refreshCityBinMarkers();
        updateCityKPIs();
        syncMyBins();
        if (drainFill <= 5) {
            clearInterval(drainInterval);
            node.fill = Math.floor(Math.random() * 8) + 2; // leave nearly empty
            alertedBins.delete(node.id); // allow re-alerting if it fills again

            // Reset truck to patrol
            truck.targetBin  = null;
            truck.collecting = false;
            truck.eta        = null;
            // Restore normal truck icon
            marker.setIcon(L.divIcon({
                html: makeTruckMarkerHTML(),
                className: '', iconSize: [38,38], iconAnchor: [19,19]
            }));
            updateTruckPopup(truck, null);
            showNotification('✅', `${node.label} has been emptied successfully`);
            refreshCityBinMarkers();
            updateCityKPIs();
        }
    }, 700);
}

// Sync first 5 city bin nodes → personal bins array for My Bins tab
function syncMyBins() {
    const syncMap = [
        { binIdx: 0, nodeId: 'B1' }, // General Waste
        { binIdx: 1, nodeId: 'B2' }, // Recyclables
        { binIdx: 2, nodeId: 'B3' }, // Organic
        { binIdx: 3, nodeId: 'B4' }, // Glass & Metal
        { binIdx: 4, nodeId: 'B9' }, // Medical
    ];
    syncMap.forEach(({ binIdx, nodeId }) => {
        const node = CITY_BIN_NODES.find(n => n.id === nodeId);
        if (node && bins[binIdx]) bins[binIdx].fillLevel = node.fill;
    });
    // Re-render My Bins tab only if it's active
    if (document.getElementById('pickup')?.classList.contains('active')) renderBins();
    // Update dashboard bin overview cards
    const dashBinFills = document.querySelectorAll('#dashboard .fill-level-fill');
    if (dashBinFills.length >= 3) {
        [0,1,2].forEach(i => {
            const fill = bins[i]?.fillLevel ?? 0;
            const fc   = fill >= 85 ? 'critical' : fill >= 60 ? 'warning' : '';
            dashBinFills[i].style.height = fill + '%';
            dashBinFills[i].textContent  = fill + '%';
            dashBinFills[i].className    = 'fill-level-fill ' + fc;
        });
    }
}

// Update truck popup content
function updateTruckPopup(truck, targetBin) {
    const tm = cityTruckMarkers.find(t => t.truck.id === truck.id);
    if (!tm) return;
    if (targetBin) {
        tm.marker.setPopupContent(`<div class="bin-popup">
            <div class="bin-popup-header">
                <div class="icon">&#x1F69B;</div>
                <div>
                    <h3>${truck.label}</h3>
                    <span class="type-badge crit">DISPATCHED</span>
                </div>
            </div>
            <div class="bin-popup-meta">
                Target: <span>${targetBin.label}</span><br>
                Fill: <span style="color:#ff5252;font-weight:700">${targetBin.fill}%</span><br>
                ETA: <span style="color:#69f0ae">${truck.eta} min</span>
            </div>
        </div>`);
    } else {
        tm.marker.setPopupContent(`<div class="bin-popup">
            <div class="bin-popup-header">
                <div class="icon">&#x1F69A;</div>
                <div>
                    <h3>${truck.label}</h3>
                    <span class="type-badge ok">PATROLLING</span>
                </div>
            </div>
            <div class="bin-popup-meta">
                Type: <span>${truck.subtype}</span><br>
                Status: <span>Active · GPS Tracked</span>
            </div>
        </div>`);
    }
}

// Big dramatic alert when a bin hits critical
function showCriticalAlert(bin, truck) {
    // Flash the KPI row
    const kpiCrit = document.getElementById('kpiCrit');
    if (kpiCrit) {
        kpiCrit.style.color = '#ff1744';
        kpiCrit.style.transform = 'scale(1.3)';
        kpiCrit.style.transition = 'all 0.3s';
        setTimeout(() => { kpiCrit.style.color = ''; kpiCrit.style.transform = ''; }, 1500);
    }

    // Show a bold toast
    showNotification('🚛', `${truck.label} will reach ${bin.label} within ${truck.eta} mins`);

    // Also inject a live event into the ward feed if visible
    const feed = document.querySelector('.community-feed .feed-item:first-child');
    if (feed) {
        const newEntry = document.createElement('div');
        newEntry.className = 'feed-item';
        newEntry.style.animation = 'resultFadeIn 0.4s ease';
        newEntry.innerHTML = `
            <div class="feed-avatar" style="background:#ffebee">&#x1F6A8;</div>
            <div class="feed-body">
                <div class="feed-text"><strong style="color:#c62828">ALERT</strong> — ${bin.label} at ${bin.fill}% capacity. ${truck.label} will reach within ${truck.eta} mins.</div>
                <div class="feed-time">Just now</div>
            </div>`;
        feed.parentNode.insertBefore(newEntry, feed);
    }
}

// Sim speed multiplier
let simSpeed = 1;
function setSimSpeed(x) {
    simSpeed = x;
    [1,2,3].forEach(n => {
        const btn = document.getElementById('speedBtn' + n);
        if (!btn) return;
        if (n === x) {
            btn.style.background = 'rgba(46,204,113,0.25)';
            btn.style.borderColor = 'rgba(46,204,113,0.6)';
            btn.style.color = '#69f0ae';
        } else {
            btn.style.background = 'transparent';
            btn.style.borderColor = 'rgba(255,255,255,0.15)';
            btn.style.color = 'rgba(255,255,255,0.4)';
        }
    });
    // Restart sim with new speed
    if (liveSimInterval) {
        clearInterval(liveSimInterval);
        const interval = Math.max(1200, 4000 / simSpeed);
        liveSimInterval = setInterval(() => {
            simTick++;
            CITY_BIN_NODES.forEach(node => {
                const beingServiced = CITY_TRUCKS.some(t => t.targetBin === node.id && t.collecting);
                if (beingServiced) return;
                const chance = (node.subtype === 'Organic' ? 0.55 : node.subtype === 'General' ? 0.5 : 0.35) * simSpeed;
                if (Math.random() < Math.min(chance, 0.9)) {
                    node.fill = Math.min(100, node.fill + Math.floor(Math.random() * 4 * simSpeed) + 1);
                }
            });
            refreshCityBinMarkers();
            updateCityKPIs();
            dispatchTrucksToCritical();
            syncMyBins();
        }, interval);
        showNotification('⚡', `Simulation speed: ${x}x`);
    }
}

// ============================================================
// MAP INIT — with geolocation
// ============================================================
const DEFAULT_LAT = 13.0827;
const DEFAULT_LNG = 80.2707;

function initMap() {
    function updateLocationStatus(icon, text, color) {
        const s = document.getElementById('locationStatus');
        if (!s) return;
        const colors = { green: ['rgba(46,204,113,0.08)','rgba(46,204,113,0.25)','#69f0ae'], orange: ['rgba(255,152,0,0.08)','rgba(255,152,0,0.25)','#ffcc80'], red: ['rgba(244,67,54,0.08)','rgba(244,67,54,0.25)','#ff8a80'] };
        const [bg, border, col] = colors[color] || colors.green;
        s.style.background = bg; s.style.borderColor = border; s.style.color = col;
        document.getElementById('locationIcon').textContent = icon;
        document.getElementById('locationText').textContent = text;
    }

    if (navigator.geolocation) {
        updateLocationStatus('⏳', 'Detecting your location… Allow access when prompted.', 'orange');
        navigator.geolocation.getCurrentPosition(
            pos => {
                updateLocationStatus('✅', `Location locked (${pos.coords.latitude.toFixed(4)}°, ${pos.coords.longitude.toFixed(4)}°) — Ward 12 grid loaded`, 'green');
                buildCityMap(pos.coords.latitude, pos.coords.longitude);
            },
            err => {
                const msgs = { 1:'Access denied. Showing Chennai default.', 2:'Position unavailable. Showing Chennai default.', 3:'Timed out. Showing Chennai default.' };
                updateLocationStatus('⚠️', msgs[err.code] || 'Error. Showing default.', 'red');
                buildCityMap(DEFAULT_LAT, DEFAULT_LNG);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    } else {
        buildCityMap(DEFAULT_LAT, DEFAULT_LNG);
    }
}

// ============================================================
// LOGIN FUNCTIONS
// ============================================================
function switchLoginTab(tab) {
    document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById(tab + 'LoginForm').classList.add('active');
}
function handleLogin(event, type) {
    event.preventDefault();
    let username = type === 'email' ? document.getElementById('emailInput').value.split('@')[0] : 'User_' + document.getElementById('phoneInput').value.slice(-4);
    currentUser = { type, username };
    startApp(username);
}
function socialLogin(provider) {
    currentUser = { type: provider, username: provider === 'google' ? 'Google User' : 'Facebook User' };
    startApp(currentUser.username);
}
function startApp(username) {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainApp').classList.add('active');
    // Show EcoBot FAB only in main app
    const fab = document.getElementById('fabEcobot');
    if (fab) fab.style.display = 'flex';
    // Apply saved language on login (silent — no toast, no double render)
    setLang(currentLang, true);
    document.getElementById('userDisplayName').textContent = username;
    document.getElementById('leaderboardUserName').textContent = 'You (' + username + ')';

    // Restore persisted points from sessionStorage
    const saved = sessionStorage.getItem('ewp_points');
    if (saved) {
        userPoints = parseInt(saved) || 0;
        ['headerPoints','totalPoints','dashboardPoints'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=userPoints; });
    }

    renderBins(); renderActiveRequests(); initCharts(); simulateBinLevelChanges(); displayRecentScans();
    mapInitialized = false;
    showNotification('🎉', `Welcome back, ${username}!`);
    updateLevelBadge();
    updateStatisticsTab();

    // Show onboarding tour if first visit
    if (!sessionStorage.getItem('ewp_toured')) {
        setTimeout(startOnboardingTour, 1500);
    }
}
function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        currentUser = null;
        document.getElementById('mainApp').classList.remove('active');
        document.getElementById('loginPage').style.display = 'flex';
        // Hide EcoBot FAB on login page, close panel cleanly
        const fab = document.getElementById('fabEcobot');
        const panel = document.getElementById('ecobotFloatPanel');
        if (fab) fab.style.display = 'none';
        if (panel) { panel.classList.remove('open'); }
        showNotification('👋', 'Logged out successfully!');
    }
}

// ============================================================
// TAB MANAGEMENT
// ============================================================
function openTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const tabId = tabName === 'map' ? 'map-tab' : tabName;
    const el = document.getElementById(tabId);
    if (el) el.classList.add('active');
    if (event && event.target && event.target.classList) event.target.classList.add('active');
    if (tabName === 'map') {
        if (!mapInitialized) { mapInitialized = true; setTimeout(() => initMap(), 150); }
        else if (map) setTimeout(() => map.invalidateSize(), 100);
    }
    if (tabName === 'community') setTimeout(animateChallengeProgress, 80);
    if (tabName === 'certificate') setTimeout(initCertificate, 80);
}

// ── 2. CAMERA-FIRST AI SCANNER ──────────────────────────────────────
let cameraStream = null;
async function startCamera() {
    const cameraArea = document.getElementById('cameraArea');
    const uploadArea = document.getElementById('uploadArea');
    const video = document.getElementById('cameraVideo');
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width:{ideal:1280}, height:{ideal:720} } });
        video.srcObject = cameraStream;
        uploadArea.style.display = 'none';
        cameraArea.style.display = 'flex';
        showNotification('📷', 'Camera ready — point at any waste item!');
    } catch(err) {
        showNotification('⚠️', 'Camera unavailable — use Upload instead');
        console.warn('Camera error:', err);
    }
}
function stopCamera() {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
    document.getElementById('cameraArea').style.display = 'none';
    document.getElementById('uploadArea').style.display = 'flex';
}
function snapCamera() {
    const video = document.getElementById('cameraVideo');
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    currentImage = canvas.toDataURL('image/jpeg', 0.92);
    stopCamera();
    displayPreview(currentImage);
    showNotification('📸', 'Snap taken! Click Analyse to scan.');
    setTimeout(() => analyzeImage(), 600);
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => { currentImage = e.target.result; displayPreview(e.target.result); };
    reader.readAsDataURL(file);
}
function displayPreview(src) {
    document.getElementById('uploadArea').style.display = 'none';
    document.getElementById('previewContainer').style.display = 'block';
    document.getElementById('previewImage').src = src;
}
function clearImage() {
    currentImage = null;
    document.getElementById('uploadArea').style.display = 'flex';
    document.getElementById('previewContainer').style.display = 'none';
    document.getElementById('imageUpload').value = '';
    document.getElementById('scannerResults').innerHTML = `<div style="text-align:center;padding:3rem;color:#999"><div style="font-size:4rem;margin-bottom:1rem">🔍</div><h3>${t('scanner_no_analysis')}</h3><p>${t('scanner_no_analysis_sub')}</p></div>`;
}
// ============================================================
// LOCAL AI SCANNER — No API key required, runs 100% offline
// Uses canvas pixel sampling to detect dominant colours,
// then maps them to a detailed Chennai-specific waste profile.
// ============================================================
async function analyzeImage() {
    if (!currentImage) return;

    // Show animated loading — identical UX to the API version
    document.getElementById('scannerResults').innerHTML = `
        <div style="text-align:center;padding:3rem 2rem">
            <div style="position:relative;display:inline-block;margin-bottom:1.5rem">
                <div class="loading-spinner"></div>
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.4rem">&#x1F916;</div>
            </div>
            <h3 style="color:#333;margin-bottom:0.5rem">${t('scanner_analysing')}</h3>
            <p style="color:#888;font-size:0.9rem" id="scanStepText">${t('scanner_identifying')}</p>
            <div style="margin-top:1.5rem;background:#f0f9f4;border-radius:12px;padding:1rem 1.5rem;max-width:360px;margin-left:auto;margin-right:auto">
                <div style="font-size:0.78rem;color:#888;margin-bottom:0.5rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em">${t('scanner_checks_label')}</div>
                <div style="font-size:0.85rem;color:#555;text-align:left;display:grid;gap:0.3rem">
                    <div id="ck1" style="opacity:0.3;transition:all 0.4s">${t('scanner_material')}</div>
                    <div id="ck2" style="opacity:0.3;transition:all 0.4s">${t('scanner_category')}</div>
                    <div id="ck3" style="opacity:0.3;transition:all 0.4s">${t('scanner_recyclability')}</div>
                    <div id="ck4" style="opacity:0.3;transition:all 0.4s">${t('scanner_disposal')}</div>
                    <div id="ck5" style="opacity:0.3;transition:all 0.4s">${t('scanner_guidance')}</div>
                </div>
            </div>
        </div>`;

    const stepData = [
        [350,  'ck1', t('scanner_mat_done'),  t('scanner_step1')],
        [850,  'ck2', t('scanner_cat_done'),  t('scanner_step2')],
        [1400, 'ck3', t('scanner_rec_done'),  t('scanner_step3')],
        [1900, 'ck4', t('scanner_dis_done'),  t('scanner_step4')],
        [2350, 'ck5', t('scanner_gui_done'),  t('scanner_step5')],
    ];
    const timers = stepData.map(([delay, id, label, stepText]) =>
        setTimeout(() => {
            const el = document.getElementById(id);
            const st = document.getElementById('scanStepText');
            if (el) { el.innerHTML = label; el.style.opacity = '1'; el.style.color = '#27ae60'; el.style.fontWeight = '600'; }
            if (st) st.innerHTML = stepText;
        }, delay)
    );

    // Run local analysis after animation
    setTimeout(() => {
        timers.forEach(clearTimeout);
        try {
            const palette  = _ewp_extractPalette();
            const profile  = _ewp_classify(palette);
            const result   = _ewp_buildResult(profile);
            displayResult(result);
            saveRecentScan(result);
        } catch(err) {
            console.warn('Local scanner error:', err);
            renderScanResult(MOCK_SCAN_RESULT);
        }
    }, 2600);
}

// ── Palette extraction via HTML5 Canvas ──────────────────────
function _ewp_extractPalette() {
    try {
        const img = document.getElementById('previewImage');
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 64, 64);
        const d = ctx.getImageData(0, 0, 64, 64).data;
        let r=0,g=0,b=0,n=0;
        for (let i=0; i<d.length; i+=16) { r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++; }
        r=Math.round(r/n); g=Math.round(g/n); b=Math.round(b/n);
        const br=(r+g+b)/3, sat=Math.max(r,g,b)-Math.min(r,g,b);
        return {
            r,g,b,br,sat,
            isWhite:      br>210 && sat<35,
            isBrightClr:  br>170 && sat<60,   // pale/pastel — plastic-ish
            isGreen:      g>r+18 && g>b+18,
            isBrown:      r>110 && g>70 && b<90 && sat>25 && r>g,
            isGrey:       sat<28 && br>55 && br<200,
            isBlack:      br<55,
            isBlue:       b>r+18 && b>g+8,
            isRed:        r>g+35 && r>b+35,
            isYellow:     r>175 && g>145 && b<110,
            isOrange:     r>170 && g>90 && g<160 && b<90,
        };
    } catch(_) {
        return { isGrey:true, br:128, sat:0 };
    }
}

// ── Classification rules (ordered, first-match wins) ─────────
const _EWP_PROFILES = [
    // ── TRANSPARENT / PALE = Plastic bottle ────────────────
    {
        id:'pet_bottle',
        test: p => p.isWhite || p.isBrightClr,
        name:'PET Plastic Bottle', category:'Recyclable', subcategory:'PET Plastic (Type 1)', icon:'🍶',
        confidence: ()=> 82+Math.floor(Math.random()*12),
        urgency:'Low',
        description:'A clear or lightly coloured PET plastic bottle — one of the most recyclable plastics in Chennai. The GCC Blue bin accepts these for kerbside dry-waste collection.',
        environmentalImpact:{ recyclabilityScore:88, carbonFootprint:'1.8 kg CO₂ saved if recycled', decompositionTime:'450 years in landfill', hazardLevel:'Low', waterImpact:'Saves ~3L water vs. new production', overallScore:82 },
        materialComposition:[{material:'PET Plastic',percentage:92},{material:'HDPE Cap',percentage:6},{material:'Paper Label',percentage:2}],
        disposalSteps:['Step 1: Empty and rinse the bottle thoroughly','Step 2: Remove the cap — place separately in same Blue bin','Step 3: Crush flat to save bin space','Step 4: Drop in the GCC Blue Dry Waste bin'],
        tips:['Check for ♻️1 symbol on the base to confirm PET','Never put in Green organic bin — contaminates the load'],
        locations:'GCC Blue Dry Waste Bin · Kotturpuram DWCC, 5th Ave, Anna Nagar',
        alternativeUses:['Cut top off → herb planter','Fill with sand → doorstop weight'],
        doNots:['Do not burn — releases toxic styrene','Do not mix with food waste'],
        nearbyFacilityType:'GCC Blue Dry Waste Bin',
    },
    // ── GREEN = Garden / plant waste ───────────────────────
    {
        id:'garden_waste',
        test: p => p.isGreen && p.br < 185,
        name:'Garden & Plant Waste', category:'Organic', subcategory:'Green Garden Waste', icon:'🌱',
        confidence: ()=> 80+Math.floor(Math.random()*13),
        urgency:'Low',
        description:'Garden clippings, leaves, or plant trimmings — 100% compostable. Put in the Green GCC Organic bin; GCC transports to Perungudi composting facility.',
        environmentalImpact:{ recyclabilityScore:100, carbonFootprint:'0.3 kg CO₂ saved vs. landfill', decompositionTime:'2–8 weeks when composted', hazardLevel:'None', waterImpact:'Compost improves soil moisture retention', overallScore:94 },
        materialComposition:[{material:'Cellulose / Plant Matter',percentage:78},{material:'Moisture',percentage:18},{material:'Minerals',percentage:4}],
        disposalSteps:['Step 1: Bundle large branches into ≤60 cm lengths','Step 2: Place leaves and cuttings in the Green bin','Step 3: Call GCC 1913 for bulk garden-waste pickup','Step 4: GCC collects Mon / Wed / Fri in Ward 12'],
        tips:['Dry leaves are a great compost carbon layer','Shredded garden waste composts 3× faster'],
        locations:'Green GCC Organic Bin · Perungudi Compost Facility (via GCC)',
        alternativeUses:['Layer dry leaves with food scraps for home compost','Donate grass clippings to nurseries as mulch'],
        doNots:['Do not burn — illegal in Chennai','Do not mix with plastics or glass'],
        nearbyFacilityType:'Green GCC Organic Bin',
    },
    // ── BROWN (medium) = Cardboard ─────────────────────────
    {
        id:'cardboard',
        test: p => p.isBrown && p.br>=110 && p.br<185,
        name:'Cardboard / Paper Box', category:'Recyclable', subcategory:'Corrugated Cardboard', icon:'📦',
        confidence: ()=> 84+Math.floor(Math.random()*10),
        urgency:'Low',
        description:'Corrugated cardboard — highly recyclable and accepted in the GCC Blue bin. Keep it dry; wet cardboard cannot be recycled. Kabadiwala dealers pay ₹3–5/kg.',
        environmentalImpact:{ recyclabilityScore:92, carbonFootprint:'1.1 kg CO₂ saved per kg recycled', decompositionTime:'2 months in open air', hazardLevel:'None', waterImpact:'Saves 17L per kg vs. virgin paper production', overallScore:88 },
        materialComposition:[{material:'Corrugated Paper',percentage:90},{material:'Adhesive/Tape',percentage:7},{material:'Ink/Print',percentage:3}],
        disposalSteps:['Step 1: Remove tape, staples, and plastic wrap','Step 2: Flatten the box to save bin space','Step 3: Keep dry — wet cardboard is not recyclable','Step 4: Place in the GCC Blue Dry Waste bin'],
        tips:['Greasy pizza boxes → Green bin (food contamination)','Kabadiwala pays ₹3–5/kg for clean cardboard at your door'],
        locations:'GCC Blue Dry Waste Bin · ITC WOW Collection Points, Anna Nagar',
        alternativeUses:['Use as seed-germination bed (biodegrades naturally)','Cut into strips for vermicompost carbon layer'],
        doNots:['Do not wet or soak','Do not place soiled/greasy cardboard in Blue bin'],
        nearbyFacilityType:'GCC Blue Dry Waste Bin',
    },
    // ── DARK BROWN / FOOD = Organic kitchen waste ──────────
    {
        id:'food_organic',
        test: p => (p.isBrown && p.br < 110) || (p.isYellow && p.br < 175),
        name:'Food & Kitchen Waste', category:'Organic', subcategory:'Kitchen / Food Scrap', icon:'🌿',
        confidence: ()=> 79+Math.floor(Math.random()*14),
        urgency:'Medium',
        description:'Organic kitchen or food waste — vegetable peels, cooked food, fruit scraps. GCC collects daily in the Green bin for composting at Kodungaiyur facility.',
        environmentalImpact:{ recyclabilityScore:95, carbonFootprint:'0.5 kg CO₂ saved vs. landfill', decompositionTime:'2–6 weeks when composted', hazardLevel:'None', waterImpact:'Compost returns nutrients and moisture to soil', overallScore:91 },
        materialComposition:[{material:'Organic Matter',percentage:85},{material:'Water',percentage:12},{material:'Minerals',percentage:3}],
        disposalSteps:['Step 1: Separate food waste from any plastic packaging','Step 2: Drain excess liquid to reduce odour','Step 3: Place in the Green GCC Organic Waste bin','Step 4: GCC collects daily — put out before 6:00 AM'],
        tips:['Start a home compost pot for +25 EcoCoins!','Dry leaves + food scraps = rich compost in 45 days'],
        locations:'Green GCC Organic Bin · Kodungaiyur Composting Facility (via GCC)',
        alternativeUses:['Home compost with dry leaves','Vermicomposting — worms available at GCC Horticulture, Nandanam'],
        doNots:['Do not mix with plastic or glass','Do not put in the Blue Dry Waste bin'],
        nearbyFacilityType:'Green GCC Organic Bin',
    },
    // ── GREY / BLACK = Electronics / E-Waste ───────────────
    {
        id:'ewaste',
        test: p => (p.isGrey || p.isBlack) && p.br < 100,
        name:'Electronic Waste (E-Waste)', category:'E-Waste', subcategory:'Consumer Electronics', icon:'📱',
        confidence: ()=> 76+Math.floor(Math.random()*15),
        urgency:'High',
        description:'Electronic or electrical waste containing circuit components, metals, and hazardous materials. Never put in regular bins — must go to an authorised e-waste recycler.',
        environmentalImpact:{ recyclabilityScore:70, carbonFootprint:'Up to 0.9 kg CO₂ saved per device recycled', decompositionTime:'500–1 000 years for mixed components', hazardLevel:'High', waterImpact:'Prevents lead & mercury from contaminating groundwater', overallScore:72 },
        materialComposition:[{material:'Plastics (ABS/PC)',percentage:45},{material:'Metals (Cu, Al, Fe)',percentage:35},{material:'PCB / Circuit Board',percentage:15},{material:'Glass / Screen',percentage:5}],
        disposalSteps:['Step 1: Wipe personal data — factory-reset phones/laptops','Step 2: Remove batteries and bag separately','Step 3: Take to an authorised e-waste drop-off point','Step 4: Never place in any regular GCC bin'],
        tips:['GCC E-Waste Camp: 1st Saturday every month, Anna Nagar East Park','Working devices → donate to "Mobile for All" NGO, Anna Nagar'],
        locations:'Poorvika Mobile Stores (free drop-off) · GCC E-Waste Camp (1st Saturday) · Attibele E-Waste Park, GST Road',
        alternativeUses:['Functional devices → donate to schools in Vyasarpadi','Salvage metals at authorised recycler for resale value'],
        doNots:['Do not dump in regular bins — illegal under E-Waste Management Rules 2022','Do not dismantle yourself — toxic metal exposure risk'],
        nearbyFacilityType:'Authorised E-Waste Recycler',
    },
    // ── RED = Hazardous waste ───────────────────────────────
    {
        id:'hazardous',
        test: p => p.isRed && p.sat > 55,
        name:'Hazardous Waste', category:'Hazardous', subcategory:'Chemical / Paint / Battery', icon:'⚠️',
        confidence: ()=> 72+Math.floor(Math.random()*16),
        urgency:'High',
        description:'Hazardous material — could be paint, cleaning chemicals, pesticides, or batteries. Requires special handling; must not enter any regular waste stream.',
        environmentalImpact:{ recyclabilityScore:20, carbonFootprint:'Prevents severe soil and water contamination', decompositionTime:'Indefinite — persists in environment', hazardLevel:'High', waterImpact:'Prevents contamination of Chembarambakkam reservoir', overallScore:45 },
        materialComposition:[{material:'Chemical Compounds',percentage:70},{material:'Container (Plastic/Metal)',percentage:25},{material:'Label',percentage:5}],
        disposalSteps:['Step 1: Do NOT pour down drains or onto soil','Step 2: Keep in original sealed container','Step 3: Take to GCC Hazardous Waste Centre, Kodungaiyur','Step 4: Call GCC 1913 to schedule hazardous-waste pickup'],
        tips:['Expired medicines: Apollo Pharmacy branches accept free drop-off','Paint: let dry completely before placing in a sealed Red General bin'],
        locations:'GCC Hazardous Waste Centre, Kodungaiyur · Apollo Pharmacy (medicines) · Any Battery Shop (batteries)',
        alternativeUses:['Leftover usable paint → donate to schools or community centres'],
        doNots:['Do not pour down sink or toilet — pollutes Adyar/Cooum rivers','Do not burn — toxic fume release'],
        nearbyFacilityType:'GCC Hazardous Waste Centre, Kodungaiyur',
    },
    // ── ORANGE = Food packaging / multi-layer ──────────────
    {
        id:'multilayer',
        test: p => p.isOrange,
        name:'Multi-layer / Laminated Packaging', category:'General Waste', subcategory:'Chips / Biscuit Packet', icon:'🛍️',
        confidence: ()=> 74+Math.floor(Math.random()*14),
        urgency:'Medium',
        description:'Multi-layer laminated packaging (chips bags, biscuit wrappers, tetra packs) — not recyclable through standard bins. Goes in the Red GCC General Waste bin.',
        environmentalImpact:{ recyclabilityScore:12, carbonFootprint:'Minimal — goes to Kodungaiyur landfill', decompositionTime:'Up to 500 years', hazardLevel:'Low', waterImpact:'Minimal direct impact', overallScore:22 },
        materialComposition:[{material:'PET Film',percentage:35},{material:'Aluminium Foil Layer',percentage:30},{material:'LDPE Film',percentage:25},{material:'Print/Ink',percentage:10}],
        disposalSteps:['Step 1: Empty all food residue from packet','Step 2: Flatten to reduce volume','Step 3: Place in the Red GCC General Waste bin','Step 4: GCC transports to Kodungaiyur landfill'],
        tips:['ITC WOW project accepts multi-layer packaging for upcycling — ask at Anna Nagar WOW booth','Reduce: switch to reusable snack boxes to avoid this waste type'],
        locations:'Red GCC General Waste Bin · ITC WOW Collection Booth, Anna Nagar',
        alternativeUses:['Craft: weave into waterproof mats (search "chips packet bag" craft)'],
        doNots:['Do not put in Blue Recyclables bin — contaminates recyclable plastic','Do not burn — releases dioxins'],
        nearbyFacilityType:'Red GCC General Waste Bin',
    },
    // ── GREY / SILVER (bright) = Metal / Tin can ───────────
    {
        id:'metal_tin',
        test: p => p.isGrey && p.br >= 100,
        name:'Metal / Tin Can', category:'Recyclable', subcategory:'Aluminium / Steel', icon:'🥫',
        confidence: ()=> 81+Math.floor(Math.random()*12),
        urgency:'Low',
        description:'Aluminium or steel can — infinitely recyclable with no quality loss. Kabadiwala dealers pay ₹60–80/kg for aluminium cans in Chennai.',
        environmentalImpact:{ recyclabilityScore:95, carbonFootprint:'9 kg CO₂ saved per kg aluminium recycled', decompositionTime:'50–200 years', hazardLevel:'None', waterImpact:'Saves significant mining water usage', overallScore:92 },
        materialComposition:[{material:'Aluminium / Steel',percentage:88},{material:'Lacquer Coating',percentage:8},{material:'Paper Label',percentage:4}],
        disposalSteps:['Step 1: Rinse out any food residue','Step 2: Crush flat to save space (optional)','Step 3: Remove paper labels if possible','Step 4: Place in the GCC Blue Dry Waste bin'],
        tips:['Aluminium cans: kabadiwala pays ₹60–80/kg!','Copper wire fetches ₹400–500/kg at scrap dealers'],
        locations:'GCC Blue Dry Waste Bin · Local Kabadiwala (scrap dealer) for best price',
        alternativeUses:['Clean tins → spice storage or pencil holder','Large cans → plant small herbs or succulents'],
        doNots:['Do not put sharp-edged cut cans loose — wrap in newspaper first','Do not mix with food waste'],
        nearbyFacilityType:'GCC Blue Dry Waste Bin',
    },
    // ── BLUE = Glass bottle ─────────────────────────────────
    {
        id:'glass',
        test: p => p.isBlue && p.br > 80,
        name:'Glass Bottle / Jar', category:'Recyclable', subcategory:'Glass Container', icon:'🍾',
        confidence: ()=> 80+Math.floor(Math.random()*13),
        urgency:'Low',
        description:'Glass bottle or jar — accepted in the GCC Blue Dry Waste bin. Clean glass is recycled at Manali Industrial Area, Chennai. Reuse before recycling where possible.',
        environmentalImpact:{ recyclabilityScore:85, carbonFootprint:'0.3 kg CO₂ saved per kg recycled', decompositionTime:'1 million years', hazardLevel:'Low', waterImpact:'Saves energy and water vs. virgin glass production', overallScore:80 },
        materialComposition:[{material:'Soda-Lime Glass',percentage:95},{material:'Metal Cap',percentage:4},{material:'Paper Label',percentage:1}],
        disposalSteps:['Step 1: Rinse thoroughly and remove food residue','Step 2: Remove metal lid (place in same Blue bin)','Step 3: For broken glass: wrap in newspaper, label "BROKEN GLASS"','Step 4: Place in GCC Blue Dry Waste bin'],
        tips:['Clean bottles: kabadiwala pays ₹1–3 each','Jars are excellent for storing spices — reuse first!'],
        locations:'GCC Blue Dry Waste Bin · GCC Glass Recycling, Manali Industrial Area',
        alternativeUses:['Glass jars → spice storage or flower vase','Small bottles → home décor or terrarium'],
        doNots:['Do not break glass in bin — injury risk to waste workers','Do not put drinking glasses or Pyrex in recycling (different glass type)'],
        nearbyFacilityType:'GCC Blue Dry Waste Bin',
    },
    // ── WHITE / BRIGHT = Paper / Newspaper ─────────────────
    {
        id:'paper',
        test: p => p.isWhite && p.br > 195,
        name:'Paper / Newspaper', category:'Recyclable', subcategory:'Paper & Newsprint', icon:'📰',
        confidence: ()=> 83+Math.floor(Math.random()*11),
        urgency:'Low',
        description:'Paper or newspaper — dry paper is highly recyclable and accepted in the GCC Blue bin. Door-to-door kabadiwala dealers collect and pay ₹6–8/kg.',
        environmentalImpact:{ recyclabilityScore:90, carbonFootprint:'0.9 kg CO₂ saved per kg recycled', decompositionTime:'2–6 weeks', hazardLevel:'None', waterImpact:'Saves 17L water per kg vs. virgin paper', overallScore:86 },
        materialComposition:[{material:'Cellulose Fibre',percentage:88},{material:'Ink / Coating',percentage:10},{material:'Clay / Filler',percentage:2}],
        disposalSteps:['Step 1: Keep paper dry — wet paper cannot be recycled','Step 2: Bundle or fold neatly','Step 3: Remove staples or plastic film','Step 4: Place in the GCC Blue Dry Waste bin'],
        tips:['Kabadiwala pays ₹6–8/kg for newspaper bundles','Shredded paper is an excellent compost carbon layer!'],
        locations:'GCC Blue Dry Waste Bin · Door-to-door Kabadiwala (call GCC 1913)',
        alternativeUses:['Use as wrapping paper for gifts','Shred for compost carbon layer'],
        doNots:['Do not wet or contaminate with food','Do not mix with plastic bags'],
        nearbyFacilityType:'GCC Blue Dry Waste Bin',
    },
    // ── FALLBACK = General / Mixed waste ───────────────────
    {
        id:'general',
        test: () => true,
        name:'General / Mixed Waste', category:'General Waste', subcategory:'Mixed / Unclassified', icon:'🗑️',
        confidence: ()=> 65+Math.floor(Math.random()*20),
        urgency:'Medium',
        description:'Mixed or unclassified waste. When in doubt the Red GCC General Waste bin is the safest choice — it prevents contamination of recyclable and organic streams.',
        environmentalImpact:{ recyclabilityScore:15, carbonFootprint:'Minimal savings — sent to Kodungaiyur landfill', decompositionTime:'Varies: 5 to 500+ years', hazardLevel:'Low', waterImpact:'Minimal', overallScore:25 },
        materialComposition:[{material:'Mixed Polymers',percentage:50},{material:'Organic Residue',percentage:30},{material:'Other',percentage:20}],
        disposalSteps:['Step 1: Check whether any part is recyclable and separate it','Step 2: Electronic items → E-Waste centre; Food-soiled → Green bin','Step 3: Whatever remains → Red GCC General Waste bin','Step 4: GCC collects daily — set out before 6:00 AM'],
        tips:['When in doubt → Red bin (avoids contaminating recyclables)','Ask EcoBot about specific materials for an instant answer'],
        locations:'Red GCC General Waste Bin · Kodungaiyur Landfill (via GCC collection)',
        alternativeUses:['Check whether the item can be repaired or repurposed first'],
        doNots:['Do not burn — releases toxic dioxins','Do not dump in open spaces — illegal in Chennai'],
        nearbyFacilityType:'Red GCC General Waste Bin',
    },
];

function _ewp_classify(p) {
    for (const prof of _EWP_PROFILES) {
        if (prof.test(p)) return prof;
    }
    return _EWP_PROFILES[_EWP_PROFILES.length - 1];
}

function _ewp_buildResult(prof) {
    const MAP = { 'Recyclable':'recyclable','Organic':'organic','Hazardous':'hazardous',
                  'E-Waste':'e-waste','General Waste':'general','Medical Waste':'medical' };
    return {
        name: prof.name, category: prof.category, subcategory: prof.subcategory,
        icon: prof.icon, confidence: prof.confidence(), urgency: prof.urgency,
        description: prof.description, environmentalImpact: prof.environmentalImpact,
        materialComposition: prof.materialComposition, disposalSteps: prof.disposalSteps,
        tips: prof.tips, locations: prof.locations,
        alternativeUses: prof.alternativeUses, doNots: prof.doNots,
        nearbyFacilityType: prof.nearbyFacilityType,
        cssCategory: MAP[prof.category] || 'general',
    };
}


function switchResultTab(btn, panelId) {
    btn.closest('.result-item').querySelectorAll('.result-tab-btn').forEach(b => b.classList.remove('active'));
    btn.closest('.result-item').querySelectorAll('.result-tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(panelId).classList.add('active');
}
function displayResult(result) {
    const cssKey = result.cssCategory;
    const urgencyClass = result.urgency === 'High' ? 'urgency-high' : result.urgency === 'Medium' ? 'urgency-medium' : 'urgency-low';
    const urgencyIcon = result.urgency === 'High' ? '🔴' : result.urgency === 'Medium' ? '🟡' : '🟢';
    const ei = result.environmentalImpact || {};
    const steps = result.disposalSteps || [];
    const materials = result.materialComposition || [];
    const alts = result.alternativeUses || [];
    const donots = result.doNots || [];
    const matColors = ['#2ecc71','#f39c12','#3498db','#9b59b6','#e74c3c','#1abc9c'];
    const matBarsHTML = materials.map((m,i) => `<div class="material-bar-row"><div class="material-label">${m.material}</div><div class="material-track"><div class="material-fill" style="width:${m.percentage}%;background:${matColors[i%matColors.length]}"></div></div><div class="material-pct">${m.percentage}%</div></div>`).join('');
    const ecoScore = ei.overallScore ?? 50;
    const ecoColor = ecoScore >= 70 ? '#27ae60' : ecoScore >= 40 ? '#f39c12' : '#e74c3c';
    const recyclability = ei.recyclabilityScore ?? 50;
    const recyclColor = recyclability >= 70 ? '#27ae60' : recyclability >= 40 ? '#f39c12' : '#e74c3c';
    const hazardColors = { 'None':'#27ae60','Low':'#f39c12','Medium':'#e67e22','High':'#e74c3c','Critical':'#7f0000' };
    const hazardColor = hazardColors[ei.hazardLevel] || '#666';
    const urgencyLabel = result.urgency === 'High' ? t('urgency_high') : result.urgency === 'Medium' ? t('urgency_medium') : t('urgency_low');
    document.getElementById('scannerResults').innerHTML = `
        <div class="result-item result-${cssKey}">
            <div class="result-header">
                <div class="result-icon">${result.icon}</div>
                <div style="flex:1">
                    <h3>${result.name}</h3>
                    <div style="font-size:0.85rem;color:#888">${result.subcategory||''}</div>
                    <span class="result-category category-${cssKey}">${result.category}</span>
                    <span class="urgency-badge ${urgencyClass}">${urgencyIcon} ${urgencyLabel}</span>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:1rem;margin:0.8rem 0">
                <span style="font-weight:600;font-size:0.9rem">${t('result_ai_confidence')}</span>
                <div class="confidence-bar"><div class="confidence-fill" style="width:${result.confidence}%"></div></div>
                <span style="font-weight:700;color:var(--primary-green)">${result.confidence}%</span>
            </div>
            <p style="margin:1rem 0 0;color:#444">${result.description}</p>
            <div class="result-tabs">
                <button class="result-tab-btn active" onclick="switchResultTab(this,'rtab-overview')">${t('result_overview')}</button>
                <button class="result-tab-btn" onclick="switchResultTab(this,'rtab-materials')">${t('result_materials')}</button>
                <button class="result-tab-btn" onclick="switchResultTab(this,'rtab-disposal')">${t('result_disposal')}</button>
                <button class="result-tab-btn" onclick="switchResultTab(this,'rtab-reuse')">${t('result_reuse')}</button>
            </div>
            <div class="result-tab-panel active" id="rtab-overview">
                <div class="impact-grid">
                    <div class="impact-card" style="border-top-color:${ecoColor}"><div class="impact-score" style="color:${ecoColor}">${ecoScore}</div><div class="impact-label">${t('result_eco_score')}</div></div>
                    <div class="impact-card" style="border-top-color:${recyclColor}"><div class="impact-score" style="color:${recyclColor}">${recyclability}%</div><div class="impact-label">${t('result_recyclable')}</div></div>
                    <div class="impact-card" style="border-top-color:${hazardColor}"><div class="impact-score" style="color:${hazardColor};font-size:1.1rem">${ei.hazardLevel||'N/A'}</div><div class="impact-label">${t('result_hazard')}</div></div>
                </div>
                <div style="margin-top:1rem;display:grid;gap:0.5rem">
                    ${ei.carbonFootprint?`<div>🌿 <strong>${t('result_carbon')}:</strong> ${ei.carbonFootprint}</div>`:''}
                    ${ei.decompositionTime?`<div>⏳ <strong>${t('result_decomposes')}:</strong> ${ei.decompositionTime}</div>`:''}
                </div>
                <div style="margin-top:1rem"><strong>${t('result_dispose_at')}:</strong> ${result.locations}</div>
                ${donots.length?`<div style="margin-top:1rem;background:#fff5f5;border-radius:10px;padding:0.8rem 1rem"><strong style="color:#c62828">${t('result_do_not')}:</strong><ul style="margin:0.4rem 0 0 1.2rem;color:#c62828">${donots.map(d=>`<li>${d}</li>`).join('')}</ul></div>`:''}
            </div>
            <div class="result-tab-panel" id="rtab-materials">${materials.length?matBarsHTML:`<p style="color:#aaa">${t('result_no_material')}</p>`}</div>
            <div class="result-tab-panel" id="rtab-disposal">
                <ul class="disposal-steps">${steps.map((s,i)=>`<li class="disposal-step"><div class="step-num">${i+1}</div><div class="step-text">${s}</div></li>`).join('')}</ul>
                ${result.tips&&result.tips.length?`<div style="margin-top:1rem;background:#f0fdf4;border-radius:10px;padding:0.8rem 1rem"><strong style="color:#2e7d32">${t('result_tips')}:</strong><ul style="margin:0.4rem 0 0 1.2rem;color:#444">${result.tips.map(tip=>`<li>${tip}</li>`).join('')}</ul></div>`:''}
            </div>
            <div class="result-tab-panel" id="rtab-reuse">
                ${alts.length?`<div class="alt-chips">${alts.map(a=>`<span class="alt-chip">💡 ${a}</span>`).join('')}</div>`:`<p style="color:#aaa">${t('result_no_reuse')}</p>`}
            </div>
            <div class="quick-action-bar">
                <button class="quick-action-btn qab-find" onclick="showNotification('🗺️','${t('notif_find')}')">${t('result_find_nearest')}</button>
                <button class="quick-action-btn qab-report" onclick="showNotification('📋','${t('notif_report')}')">${t('result_report_dumping')}</button>
                <button class="quick-action-btn qab-share" onclick="showNotification('🔗','${t('notif_share')}')">${t('result_share')}</button>
            </div>
        </div>`;
    setTimeout(() => {
        document.querySelectorAll('.material-fill').forEach(el => { const w = el.style.width; el.style.width = '0'; requestAnimationFrame(() => { el.style.transition = 'width 0.9s ease'; el.style.width = w; }); });
    }, 80);
}
function saveRecentScan(result) {
    recentScans.unshift({ name: result.name, category: result.category, icon: result.icon, image: currentImage, timestamp: new Date().toISOString() });
    if (recentScans.length > 6) recentScans.pop();
    displayRecentScans();
    // #1 Live carbon tracker update
    updatePersonalStats(result.category);
}
function displayRecentScans() {
    const grid = document.getElementById('recentScans');
    if (recentScans.length === 0) { grid.innerHTML = `<p style="text-align:center;color:#999;padding:2rem">${t('scanner_no_scans')}</p>`; return; }
    grid.innerHTML = recentScans.map(s => `<div class="recent-scan-item"><img src="${s.image}" alt="${s.name}" class="recent-scan-image"><div class="recent-scan-info"><h4>${s.icon} ${s.name}</h4><span class="result-category category-${s.category}" style="font-size:0.7rem;padding:0.2rem 0.5rem">${s.category}</span><div class="recent-scan-time">${getTimeAgo(s.timestamp)}</div></div></div>`).join('');
}

// ============================================================
// BIN & PICKUP FUNCTIONS
// ============================================================
function renderBins() {
    const grid = document.getElementById('binGrid');
    grid.innerHTML = bins.map(bin => {
        const fillClass = bin.fillLevel >= 85 ? 'critical' : bin.fillLevel >= 60 ? 'warning' : '';
        const isRequested = pickupRequests.some(r => r.binId === bin.id && r.status === 'pending');
        return `<div class="bin-card ${fillClass}"><div class="bin-icon">${bin.icon}</div><div class="bin-type">${bin.type}</div><div class="fill-level-container"><div class="fill-level-bar"><div class="fill-level-fill ${fillClass}" style="height:${bin.fillLevel}%">${bin.fillLevel}%</div></div></div><div class="bin-info"><div>${t('bin_capacity')}: ${bin.capacity}</div><div>${t('bin_last')}: ${bin.lastCollection}</div></div><button class="request-pickup-btn ${isRequested?'requested':''}" onclick="requestPickup(${bin.id})" ${isRequested?'disabled':''}>${isRequested?t('btn_requested'):t('btn_request_pickup')}</button></div>`;
    }).join('');
}
// ── PERSONAL STATS TRACKING (Feature #1 — Live Carbon Tracker) ──────
let personalStats = { recycledKg: 0, co2Kg: 0, scanCount: 0, waterSaved: 0, energySaved: 0 };
function updatePersonalStats(category) {
    const kgMap = { 'Recyclable': 0.3, 'Organic': 0.5, 'E-Waste': 0.8, 'Hazardous': 0.2, 'General Waste': 0.4, 'Medical Waste': 0.3 };
    const co2Map = { 'Recyclable': 0.18, 'Organic': 0.12, 'E-Waste': 0.6, 'Hazardous': 0.08, 'General Waste': 0.05, 'Medical Waste': 0.05 };
    const kg = kgMap[category] || 0.3;
    const co2 = co2Map[category] || 0.1;
    personalStats.recycledKg = Math.round((personalStats.recycledKg + kg) * 10) / 10;
    personalStats.co2Kg = Math.round((personalStats.co2Kg + co2) * 100) / 100;
    personalStats.scanCount++;
    // Water saved: ~17L per kg recycled; Energy saved: ~5.4 kWh per kg
    personalStats.waterSaved = Math.round(personalStats.recycledKg * 17);
    personalStats.energySaved = Math.round(personalStats.recycledKg * 5.4 * 10) / 10;
    // Animate dashboard stat cards
    animateStatUpdate('statRecycled', personalStats.recycledKg + ' kg', '#27ae60');
    animateStatUpdate('statCO2', personalStats.co2Kg + ' kg', '#16a085');
    // Remove skeleton shimmer
    document.querySelectorAll('.skeleton-card').forEach(c => c.classList.remove('skeleton-card'));
    // Update statistics tab live
    updateStatisticsTab();
    // SDG overlay
    const sdgPts = (co2 * 0.3).toFixed(2);
    showSDGImpact(`Your scan contributed +${sdgPts} pts to Chennai's SDG 12 score 🌍`);
    if (personalStats.scanCount >= 3) setTimeout(generateWasteInsight, 1500);
    checkAchievements();
}

function updateStatisticsTab() {
    const r = document.getElementById('statRecyclingRate');
    const w = document.getElementById('statWaterSaved');
    const e = document.getElementById('statEnergySaved');
    const d = document.getElementById('statWasteDiverted');
    const trees = document.getElementById('statTreeEquiv');
    const heroTrees = document.getElementById('heroTrees');
    const recyclePct = personalStats.recycledKg > 0
        ? Math.min(100, Math.round((personalStats.recycledKg / (personalStats.recycledKg + 0.5)) * 100))
        : 0;
    if (r) r.textContent = recyclePct + '%';
    if (w) w.textContent = (personalStats.waterSaved || 0) + ' L';
    if (e) e.textContent = (personalStats.energySaved || 0) + ' kWh';
    if (d) d.textContent = personalStats.recycledKg.toFixed(1) + ' kg';
    const treeCount = Math.floor(personalStats.co2Kg / 1.2);
    if (trees) trees.textContent = treeCount;
    if (heroTrees) heroTrees.textContent = Math.max(14, treeCount + 14);
}
function animateStatUpdate(id, newVal, color) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.transition = 'transform 0.3s, color 0.3s';
    el.style.transform = 'scale(1.18)';
    el.style.color = color;
    setTimeout(() => { el.textContent = newVal; el.style.transform = 'scale(1)'; }, 180);
}

// ── 7. SDG IMPACT OVERLAY ──────────────────────────────────────────
function showSDGImpact(msg) {
    const overlay = document.getElementById('sdgImpactOverlay');
    const text = document.getElementById('sdgImpactText');
    if (!overlay || !text) return;
    text.textContent = msg;
    overlay.style.display = 'block';
    setTimeout(() => { overlay.style.display = 'none'; }, 4000);
}

// ── 5. GCC ACKNOWLEDGEMENT TOAST ──────────────────────────────────
function showGCCToast(refNum) {
    const toast = document.getElementById('gccToast');
    const text = document.getElementById('gccToastText');
    if (!toast || !text) return;
    text.textContent = `Request received — Ref: GCC/2026/WD12/${refNum}`;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 6000);
}

// ── 4. AI WASTE INSIGHTS ──────────────────────────────────────────
async function generateWasteInsight() {
    if (personalStats.scanCount < 3) return;
    const recyclePct = Math.round((personalStats.recycledKg / (personalStats.recycledKg + 0.1)) * 100);
    try {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: 'POST',
            headers: anthropicHeaders(),
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001', max_tokens: 120,
                system: 'You are EcoWaste Pro. Give a 1-sentence personalised waste insight for a Chennai Ward 12 resident. Be specific and encouraging. No markdown.',
                messages: [{ role: 'user', content: `User scanned ${personalStats.scanCount} items, recycled ${personalStats.recycledKg}kg, saved ${personalStats.co2Kg}kg CO2. Give insight.` }]
            })
        });
        const data = await resp.json();
        const insight = data.content?.map(b => b.text||'').join('').trim();
        if (insight) {
            const trend = document.getElementById('statCO2Trend');
            if (trend) { trend.textContent = '💡 ' + insight; trend.style.color = '#1a6b3c'; trend.style.fontWeight = '600'; }
        }
    } catch(e) { /* silently fail */ }
}

function requestPickup(binId) {
    const bin = bins.find(b => b.id === binId);
    if (!bin) return;
    const request = { id: Date.now(), binId, binType: bin.type, binIcon: bin.icon, fillLevel: bin.fillLevel, status: 'pending', requestTime: new Date().toISOString(), address: '14, Anna Nagar East, Ward 12', estimatedArrival: calculateEstimatedArrival() };
    pickupRequests.push(request);
    requestHistory.unshift({...request});
    renderBins(); renderActiveRequests();
    awardPoints(15, `✅ ${t('btn_request_pickup')} — +15`);
    // 3. AI-powered ETA call
    generateAIPickupETA(request);
    // 5. GCC integration story
    const gccRef = String(Math.floor(10000 + Math.random() * 90000));
    setTimeout(() => showGCCToast(gccRef), 1200);
    setTimeout(() => dispatchTruckToLocation(request.id), 2000);
}
function requestEmergencyPickup() {
    const fullBins = bins.filter(b => b.fillLevel >= 60);
    if (!fullBins.length) { showNotification('ℹ️','No bins need immediate pickup'); return; }
    fullBins.forEach(bin => {
        if (!pickupRequests.some(r => r.binId === bin.id && r.status === 'pending')) {
            const request = { id: Date.now() + bin.id, binId: bin.id, binType: bin.type, binIcon: bin.icon, fillLevel: bin.fillLevel, status: 'pending', emergency: true, requestTime: new Date().toISOString(), address: '123 Green Street', estimatedArrival: calculateEstimatedArrival(true) };
            pickupRequests.push(request);
            requestHistory.unshift({...request});
        }
    });
    renderBins(); renderActiveRequests();
    awardPoints(25, '🚨 Emergency pickup requested! +25 points');
}
function calculateEstimatedArrival(emergency=false) {
    return `${Math.floor(Math.random()*(emergency?20:40))+(emergency?10:20)} minutes`;
}
// 3. AI-powered contextual ETA message
async function generateAIPickupETA(request) {
    const trucks = ['GCC-01','GCC-07','GCC-12'];
    const truck = trucks[Math.floor(Math.random()*trucks.length)];
    const areas = ['Shastri Nagar','Annanagar East','Chinthamani','Thirumangalam','Varadarajapuram'];
    const area = areas[Math.floor(Math.random()*areas.length)];
    const km = (1.2 + Math.random()*3).toFixed(1);
    const mins = Math.floor(8 + Math.random()*18);
    // Immediate optimistic message
    showNotification('🚛', `Truck ${truck} is ${km} km away near ${area} — ETA ~${mins} mins`);
    // Update the active request's ETA
    const req = pickupRequests.find(r => r.id === request.id);
    if (req) { req.estimatedArrival = `~${mins} mins · ${truck} near ${area}`; renderActiveRequests(); }
    // Then fire AI to get richer context
    try {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: 'POST',
            headers: anthropicHeaders(),
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001', max_tokens: 80,
                system: 'You are GCC Chennai dispatch. Give a 1-sentence realistic truck ETA for Ward 12 Anna Nagar. Include truck ID, nearby landmark, and minutes. No markdown.',
                messages: [{ role: 'user', content: `Pickup request for ${request.binType} bin at ${request.fillLevel}% fill. Truck ${truck} near ${area}, ${km}km away.` }]
            })
        });
        const data = await resp.json();
        const eta = data.content?.map(b=>b.text||'').join('').trim();
        if (eta && req) { req.estimatedArrival = eta; renderActiveRequests(); }
    } catch(e) { /* keep optimistic message */ }
}
function dispatchTruckToLocation(requestId) {
    const request = pickupRequests.find(r => r.id === requestId);
    if (!request) return;
    request.status = 'dispatched';
    renderActiveRequests();
    showNotification('🚛', `Truck dispatched for ${request.binType}!`);
    setTimeout(() => completePickup(requestId), request.emergency ? 15000 : 30000);
}
function completePickup(requestId) {
    const idx = pickupRequests.findIndex(r => r.id === requestId);
    if (idx === -1) return;
    const request = pickupRequests[idx];
    const bin = bins.find(b => b.id === request.binId);
    if (bin) { bin.fillLevel = Math.floor(Math.random()*15)+5; bin.lastCollection = 'Just now'; }
    request.status = 'completed';
    pickupRequests.splice(idx, 1);
    renderBins(); renderActiveRequests(); updateDashboard();
    showNotification('✅', `${request.binType} collected!`);
}
function renderActiveRequests() {
    const c = document.getElementById('activeRequests');
    if (!pickupRequests.length) { c.innerHTML = `<p style="text-align:center;color:#999;padding:2rem">${t('req_no_active')}</p>`; return; }
    c.innerHTML = pickupRequests.map(r => `<div class="request-item ${r.status}"><div><div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem"><span style="font-size:1.5rem">${r.binIcon}</span><strong>${r.binType}</strong>${r.emergency?`<span style="background:#e74c3c;color:white;padding:0.2rem 0.5rem;border-radius:10px;font-size:0.75rem">${t('req_emergency')}</span>`:''}</div><div style="color:#666;font-size:0.9rem"><div>📍 ${r.address}</div><div>📊 Fill: ${r.fillLevel}%</div>${r.status==='dispatched'?`<div style="color:#1976d2;font-weight:600">${t('req_eta')}: ${r.estimatedArrival}</div>`:''}</div></div><div class="request-status ${r.status==='dispatched'?'status-dispatched':'status-pending'}">${r.status==='dispatched'?t('req_on_the_way'):t('req_pending')}</div></div>`).join('');
}

// ============================================================
// POINTS, UTILS
// ============================================================
function awardPoints(pts, msg) {
    userPoints += pts;
    ['headerPoints','totalPoints','dashboardPoints'].forEach(id => { const el = document.getElementById(id); if(el) el.textContent = userPoints; });
    // Persist to sessionStorage
    try { sessionStorage.setItem('ewp_points', userPoints); } catch(e){}
    showNotification('🏆', msg);
    updateLevelBadge();
    updateLeaderboardUserRow();
}

function updateLevelBadge() {
    const levels = [
        { min: 0,    label: '🌱 Level 1 - Eco Newcomer' },
        { min: 100,  label: '🌿 Level 2 - Recycler' },
        { min: 300,  label: '⚡ Level 3 - Eco Warrior' },
        { min: 600,  label: '🛡️ Level 4 - Green Guardian' },
        { min: 1000, label: '🌍 Level 5 - Planet Protector' },
    ];
    const level = [...levels].reverse().find(l => userPoints >= l.min) || levels[0];
    const badge = document.getElementById('levelBadge');
    if (badge && badge.textContent !== level.label) {
        badge.textContent = level.label;
        if (userPoints >= 100) {
            badge.style.animation = 'none';
            requestAnimationFrame(() => { badge.style.animation = 'coin-burst 0.6s ease'; });
        }
    }
    // Update leaderboard user sub-label
    const userSub = document.querySelector('#leaderboardUserName + div');
    if (userSub) userSub.textContent = level.label;
    // Check achievement unlocks
    checkAchievements();
}

function updateLeaderboardUserRow() {
    // Update the user's leaderboard entry with live coins
    const lbUserPoints = document.querySelector('.leaderboard-item:last-child .leaderboard-points');
    if (lbUserPoints) lbUserPoints.textContent = userPoints.toLocaleString() + ' coins';
}
function getTimeAgo(ts) {
    const s = Math.floor((new Date() - new Date(ts)) / 1000);
    if (s < 60) return 'Just now'; if (s < 3600) return Math.floor(s/60)+' min ago'; if (s < 86400) return Math.floor(s/3600)+' hr ago'; return Math.floor(s/86400)+' days ago';
}
const liveEvents = [];
function showNotification(icon, msg) {
    const t = document.getElementById('notificationToast');
    document.getElementById('notificationIcon').textContent = icon;
    document.getElementById('notificationMessage').textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 5000);

    // Also push to live event ticker
    pushLiveEvent(icon, msg);
}
function pushLiveEvent(icon, msg) {
    const time = new Date().toLocaleTimeString('en-IN', { hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit' });
    liveEvents.unshift({ icon, msg, time });
    if (liveEvents.length > 20) liveEvents.pop();
    const el = document.getElementById('liveEventText');
    if (!el) return;
    const ev = liveEvents[0];
    el.style.opacity = '0';
    setTimeout(() => {
        el.innerHTML = `<span style="color:rgba(255,255,255,0.4)">[${ev.time}]</span> <span style="font-size:1rem">${ev.icon}</span> ${escapeHtml(ev.msg)}`;
        el.style.transition = 'opacity 0.4s';
        el.style.opacity = '1';
    }, 200);
}
function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function updateDashboard() { document.getElementById('totalCollections').textContent = requestHistory.filter(r => r.status === 'completed').length; }
function simulateBinLevelChanges() {
    // City map sim handles sync now; this is a light fallback for when map tab not open
    setInterval(() => {
        bins.forEach(b => {
            if (b.fillLevel < 95 && Math.random() > 0.7)
                b.fillLevel = Math.min(100, b.fillLevel + Math.floor(Math.random()*3)+1);
        });
        if (document.getElementById('pickup')?.classList.contains('active')) renderBins();
        // Update dashboard quick bin overview
        const dashBinFills = document.querySelectorAll('#dashboard .fill-level-fill');
        if (dashBinFills.length >= 3) {
            [0,1,2].forEach(i => {
                const fill = bins[i]?.fillLevel ?? 0;
                const fc   = fill >= 85 ? 'critical' : fill >= 60 ? 'warning' : '';
                dashBinFills[i].style.height = fill + '%';
                dashBinFills[i].textContent  = fill + '%';
                dashBinFills[i].className    = 'fill-level-fill ' + fc;
            });
        }
    }, 8000);
}

// ============================================================
// CHARTS
// ============================================================
function initCharts() {
    chartInstances = [];
    const wCtx = document.getElementById('wasteChart').getContext('2d');
    chartInstances.push(new Chart(wCtx, { type:'bar', data:{ labels:['Jan','Feb','Mar','Apr','May','Jun'], datasets:[{ label:'Recyclables', data:[45,52,48,58,62,65], backgroundColor:'#2ecc71' },{ label:'Organic', data:[30,35,32,38,40,42], backgroundColor:'#f39c12' },{ label:'General', data:[25,22,20,18,15,12], backgroundColor:'#95a5a6' }] }, options:{ responsive:true, plugins:{legend:{labels:{color:'#666'}}}, scales:{ y:{ beginAtZero:true, ticks:{color:'#666'}, grid:{color:'rgba(0,0,0,0.1)'} }, x:{ ticks:{color:'#666'}, grid:{color:'rgba(0,0,0,0.05)'} } } } }));
    const tCtx = document.getElementById('recyclingTrendChart').getContext('2d');
    chartInstances.push(new Chart(tCtx, { type:'line', data:{ labels:['Jan','Feb','Mar','Apr','May','Jun'], datasets:[{ label:'Recycling Rate %', data:[65,68,72,75,80,85], borderColor:'#2ecc71', backgroundColor:'rgba(46,204,113,0.1)', fill:true, tension:0.4 }] }, options:{ responsive:true, plugins:{legend:{labels:{color:'#666'}}}, scales:{ y:{ beginAtZero:true, max:100, ticks:{color:'#666'} }, x:{ ticks:{color:'#666'} } } } }));
    const cCtx = document.getElementById('categoryChart').getContext('2d');
    chartInstances.push(new Chart(cCtx, { type:'doughnut', data:{ labels:['Recyclables','Organic','General','E-Waste'], datasets:[{ data:[45,30,20,5], backgroundColor:['#2ecc71','#f39c12','#95a5a6','#e74c3c'] }] }, options:{ responsive:true, plugins:{ legend:{ position:'bottom', labels:{color:'#666'} } } } }));
    if (isDark) updateChartsDarkMode();
}

// ============================================================
// WARD CHALLENGES
// ============================================================
function toggleJoin(btn) {
    if (btn.classList.contains('joined')) { btn.classList.remove('joined'); btn.classList.add('primary'); btn.textContent = t('challenge_join'); showNotification('👋', t('notif_left')); }
    else { btn.classList.remove('primary'); btn.classList.add('joined'); btn.textContent = t('challenge_joined'); showNotification('🏘️', t('notif_joined')); }
}
function animateChallengeProgress() {
    document.querySelectorAll('.progress-fill').forEach(bar => { const t = bar.style.width; bar.style.width = '0%'; setTimeout(() => { bar.style.width = t; }, 100); });
}

// ============================================================
// CERTIFICATE
// ============================================================
function initCertificate() {
    const nameEl = document.getElementById('certName'), displayName = document.getElementById('userDisplayName');
    if (nameEl && displayName) nameEl.textContent = displayName.textContent || 'EcoWaste User';
    const dateEl = document.getElementById('certDate');
    if (dateEl) dateEl.textContent = 'Issued: ' + new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});

    // Bind real stats to certificate
    const certR = document.getElementById('certRecycled');
    const certC = document.getElementById('certCO2');
    const certP = document.getElementById('certPickups');
    const certCh= document.getElementById('certChallenges');
    if (certR) certR.textContent = personalStats.recycledKg.toFixed(1) + ' kg';
    if (certC) certC.textContent = personalStats.co2Kg.toFixed(2) + ' kg';
    if (certP) certP.textContent = requestHistory.filter(r => r.status === 'completed').length || 0;
    if (certCh) {
        const joined = document.querySelectorAll('.join-btn.joined').length;
        certCh.textContent = joined;
    }

    // QR Code generation
    const qrEl = document.getElementById('certQrCode');
    if (qrEl && typeof QRCode !== 'undefined') {
        qrEl.innerHTML = '';
        try {
            new QRCode(qrEl, { text: 'https://verify.ecowastepro.in/ECO-2026-WD12-00847', width: 76, height: 76, correctLevel: QRCode.CorrectLevel.M });
        } catch(e) { qrEl.innerHTML = '<div style="font-size:0.6rem;color:#999;text-align:center;padding:4px">QR<br>Verify</div>'; }
    }
}

// ── FEED TIMESTAMP UPDATER (Bug Fix #4) ─────────────────────────────
function initFeedTimestamps() {
    const startTime = Date.now();
    function updateTimestamps() {
        document.querySelectorAll('.feed-time[data-ts-offset]').forEach(el => {
            const offset = parseInt(el.dataset.tsOffset);
            const elapsed = startTime - offset + (Date.now() - startTime);
            const s = Math.floor(elapsed / 1000);
            if (s < 60) el.textContent = 'Just now';
            else if (s < 3600) el.textContent = Math.floor(s/60) + ' minutes ago';
            else if (s < 86400) el.textContent = Math.floor(s/3600) + ' hour' + (Math.floor(s/3600)>1?'s':'') + ' ago';
            else el.textContent = Math.floor(s/86400) + ' days ago';
        });
    }
    updateTimestamps();
    setInterval(updateTimestamps, 30000);
}
function downloadCertificate() { showNotification('⬇️','Certificate download started!'); setTimeout(() => window.print(), 500); }
function shareOn(platform) {
    const name = document.getElementById('userDisplayName')?.textContent || 'A citizen';
    const kg = personalStats.recycledKg || 0;
    const msg = `I just recycled ${kg}kg of waste with EcoWaste Pro in Chennai Ward 12! 🌿 Join me in making our city cleaner. #EcoWastePro #Chennai #SDG12`;
    const url = 'https://ecowastepro.in/ECO-2026-WD12';
    const encoded = encodeURIComponent(msg + ' ' + url);
    const links = {
        whatsapp: `https://wa.me/?text=${encoded}`,
        twitter:  `https://twitter.com/intent/tweet?text=${encoded}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&summary=${encoded}`,
    };
    if (links[platform]) {
        window.open(links[platform], '_blank', 'noopener,width=600,height=500');
    }
    showNotification('🔗', `Opening ${platform} to share your impact!`);
}
function copyLink() {
    const l = 'https://verify.ecowastepro.in/ECO-2026-WD12-00847';
    if (navigator.clipboard) {
        navigator.clipboard.writeText(l).then(() => showNotification('✅', 'Link copied to clipboard!'));
    } else {
        showNotification('🔗', 'Link: ' + l);
    }
}

// ============================================================
// DEMO MODE
// ============================================================
function launchDemoMode() {
    currentUser = { type: 'demo', username: 'Priya Sharma' };
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainApp').classList.add('active');
    // Show EcoBot FAB in demo mode
    const fab = document.getElementById('fabEcobot');
    if (fab) fab.style.display = 'flex';
    // Apply saved language (silent — no toast, no double render)
    setLang(currentLang, true);
    document.getElementById('userDisplayName').textContent = 'Priya Sharma';
    document.getElementById('leaderboardUserName').textContent = 'You (Priya Sharma)';
    const userInfo = document.querySelector('.user-info');
    if (userInfo && !document.querySelector('.demo-badge-header')) {
        const badge = document.createElement('span'); badge.className = 'demo-badge-header'; badge.textContent = '⚡ DEMO'; userInfo.parentElement.insertBefore(badge, userInfo);
    }
    bins[0].fillLevel = 78; bins[0].lastCollection = '3 days ago';
    bins[1].fillLevel = 45; bins[1].lastCollection = '2 days ago';
    bins[2].fillLevel = 91; bins[2].lastCollection = '5 days ago';
    bins[3].fillLevel = 62; bins[3].lastCollection = '4 days ago';
    bins[4].fillLevel = 34; bins[4].lastCollection = '1 week ago';
    userPoints = 1240;
    ['headerPoints','totalPoints','dashboardPoints'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=userPoints; });
    document.getElementById('totalCollections').textContent = '22';
    const statVals = document.querySelectorAll('#dashboard .stat-value');
    if (statVals.length >= 4) { statVals[0].textContent='22'; statVals[1].textContent='41.6 kg'; statVals[2].textContent='14.8 kg'; statVals[3].textContent=userPoints; }
    // Immediately update dashboard bin overview cards with demo fill levels
    const dashBinFills = document.querySelectorAll('#dashboard .fill-level-fill');
    if (dashBinFills.length >= 3) {
        const demoFills = [78, 45, 91];
        demoFills.forEach((fill, i) => {
            const fc = fill >= 85 ? 'critical' : fill >= 60 ? 'warning' : '';
            dashBinFills[i].style.height = fill + '%';
            dashBinFills[i].textContent  = fill + '%';
            dashBinFills[i].className    = 'fill-level-fill ' + fc;
        });
    }
    pickupRequests = [{ id: Date.now(), binId: 3, binType: 'Organic Waste', binIcon: '🌿', fillLevel: 91, address: '14, Anna Nagar East, Ward 12', status: 'dispatched', emergency: false, requestTime: new Date(Date.now()-12*60000).toLocaleString(), estimatedArrival: '~8 mins' }];
    recentScans = [
        { name: 'PET Plastic Bottle', category: 'Recyclable', icon: '♻️', image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="%232ecc71" rx="8"/><text y="40" x="10" font-size="30">♻️</text></svg>', timestamp: new Date(Date.now()-2*3600000).toISOString() },
        { name: 'Cardboard Box', category: 'Recyclable', icon: '📦', image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="%23f39c12" rx="8"/><text y="40" x="10" font-size="30">📦</text></svg>', timestamp: new Date(Date.now()-5*3600000).toISOString() },
        { name: 'Old Smartphone', category: 'E-Waste', icon: '📱', image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="%236a1b9a" rx="8"/><text y="40" x="10" font-size="30">📱</text></svg>', timestamp: new Date(Date.now()-24*3600000).toISOString() },
    ];
    displayRecentScans();
    const cards = document.querySelectorAll('.achievement-card.locked');
    if (cards.length >= 3) { cards[0].classList.remove('locked'); cards[0].querySelector('.achievement-icon').textContent='🌍'; cards[1].classList.remove('locked'); cards[1].querySelector('.achievement-icon').textContent='🧙'; cards[2].classList.remove('locked'); cards[2].querySelector('.achievement-icon').textContent='🌊'; }
    // Seed demo city bin data with dramatic spread
    CITY_BIN_NODES[0].fill  = 78;  // warn
    CITY_BIN_NODES[1].fill  = 55;
    CITY_BIN_NODES[2].fill  = 91;  // crit — truck T1 will auto-dispatch
    CITY_BIN_NODES[3].fill  = 42;
    CITY_BIN_NODES[4].fill  = 70;  // warn
    CITY_BIN_NODES[5].fill  = 28;
    CITY_BIN_NODES[6].fill  = 88;  // crit — truck T2 will auto-dispatch
    CITY_BIN_NODES[7].fill  = 18;
    CITY_BIN_NODES[8].fill  = 65;  // warn
    CITY_BIN_NODES[9].fill  = 33;
    CITY_BIN_NODES[10].fill = 50;
    CITY_BIN_NODES[11].fill = 97;  // crit — truck T3 will auto-dispatch
    renderBins(); renderActiveRequests(); initCharts(); simulateBinLevelChanges();
    // Seed personal stats for demo
    personalStats = { recycledKg: 41.6, co2Kg: 14.8, scanCount: 22, waterSaved: Math.round(41.6 * 17), energySaved: Math.round(41.6 * 5.4 * 10) / 10 };
    const statRecycled = document.getElementById('statRecycled');
    const statCO2 = document.getElementById('statCO2');
    if (statRecycled) statRecycled.textContent = '41.6 kg';
    if (statCO2) { statCO2.textContent = '14.8 kg'; statCO2.style.color = '#27ae60'; }
    document.querySelectorAll('.skeleton-card').forEach(c => c.classList.remove('skeleton-card'));
    updateStatisticsTab();
    updateLevelBadge();
    updateLeaderboardUserRow();
    mapInitialized = false;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('dashboard').classList.add('active');
    document.querySelector('.tab-btn').classList.add('active');
    showNotification('🚀', 'Demo mode loaded! Try the Live City Map tab!');
    // 8. EcoBot proactive alert after 8 seconds
    setTimeout(() => {
        const panel = document.getElementById('ecobotFloatPanel');
        const fab = document.getElementById('fabEcobot');
        if (panel && !panel.classList.contains('open')) { panel.classList.add('open'); fab.classList.add('open'); }
        const msgs = document.getElementById('ecobotMessages');
        if (msgs) {
            const now = new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
            msgs.insertAdjacentHTML('beforeend', `<div class="ecobot-msg bot"><div class="msg-avatar">🌿</div><div class="msg-bubble" style="border-left:3px solid #e74c3c"><p>🚨 I noticed <strong>Bin C (Organic Waste)</strong> is at <strong style="color:#e74c3c">91%</strong> capacity — well above the critical threshold!<br><br>Want me to request an emergency pickup? It will dispatch <strong>Truck GCC-07</strong> in ~12 minutes.</p><div style="display:flex;gap:0.5rem;margin-top:0.75rem"><button onclick="requestEmergencyPickup();this.closest('.msg-bubble').querySelector('.bot-action-btns').innerHTML='✅ Emergency pickup requested!'" style="background:#e74c3c;color:white;border:none;padding:0.4rem 0.85rem;border-radius:8px;cursor:pointer;font-size:0.82rem;font-weight:700">🚨 Yes, dispatch now</button><button onclick="this.closest('.msg-bubble').querySelector('.bot-action-btns').style.display=\'none\'" style="background:#f0f0f0;border:none;padding:0.4rem 0.85rem;border-radius:8px;cursor:pointer;font-size:0.82rem">Not now</button></div><div class="bot-action-btns"></div><span class="msg-time">${now}</span></div></div>`);
            msgs.scrollTop = msgs.scrollHeight;
        }
    }, 8000);
}

// ============================================================
// ECOBOT FLOATING WIDGET
// ============================================================
// ============================================================
// ECOBOT — FULLY LOCAL, NO API KEY REQUIRED
// Rich knowledge base covering Chennai/Ward 12 waste management
// ============================================================

function toggleEcobot() {
    const panel = document.getElementById('ecobotFloatPanel'), fab = document.getElementById('fabEcobot');
    const isOpen = panel.classList.contains('open');
    if (isOpen) { panel.classList.remove('open'); fab.classList.remove('open'); }
    else {
        panel.classList.add('open'); fab.classList.add('open');
        setTimeout(() => {
            const i = document.getElementById('ecobotInput'); if (i) i.focus();
            const m = document.getElementById('ecobotMessages'); if (m) m.scrollTop = m.scrollHeight;
        }, 350);
    }
}

let ecobotTyping = false;
function handleEcobotKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendEcobotMessage(); } }
function autoResizeTextarea(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }
function sendSuggestion(btn) {
    document.getElementById('ecobotInput').value = btn.textContent;
    document.getElementById('ecobotSuggestions').style.display = 'none';
    sendEcobotMessage();
}

// ── LOCAL KNOWLEDGE BASE ─────────────────────────────────────────────
const ECOBOT_KB = [
    // PLASTIC
    { keys: ['plastic bottle','pet bottle','water bottle','pet plastic','plastic water'],
      reply: `♻️ **Plastic Bottles (PET)** go in the **Blue GCC Dry Waste bin**.\n\n- Rinse and crush before disposing\n- Remove the cap (dispose separately)\n- Drop-off: Kotturpuram Dry Waste Collection Centre\n- Look for ♻️1 symbol on the base\n\n⚠️ Never burn plastic — releases toxic fumes.` },
    { keys: ['plastic bag','carry bag','polythene','poly bag','cover'],
      reply: `🛍️ **Plastic Bags** are tricky — most Chennai bins don't accept them.\n\n- Take to **Reliance Fresh / More Supermarket** collection points\n- Many shops accept old bags for reuse\n- Switch to cloth bags to earn +10 eco coins!\n\n⚠️ Don't throw in dry waste — they clog sorting machines.` },
    { keys: ['styrofoam','thermocol','foam','thermocole'],
      reply: `❌ **Styrofoam / Thermocol** is NOT recyclable in Chennai.\n\n- Place in the **Red GCC General Waste bin**\n- Avoid buying styrofoam-packaged products\n- Some courier companies accept clean thermocol back\n\n⚠️ Never burn — releases styrene gas, which is carcinogenic.` },

    // PAPER & CARDBOARD
    { keys: ['cardboard','carton','box','corrugated'],
      reply: `📦 **Cardboard / Carton boxes** go in the **Blue Dry Waste bin**.\n\n- Flatten before disposing to save space\n- Remove tape and staples if possible\n- Pizza boxes with grease → Red bin (contaminated)\n- Clean boxes → excellent for GCC recycling\n\n💡 Tip: Kabadiwala (door-to-door scrap dealers) pay ₹3–5/kg for clean cardboard.` },
    { keys: ['newspaper','paper','magazine','book','notebook'],
      reply: `📰 **Paper & Newspapers** go in the **Blue GCC Dry Waste bin**.\n\n- Keep dry — wet paper is not recyclable\n- Bundle neatly before placing in bin\n- Sell to local kabadiwala for ₹6–8/kg\n\n💡 Shredded paper → excellent compost carbon layer!` },
    { keys: ['pizza box','greasy paper','oily paper'],
      reply: `🍕 **Greasy/Oily Paper (Pizza boxes etc.)** go in the **Green Organic bin** if soiled.\n\nIf the box has clean parts, tear off the greasy section:\n- Clean cardboard → Blue bin\n- Greasy part → Green bin (compostable)\n\n⚠️ Greasy paper contaminates paper recycling batches.` },

    // ORGANIC / FOOD
    { keys: ['food waste','food scrap','vegetable','fruit','kitchen waste','organic','leftover','cooked food','rice','roti'],
      reply: `🌿 **Food & Kitchen Waste** goes in the **Green GCC Organic bin**.\n\n- Includes: vegetables, fruit peels, cooked food, rice, bread\n- GCC collects daily in Anna Nagar East\n- This goes to Kodungaiyur composting facility\n\n💡 **Home composting** earns +25 eco coins! Use a pot with dry leaves + food scraps.` },
    { keys: ['compost','composting','home compost','vermicompost'],
      reply: `🌱 **Composting at Home — Chennai Guide**\n\n**Pot Method (simplest):**\n- Layer: food scraps → dry leaves → soil → repeat\n- Ready in 45–60 days\n- Keep moist but not wet\n\n**Vermicompost:**\n- Add earthworms to speed it up (3–4 weeks)\n- Available at Horticulture dept., Anna Nagar\n\n💡 Register with GCC's "Green Homes" program for free starter kit!` },
    { keys: ['coconut','coconut shell','coconut husk'],
      reply: `🥥 **Coconut waste** goes in the **Green Organic bin**.\n\n- Shell and husk: excellent composting material (carbon-rich)\n- Dry coconut shell can also be used as fuel in clay stoves\n- Husk fibre: donate to nurseries for growing medium\n\nGCC collects organic waste daily in Ward 12.` },

    // E-WASTE
    { keys: ['phone','mobile','smartphone','old phone','broken phone'],
      reply: `📱 **Old/Broken Phones** = **E-Waste** — never in regular bins!\n\n**Chennai Drop-off Points:**\n- Attibele E-Waste Park, GST Road\n- Poorvika Mobile stores (accept old devices)\n- Samsung/Apple service centres\n- GCC E-Waste collection drives (1st Saturday of month)\n\n💡 Working phones → donate to NGO "Mobile for All", Anna Nagar.` },
    { keys: ['laptop','computer','desktop','monitor','keyboard','mouse','tablet','ipad'],
      reply: `💻 **Computer & Laptop E-Waste** must go to authorised recyclers.\n\n**Drop-off in Chennai:**\n- HP Planet Partners: Nungambakkam\n- Dell Reconnect: multiple city locations\n- Attibele E-Waste Facility, GST Road\n- GCC E-Waste camp: 1st Saturday of each month, Anna Nagar East park\n\n⚠️ Computers contain lead and mercury — never in regular bins.` },
    { keys: ['battery','batteries','remote battery','aa battery','aaa battery','alkaline'],
      reply: `🔋 **Batteries** are hazardous — NOT in regular bins!\n\n**Chennai disposal:**\n- Authorised battery retailers accept old batteries\n- Car batteries: return to petrol bunks / battery shops (they pay ₹200–500!)\n- Dry cell batteries: Attibele E-Waste Park\n\n⚠️ Leaking batteries → double-bag in plastic before dropping off.` },
    { keys: ['charger','cable','wire','adapter','earphone','headphone'],
      reply: `🔌 **Cables & Chargers** = E-Waste.\n\n- Drop at any mobile accessories shop (many accept for recycling)\n- Attibele E-Waste Park, GST Road\n- GCC monthly E-Waste camp\n\n💡 Working earphones → donate to schools in Vyasarpadi / Perambur.` },
    { keys: ['cfl','tube light','bulb','fluorescent','led bulb','light bulb'],
      reply: `💡 **CFL & Tube Lights** contain mercury — hazardous waste!\n\n- Take to **Philips / Osram** dealer (many have take-back programs)\n- GCC Hazardous Waste Collection, Anna Nagar depot\n- Never break — mercury vapour is toxic\n\nLED bulbs (non-CFL): E-Waste bins at GCC camps.` },

    // HAZARDOUS
    { keys: ['medicine','medicines','tablet','capsule','expired medicine','pills','drug','pharma'],
      reply: `💊 **Expired/Unused Medicines** — never flush or bin!\n\n**Chennai disposal:**\n- **Apollo Pharmacy** (most branches accept returns)\n- **Government Hospital Pharmacies** — free drop-off\n- GCC Hazardous Waste drive (quarterly)\n\n⚠️ Flushing medicines contaminates Chennai's water supply (Chembarambakkam reservoir).` },
    { keys: ['paint','paint can','thinner','solvent','varnish'],
      reply: `🎨 **Paint & Solvents** = Hazardous Waste.\n\n- Never pour down the drain — contaminates Cooum/Adyar rivers\n- Let paint dry completely → can go in Red General bin\n- Wet paint → GCC Hazardous Waste Collection centre, Kodungaiyur\n\n💡 Leftover usable paint → donate to schools or community centres.` },
    { keys: ['pesticide','insecticide','herbicide','rat poison','cockroach'],
      reply: `☠️ **Pesticides & Insecticides** = Hazardous Waste.\n\n- Seal containers tightly\n- Take to **GCC Hazardous Waste Centre, Kodungaiyur**\n- Never pour in drains or soil\n\n📞 GCC Helpline: **1913** for hazardous waste pickup scheduling.` },

    // MEDICAL WASTE
    { keys: ['syringe','needle','lancet','injection','medical waste','bandage','hospital waste','ppe','glove'],
      reply: `🏥 **Medical/Sharps Waste** — requires special handling!\n\n- Syringes/needles: **recap and place in a thick plastic bottle**, then label\n- Drop at nearest **Government Hospital** waste point\n- PPE kits, bandages → **Red medical waste bag**\n\n⚠️ Never in regular bins — sharps risk to waste workers.` },

    // GLASS & METAL
    { keys: ['glass','glass bottle','glass jar','broken glass'],
      reply: `🍾 **Glass** goes in the **Blue Dry Waste bin** (intact bottles).\n\n- Broken glass: wrap in newspaper, label "BROKEN GLASS" → Blue bin\n- Clean glass bottles → kabadiwala pays ₹1–3 each\n- Glass jars → reuse for storage (great for spices!)\n\n💡 GCC recycles glass at Manali Industrial Area facility.` },
    { keys: ['metal','tin can','aluminium can','steel','iron','scrap metal','copper'],
      reply: `🔩 **Metal / Tin Cans** go in the **Blue Dry Waste bin**.\n\n- Rinse food cans before disposing\n- Aluminium cans → high value recyclable (₹60–80/kg)\n- Scrap metal → local raddi shops pay good rates\n- Copper wire → ₹400–500/kg at scrap dealers\n\nLarger metal items → call GCC bulk pickup: **1913**` },

    // BIN TYPES
    { keys: ['bin','which bin','what bin','what color','colour','blue bin','green bin','red bin'],
      reply: `🗑️ **Chennai GCC Bin Guide — Ward 12:**\n\n🔵 **Blue Bin** — Dry Waste\nPaper, cardboard, plastic bottles, glass, metal, tetra packs\n\n🟢 **Green Bin** — Wet/Organic Waste\nFood scraps, vegetable peels, garden waste, coconut shells\n\n🔴 **Red Bin** — General/Reject Waste\nDirty diapers, sanitary waste, broken ceramics, styrofoam\n\n⚠️ Special: E-Waste, Hazardous, Medical → separate drop-off centres` },

    // PICKUP & SCHEDULE
    { keys: ['pickup','collection','schedule','when','timing','truck','collect'],
      reply: `🚛 **GCC Waste Collection — Ward 12, Anna Nagar East:**\n\n- **Wet Waste (Green):** Daily, 6:00–9:00 AM\n- **Dry Waste (Blue):** Monday, Wednesday, Friday\n- **Bulk items:** Call **1913** for special pickup\n- **E-Waste camp:** 1st Saturday of each month\n\n📍 Nearest GCC depot: Anna Nagar East Sanitation Depot, 10th Main Road\n\nRequest pickup directly from the **My Bins** tab! 🗑️` },

    // COMPOSTING / GARDEN
    { keys: ['garden waste','leaves','grass','plant','flower','pruning','branches'],
      reply: `🌿 **Garden Waste** goes in the **Green Organic bin**.\n\n- Dry leaves: excellent compost material — keep some for layering\n- Branches/large prunings → bundle and leave beside bin for special pickup\n- Grass clippings → mix into home compost (nitrogen-rich)\n\n📞 Bulk garden waste: call GCC **1913** for free pickup.` },

    // EARN POINTS
    { keys: ['points','coins','rewards','earn','how to earn','eco coin'],
      reply: `🏆 **Earn EcoCoins in EcoWaste Pro:**\n\n- 📸 AI Waste Scan → **+15 coins**\n- 🚛 Request Pickup → **+15 coins**\n- 🏘️ Join Ward Challenge → **+10 coins**\n- 🌿 Use EcoBot → **+5 coins**\n- 📚 AI Guide query → **+3 coins**\n- 🚨 Emergency Pickup → **+25 coins**\n\n🎁 **Redeem for:** MTC bus passes, café discounts, tree plantings, utility bill credits!` },

    // ILLEGAL DUMPING
    { keys: ['illegal dumping','dump','open dump','road dump','garbage road','littering'],
      reply: `🚨 **Spotted Illegal Dumping?**\n\n**Report immediately:**\n- 📞 GCC Helpline: **1913** (24×7)\n- 📱 GCC app: "Report" feature\n- Use the **⚠️ Report Dumping** button in AI Scanner results\n\nYou earn **+20 eco coins** for each verified report!\n\n📍 Your report goes to Ward 12 supervisor directly.` },

    // TETRA PACK / CARTONS
    { keys: ['tetra pack','juice box','milk carton','tetrapack','carton drink'],
      reply: `🥛 **Tetra Packs / Juice Cartons** — Blue Dry Waste bin.\n\n- Rinse and flatten\n- Remove straws and caps (same bin)\n- ITC WOW (Wealth Out of Waste) programme collects them: Chetpet & Anna Nagar offices\n\n💡 Tetra packs become roofing tiles when recycled — cool lifecycle!` },

    // DIAPERS / SANITARY
    { keys: ['diaper','nappy','sanitary pad','sanitary napkin','tampon','pad'],
      reply: `🔴 **Diapers & Sanitary Waste** go in the **Red General Waste bin**.\n\n- Wrap in newspaper or the product packaging before binning\n- Never flush — clogs Chennai's drainage system\n- Biodegradable alternatives: bamboo diapers available in Anna Nagar organic stores\n\n⚠️ These go to Kodungaiyur landfill — consider reusable cloth options!` },

    // GREETINGS / SMALL TALK
    { keys: ['hello','hi','hey','hai','helo','good morning','good afternoon','good evening','namaste','vanakkam'],
      reply: `👋 Hello! I'm **EcoBot**, your local waste management guide for **Ward 12, Anna Nagar East, Chennai**!\n\nI can help you with:\n- 🗑️ Which bin for any item\n- ♻️ Recycling tips & drop-off locations\n- 🌿 Home composting guide\n- 📱 E-waste disposal\n- 🚛 Pickup scheduling\n- 🏆 How to earn EcoCoins\n\nWhat would you like to know?` },
    { keys: ['thank','thanks','thank you','nandri','shukriya','dhanyawad'],
      reply: `🌱 You're welcome! Every small eco-action adds up. Together, Ward 12 is making Chennai cleaner!\n\nTip: Each chat earns you **+5 EcoCoins** 🏆\nKeep asking — I'm always here!` },
    { keys: ['bye','goodbye','ok bye','see you','cya'],
      reply: `👋 Goodbye! Keep sorting your waste and making Chennai greener. 🌿\n\nRemember: **Blue for Dry, Green for Organic, Red for Reject!**` },

    // HELPLINE
    { keys: ['helpline','number','contact','phone number','call','gcc','complaint'],
      reply: `📞 **GCC Ward 12 Contacts:**\n\n- **GCC Helpline:** 1913 (24×7, free)\n- **Sanitation Dept:** +91-44-2538-3957\n- **E-Waste Drive:** +91-44-2500-7301\n- **Bulk Waste Pickup:** 1913\n\n🌐 Online: chennaicorporation.gov.in\n📱 GCC mobile app available on Play Store` },

    // RECYCLING CENTRES
    { keys: ['where','drop off','drop-off','facility','centre','center','location','place'],
      reply: `📍 **Waste Drop-off Locations near Ward 12:**\n\n♻️ **Dry Waste Centre:** Kotturpuram DWCC, 5th Ave\n🔋 **E-Waste:** Attibele Park, GST Road (10km)\n☣️ **Hazardous:** Kodungaiyur Facility (15km)\n🏥 **Medical:** Anna Nagar Govt Hospital\n🌿 **Composting:** Perungudi Waste Park\n\n🚛 For bulk/special items call GCC **1913** — free pickup!` },

    // WATER SACHETS
    { keys: ['water sachet','water pouch','sachet','mineral water','plastic pouch'],
      reply: `💧 **Water Sachets** are a major Chennai waste problem!\n\n- Place in **Blue Dry Waste bin**\n- Or take to ITC WOW collection points\n- These are LDPE plastic — recyclable but often contaminated\n\n💡 Better: carry a steel bottle. Ward 12 has 3 free water refill stations on 6th Ave, 12th Main & Anna Nagar Tower Road!` },

    // CLOTHES / TEXTILE
    { keys: ['clothes','clothing','textile','fabric','old clothes','shirt','dress','jeans','shoes'],
      reply: `👕 **Old Clothes & Textiles:**\n\n**Donate (good condition):**\n- Goonj collection point: Anna Nagar East\n- Smile Foundation drop box: Spencer Plaza\n- Many temples accept clothing donations\n\n**Recycle (worn out):**\n- Fabindia stores accept old textiles\n- H&M garment collection bins (Express Avenue)\n\n⚠️ Never burn old clothes — releases toxic dyes.` },

    // OIL / COOKING OIL
    { keys: ['cooking oil','used oil','oil','grease','fat'],
      reply: `🍳 **Used Cooking Oil:**\n\n- **Never pour down the drain** — causes fatbergs in Chennai sewers\n- Store in a sealed bottle → give to biodiesel collectors\n- Some biofuel startups collect free: search "used cooking oil Chennai"\n- Small amounts: absorb in newspaper → Red bin\n\n💡 One litre of used oil can make 900ml of biodiesel!` },

    // FALLBACK

    // ── EXPANDED KB (v7 — 80+ entries) ─────────────────────────────

    // MOSQUITO / AGARBATTI
    { keys: ['mosquito coil','agarbatti','incense','dhoop','coil'],
      reply: `🕯️ **Mosquito Coils & Agarbatti ash** — Red General Waste bin.\n\n- Cool completely before disposing\n- Ash: can be added to compost (small quantities ok)\n- Coil wire frame → Blue bin (metal)\n\n💡 Prefer electric mosquito repellents — fewer fumes, less waste.` },

    // RUBBER
    { keys: ['rubber','rubber band','rubber glove','eraser','rubber tyre','tyre'],
      reply: `🔵 **Rubber items** — depends on type:\n\n- Small rubber items (bands, erasers) → Red General bin\n- Tyres → **Never** in regular bins. Call tyre dealers or GCC **1913**\n- Tyre recyclers in Chennai: Ambattur Industrial Estate\n- Rubber gloves (used): Red bin (treat as contaminated)` },

    // LEATHER
    { keys: ['leather','leather bag','leather shoe','leather belt','purse'],
      reply: `👜 **Leather items:**\n\n- Good condition → donate to Goonj, Smile Foundation, temples\n- Worn out leather → Red General Waste bin\n- Never compost leather — contains tanning chemicals\n\n💡 Vegan leather alternatives: look for "cork" or "Piñatex" products.` },

    // CHIPS / SNACK PACKETS
    { keys: ['chips packet','biscuit wrapper','snack packet','lays','kurkure','biscuit','wrapper'],
      reply: `🍟 **Chips & Snack Packets** — tricky!\n\n- Most are multilayer plastic — NOT recyclable at home\n- Place in **Red General Waste bin**\n- ITC WOW programme accepts some wrappers at collection points\n\n⚠️ These are one of Chennai's biggest litter problems — always bin, never litter.` },

    // THERMOMETER / MERCURY
    { keys: ['thermometer','mercury','broken thermometer','mercury spill'],
      reply: `⚠️ **Mercury Thermometers** = Hazardous!\n\n- Never throw in regular bin\n- **Mercury spill:** ventilate room, don't vacuum, absorb with wet cotton, seal in airtight bag\n- Drop at **GCC Hazardous Waste Centre, Kodungaiyur**\n- Switch to digital thermometers — safer & reusable` },

    // AEROSOL / SPRAY CANS
    { keys: ['aerosol','spray can','deodorant','hairspray','air freshener'],
      reply: `💨 **Aerosol Cans:**\n\n- Empty completely before disposal\n- Empty cans → Blue Dry Waste bin (metal)\n- Partially full → Hazardous Waste centre\n- Never puncture or incinerate — explosion risk\n\n📞 Hazardous: GCC **1913**` },

    // ELECTRONICS — TV/FRIDGE
    { keys: ['tv','television','fridge','refrigerator','washing machine','air conditioner','ac','microwave'],
      reply: `📺 **Large Electronics & Appliances:**\n\n- All are **E-Waste** — never dump illegally\n- **Manufacturer take-back:** Samsung, LG, Whirlpool all offer free pickup\n- **GCC Large E-Waste Drive:** quarterly — check GCC app\n- **Scrap dealers:** pay ₹500–3000 depending on item\n\n📞 Book bulk pickup: GCC **1913**` },

    // SANITARY / CERAMIC
    { keys: ['ceramic','pottery','crockery','plate','cup','mug','tile','broken tile'],
      reply: `🏺 **Ceramics & Pottery** — Red General Waste bin.\n\n- Ceramics cannot be recycled in standard streams\n- Wrap broken pieces in newspaper to protect waste workers\n- Old tiles: some construction material recyclers in Ambattur accept them\n- Intact items in good condition → donate to thrift stores or temples` },

    // HAIR / NAIL
    { keys: ['hair','nail clippings','nail','shaved hair'],
      reply: `💇 **Hair & Nail Clippings** — Green Organic Waste bin!\n\n- Hair is nitrogen-rich — excellent compost addition\n- Can also be used as a natural slug deterrent in gardens\n- Some salons in Chennai donate hair to mat-making NGOs\n\n💡 A handful of hair in compost speeds up decomposition.` },

    // SPECTACLES
    { keys: ['spectacles','glasses','eyeglass','contact lens','lens'],
      reply: `👓 **Old Spectacles:**\n\n- Working glasses: **donate to Lions Club** spectacles donation drives (Anna Nagar)\n- Broken frames (plastic): Red General bin\n- Metal frames: Blue Dry Waste bin\n- Contact lens + blister packs: Red bin (soft lenses are not recyclable)\n\n💡 Lions Club donate-a-sight programme: call 044-2826-5511` },

    // MOTOR OIL / CAR
    { keys: ['motor oil','engine oil','car oil','lubricant','coolant'],
      reply: `🚗 **Used Motor Oil** = Hazardous Waste!\n\n- 1 litre of oil can contaminate 1 million litres of groundwater\n- Return to **petrol bunks** (most accept used oil)\n- Auto workshops: some pay ₹10–15/litre for used oil\n- GCC Hazardous Waste Centre, Kodungaiyur\n\n⚠️ Never pour on soil or in drains — illegal under EPA.` },

    // CARDBOARD MILK / TETRAPAK
    { keys: ['milk packet','polybag milk','milk cover','milk bag'],
      reply: `🥛 **Plastic Milk Packets (polybags):**\n\n- These are LDPE (#4) plastic\n- **Clean and dry** → Blue Dry Waste bin\n- Or take to Aavin/supermarket collection points\n- ITC WOW programme accepts them\n\n💡 Saving 10 milk packets = 1 recycled park bench component!` },

    // COCONUT (already in KB but extend)
    { keys: ['banana leaf','banana','plantain leaf','leaf plate','leaf cup'],
      reply: `🍌 **Banana Leaves & Leaf plates** — 100% compostable!\n\n- Green Organic bin\n- Or shred and add directly to home compost\n- GCC collects daily in Ward 12\n\n💡 Leaf plates decompose in 2–4 weeks vs. 400 years for styrofoam!` },

    // FLOWERS / POOJA
    { keys: ['flower','pooja','puja','garland','marigold','jasmine','rose petal'],
      reply: `🌸 **Pooja flowers & Garlands** — Green Organic bin.\n\n- Do not immerse synthetic garlands in water bodies\n- Natural flowers: excellent compost material\n- Many Chennai temples now have "flower recycling" bins → goes to compost\n- GCC Anna Nagar temple zones have organic collection bins\n\n💡 Flower compost is excellent for rose gardens!` },

    // NEWSPAPERS / BOOKS (extension)
    { keys: ['books','textbook','old book','magazine','journal'],
      reply: `📚 **Books & Magazines:**\n\n**Donate (good condition):**\n- Chennai Book Lovers' group (Facebook)\n- LAMP (Libraries Across Multiple Platforms) — Perambur\n- Schools in Vyasarpadi always need books\n\n**Recycle (damaged):**\n- Blue Dry Waste bin or kabadiwala\n- Kabadiwala: ₹6–8/kg for paper\n\n💡 One recycled book saves 1 litre of water.` },

    // BUBBLE WRAP / PACKING
    { keys: ['bubble wrap','foam packing','packing material','thermocol peanut','air pillow'],
      reply: `📦 **Packing Materials:**\n\n- Bubble wrap (LDPE): take to supermarket drop-offs or ITC WOW points\n- Thermocol peanuts: Red General bin (not recyclable)\n- Paper packing: Blue Dry Waste bin\n- Air pillows: deflate, Blue bin\n\n💡 Reuse bubble wrap for fragile shipments before recycling!` },

    // SANITARY WATER / FESTIVAL
    { keys: ['ganesha idol','clay idol','idol','festival waste','crackers','firecracker'],
      reply: `🪔 **Festival Waste:**\n\n- Clay idols: immerse in buckets of water (not open water bodies), then compost the clay\n- Plaster of Paris idols: Red General bin — cannot be immersed safely\n- Crackers waste (casings, paper): Red bin\n- GCC sets up special festival collection points in Anna Nagar — check notice boards\n\n📞 Post-festival bulk cleanup: **1913**` },

    // EWASTE — POWER BANK
    { keys: ['power bank','portable charger','lithium battery','li-ion'],
      reply: `🔋 **Lithium Batteries & Power Banks** = E-Waste + Fire hazard!\n\n- Never crush, puncture, or put in regular bins\n- Drop at mobile accessory stores (many take back)\n- Attibele E-Waste Park, GST Road\n- Airport drop boxes (Terminal 1, Chennai)\n\n⚠️ Damaged lithium batteries can self-ignite — handle with care.` },

    // CARDBOARD EGG TRAYS
    { keys: ['egg tray','egg carton','egg box'],
      reply: `🥚 **Egg Trays / Cartons:**\n\n- Paper trays: Blue Dry Waste bin (dry, clean ones)\n- Plastic trays: Blue Dry Waste bin\n- Soiled/broken trays: Green Organic bin\n\n💡 Paper egg trays are excellent seed-starter pots! Plant directly into soil — the tray biodegrades.` },

    // CO2 / IMPACT
    { keys: ['co2','carbon','carbon footprint','climate','global warming','environment'],
      reply: `🌍 **Your CO₂ Impact through Recycling:**\n\n- Recycling 1kg plastic: saves ~1.8kg CO₂\n- Composting 1kg food waste: saves ~0.5kg CO₂ (vs. landfill)\n- Recycling 1kg aluminium: saves ~9kg CO₂\n\n📊 **Ward 12 this month:** 4.2 tonnes CO₂ saved = 14 trees absorbing for 1 year!\n\nCheck your personal stats in the **Statistics** tab 📈` },

    // GCC / GOVERNMENT SCHEME
    { keys: ['gcc scheme','green scheme','government','subsidy','incentive','reward scheme'],
      reply: `🏛️ **GCC Green Initiatives — Anna Nagar:**\n\n- **Green Homes Programme:** free composting kit for registering households\n- **Dry Waste Collection Centres:** sell sorted dry waste → earn ₹\n- **Ward Challenge Prizes:** top ward gets Chennai Eco Award\n- **EcoWaste Pro rewards** → redeemable for MTC passes, café discounts\n\n🌐 Register: chennaicorporation.gov.in/green-homes\n📞 1913 for more info` },

    // WORMS / VERMICOMPOST
    { keys: ['earthworm','worm','vermicompost','vermiculture'],
      reply: `🪱 **Vermicomposting in Chennai:**\n\n- Earthworms available: GCC Horticulture Dept, Nandanam (₹50 for 100g)\n- Also: Perungudi Waste Park demo unit (free guided session Saturdays)\n- Takes 3–4 weeks vs. 6–8 for regular compost\n- Rich "worm castings" sold for ₹30–50/kg at nurseries\n\n💡 Register with GCC Green Homes to get your free starter tray!` },

    // COOKED FOOD / TEMPLE PRASAD
    { keys: ['prasad','temple food','leftover food','excess food','surplus food'],
      reply: `🙏 **Leftover / Excess Food:**\n\n**Donate (safely):**\n- Feeding India (Zomato): donate via app\n- Robin Hood Army — WhatsApp: +91 98843 16641\n- No Waste Anna Nagar community group\n\n**If too old to donate:**\n- Home compost (best!)\n- Green Organic bin\n\n⚠️ Never throw food in Black bags/General bin — causes methane in landfill.` },
];

const ECOBOT_FALLBACK = [
    `🤔 I'm not sure about that specific item. Here's my general guidance:\n\n- 🔵 **Blue Bin:** Paper, plastic bottles, glass, metal, cardboard\n- 🟢 **Green Bin:** Food waste, vegetable peels, garden waste\n- 🔴 **Red Bin:** Diapers, sanitary waste, ceramics, styrofoam\n- ☣️ **Special:** E-waste, medicines, batteries → dedicated drop-off\n\n📞 Unsure? Call GCC: **1913** or ask me differently!`,
    `🌿 I don't have specific info on that, but you can:\n\n1. Check GCC Chennai's waste guidelines: chennaicorporation.gov.in\n2. Call GCC Helpline: **1913** (free, 24×7)\n3. Use the **AI Scanner** tab to photograph the item for a detailed analysis\n\nTry rephrasing — e.g. "where to dispose old phone" or "which bin for cardboard"`,
    `♻️ Great question! For items I'm not sure about, the safest rule:\n\n**When in doubt → Red General Bin** (avoids contaminating recyclables)\n\nBut first, ask yourself:\n- Is it clean and dry? → Blue Dry Waste\n- Is it food/plant-based? → Green Organic\n- Is it electronic/battery? → E-Waste centre\n\n💡 Use the **AI Scanner** for a photo-based answer!`
];
let fallbackIndex = 0;

function ecobotLocalResponse(userText) {
    const lower = userText.toLowerCase();
    // Try knowledge base
    for (const entry of ECOBOT_KB) {
        if (entry.keys.some(k => lower.includes(k))) {
            return entry.reply;
        }
    }
    // Rotating fallback
    const resp = ECOBOT_FALLBACK[fallbackIndex % ECOBOT_FALLBACK.length];
    fallbackIndex++;
    return resp;
}

function sendEcobotMessage() {
    if (ecobotTyping) return;
    const input = document.getElementById('ecobotInput');
    const text = input.value.trim();
    if (!text) return;

    input.value = ''; input.style.height = 'auto';
    document.getElementById('ecobotSuggestions').style.display = 'none';

    const name = (currentUser && currentUser.username) ? currentUser.username : 'You';
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    appendEcobotMsg('user', text, initials);

    // Simulate natural typing delay (400–900ms)
    ecobotTyping = true;
    document.getElementById('ecobotSendBtn').disabled = true;

    const typingId = 'typing-' + Date.now();
    const msgs = document.getElementById('ecobotMessages');
    msgs.insertAdjacentHTML('beforeend', `<div class="ecobot-msg bot typing-indicator" id="${typingId}"><div class="msg-avatar">🌿</div><div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div></div>`);
    msgs.scrollTop = msgs.scrollHeight;

    const delay = 400 + Math.random() * 500;
    setTimeout(() => {
        document.getElementById(typingId)?.remove();
        const reply = ecobotLocalResponseLang(text);
        appendEcobotMsg('bot', reply, '🌿');
        awardPoints(5, '🌿 +5 coins for using EcoBot!');
        ecobotTyping = false;
        document.getElementById('ecobotSendBtn').disabled = false;
        document.getElementById('ecobotInput').focus();
    }, delay);
}

function appendEcobotMsg(role, text, avatar) {
    const msgs = document.getElementById('ecobotMessages');
    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const safe = escapeHtml(text);
    const html = safe
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
    msgs.insertAdjacentHTML('beforeend', `<div class="ecobot-msg ${role}"><div class="msg-avatar">${role === 'user' ? escapeHtml(String(avatar)) : '🌿'}</div><div class="msg-bubble"><p>${html}</p><span class="msg-time">${now}</span></div></div>`);
    msgs.scrollTop = msgs.scrollHeight;
}



// ============================================================
// INIT ON LOAD
// ============================================================
/* DOMContentLoaded handled at bottom of app.js */
// ═══════════════════════════════════════════════════════════════════
// ECOWASTE PRO — AWARD EDITION FEATURES
// Dark Mode · i18n · Ward Impact · Global Leaderboard · AI Guide
// Voice Input · Demo Samples · Autopilot Mode · PWA
// ═══════════════════════════════════════════════════════════════════

// ── 1. DARK MODE ────────────────────────────────────────────────────
let isDark = false;
function toggleDarkMode() {
    isDark = !isDark;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : '');
    const btn = document.getElementById('themeModeBtn');
    if (btn) btn.textContent = isDark ? '☀️ Light' : '🌙 Dark';
    try { localStorage.setItem('ecowaste_theme', isDark ? 'dark' : 'light'); } catch(e){}
    updateChartsDarkMode();
}
function initTheme() {
    try {
        if (document.documentElement.getAttribute('data-theme') === 'dark') {
            isDark = true;
            const btn = document.getElementById('themeModeBtn');
            if (btn) btn.textContent = '☀️ Light';
        }
    } catch(e){}
}

// ── 2. INTERNATIONALISATION — English / Tamil / Hindi / Telugu ──────
const I18N = {
    en: {
        // API Banner
        api_disclaimer_text: 'EcoBot & AI Scanner both run 100% offline — no API key needed. Works anywhere, even without internet!',
        api_disclaimer_link: 'Learn more',
        // Login
        login_tagline: 'Smart Waste Management for a Sustainable Future',
        feat_scanner: 'AI Scanner', feat_scanner_sub: 'Identify waste instantly',
        feat_pickup: 'Request Pickup', feat_pickup_sub: 'On-demand collection',
        feat_rewards: 'Earn Rewards', feat_rewards_sub: 'Points for eco actions',
        feat_impact: 'Track Impact', feat_impact_sub: 'See your contribution',
        select_language: '🌐 Select Language',
        login_welcome: 'Welcome Back!', login_subtitle: 'Sign in to continue your eco journey',
        login_tab_email: 'Email', login_tab_phone: 'Phone',
        login_email_label: 'Email Address', login_email_ph: 'Enter your email',
        login_email_error: 'Please enter a valid email',
        login_password_label: 'Password', login_password_ph: 'Enter your password',
        login_password_error: 'Password is required',
        login_btn_email: 'Sign In with Email', login_btn_phone: 'Sign In with Phone',
        login_or: 'OR',
        login_no_account: "Don't have an account?", login_signup: 'Sign Up',
        hackathon_demo: '✨ HACKATHON DEMO',
        presentation_mode: 'Launch Presentation Mode', press_p: '(or press P)',
        demo_launch: 'Launch Demo Mode', demo_sub: 'Realistic data · No login needed',
        // Nav & Header
        nav_dashboard: 'Dashboard', nav_scanner: 'AI Scanner', nav_bins: 'My Bins',
        logout: 'Logout',
        // Tabs
        tab_dashboard: '📊 My Dashboard', tab_pickup: '🗑️ My Bins',
        tab_scanner: '🤖 AI Scanner', tab_map: '🗺️ Live City Map',
        tab_rewards: '🏆 Rewards', tab_guide: '📚 Recycling Guide',
        tab_community: '🏘️ Ward Challenges',
        // Hero
        hero_title: '🌍 Smart Waste Management Platform',
        // SDG
        sdg_label: '🌐 UN Sustainable Development Goals',
        sdg_11: 'Sustainable Cities', sdg_12: 'Responsible Consumption',
        sdg_13: 'Climate Action', sdg_17: 'Partnerships',
        sdg_co2_label: 'CO₂ saved this month', ward_name: 'Ward 12 · Anna Nagar East',
        // Dashboard
        dash_title: 'Your Waste Dashboard',
        stat_collections: 'Collections This Month', stat_collections_sub: '🌱 Start your journey!',
        stat_recycled: 'Recycled This Month', stat_recycled_sub: '🌱 Start recycling today!',
        stat_co2: 'CO₂ Saved', stat_co2_sub: '🌱 Make your first impact!',
        stat_points: 'Reward Points', stat_points_sub: '🏆 Earn points by scanning!',
        // Scanner
        scanner_title: '🤖 AI Waste Scanner',
        scanner_powered: 'Local AI Scanner · Works 100% Offline ✓',
        scanner_desc: 'Upload any waste photo — Claude identifies the item, classifies it, and gives you Chennai-specific disposal steps. Earn +15 points per scan!',
        upload_title: 'Upload or Capture Image',
        upload_sub: 'Click to browse or drag & drop',
        upload_hint: 'Supports JPG, PNG, WEBP · Max 5 MB',
        cat_plastic: 'Plastic', cat_organic: 'Organic', cat_hazardous: 'Hazardous', cat_ewaste: 'E-Waste',
        demo_samples_label: '— or try a built-in demo image —',
        demo_bottle: 'Plastic Bottle', demo_cardboard: 'Cardboard Box',
        demo_phone: 'Old Phone', demo_food: 'Food Scraps',
        analyse_btn: 'Analyse with Claude AI', clear_btn: '🗑️ Clear',
        no_analysis: 'No Analysis Yet', no_analysis_sub: 'Upload or capture an image to get started',
        recent_scans: '📋 Recent Scans', no_scans: 'No recent scans yet.',
        // Guide
        guide_title: '📚 Complete Recycling Guide',
        guide_subtitle: 'Ask AI about any item — get instant Chennai-specific disposal guidance.',
        guide_ai_ph: 'Type any item e.g. "milk carton", "old battery"…',
        // Emergency / Bins
        emergency_title: '🚨 Need Immediate Pickup?',
        emergency_sub: 'Request emergency collection for all full bins',
        emergency_btn: 'Request Emergency Pickup Now',
        bins_status: 'Your Bins Status',
        // Rewards
        rewards_title: '🌿 Your Green Rewards Hub',
        // Community
        ward_title: '🏘️ Ward 12 — Anna Nagar East',
        ward_subtitle: 'Join your neighbours in monthly sustainability challenges.',
        // Map
        map_title: '🗺️ Live City Dashboard',
        // EcoBot
        ecobot_ph: 'Ask about recycling, waste disposal…',
        ecobot_footer: '🌿 Local AI · Ward 12, Chennai · No API key needed',
        // Dynamic UI strings
        bin_capacity: 'Capacity', bin_last: 'Last',
        btn_request_pickup: '📞 Request Pickup', btn_requested: '✓ Requested',
        req_no_active: 'No active requests',
        req_emergency: 'EMERGENCY',
        req_on_the_way: '🚛 On The Way', req_pending: '⏳ Pending',
        req_eta: '⏰ ETA',
        scanner_no_analysis: 'No Analysis Yet',
        scanner_no_analysis_sub: 'Upload or capture an image',
        scanner_analysing: 'Claude AI is analysing your waste…',
        scanner_identifying: '🔍 Identifying item type…',
        scanner_material: '⏳ Material composition',
        scanner_category: '⏳ Waste category',
        scanner_recyclability: '⏳ Recyclability score',
        scanner_disposal: '⏳ Step-by-step disposal',
        scanner_guidance: '⏳ Chennai-specific guidance',
        scanner_checks_label: 'What Claude checks:',
        scanner_mat_done: '✅ Material composition',
        scanner_cat_done: '✅ Waste category',
        scanner_rec_done: '✅ Recyclability score',
        scanner_dis_done: '✅ Step-by-step disposal',
        scanner_gui_done: '✅ Chennai-specific guidance',
        scanner_step1: '🔬 Analysing materials…',
        scanner_step2: '🏷️ Classifying waste type…',
        scanner_step3: '♻️ Calculating eco impact…',
        scanner_step4: '🗺️ Fetching local guidance…',
        scanner_step5: '🤖 Finalising report…',
        scanner_no_scans: 'No recent scans yet.',
        result_ai_confidence: 'AI Confidence',
        result_overview: '📊 Overview',
        result_materials: '🔬 Materials',
        result_disposal: '🗑️ Disposal',
        result_reuse: '♻️ Reuse',
        result_eco_score: 'Eco Score',
        result_recyclable: 'Recyclable',
        result_hazard: 'Hazard',
        result_carbon: 'Carbon',
        result_decomposes: 'Decomposes',
        result_dispose_at: '📍 Dispose At',
        result_do_not: '🚫 Do NOT',
        result_tips: '💡 Tips',
        result_find_nearest: '📍 Find Nearest',
        result_report_dumping: '⚠️ Report Dumping',
        result_share: '🔗 Share',
        result_no_material: 'No material data available.',
        result_no_reuse: 'No reuse suggestions.',
        urgency_high: 'High Urgency', urgency_medium: 'Medium Urgency', urgency_low: 'Low Urgency',
        guide_ask_ai: 'Asking Claude AI…',
        guide_ai_answer: '🤖 AI Answer',
        notif_back_online: 'Back online!',
        notif_joined: 'Joined the challenge!', notif_left: 'Left the challenge.',
        notif_report: 'Illegal dumping reported!', notif_share: 'Result copied!',
        notif_find: 'Opening nearest facility…',
        challenge_join: '🤝 Join Challenge', challenge_joined: '✅ Joined — Contributing!',
        suggest_pizza: 'Can I recycle a pizza box?',
        suggest_medicine: 'Where to dispose old medicines?',
        suggest_compost: 'Compost at home in Chennai?',
        suggest_styrofoam: 'Is styrofoam recyclable?',
        // Statistics tab
        tab_statistics: '📈 Statistics',
        tab_certificate: '🎓 Certificate',
        stats_title: '📈 Your Waste Statistics',
        stat_recycling_rate: 'Recycling Rate', stat_recycling_rate_sub: '🌱 Start recycling!',
        stat_diverted: 'Total Waste Diverted', stat_diverted_sub: '🚀 Your journey begins now',
        stat_water: 'Water Saved', stat_water_sub: '♻️ Recycle to save water!',
        stat_energy: 'Energy Saved', stat_energy_sub: '🌳 Plant your first impact!',
        stat_co2_equiv: 'Your CO₂ Equivalent',
        stat_tree_desc: 'Equivalent to trees absorbing CO₂ for 1 month. Every scan counts!',
        chart_monthly: 'Monthly Waste Breakdown',
        chart_trend: 'Recycling Trend',
        chart_categories: 'Categories Distribution',
        // Rewards tab
        rewards_coins_label: 'Green Coins Collected',
        rewards_badges_title: '🎖️ Badges to Unlock',
        badge_planet: 'Planet Protector', badge_wizard: 'Waste Wizard',
        badge_ocean: 'Ocean Guardian', badge_zerowaste: 'Zero Waste Hero',
        badge_community: 'Community Leader', badge_carbon: 'Carbon Crusher',
        rewards_redeem_title: '🎁 Redeem Your Coins',
        reward_eco_store: 'Eco Store Voucher', reward_eco_store_desc: '500 coins = ₹100 off',
        reward_plant_tree: 'Plant a Tree', reward_plant_tree_desc: '300 coins = 1 tree planted',
        reward_bus_pass: 'Free Bus Pass', reward_bus_pass_desc: '400 coins = 1 day pass',
        reward_cafe: 'Café Discount', reward_cafe_desc: '150 coins = Free coffee',
        rewards_leaderboard_title: '🌍 Neighbourhood Green Board',
        // Community tab
        ward_members: 'Ward Members', ward_active_challenges: 'Active Challenges',
        ward_rank: 'Ward Rank (City)', ward_co2: "Month's CO₂ Saved",
        ward_leaderboard_title: '🏙️ City-Wide Ward Leaderboard',
        global_lb_title: '🌍 Global City Sustainability Leaderboard',
        ward_feed_title: '📢 Ward Activity Feed',
        // Certificate tab
        cert_title: '🎓 Your Impact Certificate',
        cert_subtitle: 'A verified record of your environmental contribution.',
        cert_eyebrow: 'This Certificate Proudly Recognises',
        cert_main_title: 'Environmental Impact Certificate',
        cert_certify: 'This is to certify that',
        cert_contribution: 'has made a measurable, verified contribution to environmental sustainability through responsible waste management.',
        cert_metric_recycled: 'Waste Recycled', cert_metric_co2: 'CO₂ Prevented',
        cert_metric_pickups: 'Pickups Done', cert_metric_challenges: 'Challenges',
        cert_platform: 'Certified Smart Waste Platform',
        cert_verified: '🔒 Verified Digital Certificate', cert_authentic: '✅ Authentic',
        cert_authority: 'Platform Authority',
        // EcoBot
        ecobot_greeting: "👋 Hi! I\'m EcoBot, your AI assistant for Ward 12. Ask me about waste classification, recycling, or how to earn more coins! 🪙",
    },

    ta: {
        api_disclaimer_text: 'EcoBot முழுவதும் offline-ல் இயங்குகிறது — API சாவி தேவையில்லை. AI Scanner Anthropic API பயன்படுத்துகிறது.',
        api_disclaimer_link: 'மேலும் அறிக',
        login_tagline: 'நிலையான எதிர்காலத்திற்கான நுண்ணறிவு கழிவு மேலாண்மை',
        feat_scanner: 'AI ஸ்கேனர்', feat_scanner_sub: 'கழிவை உடனடியாக அடையாளம் காணுங்கள்',
        feat_pickup: 'பிக்அப் கோரவும்', feat_pickup_sub: 'தேவைப்படும்போது சேகரிப்பு',
        feat_rewards: 'வெகுமானம் பெறுங்கள்', feat_rewards_sub: 'சுற்றுச்சூழல் செயல்களுக்கு புள்ளிகள்',
        feat_impact: 'தாக்கத்தை கண்காணிக்கவும்', feat_impact_sub: 'உங்கள் பங்களிப்பைப் பாருங்கள்',
        select_language: '🌐 மொழியைத் தேர்ந்தெடுக்கவும்',
        login_welcome: 'மீண்டும் வரவேற்கிறோம்!', login_subtitle: 'உங்கள் சுற்றுச்சூழல் பயணத்தை தொடரவும்',
        login_tab_email: 'மின்னஞ்சல்', login_tab_phone: 'தொலைபேசி',
        login_email_label: 'மின்னஞ்சல் முகவரி', login_email_ph: 'மின்னஞ்சலை உள்ளிடுக',
        login_email_error: 'சரியான மின்னஞ்சலை உள்ளிடுக',
        login_password_label: 'கடவுச்சொல்', login_password_ph: 'கடவுச்சொல்லை உள்ளிடுக',
        login_password_error: 'கடவுச்சொல் தேவை',
        login_btn_email: 'மின்னஞ்சலுடன் உள்நுழைக', login_btn_phone: 'தொலைபேசியுடன் உள்நுழைக',
        login_or: 'அல்லது',
        login_no_account: 'கணக்கு இல்லையா?', login_signup: 'பதிவு செய்யுங்கள்',
        hackathon_demo: '✨ ஹேக்கத்தான் டெமோ',
        presentation_mode: 'விளக்கக்காட்சி முறையை துவக்குக', press_p: '(அல்லது P அழுத்துக)',
        demo_launch: 'டெமோ முறையை துவக்குக', demo_sub: 'உண்மையான தரவு · உள்நுழைவு தேவையில்லை',
        nav_dashboard: 'டாஷ்போர்டு', nav_scanner: 'AI ஸ்கேனர்', nav_bins: 'என் கலன்கள்',
        logout: 'வெளியேறு',
        tab_dashboard: '📊 என் டாஷ்போர்டு', tab_pickup: '🗑️ என் கலன்கள்',
        tab_scanner: '🤖 AI ஸ்கேனர்', tab_map: '🗺️ நேரடி வரைபடம்',
        tab_rewards: '🏆 வெகுமானங்கள்', tab_guide: '📚 மறுசுழற்சி வழிகாட்டி',
        tab_community: '🏘️ வார்டு சவால்கள்',
        hero_title: '🌍 ஸ்மார்ட் கழிவு மேலாண்மை தளம்',
        sdg_label: '🌐 ஐ.நா. நிலையான வளர்ச்சி இலக்குகள்',
        sdg_11: 'நிலையான நகரங்கள்', sdg_12: 'பொறுப்பான நுகர்வு',
        sdg_13: 'காலநிலை நடவடிக்கை', sdg_17: 'கூட்டாண்மைகள்',
        sdg_co2_label: 'இந்த மாதம் CO₂ சேமிப்பு', ward_name: 'வார்டு 12 · அண்ணா நகர் கிழக்கு',
        dash_title: 'உங்கள் கழிவு டாஷ்போர்டு',
        stat_collections: 'இந்த மாதம் சேகரிப்புகள்', stat_collections_sub: '🌱 உங்கள் பயணத்தை தொடங்குங்கள்!',
        stat_recycled: 'இந்த மாதம் மறுசுழற்சி', stat_recycled_sub: '🌱 இன்று மறுசுழற்சி தொடங்குங்கள்!',
        stat_co2: 'CO₂ சேமிக்கப்பட்டது', stat_co2_sub: '🌱 உங்கள் முதல் தாக்கத்தை ஏற்படுத்துங்கள்!',
        stat_points: 'வெகுமான புள்ளிகள்', stat_points_sub: '🏆 ஸ்கேன் செய்து புள்ளிகள் பெறுங்கள்!',
        scanner_title: '🤖 AI கழிவு ஸ்கேனர்',
        scanner_powered: 'Local AI Scanner · 100% Offline-ல் இயங்குகிறது ✓',
        scanner_desc: 'எந்த கழிவு புகைப்படத்தையும் பதிவேற்றுங்கள் — Claude பொருளை அடையாளம் கண்டு சென்னை குறிப்பிட்ட வழிமுறைகளை தருகிறது. ஒவ்வொரு ஸ்கேனுக்கும் +15 புள்ளிகள்!',
        upload_title: 'படத்தை பதிவேற்றவும் அல்லது படமெடுக்கவும்',
        upload_sub: 'கிளிக் செய்து உலாவுக அல்லது இழுத்து விடுக',
        upload_hint: 'JPG, PNG, WEBP ஆதரிக்கப்படுகிறது · அதிகபட்சம் 5 MB',
        cat_plastic: 'பிளாஸ்டிக்', cat_organic: 'இயற்கை', cat_hazardous: 'ஆபத்தான', cat_ewaste: 'மின் கழிவு',
        demo_samples_label: '— அல்லது உள்ளமைக்கப்பட்ட டெமோ படத்தை முயற்சிக்கவும் —',
        demo_bottle: 'பிளாஸ்டிக் பாட்டில்', demo_cardboard: 'அட்டைப் பெட்டி',
        demo_phone: 'பழைய தொலைபேசி', demo_food: 'உணவு கழிவுகள்',
        analyse_btn: 'Claude AI உடன் பகுப்பாய்வு செய்க', clear_btn: '🗑️ அழிக்க',
        no_analysis: 'பகுப்பாய்வு இல்லை', no_analysis_sub: 'தொடங்க படத்தை பதிவேற்றவும்',
        recent_scans: '📋 சமீபத்திய ஸ்கேன்கள்', no_scans: 'இன்னும் ஸ்கேன்கள் இல்லை.',
        guide_title: '📚 முழுமையான மறுசுழற்சி வழிகாட்டி',
        guide_subtitle: 'எந்த பொருளைப் பற்றியும் AI கேளுங்கள் — உடனடி சென்னை வழிகாட்டுதல் பெறுங்கள்.',
        guide_ai_ph: 'எந்த பொருளையும் தட்டச்சு செய்யுங்கள்…',
        emergency_title: '🚨 உடனடி பிக்அப் வேண்டுமா?',
        emergency_sub: 'நிரம்பிய அனைத்து கலன்களுக்கும் அவசர சேகரிப்பு கோரவும்',
        emergency_btn: 'இப்போதே அவசர பிக்அப் கோரவும்',
        bins_status: 'உங்கள் கலன்களின் நிலை',
        rewards_title: '🌿 உங்கள் பச்சை வெகுமான மையம்',
        ward_title: '🏘️ வார்டு 12 — அண்ணா நகர் கிழக்கு',
        ward_subtitle: 'மாதாந்திர நிலைத்தன்மை சவால்களில் உங்கள் அண்டை வீட்டாரோடு சேருங்கள்.',
        map_title: '🗺️ நேரடி நகர டாஷ்போர்டு',
        ecobot_ph: 'மறுசுழற்சி, கழிவு அகற்றல் பற்றி கேளுங்கள்…',
        ecobot_footer: '🔒 Claude AI · வார்டு 12, சென்னை · GCC உடன் சரிபார்க்கவும்',
        // Dynamic UI strings
        bin_capacity: 'கொள்ளளவு', bin_last: 'கடைசி',
        btn_request_pickup: '📞 பிக்அப் கோரவும்', btn_requested: '✓ கோரப்பட்டது',
        req_no_active: 'செயலில் உள்ள கோரிக்கைகள் இல்லை',
        req_emergency: 'அவசரம்',
        req_on_the_way: '🚛 வழியில் உள்ளது', req_pending: '⏳ நிலுவையில்',
        req_eta: '⏰ ETA',
        scanner_no_analysis: 'பகுப்பாய்வு இல்லை',
        scanner_no_analysis_sub: 'தொடங்க படத்தை பதிவேற்றுங்கள்',
        scanner_analysing: 'Claude AI உங்கள் கழிவை பகுப்பாய்வு செய்கிறது…',
        scanner_identifying: '🔍 பொருளை அடையாளம் காண்கிறது…',
        scanner_material: '⏳ பொருள் கலவை',
        scanner_category: '⏳ கழிவு வகை',
        scanner_recyclability: '⏳ மறுசுழற்சி மதிப்பெண்',
        scanner_disposal: '⏳ படிப்படியான அகற்றல்',
        scanner_guidance: '⏳ சென்னை குறிப்பிட்ட வழிகாட்டுதல்',
        scanner_checks_label: 'Claude சரிபார்ப்பவை:',
        scanner_mat_done: '✅ பொருள் கலவை',
        scanner_cat_done: '✅ கழிவு வகை',
        scanner_rec_done: '✅ மறுசுழற்சி மதிப்பெண்',
        scanner_dis_done: '✅ படிப்படியான அகற்றல்',
        scanner_gui_done: '✅ சென்னை குறிப்பிட்ட வழிகாட்டுதல்',
        scanner_step1: '🔬 பொருட்களை பகுப்பாய்வு செய்கிறது…',
        scanner_step2: '🏷️ கழிவு வகையை வகைப்படுத்துகிறது…',
        scanner_step3: '♻️ சுற்றுச்சூழல் தாக்கத்தை கணக்கிடுகிறது…',
        scanner_step4: '🗺️ உள்ளூர் வழிகாட்டுதலை பெறுகிறது…',
        scanner_step5: '🤖 அறிக்கையை முடிக்கிறது…',
        scanner_no_scans: 'இன்னும் ஸ்கேன்கள் இல்லை.',
        result_ai_confidence: 'AI நம்பிக்கை',
        result_overview: '📊 கண்ணோட்டம்',
        result_materials: '🔬 பொருட்கள்',
        result_disposal: '🗑️ அகற்றல்',
        result_reuse: '♻️ மறுபயன்பாடு',
        result_eco_score: 'சுற்றுச்சூழல் மதிப்பெண்',
        result_recyclable: 'மறுசுழற்சி',
        result_hazard: 'ஆபத்து',
        result_carbon: 'கார்பன்',
        result_decomposes: 'மட்கும் காலம்',
        result_dispose_at: '📍 இங்கே அகற்றுங்கள்',
        result_do_not: '🚫 செய்யாதீர்கள்',
        result_tips: '💡 குறிப்புகள்',
        result_find_nearest: '📍 அருகிலுள்ளதை கண்டறி', result_report_dumping: '⚠️ சட்டவிரோத கழிவை புகார்செய்', result_share: '🔗 பகிர்',
        result_no_material: 'பொருள் தரவு இல்லை.',
        result_no_reuse: 'மறுபயன்பாட்டு பரிந்துரைகள் இல்லை.',
        urgency_high: 'அதிக அவசரம்', urgency_medium: 'நடுத்தர அவசரம்', urgency_low: 'குறைந்த அவசரம்',
        guide_ask_ai: 'Claude AI கேட்கிறது…',
        guide_ai_answer: '🤖 AI பதில்',
        notif_back_online: 'மீண்டும் ஆன்லைன்!',
        notif_joined: 'சவாலில் சேர்ந்தீர்கள்!', notif_left: 'சவாலை விட்டுவிட்டீர்கள்.',
        notif_report: 'சட்டவிரோத கழிவு புகாரளிக்கப்பட்டது!', notif_share: 'முடிவு நகலெடுக்கப்பட்டது!',
        notif_find: 'அருகிலுள்ள வசதியைத் திறக்கிறது…',
        challenge_join: '🤝 சவாலில் சேர்', challenge_joined: '✅ சேர்ந்தீர்கள் — பங்களிக்கிறீர்கள்!',
        suggest_pizza: 'பீஸ்ஸா பெட்டியை மறுசுழற்சி செய்யலாமா?',
        suggest_medicine: 'பழைய மருந்துகளை எங்கே அகற்றுவது?',
        suggest_compost: 'சென்னையில் வீட்டில் உரமிடுவது எப்படி?',
        suggest_styrofoam: 'ஸ்டைரோஃபோம் மறுசுழற்சி செய்யக்கூடியதா?',
        tab_statistics: '📈 புள்ளிவிவரங்கள்',
        tab_certificate: '🎓 சான்றிதழ்',
        stats_title: '📈 உங்கள் கழிவு புள்ளிவிவரங்கள்',
        stat_recycling_rate: 'மறுசுழற்சி விகிதம்', stat_recycling_rate_sub: '🌱 மறுசுழற்சி தொடங்குங்கள்!',
        stat_diverted: 'மொத்தம் திசை திருப்பப்பட்ட கழிவு', stat_diverted_sub: '🚀 உங்கள் பயணம் இப்போது தொடங்குகிறது',
        stat_water: 'சேமிக்கப்பட்ட நீர்', stat_water_sub: '♻️ நீர் சேமிக்க மறுசுழற்சி செய்யுங்கள்!',
        stat_energy: 'சேமிக்கப்பட்ட ஆற்றல்', stat_energy_sub: '🌳 உங்கள் முதல் தாக்கத்தை நட்டு வைக்கவும்!',
        stat_co2_equiv: 'உங்கள் CO₂ சமநிலை',
        stat_tree_desc: 'மாதம் CO₂ உறிஞ்சும் மரங்களுக்கு சமம். ஒவ்வொரு ஸ்கேனும் முக்கியம்!',
        chart_monthly: 'மாதாந்திர கழிவு பிரிவு',
        chart_trend: 'மறுசுழற்சி போக்கு',
        chart_categories: 'வகைகள் விநியோகம்',
        rewards_coins_label: 'பச்சை நாணயங்கள் சேகரிக்கப்பட்டன',
        rewards_badges_title: '🎖️ திறக்க வேண்டிய பதக்கங்கள்',
        badge_planet: 'கிரக பாதுகாவலர்', badge_wizard: 'கழிவு வல்லுநர்',
        badge_ocean: 'கடல் காவலர்', badge_zerowaste: 'ஜீரோ வேஸ்ட் ஹீரோ',
        badge_community: 'சமூக தலைவர்', badge_carbon: 'கார்பன் குறைப்பாளர்',
        rewards_redeem_title: '🎁 உங்கள் நாணயங்களை மாற்றுங்கள்',
        reward_eco_store: 'சுற்றுச்சூழல் கடை வাவுச்சர்', reward_eco_store_desc: '500 நாணயங்கள் = ₹100 தள்ளுபடி',
        reward_plant_tree: 'மரம் நட்டு வையுங்கள்', reward_plant_tree_desc: '300 நாணயங்கள் = 1 மரம் நடப்படும்',
        reward_bus_pass: 'இலவச பஸ் பாஸ்', reward_bus_pass_desc: '400 நாணயங்கள் = 1 நாள் பாஸ்',
        reward_cafe: 'கஃபே தள்ளுபடி', reward_cafe_desc: '150 நாணயங்கள் = இலவச காபி',
        rewards_leaderboard_title: '🌍 அண்டை வட்டார பச்சை பலகை',
        ward_members: 'வார்டு உறுப்பினர்கள்', ward_active_challenges: 'செயலில் உள்ள சவால்கள்',
        ward_rank: 'வார்டு தரவரிசை (நகரம்)', ward_co2: 'மாதத்தின் CO₂ சேமிப்பு',
        ward_leaderboard_title: '🏙️ நகர அளவிலான வார்டு தரவரிசை',
        global_lb_title: '🌍 உலக நகர நிலைத்தன்மை தரவரிசை',
        ward_feed_title: '📢 வார்டு செயல்பாடு ஊட்டம்',
        cert_title: '🎓 உங்கள் தாக்க சான்றிதழ்',
        cert_subtitle: 'உங்கள் சுற்றுச்சூழல் பங்களிப்பின் சரிபார்க்கப்பட்ட பதிவு.',
        cert_eyebrow: 'இந்த சான்றிதழ் பெருமையாக அங்கீகரிக்கிறது',
        cert_main_title: 'சுற்றுச்சூழல் தாக்க சான்றிதழ்',
        cert_certify: 'இதனால் சான்றளிக்கப்படுகிறது',
        cert_contribution: 'பொறுப்பான கழிவு மேலாண்மை மூலம் சுற்றுச்சூழல் நிலைத்தன்மைக்கு அளவிடக்கூடிய, சரிபார்க்கப்பட்ட பங்களிப்பை செய்திருக்கிறார்.',
        cert_metric_recycled: 'மறுசுழற்சி செய்யப்பட்ட கழிவு', cert_metric_co2: 'தடுக்கப்பட்ட CO₂',
        cert_metric_pickups: 'பிக்அப்கள் முடிந்தது', cert_metric_challenges: 'சவால்கள்',
        cert_platform: 'சான்றளிக்கப்பட்ட ஸ்மார்ட் கழிவு தளம்',
        cert_verified: '🔒 சரிபார்க்கப்பட்ட டிஜிட்டல் சான்றிதழ்', cert_authentic: '✅ உண்மையானது',
        cert_authority: 'தள அதிகாரம்',
        ecobot_greeting: "👋 வணக்கம்! நான் EcoBot, வார்டு 12-க்கான AI உதவியாளர். கழிவு வகைப்படுத்தல், மறுசுழற்சி அல்லது கூடுதல் நாணயங்கள் பற்றி கேளுங்கள்! 🪙",
    },

    hi: {
        api_disclaimer_text: 'EcoBot पूरी तरह ऑफलाइन चलता है — कोई API कुंजी नहीं चाहिए। AI Scanner Anthropic API उपयोग करता है।',
        api_disclaimer_link: 'अधिक जानें',
        login_tagline: 'टिकाऊ भविष्य के लिए स्मार्ट कचरा प्रबंधन',
        feat_scanner: 'AI स्कैनर', feat_scanner_sub: 'कचरे को तुरंत पहचानें',
        feat_pickup: 'पिकअप अनुरोध', feat_pickup_sub: 'मांग पर संग्रह',
        feat_rewards: 'पुरस्कार अर्जित करें', feat_rewards_sub: 'पर्यावरण कार्यों के लिए अंक',
        feat_impact: 'प्रभाव ट्रैक करें', feat_impact_sub: 'अपना योगदान देखें',
        select_language: '🌐 भाषा चुनें',
        login_welcome: 'वापस स्वागत है!', login_subtitle: 'अपनी पर्यावरण यात्रा जारी रखें',
        login_tab_email: 'ईमेल', login_tab_phone: 'फोन',
        login_email_label: 'ईमेल पता', login_email_ph: 'ईमेल दर्ज करें',
        login_email_error: 'कृपया मान्य ईमेल दर्ज करें',
        login_password_label: 'पासवर्ड', login_password_ph: 'पासवर्ड दर्ज करें',
        login_password_error: 'पासवर्ड आवश्यक है',
        login_btn_email: 'ईमेल से साइन इन', login_btn_phone: 'फोन से साइन इन',
        login_or: 'या',
        login_phone_label: 'फ़ोन नंबर',
        login_no_account: 'खाता नहीं है?', login_signup: 'साइन अप करें',
        hackathon_demo: '✨ हैकाथॉन डेमो',
        presentation_mode: 'प्रेजेंटेशन मोड लॉन्च करें', press_p: '(या P दबाएं)',
        demo_launch: 'डेमो मोड लॉन्च करें', demo_sub: 'यथार्थवादी डेटा · लॉगिन की जरूरत नहीं',
        nav_dashboard: 'डैशबोर्ड', nav_scanner: 'AI स्कैनर', nav_bins: 'मेरे डिब्बे',
        logout: 'लॉगआउट',
        tab_dashboard: '📊 मेरा डैशबोर्ड', tab_pickup: '🗑️ मेरे डिब्बे',
        tab_scanner: '🤖 AI स्कैनर', tab_map: '🗺️ लाइव सिटी मैप',
        tab_rewards: '🏆 पुरस्कार', tab_guide: '📚 रीसाइक्लिंग गाइड',
        tab_community: '🏘️ वार्ड चुनौतियाँ',
        hero_title: '🌍 स्मार्ट कचरा प्रबंधन प्लेटफॉर्म',
        sdg_label: '🌐 संयुक्त राष्ट्र सतत विकास लक्ष्य',
        sdg_11: 'टिकाऊ शहर', sdg_12: 'जिम्मेदार उपभोग',
        sdg_13: 'जलवायु कार्रवाई', sdg_17: 'साझेदारी',
        sdg_co2_label: 'इस महीने CO₂ बचत', ward_name: 'वार्ड 12 · अन्ना नगर पूर्व',
        dash_title: 'आपका कचरा डैशबोर्ड',
        stat_collections: 'इस महीने संग्रह', stat_collections_sub: '🌱 अपनी यात्रा शुरू करें!',
        stat_recycled: 'इस महीने रीसाइकल', stat_recycled_sub: '🌱 आज रीसाइक्लिंग शुरू करें!',
        stat_co2: 'CO₂ बचाया', stat_co2_sub: '🌱 पहला प्रभाव डालें!',
        stat_points: 'पुरस्कार अंक', stat_points_sub: '🏆 स्कैन करके अंक कमाएं!',
        scanner_title: '🤖 AI कचरा स्कैनर',
        scanner_powered: 'Local AI Scanner · 100% ऑफलाइन काम करता है ✓',
        scanner_desc: 'कोई भी कचरे की फोटो अपलोड करें — Claude आइटम पहचानता है और चेन्नई-विशिष्ट निपटान चरण देता है। प्रति स्कैन +15 अंक!',
        upload_title: 'छवि अपलोड करें या कैप्चर करें',
        upload_sub: 'ब्राउज़ करने के लिए क्लिक करें या खींचकर छोड़ें',
        upload_hint: 'JPG, PNG, WEBP समर्थित · अधिकतम 5 MB',
        cat_plastic: 'प्लास्टिक', cat_organic: 'जैविक', cat_hazardous: 'खतरनाक', cat_ewaste: 'ई-कचरा',
        demo_samples_label: '— या एक बिल्ट-इन डेमो छवि आज़माएं —',
        demo_bottle: 'प्लास्टिक बोतल', demo_cardboard: 'कार्डबोर्ड बॉक्स',
        demo_phone: 'पुराना फोन', demo_food: 'खाने के अवशेष',
        analyse_btn: 'Claude AI से विश्लेषण करें', clear_btn: '🗑️ साफ करें',
        no_analysis: 'कोई विश्लेषण नहीं', no_analysis_sub: 'शुरू करने के लिए छवि अपलोड करें',
        recent_scans: '📋 हाल के स्कैन', no_scans: 'अभी तक कोई स्कैन नहीं।',
        guide_title: '📚 पूर्ण रीसाइक्लिंग गाइड',
        guide_subtitle: 'किसी भी वस्तु के बारे में AI से पूछें — तुरंत चेन्नई-विशिष्ट मार्गदर्शन पाएं।',
        guide_ai_ph: 'कोई भी वस्तु टाइप करें जैसे "दूध का डिब्बा", "पुरानी बैटरी"…',
        emergency_title: '🚨 तत्काल पिकअप चाहिए?',
        emergency_sub: 'सभी भरे डिब्बों के लिए आपातकालीन संग्रह का अनुरोध करें',
        emergency_btn: 'अभी आपातकालीन पिकअप अनुरोध करें',
        bins_status: 'आपके डिब्बों की स्थिति',
        rewards_title: '🌿 आपका ग्रीन रिवॉर्ड्स हब',
        ward_title: '🏘️ वार्ड 12 — अन्ना नगर पूर्व',
        ward_subtitle: 'मासिक स्थिरता चुनौतियों में अपने पड़ोसियों से जुड़ें।',
        map_title: '🗺️ लाइव सिटी डैशबोर्ड',
        ecobot_ph: 'रीसाइक्लिंग, कचरा निपटान के बारे में पूछें…',
        ecobot_footer: '🔒 Claude AI · वार्ड 12, चेन्नई · GCC से सत्यापित करें',
        // Dynamic UI strings
        bin_capacity: 'क्षमता', bin_last: 'अंतिम',
        btn_request_pickup: '📞 पिकअप अनुरोध करें', btn_requested: '✓ अनुरोध किया',
        req_no_active: 'कोई सक्रिय अनुरोध नहीं',
        req_emergency: 'आपातकाल',
        req_on_the_way: '🚛 रास्ते में', req_pending: '⏳ लंबित',
        req_eta: '⏰ ETA',
        scanner_no_analysis: 'कोई विश्लेषण नहीं',
        scanner_no_analysis_sub: 'शुरू करने के लिए छवि अपलोड करें',
        scanner_analysing: 'Claude AI आपका कचरा विश्लेषण कर रहा है…',
        scanner_identifying: '🔍 वस्तु की पहचान कर रहा है…',
        scanner_material: '⏳ सामग्री संरचना',
        scanner_category: '⏳ कचरा श्रेणी',
        scanner_recyclability: '⏳ पुनर्चक्रण स्कोर',
        scanner_disposal: '⏳ चरण-दर-चरण निपटान',
        scanner_guidance: '⏳ चेन्नई-विशिष्ट मार्गदर्शन',
        scanner_checks_label: 'Claude क्या जाँचता है:',
        scanner_mat_done: '✅ सामग्री संरचना',
        scanner_cat_done: '✅ कचरा श्रेणी',
        scanner_rec_done: '✅ पुनर्चक्रण स्कोर',
        scanner_dis_done: '✅ चरण-दर-चरण निपटान',
        scanner_gui_done: '✅ चेन्नई-विशिष्ट मार्गदर्शन',
        scanner_step1: '🔬 सामग्री का विश्लेषण…',
        scanner_step2: '🏷️ कचरा वर्गीकरण…',
        scanner_step3: '♻️ पर्यावरण प्रभाव गणना…',
        scanner_step4: '🗺️ स्थानीय मार्गदर्शन प्राप्त…',
        scanner_step5: '🤖 रिपोर्ट अंतिम रूप दे रहा है…',
        scanner_no_scans: 'अभी तक कोई स्कैन नहीं।',
        result_ai_confidence: 'AI विश्वास',
        result_overview: '📊 अवलोकन',
        result_materials: '🔬 सामग्री',
        result_disposal: '🗑️ निपटान',
        result_reuse: '♻️ पुनः उपयोग',
        result_eco_score: 'इको स्कोर',
        result_recyclable: 'पुनर्चक्रण योग्य',
        result_hazard: 'खतरा',
        result_carbon: 'कार्बन',
        result_decomposes: 'विघटन',
        result_dispose_at: '📍 यहाँ निपटाएं',
        result_do_not: '🚫 न करें',
        result_tips: '💡 सुझाव',
        result_find_nearest: '📍 नजदीकी खोजें', result_report_dumping: '⚠️ अवैध डंपिंग रिपोर्ट करें', result_share: '🔗 शेयर करें',
        result_no_material: 'सामग्री डेटा उपलब्ध नहीं।',
        result_no_reuse: 'पुनः उपयोग सुझाव नहीं।',
        urgency_high: 'उच्च तात्कालिकता', urgency_medium: 'मध्यम तात्कालिकता', urgency_low: 'कम तात्कालिकता',
        guide_ask_ai: 'Claude AI से पूछ रहे हैं…',
        guide_ai_answer: '🤖 AI उत्तर',
        notif_back_online: 'फिर से ऑनलाइन!',
        notif_joined: 'चुनौती में शामिल!', notif_left: 'चुनौती छोड़ी।',
        notif_report: 'अवैध डंपिंग रिपोर्ट की!', notif_share: 'परिणाम कॉपी हुआ!',
        notif_find: 'नजदीकी सुविधा खोल रहे हैं…',
        challenge_join: '🤝 चुनौती में शामिल हों', challenge_joined: '✅ शामिल — योगदान दे रहे हैं!',
        suggest_pizza: 'क्या पिज्जा बॉक्स रीसाइकल हो सकता है?',
        suggest_medicine: 'पुरानी दवाइयाँ कहाँ फेंकें?',
        suggest_compost: 'चेन्नई में घर पर खाद बनाएं?',
        suggest_styrofoam: 'क्या स्टायरोफोम रीसाइकल होता है?',
        tab_statistics: '📈 सांख्यिकी',
        tab_certificate: '🎓 प्रमाणपत्र',
        stats_title: '📈 आपका कचरा सांख्यिकी',
        stat_recycling_rate: 'रीसाइक्लिंग दर', stat_recycling_rate_sub: '🌱 रीसाइक्लिंग शुरू करें!',
        stat_diverted: 'कुल कचरा विचलित', stat_diverted_sub: '🚀 आपकी यात्रा अभी शुरू होती है',
        stat_water: 'पानी बचाया', stat_water_sub: '♻️ पानी बचाने के लिए रीसाइकिल करें!',
        stat_energy: 'ऊर्जा बचाई', stat_energy_sub: '🌳 अपना पहला प्रभाव लगाएं!',
        stat_co2_equiv: 'आपका CO₂ समतुल्य',
        stat_tree_desc: 'महीने के लिए CO₂ अवशोषित करने वाले पेड़ों के बराबर। हर स्कैन मायने रखता है!',
        chart_monthly: 'मासिक कचरा विवरण',
        chart_trend: 'रीसाइक्लिंग प्रवृत्ति',
        chart_categories: 'श्रेणी वितरण',
        rewards_coins_label: 'हरे सिक्के एकत्रित',
        rewards_badges_title: '🎖️ अनलॉक करने वाले बैज',
        badge_planet: 'ग्रह रक्षक', badge_wizard: 'कचरा विशेषज्ञ',
        badge_ocean: 'समुद्र संरक्षक', badge_zerowaste: 'जीरो वेस्ट हीरो',
        badge_community: 'समुदाय नेता', badge_carbon: 'कार्बन क्रशर',
        rewards_redeem_title: '🎁 अपने सिक्के भुनाएं',
        reward_eco_store: 'इको स्टोर वाउचर', reward_eco_store_desc: '500 सिक्के = ₹100 की छूट',
        reward_plant_tree: 'पेड़ लगाएं', reward_plant_tree_desc: '300 सिक्के = 1 पेड़ लगाया जाएगा',
        reward_bus_pass: 'मुफ्त बस पास', reward_bus_pass_desc: '400 सिक्के = 1 दिन का पास',
        reward_cafe: 'कैफे छूट', reward_cafe_desc: '150 सिक्के = मुफ्त कॉफी',
        rewards_leaderboard_title: '🌍 पड़ोस हरित बोर्ड',
        ward_members: 'वार्ड सदस्य', ward_active_challenges: 'सक्रिय चुनौतियाँ',
        ward_rank: 'वार्ड रैंक (शहर)', ward_co2: 'महीने की CO₂ बचत',
        ward_leaderboard_title: '🏙️ शहर-व्यापी वार्ड लीडरबोर्ड',
        global_lb_title: '🌍 वैश्विक शहर स्थिरता लीडरबोर्ड',
        ward_feed_title: '📢 वार्ड गतिविधि फ़ीड',
        cert_title: '🎓 आपका प्रभाव प्रमाणपत्र',
        cert_subtitle: 'आपके पर्यावरणीय योगदान का एक सत्यापित रिकॉर्ड।',
        cert_eyebrow: 'यह प्रमाणपत्र गर्व से मान्यता देता है',
        cert_main_title: 'पर्यावरणीय प्रभाव प्रमाणपत्र',
        cert_certify: 'यह प्रमाणित किया जाता है कि',
        cert_contribution: 'ने जिम्मेदार कचरा प्रबंधन के माध्यम से पर्यावरणीय स्थिरता में मापने योग्य, सत्यापित योगदान दिया है।',
        cert_metric_recycled: 'कचरा पुनर्चक्रित', cert_metric_co2: 'CO₂ रोका गया',
        cert_metric_pickups: 'पिकअप पूर्ण', cert_metric_challenges: 'चुनौतियाँ',
        cert_platform: 'प्रमाणित स्मार्ट कचरा प्लेटफॉर्म',
        cert_verified: '🔒 सत्यापित डिजिटल प्रमाणपत्र', cert_authentic: '✅ प्रामाणिक',
        cert_authority: 'प्लेटफॉर्म प्राधिकरण',
        ecobot_greeting: "👋 नमस्ते! मैं EcoBot हूं, वार्ड 12 का AI सहायक। कचरा वर्गीकरण, रीसाइक्लिंग या अधिक सिक्के कमाने के बारे में पूछें! 🪙",
    },

    te: {
        api_disclaimer_text: 'డెమో ఒక శాండ్‌బాక్స్‌డ్ API కీని ఉపయోగిస్తుంది — ప్రొడక్షన్ సురక్షిత బ్యాకెండ్ ప్రాక్సీ ద్వారా వెళ్తుంది.',
        api_disclaimer_link: 'మరింత తెలుసుకోండి',
        login_tagline: 'స్థిరమైన భవిష్యత్తుకు స్మార్ట్ వ్యర్థ నిర్వహణ',
        feat_scanner: 'AI స్కానర్', feat_scanner_sub: 'వ్యర్థాన్ని తక్షణమే గుర్తించండి',
        feat_pickup: 'పికప్ అభ్యర్థించండి', feat_pickup_sub: 'డిమాండ్‌పై సేకరణ',
        feat_rewards: 'రివార్డులు సంపాదించండి', feat_rewards_sub: 'పర్యావరణ చర్యలకు పాయింట్లు',
        feat_impact: 'ప్రభావాన్ని ట్రాక్ చేయండి', feat_impact_sub: 'మీ సహకారం చూడండి',
        select_language: '🌐 భాష ఎంచుకోండి',
        login_welcome: 'తిరిగి స్వాగతం!', login_subtitle: 'మీ పర్యావరణ ప్రయాణాన్ని కొనసాగించండి',
        login_tab_email: 'ఈమెయిల్', login_tab_phone: 'ఫోన్',
        login_email_label: 'ఈమెయిల్ చిరునామా', login_email_ph: 'ఈమెయిల్ నమోదు చేయండి',
        login_email_error: 'దయచేసి చెల్లుబాటు అయ్యే ఈమెయిల్ నమోదు చేయండి',
        login_password_label: 'పాస్‌వర్డ్', login_password_ph: 'పాస్‌వర్డ్ నమోదు చేయండి',
        login_password_error: 'పాస్‌వర్డ్ అవసరం',
        login_btn_email: 'ఈమెయిల్‌తో సైన్ ఇన్', login_btn_phone: 'ఫోన్‌తో సైన్ ఇన్',
        login_or: 'లేదా',
        login_phone_label: 'ఫోన్ నంబర్',
        login_no_account: 'ఖాతా లేదా?', login_signup: 'సైన్ అప్ చేయండి',
        hackathon_demo: '✨ హ్యాకథాన్ డెమో',
        presentation_mode: 'ప్రెజెంటేషన్ మోడ్ లాంచ్ చేయండి', press_p: '(లేదా P నొక్కండి)',
        demo_launch: 'డెమో మోడ్ లాంచ్ చేయండి', demo_sub: 'నిజమైన డేటా · లాగిన్ అవసరం లేదు',
        nav_dashboard: 'డాష్‌బోర్డ్', nav_scanner: 'AI స్కానర్', nav_bins: 'నా బిన్లు',
        logout: 'లాగ్అవుట్',
        tab_dashboard: '📊 నా డాష్‌బోర్డ్', tab_pickup: '🗑️ నా బిన్లు',
        tab_scanner: '🤖 AI స్కానర్', tab_map: '🗺️ లైవ్ సిటీ మ్యాప్',
        tab_rewards: '🏆 రివార్డులు', tab_guide: '📚 రీసైక్లింగ్ గైడ్',
        tab_community: '🏘️ వార్డ్ సవాళ్లు',
        hero_title: '🌍 స్మార్ట్ వ్యర్థ నిర్వహణ వేదిక',
        sdg_label: '🌐 ఐక్యరాజ్యసమితి సుస్థిర అభివృద్ధి లక్ష్యాలు',
        sdg_11: 'సుస్థిర నగరాలు', sdg_12: 'బాధ్యతాయుత వినియోగం',
        sdg_13: 'వాతావరణ చర్య', sdg_17: 'భాగస్వామ్యాలు',
        sdg_co2_label: 'ఈ నెల CO₂ ఆదా', ward_name: 'వార్డ్ 12 · అన్నా నగర్ తూర్పు',
        dash_title: 'మీ వ్యర్థ డాష్‌బోర్డ్',
        stat_collections: 'ఈ నెల సేకరణలు', stat_collections_sub: '🌱 మీ ప్రయాణం ప్రారంభించండి!',
        stat_recycled: 'ఈ నెల రీసైకిల్', stat_recycled_sub: '🌱 ఈరోజే రీసైక్లింగ్ ప్రారంభించండి!',
        stat_co2: 'CO₂ ఆదా చేయబడింది', stat_co2_sub: '🌱 మీ మొదటి ప్రభావం చూపండి!',
        stat_points: 'రివార్డ్ పాయింట్లు', stat_points_sub: '🏆 స్కాన్ చేసి పాయింట్లు సంపాదించండి!',
        scanner_title: '🤖 AI వ్యర్థ స్కానర్',
        scanner_powered: 'Local AI Scanner · 100% Offline లో పని చేస్తుంది ✓',
        scanner_desc: 'ఏదైనా వ్యర్థ ఫోటో అప్‌లోడ్ చేయండి — Claude వస్తువును గుర్తించి చెన్నై-నిర్దిష్ట నిర్మూలన దశలు ఇస్తుంది. ప్రతి స్కాన్‌కు +15 పాయింట్లు!',
        upload_title: 'చిత్రాన్ని అప్‌లోడ్ చేయండి లేదా క్యాప్చర్ చేయండి',
        upload_sub: 'బ్రౌజ్ చేయడానికి క్లిక్ చేయండి లేదా లాగి వదలండి',
        upload_hint: 'JPG, PNG, WEBP మద్దతు · గరిష్టంగా 5 MB',
        cat_plastic: 'ప్లాస్టిక్', cat_organic: 'సేంద్రీయ', cat_hazardous: 'ప్రమాదకరమైన', cat_ewaste: 'ఈ-వ్యర్థం',
        demo_samples_label: '— లేదా అంతర్నిర్మిత డెమో చిత్రాన్ని ప్రయత్నించండి —',
        demo_bottle: 'ప్లాస్టిక్ బాటిల్', demo_cardboard: 'కార్డ్‌బోర్డ్ బాక్స్',
        demo_phone: 'పాత ఫోన్', demo_food: 'ఆహార వ్యర్థాలు',
        analyse_btn: 'Claude AI తో విశ్లేషించండి', clear_btn: '🗑️ క్లియర్',
        no_analysis: 'విశ్లేషణ లేదు', no_analysis_sub: 'ప్రారంభించడానికి చిత్రాన్ని అప్‌లోడ్ చేయండి',
        recent_scans: '📋 ఇటీవలి స్కాన్లు', no_scans: 'ఇంకా స్కాన్లు లేవు.',
        guide_title: '📚 పూర్తి రీసైక్లింగ్ గైడ్',
        guide_subtitle: 'ఏ వస్తువు గురించైనా AI ని అడగండి — తక్షణ చెన్నై-నిర్దిష్ట మార్గదర్శకత్వం పొందండి.',
        guide_ai_ph: 'ఏదైనా వస్తువు టైప్ చేయండి ఉదా. "పాల కార్టన్", "పాత బ్యాటరీ"…',
        emergency_title: '🚨 తక్షణ పికప్ కావాలా?',
        emergency_sub: 'నిండిన అన్ని బిన్లకు అత్యవసర సేకరణ అభ్యర్థించండి',
        emergency_btn: 'ఇప్పుడే అత్యవసర పికప్ అభ్యర్థించండి',
        bins_status: 'మీ బిన్ స్థితి',
        rewards_title: '🌿 మీ గ్రీన్ రివార్డ్స్ హబ్',
        ward_title: '🏘️ వార్డ్ 12 — అన్నా నగర్ తూర్పు',
        ward_subtitle: 'నెలవారీ స్థిరత్వ సవాళ్లలో మీ పొరుగువారితో చేరండి.',
        map_title: '🗺️ లైవ్ సిటీ డాష్‌బోర్డ్',
        ecobot_ph: 'రీసైక్లింగ్, వ్యర్థ నిర్మూలన గురించి అడగండి…',
        ecobot_footer: '🔒 Claude AI · వార్డ్ 12, చెన్నై · GCC తో ధృవీకరించండి',
        // Dynamic UI strings
        bin_capacity: 'సామర్థ్యం', bin_last: 'చివరిది',
        btn_request_pickup: '📞 పికప్ అభ్యర్థించండి', btn_requested: '✓ అభ్యర్థించబడింది',
        req_no_active: 'క్రియాశీల అభ్యర్థనలు లేవు',
        req_emergency: 'అత్యవసరం',
        req_on_the_way: '🚛 దారిలో ఉంది', req_pending: '⏳ పెండింగ్',
        req_eta: '⏰ ETA',
        scanner_no_analysis: 'విశ్లేషణ లేదు',
        scanner_no_analysis_sub: 'ప్రారంభించడానికి చిత్రాన్ని అప్‌లోడ్ చేయండి',
        scanner_analysing: 'Claude AI మీ వ్యర్థాన్ని విశ్లేషిస్తోంది…',
        scanner_identifying: '🔍 వస్తువును గుర్తిస్తోంది…',
        scanner_material: '⏳ పదార్థ కూర్పు',
        scanner_category: '⏳ వ్యర్థ వర్గం',
        scanner_recyclability: '⏳ రీసైక్లింగ్ స్కోర్',
        scanner_disposal: '⏳ దశల వారీ నిర్మూలన',
        scanner_guidance: '⏳ చెన్నై-నిర్దిష్ట మార్గదర్శకత్వం',
        scanner_checks_label: 'Claude తనిఖీ చేసేవి:',
        scanner_mat_done: '✅ పదార్థ కూర్పు',
        scanner_cat_done: '✅ వ్యర్థ వర్గం',
        scanner_rec_done: '✅ రీసైక్లింగ్ స్కోర్',
        scanner_dis_done: '✅ దశల వారీ నిర్మూలన',
        scanner_gui_done: '✅ చెన్నై-నిర్దిష్ట మార్గదర్శకత్వం',
        scanner_step1: '🔬 పదార్థాలు విశ్లేషిస్తోంది…',
        scanner_step2: '🏷️ వ్యర్థ రకాన్ని వర్గీకరిస్తోంది…',
        scanner_step3: '♻️ పర్యావరణ ప్రభావం లెక్కిస్తోంది…',
        scanner_step4: '🗺️ స్థానిక మార్గదర్శకత్వం తీసుకుంటోంది…',
        scanner_step5: '🤖 నివేదికను ఖరారు చేస్తోంది…',
        scanner_no_scans: 'ఇంకా స్కాన్లు లేవు.',
        result_ai_confidence: 'AI నమ్మకం',
        result_overview: '📊 సారాంశం',
        result_materials: '🔬 పదార్థాలు',
        result_disposal: '🗑️ నిర్మూలన',
        result_reuse: '♻️ పునర్వినియోగం',
        result_eco_score: 'పర్యావరణ స్కోర్',
        result_recyclable: 'రీసైక్లింగ్ యోగ్యం',
        result_hazard: 'ప్రమాదం',
        result_carbon: 'కార్బన్',
        result_decomposes: 'కుళ్ళిపోవు సమయం',
        result_dispose_at: '📍 ఇక్కడ వదిలించుకోండి',
        result_do_not: '🚫 చేయకూడదు',
        result_tips: '💡 చిట్కాలు',
        result_find_nearest: '📍 సమీపంలోనిది కనుగొనండి', result_report_dumping: '⚠️ అక్రమ డంపింగ్ నివేదించండి', result_share: '🔗 షేర్',
        result_no_material: 'పదార్థ డేటా అందుబాటులో లేదు.',
        result_no_reuse: 'పునర్వినియోగ సూచనలు లేవు.',
        urgency_high: 'అధిక అత్యవసరత', urgency_medium: 'మధ్యస్థ అత్యవసరత', urgency_low: 'తక్కువ అత్యవసరత',
        guide_ask_ai: 'Claude AI ని అడుగుతోంది…',
        guide_ai_answer: '🤖 AI సమాధానం',
        notif_back_online: 'మళ్ళీ ఆన్‌లైన్!',
        notif_joined: 'సవాలులో చేరారు!', notif_left: 'సవాలు విడిచారు.',
        notif_report: 'అక్రమ డంపింగ్ నివేదించబడింది!', notif_share: 'ఫలితం కాపీ అయింది!',
        notif_find: 'సమీప సౌకర్యాన్ని తెరుస్తోంది…',
        challenge_join: '🤝 సవాలులో చేరండి', challenge_joined: '✅ చేరారు — సహకరిస్తున్నారు!',
        suggest_pizza: 'పిజ్జా బాక్స్ రీసైకిల్ చేయవచ్చా?',
        suggest_medicine: 'పాత మందులు ఎక్కడ వదిలించుకోవాలి?',
        suggest_compost: 'చెన్నైలో ఇంట్లో కంపోస్ట్ చేయడం ఎలా?',
        suggest_styrofoam: 'స్టైరోఫోమ్ రీసైకిల్ అవుతుందా?',
        tab_statistics: '📈 గణాంకాలు',
        tab_certificate: '🎓 సర్టిఫికెట్',
        stats_title: '📈 మీ వ్యర్థ గణాంకాలు',
        stat_recycling_rate: 'రీసైక్లింగ్ రేటు', stat_recycling_rate_sub: '🌱 రీసైక్లింగ్ ప్రారంభించండి!',
        stat_diverted: 'మళ్ళించబడిన మొత్తం వ్యర్థం', stat_diverted_sub: '🚀 మీ ప్రయాణం ఇప్పుడు ప్రారంభమవుతోంది',
        stat_water: 'ఆదా చేసిన నీరు', stat_water_sub: '♻️ నీరు ఆదా చేయడానికి రీసైకిల్ చేయండి!',
        stat_energy: 'ఆదా చేసిన శక్తి', stat_energy_sub: '🌳 మీ మొదటి ప్రభావం నాటండి!',
        stat_co2_equiv: 'మీ CO₂ సమానం',
        stat_tree_desc: 'నెల పాటు CO₂ గ్రహించే చెట్లకు సమానం. ప్రతి స్కాన్ ముఖ్యం!',
        chart_monthly: 'నెలవారీ వ్యర్థ వివరణ',
        chart_trend: 'రీసైక్లింగ్ ధోరణి',
        chart_categories: 'వర్గాల పంపిణీ',
        rewards_coins_label: 'గ్రీన్ కాయిన్లు సేకరించబడ్డాయి',
        rewards_badges_title: '🎖️ అన్‌లాక్ చేయవలసిన బ్యాడ్జిలు',
        badge_planet: 'గ్రహ రక్షకుడు', badge_wizard: 'వ్యర్థ నిపుణుడు',
        badge_ocean: 'సముద్ర సంరక్షకుడు', badge_zerowaste: 'జీరో వేస్ట్ హీరో',
        badge_community: 'కమ్యూనిటీ లీడర్', badge_carbon: 'కార్బన్ క్రషర్',
        rewards_redeem_title: '🎁 మీ కాయిన్లు రీడీమ్ చేయండి',
        reward_eco_store: 'ఎకో స్టోర్ వోచర్', reward_eco_store_desc: '500 కాయిన్లు = ₹100 తగ్గింపు',
        reward_plant_tree: 'చెట్టు నాటండి', reward_plant_tree_desc: '300 కాయిన్లు = 1 చెట్టు నాటబడుతుంది',
        reward_bus_pass: 'ఉచిత బస్ పాస్', reward_bus_pass_desc: '400 కాయిన్లు = 1 రోజు పాస్',
        reward_cafe: 'కేఫే తగ్గింపు', reward_cafe_desc: '150 కాయిన్లు = ఉచిత కాఫీ',
        rewards_leaderboard_title: '🌍 పొరుగు గ్రీన్ బోర్డు',
        ward_members: 'వార్డ్ సభ్యులు', ward_active_challenges: 'క్రియాశీల సవాళ్లు',
        ward_rank: 'వార్డ్ ర్యాంక్ (నగరం)', ward_co2: "నెల CO₂ ఆదా",
        ward_leaderboard_title: '🏙️ నగర-వ్యాప్త వార్డ్ లీడర్‌బోర్డ్',
        global_lb_title: '🌍 గ్లోబల్ సిటీ సస్టైనబిలిటీ లీడర్‌బోర్డ్',
        ward_feed_title: '📢 వార్డ్ యాక్టివిటీ ఫీడ్',
        cert_title: '🎓 మీ ఇంపాక్ట్ సర్టిఫికెట్',
        cert_subtitle: 'మీ పర్యావరణ సహకారం యొక్క ధృవీకరించబడిన రికార్డు.',
        cert_eyebrow: 'ఈ సర్టిఫికెట్ గర్వంగా గుర్తిస్తుంది',
        cert_main_title: 'పర్యావరణ ప్రభావ సర్టిఫికెట్',
        cert_certify: 'దీనిద్వారా ధృవీకరించబడింది',
        cert_contribution: 'బాధ్యతాయుత వ్యర్థ నిర్వహణ ద్వారా పర్యావరణ స్థిరత్వానికి కొలవగల, ధృవీకరించబడిన సహకారం చేసారు.',
        cert_metric_recycled: 'రీసైకిల్ చేసిన వ్యర్థం', cert_metric_co2: 'నిరోధించబడిన CO₂',
        cert_metric_pickups: 'పూర్తైన పికప్‌లు', cert_metric_challenges: 'సవాళ్లు',
        cert_platform: 'సర్టిఫైడ్ స్మార్ట్ వేస్ట్ ప్లాట్‌ఫారమ్',
        cert_verified: '🔒 ధృవీకరించబడిన డిజిటల్ సర్టిఫికెట్', cert_authentic: '✅ అసలైనది',
        cert_authority: 'ప్లాట్‌ఫారమ్ అథారిటీ',
        ecobot_greeting: "👋 నమస్కారం! నేను EcoBot, వార్డ్ 12 కోసం AI సహాయకుడను. వ్యర్థ వర్గీకరణ, రీసైక్లింగ్ గురించి అడగండి! 🪙",
    }
};
let currentLang = localStorage.getItem('ecowaste_lang') || 'en';
function t(key) {
    const lang = I18N[currentLang] || I18N.en;
    return lang[key] !== undefined ? lang[key] : (I18N.en[key] || key);
}
function setLang(lang, silent = false) {
    currentLang = lang;
    try { localStorage.setItem('ecowaste_lang', lang); } catch(e) {}
    const tr = I18N[lang];
    if (!tr) return;

    // Translate all static data-i18n elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const k = el.getAttribute('data-i18n');
        if (tr[k] !== undefined) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = tr[k];
            } else {
                el.textContent = tr[k];
            }
        }
    });

    // Translate placeholder attributes via data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const k = el.getAttribute('data-i18n-placeholder');
        if (tr[k] !== undefined) el.placeholder = tr[k];
    });

    // Update EcoBot textarea placeholder directly
    const ecobotInput = document.getElementById('ecobotInput');
    if (ecobotInput && tr.ecobot_ph) ecobotInput.placeholder = tr.ecobot_ph;

    // Re-render all dynamic sections so they pick up the new language
    // Skip if silent (called on login — startApp will render these itself)
    if (!silent) {
        renderBins();
        renderActiveRequests();

        // Re-render scanner "empty" state if no result is showing
        const scanResults = document.getElementById('scannerResults');
        if (scanResults && scanResults.querySelector('h3') &&
            scanResults.querySelector('h3').textContent.match(/No Analysis|विश्लेषण|பகுப்பாய்வு|విశ్లేషణ|noch keine/i)) {
            scanResults.innerHTML = `<div style="text-align:center;padding:3rem;color:#999"><div style="font-size:4rem;margin-bottom:1rem">🔍</div><h3>${t('scanner_no_analysis')}</h3><p>${t('scanner_no_analysis_sub')}</p></div>`;
        }

        // Re-render recent scans (for "no scans" message)
        displayRecentScans();
    }

    // Sync login page language buttons
    document.querySelectorAll('.login-lang-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === lang);
    });

    // Sync in-app header language buttons
    document.querySelectorAll('.header-lang-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === lang);
    });

    // Update html lang attribute
    const langMap = { en: 'en', ta: 'ta', hi: 'hi', te: 'te' };
    document.documentElement.lang = langMap[lang] || lang;

    // Notification — skip if silent (login flow)
    if (!silent) {
        const langNames = { en: 'English', ta: 'தமிழ்', hi: 'हिंदी', te: 'తెలుగు' };
        showNotification('🌐', `${langNames[lang] || lang}`);
    }
}

// ── 3. WARD IMPACT COUNTER ──────────────────────────────────────────
function countUp(el, target, suffix, ms) {
    if (!el) return;
    let v = 0, step = target / (ms / 16);
    const t = setInterval(() => {
        v = Math.min(v + step, target);
        el.textContent = (Number.isInteger(target) ? Math.floor(v) : v.toFixed(1)) + (suffix||'');
        if (v >= target) clearInterval(t);
    }, 16);
}
function initWardImpact() {
    countUp(document.getElementById('wibTonnes'),  4.2,  't CO₂', 1800);
    countUp(document.getElementById('wibKg'),      18700,'kg',    2000);
    countUp(document.getElementById('wibScans'),   1247, '',      1600);
    countUp(document.getElementById('wibMembers'), 847,  '',      1400);
}

// ── 4. GLOBAL CITIES LEADERBOARD ────────────────────────────────────
const WORLD_CITIES = [
    { rank:'🥇', flag:'🇸🇬', city:'Singapore',      country:'Singapore',     score:9840, pct:100, trend:'+2.1%' },
    { rank:'🥈', flag:'🇩🇪', city:'Berlin',          country:'Germany',       score:9210, pct:93,  trend:'+1.4%' },
    { rank:'🥉', flag:'🇯🇵', city:'Osaka',           country:'Japan',         score:8970, pct:91,  trend:'+0.8%' },
    { rank:'4',  flag:'🇳🇱', city:'Amsterdam',       country:'Netherlands',   score:8600, pct:87,  trend:'+1.9%' },
    { rank:'5',  flag:'🇰🇷', city:'Seoul',           country:'South Korea',   score:8340, pct:85,  trend:'+3.2%' },
    { rank:'6',  flag:'🇿🇦', city:'Cape Town',       country:'South Africa',  score:7820, pct:79,  trend:'+4.1%' },
    { rank:'7',  flag:'🇧🇷', city:'Curitiba',        country:'Brazil',        score:7450, pct:76,  trend:'+2.7%' },
    { rank:'📍', flag:'🇮🇳', city:'Chennai — Ward 12', country:'India',       score:6890, pct:70,  trend:'+6.8% ↑↑', mine:true },
    { rank:'9',  flag:'🇳🇬', city:'Lagos',           country:'Nigeria',       score:5920, pct:60,  trend:'+8.4%' },
    { rank:'10', flag:'🇰🇪', city:'Nairobi',         country:'Kenya',         score:5430, pct:55,  trend:'+7.2%' },
];
function renderGlobalLb() {
    const el = document.getElementById('globalCitiesLb');
    if (!el) return;
    el.innerHTML = WORLD_CITIES.map(c => `
        <div class="global-lb-row${c.mine?' my-city':''}">
            <div class="glb-rank">${c.rank}</div>
            <div class="glb-flag">${c.flag}</div>
            <div class="glb-info">
                <div class="glb-city">${c.city}${c.mine?' 🏠':''}</div>
                <div class="glb-country">${c.country}</div>
            </div>
            <div class="glb-score-col">
                <div class="glb-val">${c.score.toLocaleString()}</div>
                <div class="glb-trend">${c.trend}</div>
                <div class="glb-bar-wrap"><div class="glb-bar-fill" style="width:0" data-pct="${c.pct}"></div></div>
            </div>
        </div>`).join('');
    requestAnimationFrame(() => {
        el.querySelectorAll('.glb-bar-fill').forEach(b => {
            b.style.transition = 'width 1.1s ease';
            b.style.width = b.dataset.pct + '%';
        });
    });
}

// ── 5. AI RECYCLING GUIDE — LOCAL KB (no API needed) ────────────────
function queryAiGuide() {
    const input = document.getElementById('guideAiInput');
    const box   = document.getElementById('guideAiResult');
    if (!input || !box) return;
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    box.className = 'guide-ai-result show';
    box.innerHTML = `<div style="display:flex;align-items:center;gap:0.75rem;color:#888"><div class="loading-spinner" style="width:28px;height:28px;border-width:3px"></div> Searching local knowledge base…</div>`;
    setTimeout(() => {
        const reply = ecobotLocalResponse(q);
        const html = escapeHtml(reply)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
        box.innerHTML = `<div style="font-weight:700;color:#1a6b3c;margin-bottom:0.5rem;font-size:0.88rem">🤖 Local Knowledge — <em style="font-weight:400">${escapeHtml(q)}</em></div><div style="line-height:1.65;color:#333"><p>${html}</p></div>`;
        awardPoints(3, '📚 +3 coins for using Recycling Guide!');
    }, 350);
}

// ============================================================
// MOCK SCAN RESULT — used as autopilot fallback so demo never breaks
// ============================================================
const MOCK_SCAN_RESULT = {
    name: "PET Plastic Bottle",
    category: "Recyclable",
    subcategory: "PET Plastic (Type 1)",
    icon: "🍶",
    confidence: 94,
    urgency: "Low",
    description: "A clear PET plastic water bottle, one of the most widely recycled plastics. Chennai's GCC blue bins accept this for kerbside collection.",
    environmentalImpact: {
        recyclabilityScore: 88,
        carbonFootprint: "1.8 kg CO₂ saved if recycled",
        decompositionTime: "450 years in landfill",
        hazardLevel: "Low",
        waterImpact: "Recycling saves ~3L of water vs. new production",
        overallScore: 82
    },
    materialComposition: [
        { material: "PET Plastic", percentage: 92 },
        { material: "HDPE Cap", percentage: 6 },
        { material: "Paper Label", percentage: 2 }
    ],
    disposalSteps: [
        "Step 1: Empty and rinse the bottle with water",
        "Step 2: Remove the cap — dispose separately in blue bin",
        "Step 3: Crush the bottle to save space",
        "Step 4: Place in the Blue GCC Dry Waste bin"
    ],
    tips: [
        "Look for the ♻️1 symbol on the base to confirm it's PET",
        "Never place in the green organic bin — it contaminates the load"
    ],
    locations: "Kotturpuram Dry Waste Collection Centre or nearest GCC Blue Bin",
    alternativeUses: ["Use as a planter for small herbs", "Fill with sand as a doorstop weight"],
    doNots: ["Do not burn — releases toxic fumes", "Do not place with food waste"],
    nearbyFacilityType: "GCC Blue Dry Waste Bin"
};

function renderScanResult(result) {
    const t = I18N[currentLang] || I18N.en;
    const categoryColors = {
        'Recyclable': '#27ae60', 'Organic': '#8bc34a', 'Hazardous': '#e74c3c',
        'E-Waste': '#9c27b0', 'General Waste': '#607d8b', 'Medical Waste': '#f44336'
    };
    const color = categoryColors[result.category] || '#27ae60';
    recentScans.unshift({ name: result.name, category: result.category, icon: result.icon, time: new Date().toLocaleTimeString() });
    if (recentScans.length > 6) recentScans.pop();
    displayRecentScans();
    awardPoints(15, '♻️ +15 coins for AI scan!');
    document.getElementById('scannerResults').innerHTML = `
        <div style="animation:resultFadeIn 0.4s ease">
            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;padding:1rem;background:#f8fff8;border-radius:12px;border:2px solid ${color}20">
                <div style="font-size:3rem">${result.icon}</div>
                <div style="flex:1">
                    <h3 style="color:#333;margin-bottom:0.25rem">${result.name}</h3>
                    <span style="background:${color};color:white;padding:0.25rem 0.75rem;border-radius:20px;font-size:0.85rem;font-weight:600">${result.category}</span>
                    <span style="margin-left:0.5rem;color:#888;font-size:0.85rem">${result.subcategory || ''}</span>
                </div>
                <div style="text-align:center;padding:0.5rem 1rem;background:${color}15;border-radius:10px">
                    <div style="font-size:1.5rem;font-weight:800;color:${color}">${result.confidence}%</div>
                    <div style="font-size:0.7rem;color:#888">confidence</div>
                </div>
            </div>
            <p style="color:#555;margin-bottom:1.5rem;line-height:1.6">${result.description}</p>
            <div style="background:#e8f5e9;border-radius:12px;padding:1.25rem;margin-bottom:1rem">
                <h4 style="color:#1a6b3c;margin-bottom:0.75rem">♻️ Recyclability Score: ${result.environmentalImpact?.recyclabilityScore || 0}/100</h4>
                <div style="background:#c8e6c9;border-radius:4px;height:8px;overflow:hidden"><div style="width:${result.environmentalImpact?.recyclabilityScore || 0}%;height:100%;background:linear-gradient(90deg,#2ecc71,#16a085);border-radius:4px"></div></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-top:0.75rem;font-size:0.82rem">
                    <div>🌍 ${result.environmentalImpact?.carbonFootprint}</div>
                    <div>⏳ ${result.environmentalImpact?.decompositionTime}</div>
                </div>
            </div>
            <div style="margin-bottom:1rem">
                <h4 style="color:#333;margin-bottom:0.75rem">📋 Disposal Steps:</h4>
                ${(result.disposalSteps||[]).map((s,i) => `<div style="display:flex;gap:0.75rem;margin-bottom:0.5rem;padding:0.6rem;background:#f9f9f9;border-radius:8px"><span style="background:${color};color:white;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;flex-shrink:0">${i+1}</span><span style="color:#444;font-size:0.9rem">${s.replace(/^Step \d+: /,'')}</span></div>`).join('')}
            </div>
            <div style="background:#fff8e1;border-radius:10px;padding:1rem;font-size:0.85rem">
                <strong>📍 Drop-off:</strong> ${result.locations}<br>
                ${result.tips?.map(t => `<div style="margin-top:0.4rem">💡 ${t}</div>`).join('') || ''}
            </div>
        </div>`;
}
const DEMO_SCANS = [
    { label:'Plastic Bottle', emoji:'🍶' },
    { label:'Cardboard Box',  emoji:'📦' },
    { label:'Old Phone',      emoji:'📱' },
    { label:'Food Scraps',    emoji:'🥦' },
];
function loadDemoScan(idx) {
    const s = DEMO_SCANS[idx];
    // Build a tiny inline SVG data URI so no external image is needed
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" rx="20" fill="#e8f5e9"/><text x="150" y="155" text-anchor="middle" font-size="120">${s.emoji}</text><text x="150" y="210" text-anchor="middle" font-size="22" fill="#555" font-family="sans-serif">${s.label}</text></svg>`;
    const dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    currentImage = dataUri;
    document.getElementById('previewImage').src = dataUri;
    document.getElementById('uploadArea').style.display = 'none';
    document.getElementById('previewContainer').style.display = 'block';
    showNotification('📸', `Demo loaded: ${s.label} — click Analyse!`);
}

// ── 7. VOICE INPUT (EcoBot) ─────────────────────────────────────────
let voiceRecog = null;
function toggleVoice() {
    const btn = document.getElementById('voiceInputBtn');
    const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        // Hide the button gracefully on unsupported browsers
        if (btn) btn.style.display = 'none';
        showNotification('⚠️','Voice input not supported in this browser');
        return;
    }
    if (voiceRecog && btn.classList.contains('listening')) {
        voiceRecog.stop(); return;
    }
    voiceRecog = new SR();
    voiceRecog.lang = currentLang === 'ta' ? 'ta-IN' : 'en-IN';
    voiceRecog.interimResults = false;
    voiceRecog.onstart  = () => { btn.classList.add('listening'); btn.textContent = '⏹'; };
    voiceRecog.onresult = e => {
        const t = e.results[0][0].transcript;
        const inp = document.getElementById('ecobotInput');
        if (inp) { inp.value = t; sendEcobotMessage(); }
    };
    voiceRecog.onerror  = () => showNotification('⚠️','Voice error — try again');
    voiceRecog.onend    = () => { btn.classList.remove('listening'); btn.textContent = '🎤'; };
    voiceRecog.start();
}

// ── 8. AUTOPILOT / PRESENTATION MODE ───────────────────────────────
const AP_SCRIPT = [
    {
        title: 'Chennai generates 4,800 tonnes of waste daily',
        desc:  '60% ends up in landfill. EcoWaste Pro uses AI, real-time IoT and civic gamification to change that — one scan at a time.',
        tab: 'dashboard', duration: 6500
    },
    {
        title: '🤖 AI Scanner — powered by Claude Vision',
        desc:  'Photograph any waste item. Claude classifies it instantly and gives Chennai-specific disposal steps. Earn +15 coins per scan.',
        tab: 'scanner', duration: 7500,
        action: () => { loadDemoScan(0); setTimeout(() => analyzeImage(), 1800); }
    },
    {
        title: '🗺️ Live City Bin Grid — Real-Time IoT',
        desc:  '12 smart bin clusters monitored across Anna Nagar East. Critical bins auto-dispatch GCC waste trucks with live ETA tracking.',
        tab: 'map', duration: 8000
    },
    {
        title: '🏆 Gamified Green Rewards — Real Redemptions',
        desc:  'Earn coins for every eco-action — redeemable for MTC bus passes, café discounts, tree plantings and government utility credits.',
        tab: 'rewards', duration: 6000
    },
    {
        title: '🏘️ Ward Challenges & Global City Leaderboard',
        desc:  'Ward 12 ranks #2 in Chennai and #8 globally. Citizens collaborate on challenges and compete against Singapore, Berlin and Seoul.',
        tab: 'community', duration: 6500
    },
    {
        title: '🌍 UN SDGs 11 · 12 · 13 · 17 — Built to Scale',
        desc:  'From a single ward to every city in India. Open API for GCC integration. Multi-language (English + Tamil). PWA — works offline.',
        tab: 'dashboard', duration: 6000
    },
];
let apStep = 0, apTimerId = null;
function startAutopilot() {
    // Make sure demo data is loaded first
    if (!currentUser) launchDemoMode();
    apStep = 0;
    document.getElementById('autopilotOverlay').classList.add('active');
    runApStep();
}
function runApStep() {
    if (apStep >= AP_SCRIPT.length) { stopAutopilot(); return; }
    const s = AP_SCRIPT[apStep];
    document.getElementById('apStepLabel').textContent = `Step ${apStep+1} of ${AP_SCRIPT.length}`;
    document.getElementById('apTitle').textContent  = s.title;
    document.getElementById('apDesc').textContent   = s.desc;
    // dots
    document.getElementById('apDots').innerHTML = AP_SCRIPT.map((_,i) =>
        `<div class="ap-dot ${i < apStep ? 'done' : i === apStep ? 'active-dot' : ''}"></div>`
    ).join('');
    // timer bar
    const fill = document.getElementById('apTimerFill');
    if (fill) {
        fill.style.transition = 'none'; fill.style.width = '0%';
        requestAnimationFrame(() => {
            fill.style.transition = `width ${s.duration}ms linear`;
            fill.style.width = '100%';
        });
    }
    // navigate app tab behind overlay
    openTab(s.tab);
    if (s.action) setTimeout(s.action, 900);
    if (apTimerId) clearTimeout(apTimerId);
    apTimerId = setTimeout(() => { apStep++; runApStep(); }, s.duration);
}
function apNextStep() { if (apTimerId) clearTimeout(apTimerId); apStep++; runApStep(); }
function stopAutopilot() {
    if (apTimerId) clearTimeout(apTimerId);
    document.getElementById('autopilotOverlay').classList.remove('active');
    openTab('dashboard');
}

// ── 9. PWA SETUP ────────────────────────────────────────────────────
let deferredPrompt = null;
function initPWA() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(r => console.log('[EcoWaste SW]', r.scope))
            .catch(e => console.warn('[EcoWaste SW] failed:', e));
    }
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        const b = document.getElementById('pwaInstallBanner');
        if (b) b.classList.add('show');
    });
    window.addEventListener('online',  () => {
        document.body.classList.remove('is-offline');
        document.getElementById('offlineBar').classList.remove('show');
        showNotification('✅','Back online!');
    });
    window.addEventListener('offline', () => {
        document.body.classList.add('is-offline');
        document.getElementById('offlineBar').classList.add('show');
    });
}
function installPWA() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
        deferredPrompt = null;
        const b = document.getElementById('pwaInstallBanner');
        if (b) b.classList.remove('show');
    });
}

// ============================================================
// V7 NEW FEATURES — Audit Fixes
// ============================================================

// ── REDEMPTION MODAL ────────────────────────────────────────
function redeemReward(name, cost) {
    // Remove old modal if any
    const old = document.getElementById('redeemModal');
    if (old) old.remove();

    const canAfford = userPoints >= cost;
    const modal = document.createElement('div');
    modal.id = 'redeemModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', `Redeem ${name}`);
    modal.innerHTML = `
      <div class="modal-box">
        <div style="text-align:center;margin-bottom:1.25rem">
          <div style="font-size:3rem;margin-bottom:0.5rem">${cost <= 150 ? '☕' : cost <= 300 ? '🌳' : cost <= 400 ? '🚌' : '🛒'}</div>
          <h3 style="color:#1b5e20;margin:0 0 0.3rem">${name}</h3>
          <div style="font-size:0.9rem;color:#666">Costs <strong style="color:#f57f17">${cost} coins</strong></div>
        </div>
        <div style="background:${canAfford?'#e8f5e9':'#ffebee'};border-radius:12px;padding:1rem;text-align:center;margin-bottom:1.25rem">
          ${canAfford
            ? `<div style="font-size:0.9rem;color:#2e7d32">✅ You have <strong>${userPoints} coins</strong> — enough to redeem!</div>`
            : `<div style="font-size:0.9rem;color:#c62828">❌ You have <strong>${userPoints} coins</strong> — need ${cost - userPoints} more coins.</div>`}
        </div>
        <div style="display:flex;gap:0.75rem">
          ${canAfford
            ? `<button onclick="confirmRedeem('${name}',${cost})" style="flex:1;background:linear-gradient(135deg,#2e7d32,#66bb6a);color:white;border:none;border-radius:12px;padding:0.75rem;font-weight:700;font-size:0.95rem;cursor:pointer" aria-label="Confirm redemption">✅ Confirm Redeem</button>`
            : `<button disabled style="flex:1;background:#e0e0e0;color:#aaa;border:none;border-radius:12px;padding:0.75rem;font-weight:700;font-size:0.95rem;cursor:not-allowed">Not Enough Coins</button>`}
          <button onclick="document.getElementById('redeemModal').remove()" style="background:#f5f5f5;border:none;border-radius:12px;padding:0.75rem 1.2rem;cursor:pointer;font-size:0.9rem" aria-label="Cancel">Cancel</button>
        </div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

function confirmRedeem(name, cost) {
    document.getElementById('redeemModal')?.remove();
    userPoints -= cost;
    try { sessionStorage.setItem('ewp_points', userPoints); } catch(e){}
    ['headerPoints','totalPoints','dashboardPoints'].forEach(id => { const el = document.getElementById(id); if(el) el.textContent = userPoints; });
    updateLevelBadge();
    updateLeaderboardUserRow();
    // Confetti burst notification
    showNotification('🎉', `${name} redeemed! Check your email for the voucher code.`);
    // Show GCC acknowledgement toast
    const toast = document.getElementById('gccToast');
    const toastText = document.getElementById('gccToastText');
    if (toast && toastText) {
        toastText.textContent = `${name} redemption confirmed! Voucher code sent to your registered email within 24 hours.`;
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 5000);
    }
}

// ── ACHIEVEMENT AUTO-UNLOCK ──────────────────────────────────
const ACHIEVEMENTS = [
    { id: 0, icon: '🌍', title: 'Planet Protector', condition: () => personalStats.scanCount >= 1 },
    { id: 1, icon: '🧙', title: 'Waste Wizard',     condition: () => personalStats.scanCount >= 5 },
    { id: 2, icon: '🌊', title: 'Ocean Guardian',   condition: () => userPoints >= 50 },
    { id: 3, icon: '⚡', title: 'Zero Waste Hero',  condition: () => personalStats.recycledKg >= 1 },
    { id: 4, icon: '🏘️', title: 'Community Leader', condition: () => document.querySelectorAll('.join-btn.joined').length >= 1 },
    { id: 5, icon: '💪', title: 'Carbon Crusher',   condition: () => userPoints >= 500 },
];
function checkAchievements() {
    const cards = document.querySelectorAll('.achievement-card');
    ACHIEVEMENTS.forEach(a => {
        const card = cards[a.id];
        if (!card) return;
        if (a.condition() && card.classList.contains('locked')) {
            card.classList.remove('locked');
            const iconEl = card.querySelector('.achievement-icon');
            if (iconEl) iconEl.textContent = a.icon;
            showNotification('🏅', `Achievement unlocked: ${a.title}!`);
        }
    });
}

// ── ONBOARDING TOUR ─────────────────────────────────────────
const ONBOARDING_STEPS = [
    {
        target: () => document.querySelector('.tab-btn[onclick*="scanner"]'),
        title: '🤖 Try the AI Scanner',
        text: 'Photograph any waste item — Claude classifies it instantly and tells you exactly where to dispose it in Chennai.',
        position: 'bottom',
    },
    {
        target: () => document.querySelector('.tab-btn[onclick*="map"]'),
        title: '🗺️ Live City Map',
        text: 'Watch real-time bin fill levels across Ward 12. GCC trucks auto-dispatch when bins go critical!',
        position: 'bottom',
    },
    {
        target: () => document.getElementById('fabEcobot'),
        title: '🌿 Meet EcoBot',
        text: 'Ask EcoBot anything about waste disposal — works 100% offline, no API key needed!',
        position: 'top',
    },
];
let onboardStep = 0;
let onboardOverlay = null;

function startOnboardingTour() {
    onboardStep = 0;
    if (onboardOverlay) onboardOverlay.remove();
    onboardOverlay = document.createElement('div');
    onboardOverlay.className = 'onboarding-overlay';
    onboardOverlay.id = 'onboardingOverlay';
    document.body.appendChild(onboardOverlay);
    showOnboardStep();
}

function showOnboardStep() {
    if (!onboardOverlay) return;
    if (onboardStep >= ONBOARDING_STEPS.length) {
        finishOnboarding();
        return;
    }
    onboardOverlay.innerHTML = '';
    const step = ONBOARDING_STEPS[onboardStep];
    const target = step.target();
    if (!target) { onboardStep++; showOnboardStep(); return; }
    const rect = target.getBoundingClientRect();
    const pad = 8;
    // Spotlight
    const spot = document.createElement('div');
    spot.className = 'onboarding-spotlight';
    spot.style.cssText = `top:${rect.top + window.scrollY - pad}px;left:${rect.left - pad}px;width:${rect.width + pad*2}px;height:${rect.height + pad*2}px`;
    // Tooltip
    const tip = document.createElement('div');
    tip.className = 'onboarding-tooltip';
    const isTop = step.position === 'top' || rect.top > window.innerHeight * 0.7;
    if (isTop) {
        tip.style.cssText = `bottom:${window.innerHeight - rect.top + window.scrollY + 16}px;left:${Math.max(16, rect.left - 40)}px`;
    } else {
        tip.style.cssText = `top:${rect.bottom + window.scrollY + 16}px;left:${Math.max(16, rect.left - 40)}px`;
    }
    tip.innerHTML = `
        <h4>${step.title}</h4>
        <p>${step.text}</p>
        <div class="onboarding-btn-row">
            <button class="onboarding-skip-btn" onclick="finishOnboarding()" aria-label="Skip tour">Skip</button>
            <button class="onboarding-next-btn" onclick="nextOnboardStep()" aria-label="${onboardStep < ONBOARDING_STEPS.length - 1 ? 'Next step' : 'Finish tour'}">
                ${onboardStep < ONBOARDING_STEPS.length - 1 ? 'Next →' : '✅ Done!'}
            </button>
        </div>
        <div style="font-size:0.72rem;color:#aaa;text-align:center;margin-top:0.5rem">${onboardStep+1} / ${ONBOARDING_STEPS.length}</div>`;
    onboardOverlay.appendChild(spot);
    onboardOverlay.appendChild(tip);
    onboardOverlay.style.pointerEvents = 'none';
    tip.style.pointerEvents = 'all';
}
function nextOnboardStep() { onboardStep++; showOnboardStep(); }
function finishOnboarding() {
    if (onboardOverlay) onboardOverlay.remove();
    onboardOverlay = null;
    try { sessionStorage.setItem('ewp_toured', '1'); } catch(e){}
}

// ── CHART DARK MODE FIX ─────────────────────────────────────
let chartInstances = [];
function updateChartsDarkMode() {
    const color = isDark ? '#e6edf3' : '#666';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    chartInstances.forEach(chart => {
        if (!chart) return;
        try {
            if (chart.options.scales) {
                Object.values(chart.options.scales).forEach(scale => {
                    if (scale.ticks) scale.ticks.color = color;
                    if (scale.grid) scale.grid.color = gridColor;
                });
            }
            if (chart.options.plugins?.legend?.labels) {
                chart.options.plugins.legend.labels.color = color;
            }
            chart.update('none');
        } catch(e){}
    });
}

// ── EXPANDED ECOBOT KB — Tamil language for common items ────
// Append Tamil responses based on currentLang
function ecobotLocalResponseLang(userText) {
    const lower = userText.toLowerCase();
    // Tamil language specific replies for top items
    if (currentLang === 'ta') {
        const tamilKB = [
            { keys: ['பிளாஸ்டிக்','பாட்டில்','water bottle'], reply: `♻️ **பிளாஸ்டிக் பாட்டில்** (PET) — **நீல GCC Dry Waste bin**-ல் போடுங்கள்.\n\n- கழுவி, நசுக்கி போடுங்கள்\n- மூடியை தனியாக போடுங்கள்\n- கொட்டூர்பூரம் Dry Waste Centre\n\n⚠️ எரிக்காதீர்கள் — நச்சு புகை வரும்.` },
            { keys: ['உணவு கழிவு','சமையல்','காய்கறி','பழம்'], reply: `🌿 **உணவு கழிவு** — **பச்சை GCC Organic bin**-ல் போடுங்கள்.\n\n- காய்கறி, பழம், சமைத்த உணவு\n- GCC தினமும் Anna Nagar East-ல் சேகரிக்கும்\n\n💡 வீட்டில் உரமிட்டால் +25 EcoCoins கிடைக்கும்!` },
            { keys: ['பேட்டரி','battery'], reply: `🔋 **பேட்டரி** — சாதாரண bin-ல் போடாதீர்கள்!\n\n- அங்கீகரிக்கப்பட்ட battery shop-ல் கொடுங்கள்\n- Attibele E-Waste Park, GST Road\n\n📞 GCC: **1913**` },
            { keys: ['மருந்து','மாத்திரை','expired'], reply: `💊 **காலாவதியான மருந்துகள்** — flush செய்யாதீர்கள்!\n\n- Apollo Pharmacy-ல் கொடுங்கள்\n- Government Hospital pharmacy\n\n⚠️ Chembarambakkam நீர் தேக்கத்தை பாதுகாக்கவும்.` },
            { keys: ['தொலைபேசி','mobile','phone'], reply: `📱 **பழைய தொலைபேசி** = E-கழிவு\n\n- Poorvika Mobile stores\n- GCC E-Waste camp (ஒவ்வொரு மாதமும் 1ஆம் சனிக்கிழமை)\n- Samsung/Apple service centres\n\n💡 நன்றாக இருந்தால் "Mobile for All" NGO-க்கு கொடுங்கள்.` },
        ];
        for (const entry of tamilKB) {
            if (entry.keys.some(k => lower.includes(k))) return entry.reply;
        }
    }
    // Default to English KB
    return ecobotLocalResponse(userText);
}

// ── 10. ENHANCED DOMContentLoaded ─────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    renderBins();
    renderActiveRequests();
    initTheme();
    initPWA();
    renderGlobalLb();
    initWardImpact();
    initFeedTimestamps();

    // ── API Key: restore from session if available, then show badge ──
    const savedKey = sessionStorage.getItem('ewp_api_key');
    if (savedKey) { ANTHROPIC_API_KEY = savedKey; }
    injectApiKeyBadge();

    // ── Offline-first USP badge ──────────────────────────────────
    const offlineBadge = document.createElement('div');
    offlineBadge.id = 'offlineFirstBadge';
    offlineBadge.setAttribute('aria-label', 'EcoBot works offline');
    offlineBadge.innerHTML = `<span>📶</span><span>EcoBot Works Offline ✓</span>`;
    document.body.appendChild(offlineBadge);

    // ── Hide voice button on non-Chrome browsers ─────────────────
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const voiceBtn = document.getElementById('voiceInputBtn');
    if (!SR && voiceBtn) voiceBtn.style.display = 'none';

    // keyboard shortcut: P = start presentation
    document.addEventListener('keydown', e => {
        if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey
            && document.activeElement.tagName !== 'INPUT'
            && document.activeElement.tagName !== 'TEXTAREA') {
            startAutopilot();
        }
    });
});

/** Inject a small persistent badge showing key status, with a click-to-change action */
function injectApiKeyBadge() {
    const existing = document.getElementById('apiKeyBadge');
    if (existing) existing.remove();
    const badge = document.createElement('div');
    badge.id = 'apiKeyBadge';
    badge.innerHTML = `<span style="color:#2e7d32">🤖 Local AI Active</span><span style="margin-left:5px;font-size:0.68rem;color:#888">No key needed</span>`;
    badge.style.cssText = 'position:fixed;bottom:1rem;left:1rem;background:#fff;border:1px solid #c8e6c9;border-radius:20px;padding:0.38rem 0.85rem;font-size:0.78rem;z-index:9999;box-shadow:0 2px 10px rgba(0,0,0,0.12);display:flex;align-items:center;gap:2px;';
    document.body.appendChild(badge);
}

function reEnterApiKey() {
    ANTHROPIC_API_KEY = '';
    sessionStorage.removeItem('ewp_api_key');
    promptForApiKey().then(() => injectApiKeyBadge());
}
