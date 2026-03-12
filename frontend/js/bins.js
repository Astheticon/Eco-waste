// ============================================================
// BINS.JS — Bin rendering & pickup request logic
// EcoWaste Pro · frontend-refactor branch
// ============================================================

import {
    bins,
    pickupRequests,
    requestHistory,
    addPickupRequest,
    removePickupRequest,
    currentLang,
} from './state.js';

import { fetchPickupETA } from './api.js';

// ── i18n helper ──────────────────────────────────────────────
function t(key) {
    if (typeof window !== 'undefined' && typeof window.t === 'function') return window.t(key);
    return key;
}

// ── Notification helper ───────────────────────────────────────
function notify(icon, msg) {
    if (typeof showNotification === 'function') showNotification(icon, msg);
}

// ============================================================
// RENDER — My Bins grid
// ============================================================
export function renderBins() {
    const grid = document.getElementById('binGrid');
    if (!grid) return;
    grid.innerHTML = bins.map(bin => {
        const fillClass   = bin.fillLevel >= 85 ? 'critical' : bin.fillLevel >= 60 ? 'warning' : '';
        const isRequested = pickupRequests.some(r => r.binId === bin.id && r.status === 'pending');
        return `
            <div class="bin-card ${fillClass}">
                <div class="bin-icon">${bin.icon}</div>
                <div class="bin-type">${bin.type}</div>
                <div class="fill-level-container">
                    <div class="fill-level-bar">
                        <div class="fill-level-fill ${fillClass}" style="height:${bin.fillLevel}%">
                            ${bin.fillLevel}%
                        </div>
                    </div>
                </div>
                <div class="bin-info">
                    <div>${t('bin_capacity')}: ${bin.capacity}</div>
                    <div>${t('bin_last')}: ${bin.lastCollection}</div>
                </div>
                <button
                    class="request-pickup-btn ${isRequested ? 'requested' : ''}"
                    onclick="requestPickup(${bin.id})"
                    ${isRequested ? 'disabled' : ''}
                >
                    ${isRequested ? t('btn_requested') : t('btn_request_pickup')}
                </button>
            </div>`;
    }).join('');
}

// ============================================================
// RENDER — Active pickup requests list
// ============================================================
export function renderActiveRequests() {
    const c = document.getElementById('activeRequests');
    if (!c) return;

    if (!pickupRequests.length) {
        c.innerHTML = `<p style="text-align:center;color:#999;padding:2rem">${t('req_no_active')}</p>`;
        return;
    }

    c.innerHTML = pickupRequests.map(r => `
        <div class="request-item ${r.status}">
            <div>
                <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">
                    <span style="font-size:1.5rem">${r.binIcon}</span>
                    <strong>${r.binType}</strong>
                    ${r.emergency
                        ? `<span style="background:#e74c3c;color:white;padding:0.2rem 0.5rem;border-radius:10px;font-size:0.75rem">
                               ${t('req_emergency')}
                           </span>`
                        : ''}
                </div>
                <div style="color:#666;font-size:0.9rem">
                    <div>📍 ${r.address}</div>
                    <div>📊 Fill: ${r.fillLevel}%</div>
                    ${r.status === 'dispatched'
                        ? `<div style="color:#1976d2;font-weight:600">
                               ${t('req_eta')}: ${r.estimatedArrival}
                           </div>`
                        : ''}
                </div>
            </div>
            <div class="request-status ${r.status === 'dispatched' ? 'status-dispatched' : 'status-pending'}">
                ${r.status === 'dispatched' ? t('req_on_the_way') : t('req_pending')}
            </div>
        </div>`).join('');
}

// ============================================================
// REQUEST — Standard pickup
// ============================================================
export function requestPickup(binId) {
    const bin = bins.find(b => b.id === binId);
    if (!bin) return;

    const request = {
        id: Date.now(),
        binId,
        binType: bin.type,
        binIcon: bin.icon,
        fillLevel: bin.fillLevel,
        status: 'pending',
        emergency: false,
        requestTime: new Date().toISOString(),
        address: '14, Anna Nagar East, Ward 12',
        estimatedArrival: calculateEstimatedArrival(),
    };

    addPickupRequest(request);
    renderBins();
    renderActiveRequests();

    if (typeof awardPoints === 'function') awardPoints(15, `✅ ${t('btn_request_pickup')} — +15`);

    _generateAIPickupETA(request);

    const gccRef = String(Math.floor(10000 + Math.random() * 90000));
    setTimeout(() => {
        if (typeof showGCCToast === 'function') showGCCToast(gccRef);
    }, 1200);

    setTimeout(() => dispatchTruckToLocation(request.id), 2000);
}

// ============================================================
// REQUEST — Emergency pickup (all bins >= 60%)
// ============================================================
export function requestEmergencyPickup() {
    const fullBins = bins.filter(b => b.fillLevel >= 60);
    if (!fullBins.length) {
        notify('ℹ️', 'No bins need immediate pickup');
        return;
    }

    fullBins.forEach(bin => {
        if (pickupRequests.some(r => r.binId === bin.id && r.status === 'pending')) return;
        const request = {
            id: Date.now() + bin.id,
            binId: bin.id,
            binType: bin.type,
            binIcon: bin.icon,
            fillLevel: bin.fillLevel,
            status: 'pending',
            emergency: true,
            requestTime: new Date().toISOString(),
            address: '14, Anna Nagar East, Ward 12',
            estimatedArrival: calculateEstimatedArrival(true),
        };
        addPickupRequest(request);
    });

    renderBins();
    renderActiveRequests();
    if (typeof awardPoints === 'function') awardPoints(25, '🚨 Emergency pickup requested! +25 points');
}

// ============================================================
// DISPATCH & COMPLETE
// ============================================================
export function dispatchTruckToLocation(requestId) {
    const request = pickupRequests.find(r => r.id === requestId);
    if (!request) return;
    request.status = 'dispatched';
    renderActiveRequests();
    notify('🚛', `Truck dispatched for ${request.binType}!`);
    setTimeout(() => completePickup(requestId), request.emergency ? 15000 : 30000);
}

export function completePickup(requestId) {
    const request = pickupRequests.find(r => r.id === requestId);
    if (!request) return;

    const bin = bins.find(b => b.id === request.binId);
    if (bin) { bin.fillLevel = Math.floor(Math.random() * 15) + 5; bin.lastCollection = 'Just now'; }

    request.status = 'completed';
    const histEntry = requestHistory.find(r => r.id === requestId);
    if (histEntry) histEntry.status = 'completed';

    removePickupRequest(requestId);
    renderBins();
    renderActiveRequests();
    if (typeof updateDashboard === 'function') updateDashboard();
    notify('✅', `${request.binType} collected!`);
}

// ============================================================
// HELPERS
// ============================================================
export function calculateEstimatedArrival(emergency = false) {
    const base  = emergency ? 10 : 20;
    const range = emergency ? 20 : 40;
    return `${Math.floor(Math.random() * range) + base} minutes`;
}

async function _generateAIPickupETA(request) {
    const trucks  = ['GCC-01', 'GCC-07', 'GCC-12'];
    const areas   = ['Shastri Nagar', 'Annanagar East', 'Chinthamani', 'Thirumangalam', 'Varadarajapuram'];
    const truck   = { label: 'Truck ' + trucks[Math.floor(Math.random() * trucks.length)] };
    const context = { area: areas[Math.floor(Math.random() * areas.length)], km: (1.2 + Math.random() * 3).toFixed(1) };
    const mins    = Math.floor(8 + Math.random() * 18);

    notify('🚛', `${truck.label} is ${context.km} km away near ${context.area} — ETA ~${mins} mins`);

    const req = pickupRequests.find(r => r.id === request.id);
    if (req) { req.estimatedArrival = `~${mins} mins · ${truck.label} near ${context.area}`; renderActiveRequests(); }

    try {
        const eta = await fetchPickupETA(request, truck, context);
        if (eta && req) { req.estimatedArrival = eta; renderActiveRequests(); }
    } catch (e) { /* keep optimistic message */ }
}

// ============================================================
// BIN LEVEL SIMULATION (fallback when map tab not open)
// ============================================================
export function simulateBinLevelChanges() {
    setInterval(() => {
        bins.forEach(b => {
            if (b.fillLevel < 95 && Math.random() > 0.7)
                b.fillLevel = Math.min(100, b.fillLevel + Math.floor(Math.random() * 3) + 1);
        });
        if (document.getElementById('pickup')?.classList.contains('active')) renderBins();
        const dashBinFills = document.querySelectorAll('#dashboard .fill-level-fill');
        if (dashBinFills.length >= 3) {
            [0, 1, 2].forEach(i => {
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
// SYNC — city map nodes -> personal bins (called by city sim)
// ============================================================
export function syncMyBins(CITY_BIN_NODES) {
    const syncMap = [
        { binIdx: 0, nodeId: 'B1' },
        { binIdx: 1, nodeId: 'B2' },
        { binIdx: 2, nodeId: 'B3' },
        { binIdx: 3, nodeId: 'B4' },
        { binIdx: 4, nodeId: 'B9' },
    ];
    syncMap.forEach(({ binIdx, nodeId }) => {
        const node = CITY_BIN_NODES.find(n => n.id === nodeId);
        if (node && bins[binIdx]) bins[binIdx].fillLevel = node.fill;
    });
    if (document.getElementById('pickup')?.classList.contains('active')) renderBins();
    const dashBinFills = document.querySelectorAll('#dashboard .fill-level-fill');
    if (dashBinFills.length >= 3) {
        [0, 1, 2].forEach(i => {
            const fill = bins[i]?.fillLevel ?? 0;
            const fc   = fill >= 85 ? 'critical' : fill >= 60 ? 'warning' : '';
            dashBinFills[i].style.height = fill + '%';
            dashBinFills[i].textContent  = fill + '%';
            dashBinFills[i].className    = 'fill-level-fill ' + fc;
        });
    }
}