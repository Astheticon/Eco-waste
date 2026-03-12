// ============================================================
// SCANNER.JS — AI Waste Scanner logic
// EcoWaste Pro · frontend-refactor branch
// ============================================================

import {
    currentImage,
    setCurrentImage,
    recentScans,
    addRecentScan,
    personalStats,
    currentLang,
} from './state.js';

import { scanWasteImage } from './api.js';

// ── Helpers ───────────────────────────────────────────────────
function t(key) {
    if (typeof window.t === 'function') return window.t(key);
    return key;
}
function notify(icon, msg) {
    if (typeof showNotification === 'function') showNotification(icon, msg);
}
function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// CAMERA
// ============================================================
let _cameraStream = null;

export async function startCamera() {
    const cameraArea = document.getElementById('cameraArea');
    const uploadArea = document.getElementById('uploadArea');
    const video      = document.getElementById('cameraVideo');
    try {
        _cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        video.srcObject = _cameraStream;
        uploadArea.style.display = 'none';
        cameraArea.style.display = 'flex';
        notify('📷', 'Camera ready — point at any waste item!');
    } catch (err) {
        notify('⚠️', 'Camera unavailable — use Upload instead');
        console.warn('Camera error:', err);
    }
}

export function stopCamera() {
    if (_cameraStream) { _cameraStream.getTracks().forEach(t => t.stop()); _cameraStream = null; }
    document.getElementById('cameraArea').style.display  = 'none';
    document.getElementById('uploadArea').style.display  = 'flex';
}

export function snapCamera() {
    const video = document.getElementById('cameraVideo');
    if (!video) return;
    const canvas   = document.createElement('canvas');
    canvas.width   = video.videoWidth  || 640;
    canvas.height  = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl  = canvas.toDataURL('image/jpeg', 0.92);
    setCurrentImage(dataUrl);
    stopCamera();
    _displayPreview(dataUrl);
    notify('📸', 'Snap taken! Click Analyse to scan.');
    setTimeout(() => analyzeImage(), 600);
}

// ============================================================
// UPLOAD
// ============================================================
export function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader    = new FileReader();
    reader.onload   = e => { setCurrentImage(e.target.result); _displayPreview(e.target.result); };
    reader.readAsDataURL(file);
}

export function clearImage() {
    setCurrentImage(null);
    document.getElementById('uploadArea').style.display      = 'flex';
    document.getElementById('previewContainer').style.display = 'none';
    document.getElementById('imageUpload').value             = '';
    document.getElementById('scannerResults').innerHTML      =
        `<div style="text-align:center;padding:3rem;color:#999">
            <div style="font-size:4rem;margin-bottom:1rem">🔍</div>
            <h3>${t('scanner_no_analysis')}</h3>
            <p>${t('scanner_no_analysis_sub')}</p>
        </div>`;
}

function _displayPreview(src) {
    document.getElementById('uploadArea').style.display       = 'none';
    document.getElementById('previewContainer').style.display = 'block';
    document.getElementById('previewImage').src               = src;
}

// ============================================================
// DEMO SAMPLES
// ============================================================
const DEMO_SCANS = [
    { label: 'Plastic Bottle', emoji: '🍶' },
    { label: 'Cardboard Box',  emoji: '📦' },
    { label: 'Old Phone',      emoji: '📱' },
    { label: 'Food Scraps',    emoji: '🥦' },
];

export function loadDemoScan(idx) {
    const s   = DEMO_SCANS[idx];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
        <rect width="300" height="300" rx="20" fill="#e8f5e9"/>
        <text x="150" y="155" text-anchor="middle" font-size="120">${s.emoji}</text>
        <text x="150" y="210" text-anchor="middle" font-size="22" fill="#555" font-family="sans-serif">${s.label}</text>
    </svg>`;
    const dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    setCurrentImage(dataUri);
    document.getElementById('previewImage').src               = dataUri;
    document.getElementById('uploadArea').style.display       = 'none';
    document.getElementById('previewContainer').style.display = 'block';
    notify('📸', `Demo loaded: ${s.label} — click Analyse!`);
}

// ============================================================
// ANALYSE
// ============================================================
export async function analyzeImage() {
    // Read currentImage from state at call time
    const img = currentImage;
    if (!img) return;

    _showLoadingUI();

    // Step animation timers
    const stepData = [
        [350,  'ck1', t('scanner_mat_done'), t('scanner_step1')],
        [850,  'ck2', t('scanner_cat_done'), t('scanner_step2')],
        [1400, 'ck3', t('scanner_rec_done'), t('scanner_step3')],
        [1900, 'ck4', t('scanner_dis_done'), t('scanner_step4')],
        [2350, 'ck5', t('scanner_gui_done'), t('scanner_step5')],
    ];
    const timers = stepData.map(([delay, id, label, stepText]) =>
        setTimeout(() => {
            const el = document.getElementById(id);
            const st = document.getElementById('scanStepText');
            if (el) { el.innerHTML = label; el.style.opacity = '1'; el.style.color = '#27ae60'; el.style.fontWeight = '600'; }
            if (st) st.innerHTML = stepText;
        }, delay)
    );

    // Try Claude Vision API first, fall back to local classifier
    setTimeout(async () => {
        timers.forEach(clearTimeout);
        try {
            let result;
            if (typeof window.ANTHROPIC_API_KEY !== 'undefined' && window.ANTHROPIC_API_KEY) {
                const raw  = await scanWasteImage(img);
                const json = raw.replace(/```json|```/g, '').trim();
                const data = JSON.parse(json);
                result     = _normaliseApiResult(data);
            } else {
                result = _localClassify(img);
            }
            displayResult(result);
            saveRecentScan(result);
        } catch (err) {
            console.warn('Scanner error, falling back to local classifier:', err);
            const result = _localClassify(img);
            displayResult(result);
            saveRecentScan(result);
        }
    }, 2600);
}

// ============================================================
// LOCAL CLASSIFIER (palette-based, 100% offline)
// ============================================================
function _extractPalette() {
    try {
        const img = document.getElementById('previewImage');
        const c   = document.createElement('canvas');
        c.width   = 64; c.height = 64;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 64, 64);
        const d = ctx.getImageData(0, 0, 64, 64).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i+1]; b += d[i+2]; n++; }
        r = Math.round(r/n); g = Math.round(g/n); b = Math.round(b/n);
        const br = (r+g+b)/3, sat = Math.max(r,g,b) - Math.min(r,g,b);
        return {
            r, g, b, br, sat,
            isWhite:     br > 210 && sat < 35,
            isBrightClr: br > 170 && sat < 60,
            isGreen:     g > r+18 && g > b+18,
            isBrown:     r > 110 && g > 70 && b < 90 && sat > 25 && r > g,
            isGrey:      sat < 28 && br > 55 && br < 200,
            isBlack:     br < 55,
            isBlue:      b > r+18 && b > g+8,
            isRed:       r > g+35 && r > b+35,
            isYellow:    r > 175 && g > 145 && b < 110,
            isOrange:    r > 170 && g > 90 && g < 160 && b < 90,
        };
    } catch (_) {
        return { isGrey: true, br: 128, sat: 0 };
    }
}

// Profiles imported verbatim from app.js — same logic, same order
const _PROFILES = [
    { id:'pet_bottle',   test: p => p.isWhite || p.isBrightClr,                   name:'PET Plastic Bottle',          category:'Recyclable',    subcategory:'PET Plastic (Type 1)',         icon:'🍶', urgency:'Low',    confidence:()=>82+Math.floor(Math.random()*12) },
    { id:'garden_waste', test: p => p.isGreen && p.br < 185,                      name:'Garden & Plant Waste',         category:'Organic',       subcategory:'Green Garden Waste',           icon:'🌱', urgency:'Low',    confidence:()=>80+Math.floor(Math.random()*13) },
    { id:'cardboard',    test: p => p.isBrown && p.br>=110 && p.br<185,           name:'Cardboard / Paper Box',        category:'Recyclable',    subcategory:'Corrugated Cardboard',         icon:'📦', urgency:'Low',    confidence:()=>84+Math.floor(Math.random()*10) },
    { id:'food_organic', test: p => (p.isBrown && p.br<110)||(p.isYellow&&p.br<175), name:'Food & Kitchen Waste',      category:'Organic',       subcategory:'Kitchen / Food Scrap',         icon:'🌿', urgency:'Medium', confidence:()=>79+Math.floor(Math.random()*14) },
    { id:'ewaste',       test: p => (p.isGrey||p.isBlack) && p.br<100,            name:'Electronic Waste (E-Waste)',   category:'E-Waste',       subcategory:'Consumer Electronics',         icon:'📱', urgency:'High',   confidence:()=>76+Math.floor(Math.random()*15) },
    { id:'hazardous',    test: p => p.isRed && p.sat>55,                          name:'Hazardous Waste',              category:'Hazardous',     subcategory:'Chemical / Paint / Battery',   icon:'⚠️', urgency:'High',   confidence:()=>72+Math.floor(Math.random()*16) },
    { id:'multilayer',   test: p => p.isOrange,                                   name:'Multi-layer / Laminated Pkg',  category:'General Waste', subcategory:'Chips / Biscuit Packet',       icon:'🛍️', urgency:'Medium', confidence:()=>74+Math.floor(Math.random()*14) },
    { id:'metal_tin',    test: p => p.isGrey && p.br>=100,                        name:'Metal / Tin Can',              category:'Recyclable',    subcategory:'Aluminium / Steel',            icon:'🥫', urgency:'Low',    confidence:()=>81+Math.floor(Math.random()*12) },
    { id:'glass',        test: p => p.isBlue && p.br>80,                          name:'Glass Bottle / Jar',           category:'Recyclable',    subcategory:'Glass Container',              icon:'🍾', urgency:'Low',    confidence:()=>80+Math.floor(Math.random()*13) },
    { id:'paper',        test: p => p.isWhite && p.br>195,                        name:'Paper / Newspaper',            category:'Recyclable',    subcategory:'Paper & Newsprint',            icon:'📰', urgency:'Low',    confidence:()=>83+Math.floor(Math.random()*11) },
    { id:'general',      test: ()=>true,                                           name:'General / Mixed Waste',        category:'General Waste', subcategory:'Mixed / Unclassified',         icon:'🗑️', urgency:'Medium', confidence:()=>65+Math.floor(Math.random()*20) },
];

function _localClassify(imgSrc) {
    const palette = _extractPalette();
    const profile = _PROFILES.find(p => p.test(palette)) ?? _PROFILES[_PROFILES.length - 1];
    return _buildResult(profile);
}

function _buildResult(prof) {
    const MAP = {
        'Recyclable':'recyclable','Organic':'organic','Hazardous':'hazardous',
        'E-Waste':'e-waste','General Waste':'general','Medical Waste':'medical',
    };
    return {
        name: prof.name, category: prof.category, subcategory: prof.subcategory,
        icon: prof.icon, confidence: prof.confidence(), urgency: prof.urgency,
        description: `${prof.name} identified by local classifier. For detailed guidance check the Recycling Guide tab.`,
        environmentalImpact: { recyclabilityScore: 75, carbonFootprint: 'See guide', decompositionTime: 'Varies', hazardLevel: 'Low', waterImpact: 'Varies', overallScore: 70 },
        materialComposition: [{ material: prof.subcategory, percentage: 100 }],
        disposalSteps: ['Separate from other waste', 'Check local bin colour guide', 'Dispose in correct GCC bin'],
        tips: [], locations: 'Nearest GCC bin', alternativeUses: [], doNots: [],
        nearbyFacilityType: 'GCC Bin',
        cssCategory: MAP[prof.category] ?? 'general',
    };
}

function _normaliseApiResult(data) {
    const MAP = {
        'Recyclable':'recyclable','Organic':'organic','Hazardous':'hazardous',
        'E-Waste':'e-waste','General Waste':'general','Medical Waste':'medical',
    };
    return { ...data, cssCategory: MAP[data.category] ?? 'general' };
}

// ============================================================
// DISPLAY RESULT
// ============================================================
export function displayResult(result) {
    const cssKey       = result.cssCategory ?? 'general';
    const urgencyClass = result.urgency === 'High' ? 'urgency-high' : result.urgency === 'Medium' ? 'urgency-medium' : 'urgency-low';
    const urgencyIcon  = result.urgency === 'High' ? '🔴' : result.urgency === 'Medium' ? '🟡' : '🟢';
    const ei           = result.environmentalImpact  ?? {};
    const steps        = result.disposalSteps        ?? [];
    const materials    = result.materialComposition  ?? [];
    const alts         = result.alternativeUses      ?? [];
    const donots       = result.doNots               ?? [];
    const matColors    = ['#2ecc71','#f39c12','#3498db','#9b59b6','#e74c3c','#1abc9c'];
    const matBarsHTML  = materials.map((m,i) =>
        `<div class="material-bar-row">
            <div class="material-label">${m.material}</div>
            <div class="material-track">
                <div class="material-fill" style="width:${m.percentage}%;background:${matColors[i%matColors.length]}"></div>
            </div>
            <div class="material-pct">${m.percentage}%</div>
        </div>`).join('');
    const ecoScore     = ei.overallScore       ?? 50;
    const ecoColor     = ecoScore >= 70 ? '#27ae60' : ecoScore >= 40 ? '#f39c12' : '#e74c3c';
    const recyclability = ei.recyclabilityScore ?? 50;
    const recyclColor  = recyclability >= 70 ? '#27ae60' : recyclability >= 40 ? '#f39c12' : '#e74c3c';
    const hazardColors = { None:'#27ae60', Low:'#f39c12', Medium:'#e67e22', High:'#e74c3c', Critical:'#7f0000' };
    const hazardColor  = hazardColors[ei.hazardLevel] ?? '#666';
    const urgencyLabel = result.urgency === 'High' ? t('urgency_high') : result.urgency === 'Medium' ? t('urgency_medium') : t('urgency_low');

    document.getElementById('scannerResults').innerHTML = `
        <div class="result-item result-${cssKey}">
            <div class="result-header">
                <div class="result-icon">${result.icon}</div>
                <div style="flex:1">
                    <h3>${escHtml(result.name)}</h3>
                    <div style="font-size:0.85rem;color:#888">${escHtml(result.subcategory ?? '')}</div>
                    <span class="result-category category-${cssKey}">${escHtml(result.category)}</span>
                    <span class="urgency-badge ${urgencyClass}">${urgencyIcon} ${escHtml(urgencyLabel)}</span>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:1rem;margin:0.8rem 0">
                <span style="font-weight:600;font-size:0.9rem">${t('result_ai_confidence')}</span>
                <div class="confidence-bar"><div class="confidence-fill" style="width:${result.confidence}%"></div></div>
                <span style="font-weight:700;color:var(--primary-green)">${result.confidence}%</span>
            </div>
            <p style="margin:1rem 0 0;color:#444">${escHtml(result.description)}</p>
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
                    <div class="impact-card" style="border-top-color:${hazardColor}"><div class="impact-score" style="color:${hazardColor};font-size:1.1rem">${escHtml(ei.hazardLevel ?? 'N/A')}</div><div class="impact-label">${t('result_hazard')}</div></div>
                </div>
                <div style="margin-top:1rem;display:grid;gap:0.5rem">
                    ${ei.carbonFootprint    ? `<div>🌿 <strong>${t('result_carbon')}:</strong> ${escHtml(ei.carbonFootprint)}</div>`    : ''}
                    ${ei.decompositionTime  ? `<div>⏳ <strong>${t('result_decomposes')}:</strong> ${escHtml(ei.decompositionTime)}</div>` : ''}
                </div>
                <div style="margin-top:1rem"><strong>${t('result_dispose_at')}:</strong> ${escHtml(result.locations ?? '')}</div>
                ${donots.length ? `<div style="margin-top:1rem;background:#fff5f5;border-radius:10px;padding:0.8rem 1rem">
                    <strong style="color:#c62828">${t('result_do_not')}:</strong>
                    <ul style="margin:0.4rem 0 0 1.2rem;color:#c62828">${donots.map(d => `<li>${escHtml(d)}</li>`).join('')}</ul>
                </div>` : ''}
            </div>
            <div class="result-tab-panel" id="rtab-materials">
                ${materials.length ? matBarsHTML : `<p style="color:#aaa">${t('result_no_material')}</p>`}
            </div>
            <div class="result-tab-panel" id="rtab-disposal">
                <ul class="disposal-steps">
                    ${steps.map((s,i) => `<li class="disposal-step"><div class="step-num">${i+1}</div><div class="step-text">${escHtml(s)}</div></li>`).join('')}
                </ul>
                ${result.tips?.length ? `<div style="margin-top:1rem;background:#f0fdf4;border-radius:10px;padding:0.8rem 1rem">
                    <strong style="color:#2e7d32">${t('result_tips')}:</strong>
                    <ul style="margin:0.4rem 0 0 1.2rem;color:#444">${result.tips.map(tip => `<li>${escHtml(tip)}</li>`).join('')}</ul>
                </div>` : ''}
            </div>
            <div class="result-tab-panel" id="rtab-reuse">
                ${alts.length
                    ? `<div class="alt-chips">${alts.map(a => `<span class="alt-chip">💡 ${escHtml(a)}</span>`).join('')}</div>`
                    : `<p style="color:#aaa">${t('result_no_reuse')}</p>`}
            </div>
            <div class="quick-action-bar">
                <button class="quick-action-btn qab-find"   onclick="showNotification('🗺️','${t('notif_find')}')">${t('result_find_nearest')}</button>
                <button class="quick-action-btn qab-report" onclick="showNotification('📋','${t('notif_report')}')">${t('result_report_dumping')}</button>
                <button class="quick-action-btn qab-share"  onclick="showNotification('🔗','${t('notif_share')}')">${t('result_share')}</button>
            </div>
        </div>`;

    // Animate material bars
    setTimeout(() => {
        document.querySelectorAll('.material-fill').forEach(el => {
            const w = el.style.width; el.style.width = '0';
            requestAnimationFrame(() => { el.style.transition = 'width 0.9s ease'; el.style.width = w; });
        });
    }, 80);
}

// ============================================================
// SAVE & DISPLAY RECENT SCANS
// ============================================================
export function saveRecentScan(result) {
    addRecentScan({
        name: result.name,
        category: result.category,
        icon: result.icon,
        image: currentImage,
        timestamp: new Date().toISOString(),
    });
    displayRecentScans();
    if (typeof updatePersonalStats === 'function') updatePersonalStats(result.category);
}

export function displayRecentScans() {
    const grid = document.getElementById('recentScans');
    if (!grid) return;
    if (!recentScans.length) {
        grid.innerHTML = `<p style="text-align:center;color:#999;padding:2rem">${t('scanner_no_scans')}</p>`;
        return;
    }
    grid.innerHTML = recentScans.map(s =>
        `<div class="recent-scan-item">
            <img src="${s.image}" alt="${escHtml(s.name)}" class="recent-scan-image">
            <div class="recent-scan-info">
                <h4>${s.icon} ${escHtml(s.name)}</h4>
                <span class="result-category category-${s.category}" style="font-size:0.7rem;padding:0.2rem 0.5rem">${escHtml(s.category)}</span>
                <div class="recent-scan-time">${_timeAgo(s.timestamp)}</div>
            </div>
        </div>`
    ).join('');
}

function _timeAgo(ts) {
    const s = Math.floor((new Date() - new Date(ts)) / 1000);
    if (s < 60)    return 'Just now';
    if (s < 3600)  return Math.floor(s/60) + ' min ago';
    if (s < 86400) return Math.floor(s/3600) + ' hr ago';
    return Math.floor(s/86400) + ' days ago';
}

// ============================================================
// LOADING UI
// ============================================================
function _showLoadingUI() {
    document.getElementById('scannerResults').innerHTML = `
        <div style="text-align:center;padding:3rem 2rem">
            <div style="position:relative;display:inline-block;margin-bottom:1.5rem">
                <div class="loading-spinner"></div>
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.4rem">🤖</div>
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
}