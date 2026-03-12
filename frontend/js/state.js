// ============================================================
// STATE.JS — All global state for EcoWaste Pro
// EcoWaste Pro · frontend-refactor branch
//
// Every variable that was previously declared at the top of
// the monolithic app.js lives here. Modules import what they
// need; app.js imports everything.
// ============================================================

// ── API Key ───────────────────────────────────────────────────
export let ANTHROPIC_API_KEY = '';
export function setApiKey(key) {
    ANTHROPIC_API_KEY = (key || '').trim();
    if (ANTHROPIC_API_KEY) sessionStorage.setItem('ewp_api_key', ANTHROPIC_API_KEY);
}

// ── My Bins ───────────────────────────────────────────────────
export let bins = [
    { id: 1, type: 'General Waste',  icon: '🗑️', fillLevel: 10,  capacity: '240L', lastCollection: 'Never' },
    { id: 2, type: 'Recyclables',    icon: '♻️', fillLevel: 15,  capacity: '240L', lastCollection: 'Never' },
    { id: 3, type: 'Organic Waste',  icon: '🌿', fillLevel: 5,   capacity: '120L', lastCollection: 'Never' },
    { id: 4, type: 'Glass & Metal',  icon: '🍾', fillLevel: 8,   capacity: '120L', lastCollection: 'Never' },
    { id: 5, type: 'Medical Waste',  icon: '🏥', fillLevel: 12,  capacity: '60L',  lastCollection: 'Never' },
];

// ── Pickup Requests ───────────────────────────────────────────
export let pickupRequests = [];
export function addPickupRequest(req) {
    pickupRequests.push(req);
    requestHistory.unshift({ ...req });
}
export function removePickupRequest(id) {
    const idx = pickupRequests.findIndex(r => r.id === id);
    if (idx !== -1) pickupRequests.splice(idx, 1);
}

export let requestHistory = [];

// ── Personal Stats ────────────────────────────────────────────
export let personalStats = {
    recycledKg:  0,
    co2Kg:       0,
    scanCount:   0,
    waterSaved:  0,
    energySaved: 0,
};
export function setPersonalStats(obj) {
    Object.assign(personalStats, obj);
}

// ── Points ────────────────────────────────────────────────────
export let userPoints = 0;
export function addUserPoints(n) { userPoints += n; }
export function setUserPoints(n) { userPoints = n; }

// ── Scanner ───────────────────────────────────────────────────
export let currentImage = null;
export function setCurrentImage(img) { currentImage = img; }

export let recentScans = [];
export function addRecentScan(scan) {
    recentScans.unshift(scan);
    if (recentScans.length > 6) recentScans.pop();
}

// ── City Map constants ────────────────────────────────────────
export const DEFAULT_LAT = 13.0827;
export const DEFAULT_LNG = 80.2707;

export const CITY_BIN_NODES = [
    { id:'B1',  label:'Bin Cluster A', subtype:'General',   icon:'🗑️', latOff:  0.000, lngOff:  0.000, fill: 10  },
    { id:'B2',  label:'Bin Cluster B', subtype:'Recycling', icon:'♻️', latOff:  0.003, lngOff:  0.005, fill: 68  },
    { id:'B3',  label:'Bin Cluster C', subtype:'Organic',   icon:'🌿', latOff: -0.004, lngOff:  0.003, fill: 92  },
    { id:'B4',  label:'Bin Cluster D', subtype:'General',   icon:'🗑️', latOff:  0.005, lngOff: -0.004, fill: 48  },
    { id:'B5',  label:'Bin Cluster E', subtype:'E-Waste',   icon:'🔋', latOff: -0.002, lngOff: -0.006, fill: 77  },
    { id:'B6',  label:'Bin Cluster F', subtype:'Recycling', icon:'♻️', latOff:  0.007, lngOff:  0.002, fill: 35  },
    { id:'B7',  label:'Bin Cluster G', subtype:'Hazardous', icon:'⚠️', latOff: -0.006, lngOff:  0.006, fill: 88  },
    { id:'B8',  label:'Bin Cluster H', subtype:'General',   icon:'🗑️', latOff:  0.001, lngOff: -0.008, fill: 22  },
    { id:'B9',  label:'Bin Cluster I', subtype:'Medical',   icon:'🏥', latOff: -0.008, lngOff: -0.003, fill: 61  },
    { id:'B10', label:'Bin Cluster J', subtype:'Organic',   icon:'🌿', latOff:  0.009, lngOff: -0.002, fill: 14  },
    { id:'B11', label:'Bin Cluster K', subtype:'General',   icon:'🗑️', latOff: -0.003, lngOff:  0.009, fill: 55  },
    { id:'B12', label:'Bin Cluster L', subtype:'Recycling', icon:'♻️', latOff:  0.006, lngOff:  0.008, fill: 97  },
];

export const CITY_TRUCKS = [
    { id:'T1', label:'Truck GCC-01', subtype:'General Waste', latOff:  0.004, lngOff:  0.006, targetBin: null, collecting: false, eta: null },
    { id:'T2', label:'Truck GCC-07', subtype:'Recycling',     latOff: -0.005, lngOff: -0.005, targetBin: null, collecting: false, eta: null },
    { id:'T3', label:'Truck GCC-12', subtype:'Organic',       latOff:  0.006, lngOff: -0.007, targetBin: null, collecting: false, eta: null },
];

// ── Map runtime state ─────────────────────────────────────────
export let map            = null;
export let mapInitialized = false;
export function setMap(m)              { map = m; }
export function setMapInitialized(v)   { mapInitialized = v; }

export let baseLat = DEFAULT_LAT;
export let baseLng = DEFAULT_LNG;
export function setBaseLat(v) { baseLat = v; }
export function setBaseLng(v) { baseLng = v; }

export let simTick  = 0;
export let simSpeed = 1;
export function incSimTick()     { simTick++; }
export function setSimSpeed(v)   { simSpeed = v; }

export let cityBinMarkers    = [];
export let cityTruckMarkers  = [];
export let cityRouteLines    = {};
export function setCityBinMarkers(v)   { cityBinMarkers = v; }
export function setCityTruckMarkers(v) { cityTruckMarkers = v; }
export function setCityRouteLines(v)   { cityRouteLines = v; }

export let liveSimInterval    = null;
export let truckMoveInterval  = null;
export let cityClockInterval  = null;
export function setLiveSimInterval(v)   { liveSimInterval = v; }
export function setTruckMoveInterval(v) { truckMoveInterval = v; }
export function setCityClockInterval(v) { cityClockInterval = v; }

export let alertedBins   = new Set();
export let prevCritCount = 0;
export function setPrevCritCount(v) { prevCritCount = v; }

// ── UI / Theme ────────────────────────────────────────────────
export let isDark = false;
export function setIsDark(v) { isDark = v; }

export let currentLang = (() => {
    try { return localStorage.getItem('ecowaste_lang') || 'en'; } catch(e) { return 'en'; }
})();
export function setCurrentLang(v) { currentLang = v; }

export let chartInstances = [];

// ── Live event ticker ─────────────────────────────────────────
export let liveEvents = [];

// ── PWA ───────────────────────────────────────────────────────
export let deferredPrompt = null;
export function setDeferredPrompt(v) { deferredPrompt = v; }

// ── EcoBot ────────────────────────────────────────────────────
export let ecobotTyping = false;
export function setEcobotTyping(v) { ecobotTyping = v; }

export let fallbackIndex = 0;
export function incFallbackIndex() { fallbackIndex++; }

// ── Voice ─────────────────────────────────────────────────────
export let voiceRecog = null;
export function setVoiceRecog(v) { voiceRecog = v; }

// ── Camera ────────────────────────────────────────────────────
export let cameraStream = null;
export function setCameraStream(v) { cameraStream = v; }

// ── Onboarding ────────────────────────────────────────────────
export let onboardStep    = 0;
export let onboardOverlay = null;
export function setOnboardStep(v)    { onboardStep = v; }
export function setOnboardOverlay(v) { onboardOverlay = v; }

// ── Autopilot ─────────────────────────────────────────────────
export let apStep    = 0;
export let apTimerId = null;
export function setApStep(v)    { apStep = v; }
export function setApTimerId(v) { apTimerId = v; }