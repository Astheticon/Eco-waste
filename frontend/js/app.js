// ============================================================
// APP.JS — Bootstrapper (Step 6 · frontend-refactor)
// EcoWaste Pro
//
// Extracted modules:
//   state.js   — all global state
//   api.js     — Anthropic fetch calls
//   bins.js    — bin rendering & pickup logic
//   scanner.js — camera, upload, local AI classifier
//   stats.js   — stats, charts, gamification
// ============================================================

// ── Module imports ────────────────────────────────────────────
import {
    bins,
    pickupRequests, addPickupRequest, removePickupRequest,
    requestHistory,
    personalStats, setPersonalStats,
    userPoints, addUserPoints, setUserPoints,
    currentImage, setCurrentImage,
    recentScans, addRecentScan,
    CITY_BIN_NODES, CITY_TRUCKS,
    map, setMap, mapInitialized, setMapInitialized,
    baseLat, baseLng, setBaseLat, setBaseLng,
    simTick, incSimTick,
    simSpeed, setSimSpeed as setSimSpeedState,
    cityBinMarkers, setCityBinMarkers,
    cityTruckMarkers, setCityTruckMarkers,
    cityRouteLines, setCityRouteLines,
    liveSimInterval, setLiveSimInterval,
    truckMoveInterval, setTruckMoveInterval,
    cityClockInterval, setCityClockInterval,
    alertedBins, prevCritCount, setPrevCritCount,
    isDark, setIsDark,
    currentLang, setCurrentLang,
    chartInstances,
    liveEvents,
    deferredPrompt, setDeferredPrompt,
    ecobotTyping, setEcobotTyping,
    fallbackIndex, incFallbackIndex,
    voiceRecog, setVoiceRecog,
    cameraStream, setCameraStream,
    onboardStep, setOnboardStep,
    onboardOverlay, setOnboardOverlay,
    apStep, setApStep, apTimerId, setApTimerId,
    DEFAULT_LAT, DEFAULT_LNG,
    ANTHROPIC_API_KEY, setApiKey,
} from './state.js';

import {
    renderBins,
    renderActiveRequests,
    requestPickup,
    requestEmergencyPickup,
    simulateBinLevelChanges,
    syncMyBins,
} from './bins.js';

import {
    analyzeImage,
    displayResult,
    displayRecentScans,
    loadDemoScan,
    startCamera,
    stopCamera,
    snapCamera,
    handleImageUpload,
    clearImage,
} from './scanner.js';

import {
    initCharts,
    updateChartsDarkMode,
    updatePersonalStats,
    updateStatisticsTab,
    awardPoints,
    updateLevelBadge,
    checkAchievements,
    showSDGImpact,
    redeemReward,
    confirmRedeem,
} from './stats.js';

// ── Expose key functions as globals so inline onclick= handlers work ──
// These will be removed once all event listeners are moved to JS (post-refactor).
window.requestPickup          = requestPickup;
window.requestEmergencyPickup = requestEmergencyPickup;
window.loadDemoScan           = loadDemoScan;
window.startCamera            = startCamera;
window.stopCamera             = stopCamera;
window.snapCamera             = snapCamera;
window.handleImageUpload      = handleImageUpload;
window.clearImage             = clearImage;
window.analyzeImage           = analyzeImage;
window.awardPoints            = awardPoints;
window.updateLevelBadge       = updateLevelBadge;
window.checkAchievements      = checkAchievements;
window.redeemReward           = redeemReward;
window.confirmRedeem          = confirmRedeem;
window.updateStatisticsTab    = updateStatisticsTab;
window.updatePersonalStats    = updatePersonalStats;
window.displayRecentScans     = displayRecentScans;

// ============================================================
// API KEY MANAGEMENT (UI concern — stays in app.js)
// ============================================================

/** Show the API-key modal; resolves when a key is saved or skipped */
function promptForApiKey() {
    return new Promise(resolve => {
        if (ANTHROPIC_API_KEY) { resolve(); return; }
        const existing = sessionStorage.getItem('ewp_api_key');
        if (existing) { setApiKey(existing); resolve(); return; }

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

        function dismiss() { overlay.remove(); resolve(); }

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

        setTimeout(() => input.focus(), 80);
    });
}

// ============================================================
// CITY MAP — helper functions & simulation engine
// ============================================================

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

function updateCityKPIs() {
    let crit = 0, warn = 0, ok = 0;
    CITY_BIN_NODES.forEach(b => {
        const s = getBinStatus(b.fill);
        if (s === 'crit') crit++;
        else if (s === 'warn') warn++;
        else ok++;
    });
    document.getElementById('kpiCrit').textContent   = crit;
    document.getElementById('kpiWarn').textContent   = warn;
    document.getElementById('kpiOk').textContent     = ok;
    document.getElementById('kpiTrucks').textContent = CITY_TRUCKS.length;

    const currentCritCount = crit;
    if (currentCritCount > prevCritCount) {
        const pill = document.getElementById('kpiCrit').parentElement;
        if (pill) {
            pill.style.borderColor = 'rgba(255,23,68,0.8)';
            pill.style.background  = 'rgba(255,23,68,0.15)';
            pill.style.transition  = 'all 0.3s';
            setTimeout(() => { pill.style.borderColor = ''; pill.style.background = ''; }, 1800);
        }
    }
    setPrevCritCount(currentCritCount);
}

function makeBinMarkerHTML(status, fill) {
    const label = (fill !== undefined)
        ? `<div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);white-space:nowrap;font-family:'Space Mono',monospace;font-size:9px;font-weight:700;color:${status==='crit'?'#ff5252':status==='warn'?'#ffab40':'#69f0ae'};text-shadow:0 1px 3px rgba(0,0,0,0.9);letter-spacing:0.04em">${fill}%</div>`
        : '';
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
    const status      = getBinStatus(node.fill);
    const fillBarClass = status === 'crit' ? 'fill-bar-crit' : status === 'warn' ? 'fill-bar-warn' : 'fill-bar-ok';
    const statusLabel  = getBinStatusLabel(node.fill);
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
    const _liveSimInterval  = liveSimInterval;
    const _truckMoveInterval = truckMoveInterval;
    if (_liveSimInterval)  clearInterval(_liveSimInterval);
    if (_truckMoveInterval) clearInterval(_truckMoveInterval);
    Object.values(cityRouteLines).forEach(l => { try { l.remove(); } catch(e){} });
    setCityRouteLines({});

    const _map = map;
    if (_map) { _map.remove(); setMap(null); }
    const newMap = L.map('map', { zoomControl: true, attributionControl: false }).setView([lat, lng], 15);
    setMap(newMap);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, className: 'map-tiles'
    }).addTo(newMap);
    L.control.attribution({ prefix: false }).addTo(newMap);

    const homeIcon = L.divIcon({
        html: `<div style="font-size:1.8rem;filter:drop-shadow(0 0 8px rgba(46,204,113,0.9)) drop-shadow(0 2px 4px rgba(0,0,0,0.5))">🏠</div>`,
        className: '', iconSize: [36,36], iconAnchor: [18,18]
    });
    L.marker([lat, lng], { icon: homeIcon })
        .bindPopup(`<div class="bin-popup"><div class="bin-popup-header"><div class="icon">🏠</div><div><h3>Your Location</h3><span class="type-badge ok">HOME</span></div></div><div class="bin-popup-meta">Ward: <span>12 — Anna Nagar East</span><br>Chennai, Tamil Nadu</div></div>`)
        .addTo(newMap);
    L.circle([lat, lng], { color:'rgba(46,204,113,0.6)', fillColor:'rgba(46,204,113,0.08)', fillOpacity:1, radius:80, weight:1 }).addTo(newMap);

    const newCityBinMarkers = [];
    CITY_BIN_NODES.forEach(node => {
        const status   = getBinStatus(node.fill);
        const nodeIcon = L.divIcon({ html: makeBinMarkerHTML(status, node.fill), className:'', iconSize:[36,36], iconAnchor:[18,18] });
        const m = L.marker([lat + node.latOff, lng + node.lngOff], { icon: nodeIcon })
            .bindPopup(makeBinPopupHTML(node), { maxWidth: 220 })
            .addTo(newMap);
        newCityBinMarkers.push({ node, marker: m });
    });
    setCityBinMarkers(newCityBinMarkers);

    const newCityTruckMarkers = [];
    CITY_TRUCKS.forEach(truck => {
        const truckIcon = L.divIcon({ html: makeTruckMarkerHTML(), className:'', iconSize:[38,38], iconAnchor:[19,19] });
        const m = L.marker([lat + truck.latOff, lng + truck.lngOff], { icon: truckIcon })
            .bindPopup(`<div class="bin-popup"><div class="bin-popup-header"><div class="icon">🚛</div><div><h3>${truck.label}</h3><span class="type-badge ok">EN ROUTE</span></div></div><div class="bin-popup-meta">Type: <span>${truck.subtype}</span><br>Status: <span>Active · GPS Tracked</span></div></div>`)
            .addTo(newMap);
        newCityTruckMarkers.push({ truck, marker: m });
    });
    setCityTruckMarkers(newCityTruckMarkers);

    updateCityKPIs();
    startCityClock();
    startLiveSimulation(lat, lng);
}

function startCityClock() {
    const _cityClockInterval = cityClockInterval;
    if (_cityClockInterval) clearInterval(_cityClockInterval);
    function tick() {
        const el = document.getElementById('cityClockEl');
        if (el) el.textContent = new Date().toLocaleTimeString('en-IN', { hour12: false });
    }
    tick();
    setCityClockInterval(setInterval(tick, 1000));
}

// ── Live simulation engine ────────────────────────────────────
function startLiveSimulation(lat, lng) {
    setBaseLat(lat); setBaseLng(lng);

    const _liveSimInterval   = liveSimInterval;
    const _truckMoveInterval = truckMoveInterval;
    if (_liveSimInterval)  clearInterval(_liveSimInterval);
    if (_truckMoveInterval) clearInterval(_truckMoveInterval);
    alertedBins.clear();

    setLiveSimInterval(setInterval(() => {
        incSimTick();
        CITY_BIN_NODES.forEach(node => {
            const beingServiced = CITY_TRUCKS.some(t => t.targetBin === node.id && t.collecting);
            if (beingServiced) return;
            const chance = node.subtype === 'Organic' ? 0.55 : node.subtype === 'General' ? 0.5 : 0.35;
            if (Math.random() < chance)
                node.fill = Math.min(100, node.fill + Math.floor(Math.random() * 4) + 1);
        });
        refreshCityBinMarkers();
        updateCityKPIs();
        dispatchTrucksToCritical();
        syncMyBins(CITY_BIN_NODES);
    }, 4000));

    setTruckMoveInterval(setInterval(() => moveTrucksOneStep(), 1200));
}

function refreshCityBinMarkers() {
    cityBinMarkers.forEach(({ node, marker }) => {
        const status = getBinStatus(node.fill);
        marker.setIcon(L.divIcon({ html: makeBinMarkerHTML(status, node.fill), className:'', iconSize:[36,36], iconAnchor:[18,18] }));
        marker.setPopupContent(makeBinPopupHTML(node));
    });
}

function dispatchTrucksToCritical() {
    const criticalBins = CITY_BIN_NODES.filter(n => n.fill >= 85).sort((a, b) => b.fill - a.fill);
    criticalBins.forEach(bin => {
        if (CITY_TRUCKS.some(t => t.targetBin === bin.id)) return;
        const freeTruck = CITY_TRUCKS.find(t => !t.targetBin);
        if (!freeTruck) return;
        freeTruck.targetBin  = bin.id;
        freeTruck.collecting = false;
        freeTruck.eta        = Math.floor(Math.random() * 8) + 4;
        if (!alertedBins.has(bin.id)) {
            alertedBins.add(bin.id);
            showCriticalAlert(bin, freeTruck);
        }
        updateTruckPopup(freeTruck, bin);
    });
}

function moveTrucksOneStep() {
    cityTruckMarkers.forEach(({ truck, marker }) => {
        const currentPos = marker.getLatLng();
        if (truck.targetBin) {
            const targetNode = CITY_BIN_NODES.find(n => n.id === truck.targetBin);
            if (!targetNode) return;
            const targetLat = baseLat + targetNode.latOff;
            const targetLng = baseLng + targetNode.lngOff;
            const dLat = targetLat - currentPos.lat;
            const dLng = targetLng - currentPos.lng;
            const dist = Math.sqrt(dLat * dLat + dLng * dLng);
            const stepSize = 0.0006;
            if (dist < 0.0008) {
                const routes = cityRouteLines;
                if (routes[truck.id]) { routes[truck.id].remove(); delete routes[truck.id]; }
                if (!truck.collecting) {
                    truck.collecting = true;
                    marker.setLatLng([targetLat, targetLng]);
                    showCollectionAnimation(targetNode, truck, marker);
                }
            } else {
                const ratio  = stepSize / dist;
                const newLat = currentPos.lat + dLat * ratio;
                const newLng = currentPos.lng + dLng * ratio;
                marker.setLatLng([newLat, newLng]);
                const _map = map;
                if (_map) {
                    const routes = cityRouteLines;
                    if (routes[truck.id]) routes[truck.id].remove();
                    routes[truck.id] = L.polyline(
                        [[newLat, newLng], [targetLat, targetLng]],
                        { color:'#ffd600', weight:2, opacity:0.7, dashArray:'6 5' }
                    ).addTo(_map);
                }
            }
        } else {
            const i   = CITY_TRUCKS.indexOf(truck);
            const tick = simTick * 0.04;
            const r   = 0.0018 + i * 0.001;
            const ang = tick + i * 2.094;
            marker.setLatLng([baseLat + truck.latOff + Math.sin(ang) * r, baseLng + truck.lngOff + Math.cos(ang) * r]);
        }
    });
}

function showCollectionAnimation(node, truck, marker) {
    marker.setIcon(L.divIcon({
        html: `<div class="truck-marker-wrap"><div class="truck-dot" style="background:rgba(255,200,0,0.95);box-shadow:0 0 20px rgba(255,200,0,0.8);animation:truckBob 0.4s ease-in-out infinite">&#x1F69B;</div></div>`,
        className:'', iconSize:[38,38], iconAnchor:[19,19]
    }));
    showNotification('🗑️', `${truck.label} is emptying ${node.label}`);
    let drainFill = node.fill;
    const drainInterval = setInterval(() => {
        drainFill = Math.max(0, drainFill - 12);
        node.fill = drainFill;
        refreshCityBinMarkers();
        updateCityKPIs();
        syncMyBins(CITY_BIN_NODES);
        if (drainFill <= 5) {
            clearInterval(drainInterval);
            node.fill = Math.floor(Math.random() * 8) + 2;
            alertedBins.delete(node.id);
            truck.targetBin  = null;
            truck.collecting = false;
            truck.eta        = null;
            marker.setIcon(L.divIcon({ html: makeTruckMarkerHTML(), className:'', iconSize:[38,38], iconAnchor:[19,19] }));
            updateTruckPopup(truck, null);
            showNotification('✅', `${node.label} has been emptied successfully`);
            refreshCityBinMarkers();
            updateCityKPIs();
        }
    }, 700);
}

function updateTruckPopup(truck, targetBin) {
    const tm = cityTruckMarkers.find(t => t.truck.id === truck.id);
    if (!tm) return;
    tm.marker.setPopupContent(targetBin
        ? `<div class="bin-popup"><div class="bin-popup-header"><div class="icon">&#x1F69B;</div><div><h3>${truck.label}</h3><span class="type-badge crit">DISPATCHED</span></div></div><div class="bin-popup-meta">Target: <span>${targetBin.label}</span><br>Fill: <span style="color:#ff5252;font-weight:700">${targetBin.fill}%</span><br>ETA: <span style="color:#69f0ae">${truck.eta} min</span></div></div>`
        : `<div class="bin-popup"><div class="bin-popup-header"><div class="icon">&#x1F69A;</div><div><h3>${truck.label}</h3><span class="type-badge ok">PATROLLING</span></div></div><div class="bin-popup-meta">Type: <span>${truck.subtype}</span><br>Status: <span>Active · GPS Tracked</span></div></div>`
    );
}

function showCriticalAlert(bin, truck) {
    const kpiCrit = document.getElementById('kpiCrit');
    if (kpiCrit) {
        kpiCrit.style.color = '#ff1744';
        kpiCrit.style.transform = 'scale(1.3)';
        kpiCrit.style.transition = 'all 0.3s';
        setTimeout(() => { kpiCrit.style.color = ''; kpiCrit.style.transform = ''; }, 1500);
    }
    showNotification('🚛', `${truck.label} will reach ${bin.label} within ${truck.eta} mins`);
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

// ── Sim speed control ─────────────────────────────────────────
function setSimSpeed(x) {
    setSimSpeedState(x);
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
    const _liveSimInterval = liveSimInterval;
    if (_liveSimInterval) {
        clearInterval(_liveSimInterval);
        const interval = Math.max(1200, 4000 / x);
        setLiveSimInterval(setInterval(() => {
            incSimTick();
            CITY_BIN_NODES.forEach(node => {
                const beingServiced = CITY_TRUCKS.some(t => t.targetBin === node.id && t.collecting);
                if (beingServiced) return;
                const chance = (node.subtype === 'Organic' ? 0.55 : node.subtype === 'General' ? 0.5 : 0.35) * x;
                if (Math.random() < Math.min(chance, 0.9))
                    node.fill = Math.min(100, node.fill + Math.floor(Math.random() * 4 * x) + 1);
            });
            refreshCityBinMarkers();
            updateCityKPIs();
            dispatchTrucksToCritical();
            syncMyBins(CITY_BIN_NODES);
        }, interval));
        showNotification('⚡', `Simulation speed: ${x}x`);
    }
}
window.setSimSpeed = setSimSpeed;

// ============================================================
// MAP INIT — with geolocation
// ============================================================
function initMap() {
    function updateLocationStatus(icon, text, color) {
        const s = document.getElementById('locationStatus');
        if (!s) return;
        const colors = {
            green:  ['rgba(46,204,113,0.08)', 'rgba(46,204,113,0.25)', '#69f0ae'],
            orange: ['rgba(255,152,0,0.08)',  'rgba(255,152,0,0.25)',  '#ffcc80'],
            red:    ['rgba(244,67,54,0.08)',  'rgba(244,67,54,0.25)',  '#ff8a80'],
        };
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
// LOGIN / AUTH
// ============================================================
let currentUser = null;

function switchLoginTab(tab) {
    document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById(tab + 'LoginForm').classList.add('active');
}
function handleLogin(event, type) {
    event.preventDefault();
    const username = type === 'email'
        ? document.getElementById('emailInput').value.split('@')[0]
        : 'User_' + document.getElementById('phoneInput').value.slice(-4);
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
    const fab = document.getElementById('fabEcobot');
    if (fab) fab.style.display = 'flex';
    setLang(currentLang, true);
    document.getElementById('userDisplayName').textContent = username;
    document.getElementById('leaderboardUserName').textContent = 'You (' + username + ')';

    const saved = sessionStorage.getItem('ewp_points');
    if (saved) {
        setUserPoints(parseInt(saved) || 0);
        ['headerPoints','totalPoints','dashboardPoints'].forEach(id => {
            const el = document.getElementById(id); if (el) el.textContent = userPoints;
        });
    }

    renderBins(); renderActiveRequests(); initCharts(); simulateBinLevelChanges(); displayRecentScans();
    setMapInitialized(false);
    showNotification('🎉', `Welcome back, ${username}!`);
    updateLevelBadge();
    updateStatisticsTab();

    if (!sessionStorage.getItem('ewp_toured')) {
        setTimeout(startOnboardingTour, 1500);
    }
}
function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        currentUser = null;
        document.getElementById('mainApp').classList.remove('active');
        document.getElementById('loginPage').style.display = 'flex';
        const fab   = document.getElementById('fabEcobot');
        const panel = document.getElementById('ecobotFloatPanel');
        if (fab)   fab.style.display = 'none';
        if (panel) panel.classList.remove('open');
        showNotification('👋', 'Logged out successfully!');
    }
}
window.switchLoginTab = switchLoginTab;
window.handleLogin    = handleLogin;
window.socialLogin    = socialLogin;
window.handleLogout   = handleLogout;

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
        if (!mapInitialized) { setMapInitialized(true); setTimeout(() => initMap(), 150); }
        else if (map) setTimeout(() => map.invalidateSize(), 100);
    }
    if (tabName === 'community') setTimeout(animateChallengeProgress, 80);
    if (tabName === 'certificate') setTimeout(initCertificate, 80);
}
window.openTab = openTab;

// ============================================================
// SCANNER — displayPreview helper (local to app.js)
// ============================================================
function displayPreview(src) {
    document.getElementById('uploadArea').style.display = 'none';
    document.getElementById('previewContainer').style.display = 'block';
    document.getElementById('previewImage').src = src;
}
window.displayPreview = displayPreview;

function switchResultTab(btn, panelId) {
    btn.closest('.result-item').querySelectorAll('.result-tab-btn').forEach(b => b.classList.remove('active'));
    btn.closest('.result-item').querySelectorAll('.result-tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(panelId).classList.add('active');
}
window.switchResultTab = switchResultTab;

// ============================================================
// NOTIFICATIONS & UTILS
// ============================================================
function showNotification(icon, msg) {
    const toast = document.getElementById('notificationToast');
    document.getElementById('notificationIcon').textContent  = icon;
    document.getElementById('notificationMessage').textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 5000);
    pushLiveEvent(icon, msg);
}
function pushLiveEvent(icon, msg) {
    const time = new Date().toLocaleTimeString('en-IN', { hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' });
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
function updateDashboard() {
    document.getElementById('totalCollections').textContent = requestHistory.filter(r => r.status === 'completed').length;
}
function getTimeAgo(ts) {
    const s = Math.floor((new Date() - new Date(ts)) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
    return Math.floor(s / 86400) + ' days ago';
}
function showGCCToast(refNum) {
    const toast = document.getElementById('gccToast');
    const text  = document.getElementById('gccToastText');
    if (!toast || !text) return;
    text.textContent = `Request received — Ref: GCC/2026/WD12/${refNum}`;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 6000);
}
window.showNotification = showNotification;
window.showGCCToast     = showGCCToast;
window.updateDashboard  = updateDashboard;
window.getTimeAgo       = getTimeAgo;
window.escapeHtml       = escapeHtml;

// ============================================================
// DARK MODE
// ============================================================
function toggleDarkMode() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : '');
    const btn = document.getElementById('themeModeBtn');
    if (btn) btn.textContent = next ? '☀️ Light' : '🌙 Dark';
    try { localStorage.setItem('ecowaste_theme', next ? 'dark' : 'light'); } catch(e){}
    updateChartsDarkMode();
}
function initTheme() {
    try {
        if (document.documentElement.getAttribute('data-theme') === 'dark') {
            setIsDark(true);
            const btn = document.getElementById('themeModeBtn');
            if (btn) btn.textContent = '☀️ Light';
        }
    } catch(e){}
}
window.toggleDarkMode = toggleDarkMode;

// ============================================================
// i18n
// ============================================================
const I18N = {
    en: {
        api_disclaimer_text: 'EcoBot & AI Scanner both run 100% offline — no API key needed. Works anywhere, even without internet!',
        api_disclaimer_link: 'Learn more',
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
        nav_dashboard: 'Dashboard', nav_scanner: 'AI Scanner', nav_bins: 'My Bins',
        logout: 'Logout',
        tab_dashboard: '📊 My Dashboard', tab_pickup: '🗑️ My Bins',
        tab_scanner: '🤖 AI Scanner', tab_map: '🗺️ Live City Map',
        tab_rewards: '🏆 Rewards', tab_guide: '📚 Recycling Guide',
        tab_community: '🏘️ Ward Challenges',
        hero_title: '🌍 Smart Waste Management Platform',
        sdg_label: '🌐 UN Sustainable Development Goals',
        sdg_11: 'Sustainable Cities', sdg_12: 'Responsible Consumption',
        sdg_13: 'Climate Action', sdg_17: 'Partnerships',
        sdg_co2_label: 'CO₂ saved this month', ward_name: 'Ward 12 · Anna Nagar East',
        dash_title: 'Your Waste Dashboard',
        stat_collections: 'Collections This Month', stat_collections_sub: '🌱 Start your journey!',
        stat_recycled: 'Recycled This Month', stat_recycled_sub: '🌱 Start recycling today!',
        stat_co2: 'CO₂ Saved', stat_co2_sub: '🌱 Make your first impact!',
        stat_points: 'Reward Points', stat_points_sub: '🏆 Earn points by scanning!',
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
        guide_title: '📚 Complete Recycling Guide',
        guide_subtitle: 'Ask AI about any item — get instant Chennai-specific disposal guidance.',
        guide_ai_ph: 'Type any item e.g. "milk carton", "old battery"…',
        emergency_title: '🚨 Need Immediate Pickup?',
        emergency_sub: 'Request emergency collection for all full bins',
        emergency_btn: 'Request Emergency Pickup Now',
        bins_status: 'Your Bins Status',
        rewards_title: '🌿 Your Green Rewards Hub',
        ward_title: '🏘️ Ward 12 — Anna Nagar East',
        ward_subtitle: 'Join your neighbours in monthly sustainability challenges.',
        map_title: '🗺️ Live City Dashboard',
        ecobot_ph: 'Ask about recycling, waste disposal…',
        ecobot_footer: '🌿 Local AI · Ward 12, Chennai · No API key needed',
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
        ward_members: 'Ward Members', ward_active_challenges: 'Active Challenges',
        ward_rank: 'Ward Rank (City)', ward_co2: "Month's CO₂ Saved",
        ward_leaderboard_title: '🏙️ City-Wide Ward Leaderboard',
        global_lb_title: '🌍 Global City Sustainability Leaderboard',
        ward_feed_title: '📢 Ward Activity Feed',
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
        ecobot_greeting: "👋 Hi! I'm EcoBot, your AI assistant for Ward 12. Ask me about waste classification, recycling, or how to earn more coins! 🪙",
    },
    // ── Tamil, Hindi, Telugu translations ──
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

function t(key) {
    const lang = I18N[currentLang] || I18N.en;
    return lang[key] !== undefined ? lang[key] : (I18N.en[key] || key);
}
// Expose globally so modules can call window.t(key)
window.t = t;

function setLang(lang, silent = false) {
    setCurrentLang(lang);
    try { localStorage.setItem('ecowaste_lang', lang); } catch(e) {}
    const tr = I18N[lang];
    if (!tr) return;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const k = el.getAttribute('data-i18n');
        if (tr[k] !== undefined) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = tr[k];
            else el.textContent = tr[k];
        }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const k = el.getAttribute('data-i18n-placeholder');
        if (tr[k] !== undefined) el.placeholder = tr[k];
    });
    const ecobotInput = document.getElementById('ecobotInput');
    if (ecobotInput && tr.ecobot_ph) ecobotInput.placeholder = tr.ecobot_ph;

    if (!silent) {
        renderBins();
        renderActiveRequests();
        const scanResults = document.getElementById('scannerResults');
        if (scanResults && scanResults.querySelector('h3') &&
            scanResults.querySelector('h3').textContent.match(/No Analysis|विश्लेषण|பகுப்பாய்வு|విశ్లేషణ/i)) {
            scanResults.innerHTML = `<div style="text-align:center;padding:3rem;color:#999"><div style="font-size:4rem;margin-bottom:1rem">🔍</div><h3>${t('scanner_no_analysis')}</h3><p>${t('scanner_no_analysis_sub')}</p></div>`;
        }
        displayRecentScans();
    }
    document.querySelectorAll('.login-lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    document.querySelectorAll('.header-lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    document.documentElement.lang = lang;
    if (!silent) {
        const langNames = { en:'English', ta:'தமிழ்', hi:'हिंदी', te:'తెలుగు' };
        showNotification('🌐', `${langNames[lang] || lang}`);
    }
}
window.setLang = setLang;

// ============================================================
// WARD IMPACT
// ============================================================
function countUp(el, target, suffix, ms) {
    if (!el) return;
    let v = 0, step = target / (ms / 16);
    const timer = setInterval(() => {
        v = Math.min(v + step, target);
        el.textContent = (Number.isInteger(target) ? Math.floor(v) : v.toFixed(1)) + (suffix || '');
        if (v >= target) clearInterval(timer);
    }, 16);
}
function initWardImpact() {
    countUp(document.getElementById('wibTonnes'),  4.2,  't CO₂', 1800);
    countUp(document.getElementById('wibKg'),      18700,'kg',    2000);
    countUp(document.getElementById('wibScans'),   1247, '',      1600);
    countUp(document.getElementById('wibMembers'), 847,  '',      1400);
}

// ============================================================
// GLOBAL LEADERBOARD
// ============================================================
const WORLD_CITIES = [
    { rank:'🥇', flag:'🇸🇬', city:'Singapore',        country:'Singapore',   score:9840, pct:100, trend:'+2.1%' },
    { rank:'🥈', flag:'🇩🇪', city:'Berlin',            country:'Germany',     score:9210, pct:93,  trend:'+1.4%' },
    { rank:'🥉', flag:'🇯🇵', city:'Osaka',             country:'Japan',       score:8970, pct:91,  trend:'+0.8%' },
    { rank:'4',  flag:'🇳🇱', city:'Amsterdam',         country:'Netherlands', score:8600, pct:87,  trend:'+1.9%' },
    { rank:'5',  flag:'🇰🇷', city:'Seoul',             country:'South Korea', score:8340, pct:85,  trend:'+3.2%' },
    { rank:'6',  flag:'🇿🇦', city:'Cape Town',         country:'South Africa',score:7820, pct:79,  trend:'+4.1%' },
    { rank:'7',  flag:'🇧🇷', city:'Curitiba',          country:'Brazil',      score:7450, pct:76,  trend:'+2.7%' },
    { rank:'📍', flag:'🇮🇳', city:'Chennai — Ward 12', country:'India',       score:6890, pct:70,  trend:'+6.8% ↑↑', mine:true },
    { rank:'9',  flag:'🇳🇬', city:'Lagos',             country:'Nigeria',     score:5920, pct:60,  trend:'+8.4%' },
    { rank:'10', flag:'🇰🇪', city:'Nairobi',           country:'Kenya',       score:5430, pct:55,  trend:'+7.2%' },
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

// ============================================================
// AI RECYCLING GUIDE (uses EcoBot KB)
// ============================================================
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
        const html  = escapeHtml(reply)
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
window.queryAiGuide = queryAiGuide;

// ============================================================
// WARD CHALLENGES
// ============================================================
function toggleJoin(btn) {
    if (btn.classList.contains('joined')) {
        btn.classList.remove('joined'); btn.classList.add('primary');
        btn.textContent = t('challenge_join');
        showNotification('👋', t('notif_left'));
    } else {
        btn.classList.remove('primary'); btn.classList.add('joined');
        btn.textContent = t('challenge_joined');
        showNotification('🏘️', t('notif_joined'));
    }
}
function animateChallengeProgress() {
    document.querySelectorAll('.progress-fill').forEach(bar => {
        const w = bar.style.width; bar.style.width = '0%';
        setTimeout(() => { bar.style.width = w; }, 100);
    });
}
window.toggleJoin = toggleJoin;

// ============================================================
// CERTIFICATE
// ============================================================
function initCertificate() {
    const nameEl = document.getElementById('certName');
    const displayName = document.getElementById('userDisplayName');
    if (nameEl && displayName) nameEl.textContent = displayName.textContent || 'EcoWaste User';
    const dateEl = document.getElementById('certDate');
    if (dateEl) dateEl.textContent = 'Issued: ' + new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});

    const certR  = document.getElementById('certRecycled');
    const certC  = document.getElementById('certCO2');
    const certP  = document.getElementById('certPickups');
    const certCh = document.getElementById('certChallenges');
    if (certR)  certR.textContent  = personalStats.recycledKg.toFixed(1) + ' kg';
    if (certC)  certC.textContent  = personalStats.co2Kg.toFixed(2) + ' kg';
    if (certP)  certP.textContent  = requestHistory.filter(r => r.status === 'completed').length || 0;
    if (certCh) certCh.textContent = document.querySelectorAll('.join-btn.joined').length;

    const qrEl = document.getElementById('certQrCode');
    if (qrEl && typeof QRCode !== 'undefined') {
        qrEl.innerHTML = '';
        try {
            new QRCode(qrEl, { text:'https://verify.ecowastepro.in/ECO-2026-WD12-00847', width:76, height:76, correctLevel:QRCode.CorrectLevel.M });
        } catch(e) { qrEl.innerHTML = '<div style="font-size:0.6rem;color:#999;text-align:center;padding:4px">QR<br>Verify</div>'; }
    }
}
function downloadCertificate() { showNotification('⬇️','Certificate download started!'); setTimeout(() => window.print(), 500); }
function shareOn(platform) {
    const name = document.getElementById('userDisplayName')?.textContent || 'A citizen';
    const kg   = personalStats.recycledKg || 0;
    const msg  = `I just recycled ${kg}kg of waste with EcoWaste Pro in Chennai Ward 12! 🌿 Join me in making our city cleaner. #EcoWastePro #Chennai #SDG12`;
    const url  = 'https://ecowastepro.in/ECO-2026-WD12';
    const encoded = encodeURIComponent(msg + ' ' + url);
    const links = {
        whatsapp: `https://wa.me/?text=${encoded}`,
        twitter:  `https://twitter.com/intent/tweet?text=${encoded}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&summary=${encoded}`,
    };
    if (links[platform]) window.open(links[platform], '_blank', 'noopener,width=600,height=500');
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
window.downloadCertificate = downloadCertificate;
window.shareOn = shareOn;
window.copyLink = copyLink;

// ============================================================
// FEED TIMESTAMPS
// ============================================================
function initFeedTimestamps() {
    const startTime = Date.now();
    function updateTimestamps() {
        document.querySelectorAll('.feed-time[data-ts-offset]').forEach(el => {
            const offset  = parseInt(el.dataset.tsOffset);
            const elapsed = startTime - offset + (Date.now() - startTime);
            const s = Math.floor(elapsed / 1000);
            if (s < 60) el.textContent = 'Just now';
            else if (s < 3600) el.textContent = Math.floor(s / 60) + ' minutes ago';
            else if (s < 86400) el.textContent = Math.floor(s / 3600) + ' hour' + (Math.floor(s / 3600) > 1 ? 's' : '') + ' ago';
            else el.textContent = Math.floor(s / 86400) + ' days ago';
        });
    }
    updateTimestamps();
    setInterval(updateTimestamps, 30000);
}

// ============================================================
// DEMO MODE
// ============================================================
function launchDemoMode() {
    currentUser = { type: 'demo', username: 'Priya Sharma' };
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainApp').classList.add('active');
    const fab = document.getElementById('fabEcobot');
    if (fab) fab.style.display = 'flex';
    setLang(currentLang, true);
    document.getElementById('userDisplayName').textContent = 'Priya Sharma';
    document.getElementById('leaderboardUserName').textContent = 'You (Priya Sharma)';
    const userInfo = document.querySelector('.user-info');
    if (userInfo && !document.querySelector('.demo-badge-header')) {
        const badge = document.createElement('span');
        badge.className = 'demo-badge-header'; badge.textContent = '⚡ DEMO';
        userInfo.parentElement.insertBefore(badge, userInfo);
    }

    bins[0].fillLevel = 78; bins[0].lastCollection = '3 days ago';
    bins[1].fillLevel = 45; bins[1].lastCollection = '2 days ago';
    bins[2].fillLevel = 91; bins[2].lastCollection = '5 days ago';
    bins[3].fillLevel = 62; bins[3].lastCollection = '4 days ago';
    bins[4].fillLevel = 34; bins[4].lastCollection = '1 week ago';

    setUserPoints(1240);
    ['headerPoints','totalPoints','dashboardPoints'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = userPoints;
    });
    document.getElementById('totalCollections').textContent = '22';
    const statVals = document.querySelectorAll('#dashboard .stat-value');
    if (statVals.length >= 4) {
        statVals[0].textContent='22'; statVals[1].textContent='41.6 kg';
        statVals[2].textContent='14.8 kg'; statVals[3].textContent=userPoints;
    }
    const dashBinFills = document.querySelectorAll('#dashboard .fill-level-fill');
    if (dashBinFills.length >= 3) {
        [78, 45, 91].forEach((fill, i) => {
            const fc = fill >= 85 ? 'critical' : fill >= 60 ? 'warning' : '';
            dashBinFills[i].style.height = fill + '%';
            dashBinFills[i].textContent  = fill + '%';
            dashBinFills[i].className    = 'fill-level-fill ' + fc;
        });
    }

    // Seed pickup requests using module API
    while (pickupRequests.length) removePickupRequest(pickupRequests[0].id);
    addPickupRequest({ id: Date.now(), binId: 3, binType: 'Organic Waste', binIcon: '🌿', fillLevel: 91,
        address: '14, Anna Nagar East, Ward 12', status: 'dispatched', emergency: false,
        requestTime: new Date(Date.now()-12*60000).toLocaleString(), estimatedArrival: '~8 mins' });

    // Seed recent scans
    recentScans.length = 0;
    addRecentScan({ name:'PET Plastic Bottle', category:'Recyclable', icon:'♻️',
        image:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="%232ecc71" rx="8"/><text y="40" x="10" font-size="30">♻️</text></svg>',
        timestamp: new Date(Date.now()-2*3600000).toISOString() });
    addRecentScan({ name:'Cardboard Box', category:'Recyclable', icon:'📦',
        image:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="%23f39c12" rx="8"/><text y="40" x="10" font-size="30">📦</text></svg>',
        timestamp: new Date(Date.now()-5*3600000).toISOString() });
    addRecentScan({ name:'Old Smartphone', category:'E-Waste', icon:'📱',
        image:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="%236a1b9a" rx="8"/><text y="40" x="10" font-size="30">📱</text></svg>',
        timestamp: new Date(Date.now()-24*3600000).toISOString() });
    displayRecentScans();

    const cards = document.querySelectorAll('.achievement-card.locked');
    if (cards.length >= 3) {
        cards[0].classList.remove('locked'); cards[0].querySelector('.achievement-icon').textContent='🌍';
        cards[1].classList.remove('locked'); cards[1].querySelector('.achievement-icon').textContent='🧙';
        cards[2].classList.remove('locked'); cards[2].querySelector('.achievement-icon').textContent='🌊';
    }

    CITY_BIN_NODES[0].fill=78; CITY_BIN_NODES[1].fill=55;  CITY_BIN_NODES[2].fill=91;
    CITY_BIN_NODES[3].fill=42; CITY_BIN_NODES[4].fill=70;  CITY_BIN_NODES[5].fill=28;
    CITY_BIN_NODES[6].fill=88; CITY_BIN_NODES[7].fill=18;  CITY_BIN_NODES[8].fill=65;
    CITY_BIN_NODES[9].fill=33; CITY_BIN_NODES[10].fill=50; CITY_BIN_NODES[11].fill=97;

    renderBins(); renderActiveRequests(); initCharts(); simulateBinLevelChanges();

    setPersonalStats({ recycledKg:41.6, co2Kg:14.8, scanCount:22, waterSaved:Math.round(41.6*17), energySaved:Math.round(41.6*5.4*10)/10 });
    const statRecycled = document.getElementById('statRecycled');
    const statCO2      = document.getElementById('statCO2');
    if (statRecycled) statRecycled.textContent = '41.6 kg';
    if (statCO2) { statCO2.textContent = '14.8 kg'; statCO2.style.color = '#27ae60'; }
    document.querySelectorAll('.skeleton-card').forEach(c => c.classList.remove('skeleton-card'));
    updateStatisticsTab(); updateLevelBadge();

    const lbPoints = document.querySelector('.leaderboard-item:last-child .leaderboard-points');
    if (lbPoints) lbPoints.textContent = userPoints.toLocaleString() + ' coins';

    setMapInitialized(false);
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('dashboard').classList.add('active');
    document.querySelector('.tab-btn').classList.add('active');
    showNotification('🚀', 'Demo mode loaded! Try the Live City Map tab!');

    setTimeout(() => {
        const panel = document.getElementById('ecobotFloatPanel');
        const fab2  = document.getElementById('fabEcobot');
        if (panel && !panel.classList.contains('open')) { panel.classList.add('open'); fab2.classList.add('open'); }
        const msgs = document.getElementById('ecobotMessages');
        if (msgs) {
            const now = new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
            msgs.insertAdjacentHTML('beforeend', `<div class="ecobot-msg bot"><div class="msg-avatar">🌿</div><div class="msg-bubble" style="border-left:3px solid #e74c3c"><p>🚨 I noticed <strong>Bin C (Organic Waste)</strong> is at <strong style="color:#e74c3c">91%</strong> capacity — well above the critical threshold!<br><br>Want me to request an emergency pickup? It will dispatch <strong>Truck GCC-07</strong> in ~12 minutes.</p><div style="display:flex;gap:0.5rem;margin-top:0.75rem"><button onclick="requestEmergencyPickup();this.closest('.msg-bubble').querySelector('.bot-action-btns').innerHTML='✅ Emergency pickup requested!'" style="background:#e74c3c;color:white;border:none;padding:0.4rem 0.85rem;border-radius:8px;cursor:pointer;font-size:0.82rem;font-weight:700">🚨 Yes, dispatch now</button><button onclick="this.closest('.msg-bubble').querySelector('.bot-action-btns').style.display='none'" style="background:#f0f0f0;border:none;padding:0.4rem 0.85rem;border-radius:8px;cursor:pointer;font-size:0.82rem">Not now</button></div><div class="bot-action-btns"></div><span class="msg-time">${now}</span></div></div>`);
            msgs.scrollTop = msgs.scrollHeight;
        }
    }, 8000);
}
window.launchDemoMode = launchDemoMode;

// ============================================================
// ECOBOT
// ============================================================
function toggleEcobot() {
    const panel = document.getElementById('ecobotFloatPanel');
    const fab   = document.getElementById('fabEcobot');
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
function handleEcobotKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendEcobotMessage(); } }
function autoResizeTextarea(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }
function sendSuggestion(btn) {
    document.getElementById('ecobotInput').value = btn.textContent;
    document.getElementById('ecobotSuggestions').style.display = 'none';
    sendEcobotMessage();
}
window.toggleEcobot = toggleEcobot;
window.handleEcobotKey = handleEcobotKey;
window.autoResizeTextarea = autoResizeTextarea;
window.sendSuggestion = sendSuggestion;

// ── Local knowledge base ──────────────────────────────────────
const ECOBOT_KB = [
    { keys: ['plastic bottle','pet bottle','water bottle','pet plastic','plastic water'],
      reply: `♻️ **Plastic Bottles (PET)** go in the **Blue GCC Dry Waste bin**.\n\n- Rinse and crush before disposing\n- Remove the cap (dispose separately)\n- Drop-off: Kotturpuram Dry Waste Collection Centre\n- Look for ♻️1 symbol on the base\n\n⚠️ Never burn plastic — releases toxic fumes.` },
    { keys: ['plastic bag','carry bag','polythene','poly bag','cover'],
      reply: `🛍️ **Plastic Bags** are tricky — most Chennai bins don't accept them.\n\n- Take to **Reliance Fresh / More Supermarket** collection points\n- Many shops accept old bags for reuse\n- Switch to cloth bags to earn +10 eco coins!\n\n⚠️ Don't throw in dry waste — they clog sorting machines.` },
    { keys: ['styrofoam','thermocol','foam','thermocole'],
      reply: `❌ **Styrofoam / Thermocol** is NOT recyclable in Chennai.\n\n- Place in the **Red GCC General Waste bin**\n- Avoid buying styrofoam-packaged products\n- Some courier companies accept clean thermocol back\n\n⚠️ Never burn — releases styrene gas, which is carcinogenic.` },
    { keys: ['cardboard','carton','box','corrugated'],
      reply: `📦 **Cardboard / Carton boxes** go in the **Blue Dry Waste bin**.\n\n- Flatten before disposing to save space\n- Remove tape and staples if possible\n- Pizza boxes with grease → Red bin (contaminated)\n- Clean boxes → excellent for GCC recycling\n\n💡 Tip: Kabadiwala (door-to-door scrap dealers) pay ₹3–5/kg for clean cardboard.` },
    { keys: ['newspaper','paper','magazine','book','notebook'],
      reply: `📰 **Paper & Newspapers** go in the **Blue GCC Dry Waste bin**.\n\n- Keep dry — wet paper is not recyclable\n- Bundle neatly before placing in bin\n- Sell to local kabadiwala for ₹6–8/kg\n\n💡 Shredded paper → excellent compost carbon layer!` },
    { keys: ['food waste','food scrap','vegetable','fruit','kitchen waste','organic','leftover','cooked food','rice','roti'],
      reply: `🌿 **Food & Kitchen Waste** goes in the **Green GCC Organic bin**.\n\n- Includes: vegetables, fruit peels, cooked food, rice, bread\n- GCC collects daily in Anna Nagar East\n- This goes to Kodungaiyur composting facility\n\n💡 **Home composting** earns +25 eco coins! Use a pot with dry leaves + food scraps.` },
    { keys: ['phone','mobile','smartphone','old phone','broken phone'],
      reply: `📱 **Old/Broken Phones** = **E-Waste** — never in regular bins!\n\n**Chennai Drop-off Points:**\n- Attibele E-Waste Park, GST Road\n- Poorvika Mobile stores (accept old devices)\n- Samsung/Apple service centres\n- GCC E-Waste collection drives (1st Saturday of month)\n\n💡 Working phones → donate to NGO "Mobile for All", Anna Nagar.` },
    { keys: ['battery','batteries','remote battery','aa battery','aaa battery','alkaline'],
      reply: `🔋 **Batteries** are hazardous — NOT in regular bins!\n\n**Chennai disposal:**\n- Authorised battery retailers accept old batteries\n- Car batteries: return to petrol bunks / battery shops (they pay ₹200–500!)\n- Dry cell batteries: Attibele E-Waste Park\n\n⚠️ Leaking batteries → double-bag in plastic before dropping off.` },
    { keys: ['medicine','medicines','tablet','capsule','expired medicine','pills','drug','pharma'],
      reply: `💊 **Expired/Unused Medicines** — never flush or bin!\n\n**Chennai disposal:**\n- **Apollo Pharmacy** (most branches accept returns)\n- **Government Hospital Pharmacies** — free drop-off\n- GCC Hazardous Waste drive (quarterly)\n\n⚠️ Flushing medicines contaminates Chennai's water supply (Chembarambakkam reservoir).` },
    { keys: ['bin','which bin','what bin','what color','colour','blue bin','green bin','red bin'],
      reply: `🗑️ **Chennai GCC Bin Guide — Ward 12:**\n\n🔵 **Blue Bin** — Dry Waste\nPaper, cardboard, plastic bottles, glass, metal, tetra packs\n\n🟢 **Green Bin** — Wet/Organic Waste\nFood scraps, vegetable peels, garden waste, coconut shells\n\n🔴 **Red Bin** — General/Reject Waste\nDirty diapers, sanitary waste, broken ceramics, styrofoam\n\n⚠️ Special: E-Waste, Hazardous, Medical → separate drop-off centres` },
    { keys: ['pickup','collection','schedule','when','timing','truck','collect'],
      reply: `🚛 **GCC Waste Collection — Ward 12, Anna Nagar East:**\n\n- **Wet Waste (Green):** Daily, 6:00–9:00 AM\n- **Dry Waste (Blue):** Monday, Wednesday, Friday\n- **Bulk items:** Call **1913** for special pickup\n- **E-Waste camp:** 1st Saturday of each month\n\n📍 Nearest GCC depot: Anna Nagar East Sanitation Depot, 10th Main Road\n\nRequest pickup directly from the **My Bins** tab! 🗑️` },
    { keys: ['points','coins','rewards','earn','how to earn','eco coin'],
      reply: `🏆 **Earn EcoCoins in EcoWaste Pro:**\n\n- 📸 AI Waste Scan → **+15 coins**\n- 🚛 Request Pickup → **+15 coins**\n- 🏘️ Join Ward Challenge → **+10 coins**\n- 🌿 Use EcoBot → **+5 coins**\n- 📚 AI Guide query → **+3 coins**\n- 🚨 Emergency Pickup → **+25 coins**\n\n🎁 **Redeem for:** MTC bus passes, café discounts, tree plantings, utility bill credits!` },
    { keys: ['hello','hi','hey','hai','helo','good morning','good afternoon','good evening','namaste','vanakkam'],
      reply: `👋 Hello! I'm **EcoBot**, your local waste management guide for **Ward 12, Anna Nagar East, Chennai**!\n\nI can help you with:\n- 🗑️ Which bin for any item\n- ♻️ Recycling tips & drop-off locations\n- 🌿 Home composting guide\n- 📱 E-waste disposal\n- 🚛 Pickup scheduling\n- 🏆 How to earn EcoCoins\n\nWhat would you like to know?` },
    { keys: ['thank','thanks','thank you','nandri','shukriya','dhanyawad'],
      reply: `🌱 You're welcome! Every small eco-action adds up. Together, Ward 12 is making Chennai cleaner!\n\nTip: Each chat earns you **+5 EcoCoins** 🏆\nKeep asking — I'm always here!` },
    { keys: ['helpline','number','contact','phone number','call','gcc','complaint'],
      reply: `📞 **GCC Ward 12 Contacts:**\n\n- **GCC Helpline:** 1913 (24×7, free)\n- **Sanitation Dept:** +91-44-2538-3957\n- **E-Waste Drive:** +91-44-2500-7301\n\n🌐 chennaicorporation.gov.in\n📱 GCC mobile app available on Play Store` },
];

const ECOBOT_FALLBACK = [
    `🤔 I'm not sure about that specific item. Here's my general guidance:\n\n- 🔵 **Blue Bin:** Paper, plastic bottles, glass, metal, cardboard\n- 🟢 **Green Bin:** Food waste, vegetable peels, garden waste\n- 🔴 **Red Bin:** Diapers, sanitary waste, ceramics, styrofoam\n- ☣️ **Special:** E-waste, medicines, batteries → dedicated drop-off\n\n📞 Unsure? Call GCC: **1913** or ask me differently!`,
    `🌿 I don't have specific info on that, but you can:\n\n1. Check GCC Chennai's waste guidelines: chennaicorporation.gov.in\n2. Call GCC Helpline: **1913** (free, 24×7)\n3. Use the **AI Scanner** tab to photograph the item for a detailed analysis`,
    `♻️ Great question! For items I'm not sure about, the safest rule:\n\n**When in doubt → Red General Bin** (avoids contaminating recyclables)\n\nBut first, ask yourself:\n- Is it clean and dry? → Blue Dry Waste\n- Is it food/plant-based? → Green Organic\n- Is it electronic/battery? → E-Waste centre\n\n💡 Use the **AI Scanner** for a photo-based answer!`,
];
let _fallbackIndex = 0;

function ecobotLocalResponse(userText) {
    const lower = userText.toLowerCase();
    for (const entry of ECOBOT_KB) {
        if (entry.keys.some(k => lower.includes(k))) return entry.reply;
    }
    const resp = ECOBOT_FALLBACK[_fallbackIndex % ECOBOT_FALLBACK.length];
    _fallbackIndex++;
    return resp;
}

function ecobotLocalResponseLang(userText) {
    const lower = userText.toLowerCase();
    if (currentLang === 'ta') {
        const tamilKB = [
            { keys: ['பிளாஸ்டிக்','பாட்டில்','water bottle'], reply: `♻️ **பிளாஸ்டிக் பாட்டில்** (PET) — **நீல GCC Dry Waste bin**-ல் போடுங்கள்.\n\n- கழுவி, நசுக்கி போடுங்கள்\n- மூடியை தனியாக போடுங்கள்\n- கொட்டூர்பூரம் Dry Waste Centre\n\n⚠️ எரிக்காதீர்கள் — நச்சு புகை வரும்.` },
            { keys: ['உணவு கழிவு','சமையல்','காய்கறி','பழம்'], reply: `🌿 **உணவு கழிவு** — **பச்சை GCC Organic bin**-ல் போடுங்கள்.\n\n- GCC தினமும் Anna Nagar East-ல் சேகரிக்கும்\n\n💡 வீட்டில் உரமிட்டால் +25 EcoCoins கிடைக்கும்!` },
            { keys: ['பேட்டரி','battery'], reply: `🔋 **பேட்டரி** — சாதாரண bin-ல் போடாதீர்கள்!\n\n- Attibele E-Waste Park, GST Road\n\n📞 GCC: **1913**` },
            { keys: ['மருந்து','மாத்திரை'], reply: `💊 **காலாவதியான மருந்துகள்** — flush செய்யாதீர்கள்!\n\n- Apollo Pharmacy-ல் கொடுங்கள்` },
            { keys: ['தொலைபேசி','mobile','phone'], reply: `📱 **பழைய தொலைபேசி** = E-கழிவு\n\n- Poorvika Mobile stores\n- GCC E-Waste camp (ஒவ்வொரு மாதமும் 1ஆம் சனிக்கிழமை)` },
        ];
        for (const entry of tamilKB) {
            if (entry.keys.some(k => lower.includes(k))) return entry.reply;
        }
    }
    return ecobotLocalResponse(userText);
}

function sendEcobotMessage() {
    if (ecobotTyping) return;
    const input = document.getElementById('ecobotInput');
    const text  = input.value.trim();
    if (!text) return;

    input.value = ''; input.style.height = 'auto';
    document.getElementById('ecobotSuggestions').style.display = 'none';

    const name     = (currentUser && currentUser.username) ? currentUser.username : 'You';
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    appendEcobotMsg('user', text, initials);

    setEcobotTyping(true);
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
        setEcobotTyping(false);
        document.getElementById('ecobotSendBtn').disabled = false;
        document.getElementById('ecobotInput').focus();
    }, delay);
}

function appendEcobotMsg(role, text, avatar) {
    const msgs = document.getElementById('ecobotMessages');
    const now  = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
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
window.sendEcobotMessage = sendEcobotMessage;

// ============================================================
// VOICE INPUT
// ============================================================
function toggleVoice() {
    const btn = document.getElementById('voiceInputBtn');
    const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { if (btn) btn.style.display = 'none'; showNotification('⚠️','Voice input not supported in this browser'); return; }
    if (voiceRecog && btn.classList.contains('listening')) { voiceRecog.stop(); return; }
    const recog = new SR();
    setVoiceRecog(recog);
    recog.lang = currentLang === 'ta' ? 'ta-IN' : 'en-IN';
    recog.interimResults = false;
    recog.onstart  = () => { btn.classList.add('listening'); btn.textContent = '⏹'; };
    recog.onresult = e => {
        const text = e.results[0][0].transcript;
        const inp  = document.getElementById('ecobotInput');
        if (inp) { inp.value = text; sendEcobotMessage(); }
    };
    recog.onerror = () => showNotification('⚠️','Voice error — try again');
    recog.onend   = () => { btn.classList.remove('listening'); btn.textContent = '🎤'; };
    recog.start();
}
window.toggleVoice = toggleVoice;

// ============================================================
// AUTOPILOT / PRESENTATION MODE
// ============================================================
const AP_SCRIPT = [
    { title:'Chennai generates 4,800 tonnes of waste daily', desc:'60% ends up in landfill. EcoWaste Pro uses AI, real-time IoT and civic gamification to change that — one scan at a time.', tab:'dashboard', duration:6500 },
    { title:'🤖 AI Scanner — powered by Claude Vision', desc:'Photograph any waste item. Claude classifies it instantly and gives Chennai-specific disposal steps. Earn +15 coins per scan.', tab:'scanner', duration:7500, action:() => { loadDemoScan(0); setTimeout(() => analyzeImage(), 1800); } },
    { title:'🗺️ Live City Bin Grid — Real-Time IoT', desc:'12 smart bin clusters monitored across Anna Nagar East. Critical bins auto-dispatch GCC waste trucks with live ETA tracking.', tab:'map', duration:8000 },
    { title:'🏆 Gamified Green Rewards — Real Redemptions', desc:'Earn coins for every eco-action — redeemable for MTC bus passes, café discounts, tree plantings and government utility credits.', tab:'rewards', duration:6000 },
    { title:'🏘️ Ward Challenges & Global City Leaderboard', desc:'Ward 12 ranks #2 in Chennai and #8 globally. Citizens collaborate on challenges and compete against Singapore, Berlin and Seoul.', tab:'community', duration:6500 },
    { title:'🌍 UN SDGs 11 · 12 · 13 · 17 — Built to Scale', desc:'From a single ward to every city in India. Open API for GCC integration. Multi-language (English + Tamil). PWA — works offline.', tab:'dashboard', duration:6000 },
];

function startAutopilot() {
    if (!currentUser) launchDemoMode();
    setApStep(0);
    document.getElementById('autopilotOverlay').classList.add('active');
    runApStep();
}
function runApStep() {
    if (apStep >= AP_SCRIPT.length) { stopAutopilot(); return; }
    const s = AP_SCRIPT[apStep];
    document.getElementById('apStepLabel').textContent = `Step ${apStep+1} of ${AP_SCRIPT.length}`;
    document.getElementById('apTitle').textContent     = s.title;
    document.getElementById('apDesc').textContent      = s.desc;
    document.getElementById('apDots').innerHTML = AP_SCRIPT.map((_,i) =>
        `<div class="ap-dot ${i < apStep ? 'done' : i === apStep ? 'active-dot' : ''}"></div>`
    ).join('');
    const fill = document.getElementById('apTimerFill');
    if (fill) {
        fill.style.transition = 'none'; fill.style.width = '0%';
        requestAnimationFrame(() => { fill.style.transition = `width ${s.duration}ms linear`; fill.style.width = '100%'; });
    }
    openTab(s.tab);
    if (s.action) setTimeout(s.action, 900);
    const _apTimerId = apTimerId;
    if (_apTimerId) clearTimeout(_apTimerId);
    setApTimerId(setTimeout(() => { setApStep(apStep + 1); runApStep(); }, s.duration));
}
function apNextStep() { const t = apTimerId; if (t) clearTimeout(t); setApStep(apStep + 1); runApStep(); }
function stopAutopilot() { const t = apTimerId; if (t) clearTimeout(t); document.getElementById('autopilotOverlay').classList.remove('active'); openTab('dashboard'); }
window.startAutopilot = startAutopilot;
window.apNextStep     = apNextStep;
window.stopAutopilot  = stopAutopilot;

// ============================================================
// PWA
// ============================================================
function initPWA() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(r => console.log('[EcoWaste SW]', r.scope))
            .catch(e => console.warn('[EcoWaste SW] failed:', e));
    }
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        setDeferredPrompt(e);
        const b = document.getElementById('pwaInstallBanner');
        if (b) b.classList.add('show');
    });
    window.addEventListener('online', () => {
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
        setDeferredPrompt(null);
        const b = document.getElementById('pwaInstallBanner');
        if (b) b.classList.remove('show');
    });
}
window.installPWA = installPWA;

// ============================================================
// ONBOARDING TOUR
// ============================================================
const ONBOARDING_STEPS = [
    { target: () => document.querySelector('.tab-btn[onclick*="scanner"]'), title:'🤖 Try the AI Scanner', text:'Photograph any waste item — Claude classifies it instantly and tells you exactly where to dispose it in Chennai.', position:'bottom' },
    { target: () => document.querySelector('.tab-btn[onclick*="map"]'),     title:'🗺️ Live City Map',   text:'Watch real-time bin fill levels across Ward 12. GCC trucks auto-dispatch when bins go critical!', position:'bottom' },
    { target: () => document.getElementById('fabEcobot'),                    title:'🌿 Meet EcoBot',    text:'Ask EcoBot anything about waste disposal — works 100% offline, no API key needed!', position:'top' },
];

function startOnboardingTour() {
    setOnboardStep(0);
    if (onboardOverlay) onboardOverlay.remove();
    const overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    overlay.id = 'onboardingOverlay';
    document.body.appendChild(overlay);
    setOnboardOverlay(overlay);
    showOnboardStep();
}
function showOnboardStep() {
    const overlay = onboardOverlay;
    if (!overlay) return;
    if (onboardStep >= ONBOARDING_STEPS.length) { finishOnboarding(); return; }
    overlay.innerHTML = '';
    const step   = ONBOARDING_STEPS[onboardStep];
    const target = step.target();
    if (!target) { setOnboardStep(onboardStep + 1); showOnboardStep(); return; }
    const rect = target.getBoundingClientRect();
    const pad  = 8;
    const spot = document.createElement('div');
    spot.className = 'onboarding-spotlight';
    spot.style.cssText = `top:${rect.top+window.scrollY-pad}px;left:${rect.left-pad}px;width:${rect.width+pad*2}px;height:${rect.height+pad*2}px`;
    const tip = document.createElement('div');
    tip.className = 'onboarding-tooltip';
    const isTop = step.position === 'top' || rect.top > window.innerHeight * 0.7;
    tip.style.cssText = isTop
        ? `bottom:${window.innerHeight-rect.top+window.scrollY+16}px;left:${Math.max(16,rect.left-40)}px`
        : `top:${rect.bottom+window.scrollY+16}px;left:${Math.max(16,rect.left-40)}px`;
    tip.innerHTML = `
        <h4>${step.title}</h4>
        <p>${step.text}</p>
        <div class="onboarding-btn-row">
            <button class="onboarding-skip-btn" onclick="finishOnboarding()">Skip</button>
            <button class="onboarding-next-btn" onclick="nextOnboardStep()">${onboardStep < ONBOARDING_STEPS.length - 1 ? 'Next →' : '✅ Done!'}</button>
        </div>
        <div style="font-size:0.72rem;color:#aaa;text-align:center;margin-top:0.5rem">${onboardStep+1} / ${ONBOARDING_STEPS.length}</div>`;
    overlay.appendChild(spot);
    overlay.appendChild(tip);
    overlay.style.pointerEvents = 'none';
    tip.style.pointerEvents = 'all';
}
function nextOnboardStep() { setOnboardStep(onboardStep + 1); showOnboardStep(); }
function finishOnboarding() {
    if (onboardOverlay) onboardOverlay.remove();
    setOnboardOverlay(null);
    try { sessionStorage.setItem('ewp_toured', '1'); } catch(e){}
}
window.startOnboardingTour = startOnboardingTour;
window.nextOnboardStep     = nextOnboardStep;
window.finishOnboarding    = finishOnboarding;

// ============================================================
// API KEY BADGE
// ============================================================
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
    setApiKey('');
    sessionStorage.removeItem('ewp_api_key');
    promptForApiKey().then(() => injectApiKeyBadge());
}
window.reEnterApiKey = reEnterApiKey;

// ============================================================
// DOMContentLoaded
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
    renderBins();
    renderActiveRequests();
    initTheme();
    initPWA();
    renderGlobalLb();
    initWardImpact();
    initFeedTimestamps();

    const savedKey = sessionStorage.getItem('ewp_api_key');
    if (savedKey) setApiKey(savedKey);
    injectApiKeyBadge();

    const offlineBadge = document.createElement('div');
    offlineBadge.id = 'offlineFirstBadge';
    offlineBadge.setAttribute('aria-label', 'EcoBot works offline');
    offlineBadge.innerHTML = `<span>📶</span><span>EcoBot Works Offline ✓</span>`;
    document.body.appendChild(offlineBadge);

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const voiceBtn = document.getElementById('voiceInputBtn');
    if (!SR && voiceBtn) voiceBtn.style.display = 'none';

    document.addEventListener('keydown', e => {
        if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey
            && document.activeElement.tagName !== 'INPUT'
            && document.activeElement.tagName !== 'TEXTAREA') {
            startAutopilot();
        }
    });
});