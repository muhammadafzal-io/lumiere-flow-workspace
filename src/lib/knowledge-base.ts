/**
 * Lumière Med Spa & Wellness — embedded knowledge base.
 *
 * Approach: single structured string embedded in the system prompt.
 * Rationale: at ~800 clients and a fixed service menu, a vector-search RAG
 * introduces latency and complexity for zero gain. The full KB is ~2k tokens
 * and fits comfortably in the context window.  We enable prompt caching on the
 * system prompt so the Claude API caches this across requests — negligible
 * incremental cost per turn.
 *
 * To update a price or add a service, edit this file only.
 */

export const KNOWLEDGE_BASE = `
## About Lumière Med Spa & Wellness
Lumière is a boutique aesthetic clinic in Austin, Texas, founded in 2021 by Dr. Sofia Marchetti.
Address: 2847 South Lamar Blvd, Suite 120, Austin, TX 78704
Phone: (512) 555-0192  |  Email: hello@lumierespa.com
Hours: Monday–Saturday 9:00 AM – 7:00 PM  |  Closed Sunday
Parking: Free surface lot directly behind the building (enter from Lamar Blvd).

---

## Services & Pricing

### Botox® / Neurotoxin
- Price: $14 per unit
- Typical usage: Forehead 10–20 units | Glabellar (11s) 20–25 units | Crow's feet 10–15 units per side
- Typical total cost: $140–$700 depending on areas treated
- Duration: results last 3–4 months
- Treatment time: 20–30 minutes
- Downtime: minimal; small bumps resolve in 15–20 minutes
- Onset: 3–7 days for full effect
- Contraindications: pregnancy, breastfeeding, neuromuscular disease (myasthenia gravis, ALS), active skin infection at injection site, allergy to botulinum toxin, isotretinoin (Accutane) use in the past 6 months

### Dermal Fillers (Juvederm / Restylane)
- Lip filler: $650 per syringe
- Cheek / mid-face filler: $750 per syringe
- Under-eye / tear trough: $700 per syringe
- Nasolabial folds: $650 per syringe
- Full-face filler assessment: complimentary consultation, custom quote
- Duration: 9–18 months depending on area and product
- Treatment time: 30–45 minutes
- Downtime: mild swelling/bruising 2–7 days
- Contraindications: pregnancy, breastfeeding, blood thinners (aspirin, warfarin — consult your physician), active oral herpes outbreak (prophylactic antivirals can be prescribed), allergy to lidocaine or hyaluronic acid

### HydraFacial
- Classic HydraFacial: $175 (30 min)
- Deluxe HydraFacial + LED therapy: $225 (45 min)
- Platinum HydraFacial + Lymphatic Drainage + LED: $275 (60 min)
- Packages: 3 sessions 10% off | 6 sessions 15% off
- Suitable for all skin types; no downtime
- Contraindications: active rosacea flare, active sunburn, open wounds or sores on face

### Laser Hair Removal
- Upper lip: $75/session
- Chin: $75/session
- Underarms: $150/session
- Brazilian (full): $250/session
- Full legs: $350/session
- Packages: 6-session package 20% off any area
- Recommended: 6–8 sessions spaced 4–6 weeks apart
- Contraindications: recent tan (natural or spray) within 2 weeks, isotretinoin use within 6 months, pregnancy, very light/white/grey hair (minimal response), tattoos directly in treatment area

### Microneedling (SkinPen®)
- Single session: $350
- 3-session package: $900 (save $150)
- Add-on PRP (Platelet-Rich Plasma): $200 extra
- Treatment time: 60 minutes (30 min numbing cream + 30 min procedure)
- Downtime: 24–48 hours redness; 3–5 days slight peeling
- Contraindications: active acne breakout in treatment area, rosacea, eczema, psoriasis, blood thinners, pregnancy, keloid scarring history

### IV Vitamin Therapy
- Hydration Drip (saline + electrolytes): $125 (45 min)
- Myers Cocktail (B vitamins, Vitamin C, magnesium): $175 (45 min)
- Glow Drip (glutathione, Vitamin C, B12): $200 (45 min)
- NAD+ Boost Drip: $350 (90 min)
- Walk-ins welcome for IV therapy if a nurse is available (call ahead recommended)
- Contraindications: kidney disease, heart failure, G6PD deficiency (for high-dose Vitamin C), pregnancy (consult OB first)

---

## Consultation & New Clients
- All new clients receive a complimentary 15-minute consultation before any injectable or laser treatment
- Returning clients can skip consultation for previously performed treatments
- New client intake form completed digitally before arrival

---

## Pre-Treatment Instructions
**Botox / Fillers:** Avoid blood thinners (aspirin, ibuprofen, fish oil) 5 days before. No alcohol 24 hours before. Arrive with clean face (no makeup).
**Laser:** Shave the area 24 hours before. No tanning 2 weeks prior. Avoid retinoids/acids 3 days before.
**Microneedling:** No retinoids or exfoliants 5 days before. Arrive with clean face.
**HydraFacial:** No special prep required. Arrive with clean skin if possible.

## Post-Treatment Instructions
**Botox:** No exercise, alcohol, or lying flat for 4 hours. Do not massage or rub the area.
**Fillers:** Avoid extreme heat (sauna, hot yoga) for 48 hours. Sleep elevated. Mild bruising is normal.
**Laser:** Apply sunscreen SPF 50+ immediately. Avoid direct sun for 2 weeks. Redness is normal 24–48 hrs.
**Microneedling:** No makeup for 24 hours. Gentle cleanser only for 72 hours. Apply SPF 50+ daily.

---

## Frequently Asked Questions
**Do you offer payment plans?** We accept all major credit cards. CareCredit financing accepted for purchases over $500.
**Do you accept insurance?** No. All services are cosmetic and elective.
**Can I come in pregnant?** Most treatments are not recommended during pregnancy. IV Hydration may be OK with OB clearance, but all injectables, laser, and microneedling are contraindicated. Always disclose pregnancy status during consultation.
**Do you offer gift cards?** Yes, gift cards available in any amount. Ask at the front desk or ask to be connected with a human.
**How long do results last?** Botox 3–4 months; fillers 9–18 months; laser hair removal is permanent reduction after full course; microneedling results visible at 4–6 weeks and improve over 3–6 months.
**Do you do lip filler?** Yes — lip filler starts at $650 per syringe. Most clients need 0.5–1 syringe for natural enhancement.
`;
