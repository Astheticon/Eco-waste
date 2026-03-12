// ============================================================
// API.JS — All external fetch calls live here
// EcoWaste Pro · frontend-refactor branch
//
// Phase 1 (now):    calls Anthropic API directly (browser)
// Phase 2 (backend ready): swap BASE_URL, remove anthropicHeaders,
//                           calls go to /api/* instead
// ============================================================

import { ANTHROPIC_API_KEY } from './state.js';

// ── Config ────────────────────────────────────────────────────
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL_FAST    = 'claude-haiku-4-5-20251001';  // ETA, insights
const MODEL_SCAN    = 'claude-haiku-4-5-20251001';  // scanner

// TODO Phase 2: uncomment and set backend URL
// const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// ── Helpers ───────────────────────────────────────────────────
function anthropicHeaders() {
    const h = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
    };
    if (ANTHROPIC_API_KEY) h['x-api-key'] = ANTHROPIC_API_KEY;
    return h;
}

async function anthropicPost(body) {
    const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: anthropicHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
    const data = await res.json();
    // Extract plain text from content blocks
    return data.content?.map(b => b.text || '').join('').trim() ?? '';
}

// ── Scanner ───────────────────────────────────────────────────
/**
 * Analyse a base64 image with Claude Vision.
 * @param {string} base64Image  — full data URI (data:image/jpeg;base64,...)
 * @returns {Promise<string>}   — raw text response from Claude
 *
 * TODO Phase 2: replace body with:
 *   const res = await fetch(`${BASE_URL}/api/scan`, {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({ image: base64Image }),
 *   });
 *   return (await res.json()).data;
 */
export async function scanWasteImage(base64Image) {
    const base64Data = base64Image.split(',')[1];
    const mediaType  = base64Image.match(/data:(.*?);base64/)?.[1] ?? 'image/jpeg';

    return anthropicPost({
        model: MODEL_SCAN,
        max_tokens: 1000,
        system: `You are EcoWaste Pro AI for Chennai Ward 12. Analyse the waste item in the image and respond ONLY with a JSON object (no markdown) with these exact keys:
{
  "name": string,
  "category": "Recyclable"|"Organic"|"Hazardous"|"E-Waste"|"General Waste"|"Medical Waste",
  "subcategory": string,
  "icon": string (single emoji),
  "confidence": number (0-100),
  "urgency": "Low"|"Medium"|"High",
  "description": string,
  "environmentalImpact": {
    "recyclabilityScore": number,
    "carbonFootprint": string,
    "decompositionTime": string,
    "hazardLevel": "None"|"Low"|"Medium"|"High",
    "waterImpact": string,
    "overallScore": number
  },
  "materialComposition": [{ "material": string, "percentage": number }],
  "disposalSteps": [string],
  "tips": [string],
  "locations": string,
  "alternativeUses": [string],
  "doNots": [string],
  "nearbyFacilityType": string
}`,
        messages: [{
            role: 'user',
            content: [{
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64Data },
            }, {
                type: 'text',
                text: 'Identify this waste item and return the JSON object as specified.',
            }],
        }],
    });
}

// ── Waste Insight ─────────────────────────────────────────────
/**
 * Generate a personalised 1-sentence waste insight for the user.
 * @param {{ scanCount: number, recycledKg: number, co2Kg: number }} stats
 * @returns {Promise<string>}
 *
 * TODO Phase 2: replace with GET ${BASE_URL}/api/insights?scanCount=&recycledKg=&co2Kg=
 */
export async function fetchWasteInsight(stats) {
    return anthropicPost({
        model: MODEL_FAST,
        max_tokens: 120,
        system: 'You are EcoWaste Pro. Give a 1-sentence personalised waste insight for a Chennai Ward 12 resident. Be specific and encouraging. No markdown.',
        messages: [{
            role: 'user',
            content: `User scanned ${stats.scanCount} items, recycled ${stats.recycledKg}kg, saved ${stats.co2Kg}kg CO2. Give insight.`,
        }],
    });
}

// ── Pickup ETA ────────────────────────────────────────────────
/**
 * Generate a realistic AI pickup ETA message.
 * @param {{ binType: string, fillLevel: number }} request
 * @param {{ id: string, label: string }} truck
 * @param {{ area: string, km: string }} context
 * @returns {Promise<string>}
 *
 * TODO Phase 2: replace with POST ${BASE_URL}/api/pickup/eta
 */
export async function fetchPickupETA(request, truck, context) {
    return anthropicPost({
        model: MODEL_FAST,
        max_tokens: 80,
        system: 'You are GCC Chennai dispatch. Give a 1-sentence realistic truck ETA for Ward 12 Anna Nagar. Include truck ID, nearby landmark, and minutes. No markdown.',
        messages: [{
            role: 'user',
            content: `Pickup request for ${request.binType} bin at ${request.fillLevel}% fill. Truck ${truck.label} near ${context.area}, ${context.km}km away.`,
        }],
    });
}

// ── Future backend stubs (Phase 2) ───────────────────────────
// Uncomment these when the Express backend is live.

/*
export async function fetchBins() {
    const res = await fetch(`${BASE_URL}/api/bins`);
    return (await res.json()).data;
}

export async function createPickupRequest(payload) {
    const res = await fetch(`${BASE_URL}/api/pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return (await res.json()).data;
}
*/