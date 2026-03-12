// ============================================================
// STATS.JS — Statistics, charts, gamification & achievements
// EcoWaste Pro · frontend-refactor branch
// ============================================================

import {
    personalStats,
    setPersonalStats,
    userPoints,
    addUserPoints,
    setUserPoints,
    chartInstances,
    isDark,
    currentLang,
} from './stats.js';

import { fetchWasteInsight } from './api.js';

// ── Helpers ───────────────────────────────────────────────────
function t(key) {
    if (typeof window.t === 'function') return window.t(key);
    return key;
}
function notify(icon, msg) {
    if (typeof showNotification === 'function') showNotification(icon, msg);
}

// ============================================================
// PERSONAL STATS — update after every scan
// ============================================================
export function updatePersonalStats(category) {
    const kgMap  = { 'Recyclable':0.3, 'Organic':0.5, 'E-Waste':0.8, 'Hazardous':0.2, 'General Waste':0.4, 'Medical Waste':0.3 };
    const co2Map = { 'Recyclable':0.18,'Organic':0.12,'E-Waste':0.6, 'Hazardous':0.08,'General Waste':0.05,'Medical Waste':0.05 };

    const kg  = kgMap[category]  ?? 0.3;
    const co2 = co2Map[category] ?? 0.1;

    setPersonalStats({
        recycledKg:  Math.round((personalStats.recycledKg  + kg)  * 10) / 10,
        co2Kg:       Math.round((personalStats.co2Kg       + co2) * 100) / 100,
        scanCount:   personalStats.scanCount + 1,
        waterSaved:  Math.round((personalStats.recycledKg  + kg)  * 17),
        energySaved: Math.round((personalStats.recycledKg  + kg)  * 5.4 * 10) / 10,
    });

    // Animate the two dashboard stat cards
    animateStatUpdate('statRecycled', personalStats.recycledKg + ' kg', '#27ae60');
    animateStatUpdate('statCO2',      personalStats.co2Kg      + ' kg', '#16a085');

    // Remove skeleton shimmer
    document.querySelectorAll('.skeleton-card').forEach(c => c.classList.remove('skeleton-card'));

    updateStatisticsTab();

    // SDG impact overlay
    const sdgPts = (co2 * 0.3).toFixed(2);
    showSDGImpact(`Your scan contributed +${sdgPts} pts to Chennai's SDG 12 score 🌍`);

    // AI insight after 3 scans
    if (personalStats.scanCount >= 3) setTimeout(generateWasteInsight, 1500);

    checkAchievements();
}

// ============================================================
// STATISTICS TAB — sync all stat cards
// ============================================================
export function updateStatisticsTab() {
    const recyclePct = personalStats.recycledKg > 0
        ? Math.min(100, Math.round((personalStats.recycledKg / (personalStats.recycledKg + 0.5)) * 100))
        : 0;

    _setText('statRecyclingRate', recyclePct + '%');
    _setText('statWaterSaved',    (personalStats.waterSaved  ?? 0) + ' L');
    _setText('statEnergySaved',   (personalStats.energySaved ?? 0) + ' kWh');
    _setText('statWasteDiverted', personalStats.recycledKg.toFixed(1) + ' kg');

    const treeCount = Math.floor(personalStats.co2Kg / 1.2);
    _setText('statTreeEquiv', treeCount);
    _setText('heroTrees',     Math.max(14, treeCount + 14));
}

// ============================================================
// ANIMATE STAT CARD
// ============================================================
export function animateStatUpdate(id, newVal, color) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.transition = 'transform 0.3s, color 0.3s';
    el.style.transform  = 'scale(1.18)';
    el.style.color      = color;
    setTimeout(() => { el.textContent = newVal; el.style.transform = 'scale(1)'; }, 180);
}

// ============================================================
// POINTS & LEVEL BADGE
// ============================================================
export function awardPoints(pts, msg) {
    addUserPoints(pts);
    ['headerPoints', 'totalPoints', 'dashboardPoints'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = userPoints;
    });
    try { sessionStorage.setItem('ewp_points', userPoints); } catch (e) {}
    notify('🏆', msg);
    updateLevelBadge();
    updateLeaderboardUserRow();
}

export function updateLevelBadge() {
    const levels = [
        { min: 0,    label: '🌱 Level 1 - Eco Newcomer'    },
        { min: 100,  label: '🌿 Level 2 - Recycler'         },
        { min: 300,  label: '⚡ Level 3 - Eco Warrior'      },
        { min: 600,  label: '🛡️ Level 4 - Green Guardian'   },
        { min: 1000, label: '🌍 Level 5 - Planet Protector' },
    ];
    const level = [...levels].reverse().find(l => userPoints >= l.min) ?? levels[0];
    const badge = document.getElementById('levelBadge');
    if (badge && badge.textContent !== level.label) {
        badge.textContent = level.label;
        if (userPoints >= 100) {
            badge.style.animation = 'none';
            requestAnimationFrame(() => { badge.style.animation = 'coin-burst 0.6s ease'; });
        }
    }
    // Update leaderboard sub-label
    const userSub = document.querySelector('#leaderboardUserName + div');
    if (userSub) userSub.textContent = level.label;
    checkAchievements();
}

export function updateLeaderboardUserRow() {
    const el = document.querySelector('.leaderboard-item:last-child .leaderboard-points');
    if (el) el.textContent = userPoints.toLocaleString() + ' coins';
}

// ============================================================
// ACHIEVEMENTS
// ============================================================
const ACHIEVEMENTS = [
    { id: 0, icon: '🌍', title: 'Planet Protector', condition: () => personalStats.scanCount >= 1  },
    { id: 1, icon: '🧙', title: 'Waste Wizard',     condition: () => personalStats.scanCount >= 5  },
    { id: 2, icon: '🌊', title: 'Ocean Guardian',   condition: () => userPoints >= 50              },
    { id: 3, icon: '⚡', title: 'Zero Waste Hero',  condition: () => personalStats.recycledKg >= 1 },
    { id: 4, icon: '🏘️', title: 'Community Leader', condition: () => document.querySelectorAll('.join-btn.joined').length >= 1 },
    { id: 5, icon: '💪', title: 'Carbon Crusher',   condition: () => userPoints >= 500             },
];

export function checkAchievements() {
    const cards = document.querySelectorAll('.achievement-card');
    ACHIEVEMENTS.forEach(a => {
        const card = cards[a.id];
        if (!card) return;
        if (a.condition() && card.classList.contains('locked')) {
            card.classList.remove('locked');
            const iconEl = card.querySelector('.achievement-icon');
            if (iconEl) iconEl.textContent = a.icon;
            notify('🏅', `Achievement unlocked: ${a.title}!`);
        }
    });
}

// ============================================================
// SDG IMPACT OVERLAY
// ============================================================
export function showSDGImpact(msg) {
    const overlay = document.getElementById('sdgImpactOverlay');
    const text    = document.getElementById('sdgImpactText');
    if (!overlay || !text) return;
    text.textContent    = msg;
    overlay.style.display = 'block';
    setTimeout(() => { overlay.style.display = 'none'; }, 4000);
}

// ============================================================
// AI WASTE INSIGHT (calls api.js)
// ============================================================
export async function generateWasteInsight() {
    if (personalStats.scanCount < 3) return;
    try {
        const insight = await fetchWasteInsight({
            scanCount:  personalStats.scanCount,
            recycledKg: personalStats.recycledKg,
            co2Kg:      personalStats.co2Kg,
        });
        if (insight) {
            const trend = document.getElementById('statCO2Trend');
            if (trend) {
                trend.textContent  = '💡 ' + insight;
                trend.style.color  = '#1a6b3c';
                trend.style.fontWeight = '600';
            }
        }
    } catch (e) { /* silently fail */ }
}

// ============================================================
// CHARTS
// ============================================================
export function initCharts() {
    // Clear old instances first
    chartInstances.length = 0;

    const wCtx = document.getElementById('wasteChart')?.getContext('2d');
    const tCtx = document.getElementById('recyclingTrendChart')?.getContext('2d');
    const cCtx = document.getElementById('categoryChart')?.getContext('2d');

    if (wCtx) {
        chartInstances.push(new Chart(wCtx, {
            type: 'bar',
            data: {
                labels: ['Jan','Feb','Mar','Apr','May','Jun'],
                datasets: [
                    { label:'Recyclables', data:[45,52,48,58,62,65], backgroundColor:'#2ecc71' },
                    { label:'Organic',     data:[30,35,32,38,40,42], backgroundColor:'#f39c12' },
                    { label:'General',     data:[25,22,20,18,15,12], backgroundColor:'#95a5a6' },
                ],
            },
            options: {
                responsive: true,
                plugins: { legend: { labels: { color: '#666' } } },
                scales: {
                    y: { beginAtZero:true, ticks:{color:'#666'}, grid:{color:'rgba(0,0,0,0.1)'} },
                    x: { ticks:{color:'#666'}, grid:{color:'rgba(0,0,0,0.05)'} },
                },
            },
        }));
    }

    if (tCtx) {
        chartInstances.push(new Chart(tCtx, {
            type: 'line',
            data: {
                labels: ['Jan','Feb','Mar','Apr','May','Jun'],
                datasets: [{
                    label: 'Recycling Rate %',
                    data: [65,68,72,75,80,85],
                    borderColor: '#2ecc71',
                    backgroundColor: 'rgba(46,204,113,0.1)',
                    fill: true, tension: 0.4,
                }],
            },
            options: {
                responsive: true,
                plugins: { legend: { labels: { color: '#666' } } },
                scales: {
                    y: { beginAtZero:true, max:100, ticks:{color:'#666'} },
                    x: { ticks:{color:'#666'} },
                },
            },
        }));
    }

    if (cCtx) {
        chartInstances.push(new Chart(cCtx, {
            type: 'doughnut',
            data: {
                labels: ['Recyclables','Organic','General','E-Waste'],
                datasets: [{ data:[45,30,20,5], backgroundColor:['#2ecc71','#f39c12','#95a5a6','#e74c3c'] }],
            },
            options: {
                responsive: true,
                plugins: { legend: { position:'bottom', labels:{color:'#666'} } },
            },
        }));
    }

    if (isDark) updateChartsDarkMode();
}

export function updateChartsDarkMode() {
    const color     = isDark ? '#e6edf3' : '#666';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    chartInstances.forEach(chart => {
        if (!chart) return;
        try {
            if (chart.options.scales) {
                Object.values(chart.options.scales).forEach(scale => {
                    if (scale.ticks) scale.ticks.color = color;
                    if (scale.grid)  scale.grid.color  = gridColor;
                });
            }
            if (chart.options.plugins?.legend?.labels) {
                chart.options.plugins.legend.labels.color = color;
            }
            chart.update('none');
        } catch (e) {}
    });
}

// ============================================================
// REDEMPTION MODAL
// ============================================================
export function redeemReward(name, cost) {
    const old = document.getElementById('redeemModal');
    if (old) old.remove();

    const canAfford = userPoints >= cost;
    const modal     = document.createElement('div');
    modal.id        = 'redeemModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', `Redeem ${name}`);
    modal.innerHTML = `
        <div class="modal-box">
            <div style="text-align:center;margin-bottom:1.25rem">
                <div style="font-size:3rem;margin-bottom:0.5rem">${cost<=150?'☕':cost<=300?'🌳':cost<=400?'🚌':'🛒'}</div>
                <h3 style="color:#1b5e20;margin:0 0 0.3rem">${name}</h3>
                <div style="font-size:0.9rem;color:#666">Costs <strong style="color:#f57f17">${cost} coins</strong></div>
            </div>
            <div style="background:${canAfford?'#e8f5e9':'#ffebee'};border-radius:12px;padding:1rem;text-align:center;margin-bottom:1.25rem">
                ${canAfford
                    ? `<div style="font-size:0.9rem;color:#2e7d32">✅ You have <strong>${userPoints} coins</strong> — enough to redeem!</div>`
                    : `<div style="font-size:0.9rem;color:#c62828">❌ You have <strong>${userPoints} coins</strong> — need ${cost-userPoints} more.</div>`}
            </div>
            <div style="display:flex;gap:0.75rem">
                ${canAfford
                    ? `<button onclick="confirmRedeem('${name}',${cost})" style="flex:1;background:linear-gradient(135deg,#2e7d32,#66bb6a);color:white;border:none;border-radius:12px;padding:0.75rem;font-weight:700;font-size:0.95rem;cursor:pointer">✅ Confirm Redeem</button>`
                    : `<button disabled style="flex:1;background:#e0e0e0;color:#aaa;border:none;border-radius:12px;padding:0.75rem;font-weight:700;font-size:0.95rem;cursor:not-allowed">Not Enough Coins</button>`}
                <button onclick="document.getElementById('redeemModal').remove()" style="background:#f5f5f5;border:none;border-radius:12px;padding:0.75rem 1.2rem;cursor:pointer;font-size:0.9rem">Cancel</button>
            </div>
        </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

export function confirmRedeem(name, cost) {
    document.getElementById('redeemModal')?.remove();
    setUserPoints(userPoints - cost);
    try { sessionStorage.setItem('ewp_points', userPoints); } catch (e) {}
    ['headerPoints','totalPoints','dashboardPoints'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = userPoints;
    });
    updateLevelBadge();
    updateLeaderboardUserRow();
    notify('🎉', `${name} redeemed! Check your email for the voucher code.`);
    const toast     = document.getElementById('gccToast');
    const toastText = document.getElementById('gccToastText');
    if (toast && toastText) {
        toastText.textContent = `${name} redemption confirmed! Voucher sent to your email within 24 hours.`;
        toast.style.display   = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 5000);
    }
}

// ============================================================
// HELPERS
// ============================================================
function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}