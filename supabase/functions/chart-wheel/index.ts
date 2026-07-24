// ============================================================
// BEACONGAZE · CHART WHEEL GENERATION ENGINE
// Supabase Edge Function — deno deploy target
//
// POST JSON payload  →  self-contained interactive HTML wheel
//   → uploaded to storage bucket "chart-wheels"
//   → orders.chart_wheel_pdf_url updated (matched by order_ref)
//   → returns {"status":"success","url":"<cdn_url>"}
//
// SECURITY MODEL
//   · Caller must present header  x-beacon-key: <FULFILLMENT_KEY>
//     (set via: supabase secrets set FULFILLMENT_KEY=...)
//   · The service key is read from env inside Supabase infra
//     only (SERVICE_ROLE_MASTER secret, or the platform-injected
//     legacy key) — never in the repo, never in Make, never
//     client-side. Supports both sb_secret_... and legacy JWT
//     key formats.
//   · Every string that enters the generated document is
//     HTML-escaped; every number is validated + clamped; arrays
//     are length-capped. The JSON island is </script-safe.
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// ---------- env ----------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// Prefer the custom-named secret (new sb_secret_... key format);
// fall back to the platform-injected legacy JWT service key.
//   supabase secrets set SERVICE_ROLE_MASTER=sb_secret_...
const SERVICE_KEY  = Deno.env.get("SERVICE_ROLE_MASTER")
  ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FULFILL_KEY  = Deno.env.get("FULFILLMENT_KEY") ?? "";
const BUCKET       = "chart-wheels";

// New-format keys (sb_secret_...) are NOT JWTs — they must travel
// in the `apikey` header. Only a real JWT (starts with "eyJ") may
// also ride in the Authorization Bearer slot; putting a non-JWT
// there makes Storage fail with "invalid Compact JWS".
const AUTH_HEADERS: Record<string, string> = {
  apikey: SERVICE_KEY,
  ...(SERVICE_KEY.startsWith("eyJ")
    ? { Authorization: `Bearer ${SERVICE_KEY}` } : {}),
};

// ---------- sanitization ----------
const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
    .replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 160);

const num = (v: unknown, lo: number, hi: number, dflt = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

const SIGNS = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo",
  "Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];

interface Planet { id: string; name: string; degree: number; sign: string;
  house: number; speed: number; }
interface House  { number: number; cusp_degree: number; sign: string; }
interface Aspect { planet_1: string; planet_2: string; type: string;
  orb: number; harmonious: boolean; }

// ---------- aspect auto-computation (pure math fallback) ----------
const ASPECT_DEFS = [
  { type: "Conjunction", angle: 0,   orb: 8, harmonious: true  },
  { type: "Sextile",     angle: 60,  orb: 6, harmonious: true  },
  { type: "Square",      angle: 90,  orb: 7, harmonious: false },
  { type: "Trine",       angle: 120, orb: 7, harmonious: true  },
  { type: "Opposition",  angle: 180, orb: 8, harmonious: false },
];
function computeAspects(planets: Planet[]): Aspect[] {
  const out: Aspect[] = [];
  for (let i = 0; i < planets.length; i++)
    for (let j = i + 1; j < planets.length; j++) {
      let d = Math.abs(planets[i].degree - planets[j].degree) % 360;
      if (d > 180) d = 360 - d;
      for (const A of ASPECT_DEFS) {
        const orb = Math.abs(d - A.angle);
        if (orb <= A.orb) {
          out.push({ planet_1: planets[i].id, planet_2: planets[j].id,
            type: A.type, orb: +orb.toFixed(2), harmonious: A.harmonious });
          break;
        }
      }
    }
  return out.slice(0, 60);
}

// ---------- payload validation ----------
function parsePayload(raw: any) {
  const order_id    = esc(raw.order_id);
  if (!order_id) throw new Error("order_id required");
  const name        = esc(raw.name) || "Traveler";
  const birth_date  = esc(raw.birth_date);
  const birth_time  = esc(raw.birth_time) || "";
  const birth_place = esc(raw.birth_place) || "";

  const planets: Planet[] = (Array.isArray(raw.planets) ? raw.planets : [])
    .slice(0, 15).map((p: any) => ({
      id:     esc(p.id).slice(0, 24) || "p",
      name:   esc(p.name).slice(0, 24) || "Planet",
      degree: num(p.degree, 0, 360),
      sign:   SIGNS.includes(String(p.sign)) ? String(p.sign)
              : SIGNS[Math.floor(num(p.degree, 0, 360) / 30) % 12],
      house:  Math.round(num(p.house, 0, 12)),
      speed:  num(p.speed, -5, 5, 1),
    }));
  if (planets.length < 2) throw new Error("planets array (>=2) required");

  const houses: House[] = (Array.isArray(raw.houses) ? raw.houses : [])
    .slice(0, 12).map((h: any) => ({
      number:      Math.round(num(h.number, 1, 12, 1)),
      cusp_degree: num(h.cusp_degree, 0, 360),
      sign:        SIGNS.includes(String(h.sign)) ? String(h.sign) : "",
    }));

  const aspects: Aspect[] = (Array.isArray(raw.aspects) && raw.aspects.length)
    ? raw.aspects.slice(0, 60).map((a: any) => ({
        planet_1:  esc(a.planet_1).slice(0, 24),
        planet_2:  esc(a.planet_2).slice(0, 24),
        type:      esc(a.type).slice(0, 24) || "Aspect",
        orb:       num(a.degree_or_orb ?? a.orb, 0, 15),
        harmonious: Boolean(a.harmonious_boolean ?? a.harmonious),
      }))
    : computeAspects(planets);

  // Ascendant = house 1 cusp if provided, else first planet's degree
  const asc = houses.find(h => h.number === 1)?.cusp_degree ?? planets[0].degree;

  return { order_id, name, birth_date, birth_time, birth_place,
           planets, houses, aspects, asc };
}

// ---------- the generated artifact ----------
function buildHTML(d: ReturnType<typeof parsePayload>): string {
  // JSON island: escape "<" so "</script>" can never break out
  const island = JSON.stringify(d).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>${esc(d.name)} · Natal Chart Wheel · BeaconGaze</title>
<style>
:root{--void1:#03010a;--void2:#050310;--ring:#2c2547;--ringA:rgba(44,37,71,.4);
  --harm1:#00e676;--harm2:#00b0ff;--chal1:#ff3d00;--chal2:#ff1744;
  --uv:#8b6cf0;--silver:#e9e6f4;--dim:rgba(233,230,244,.55)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100vw;height:100vh;overflow:hidden}
body{background:linear-gradient(160deg,var(--void1),var(--void2) 70%);
  font-family:'Space Grotesk','Segoe UI',system-ui,sans-serif;color:var(--silver);
  display:flex;align-items:center;justify-content:center}
#stars{position:fixed;inset:-25%;width:150%;height:150%;pointer-events:none;
  will-change:transform;transform:translate3d(0,0,0);
  animation:starspin 360s linear infinite}
@keyframes starspin{to{transform:translate3d(0,0,0) rotate(360deg)}}
#stage{position:relative;width:min(94vmin,900px);height:min(94vmin,900px);
  transform:scale(.92);opacity:0;
  animation:reveal 1.4s cubic-bezier(0.16,1,0.3,1) .15s forwards}
@keyframes reveal{to{transform:scale(1);opacity:1}}
#wheel{width:100%;height:100%;display:block}
.seg{fill:none;stroke:var(--ring);stroke-width:1.1}
.segA{stroke:var(--ringA)}
.glyph{font-size:26px;fill:var(--dim);text-anchor:middle;dominant-baseline:central;
  font-family:'Segoe UI Symbol','Noto Sans Symbols 2',serif}
.planet{cursor:pointer;transition:transform .35s cubic-bezier(0.16,1,0.3,1),opacity .4s}
.planet text{font-size:30px;fill:var(--silver);text-anchor:middle;dominant-baseline:central;
  font-family:'Segoe UI Symbol','Noto Sans Symbols 2',serif;
  filter:drop-shadow(0 0 6px rgba(139,108,240,.55))}
.planet circle.hit{fill:transparent;r:26}
.planet.sel{transform:scale(1.25)}
.planet.sel circle.ringpulse{animation:pulse 1.6s ease-out infinite}
circle.ringpulse{fill:none;stroke:var(--uv);stroke-width:1.4;opacity:0}
@keyframes pulse{0%{opacity:.9;r:16}100%{opacity:0;r:34}}
.aspect{fill:none;stroke-width:1.5;cursor:pointer;transition:opacity .4s;
  stroke-dasharray:var(--len);stroke-dashoffset:var(--len);
  animation:drawline 2400ms cubic-bezier(0.16,1,0.3,1) forwards}
@keyframes drawline{to{stroke-dashoffset:0}}
.aspect.harm{stroke:url(#gradHarm);filter:drop-shadow(0 0 4px rgba(0,230,118,.5))}
.aspect.chal{stroke:url(#gradChal);filter:drop-shadow(0 0 4px rgba(255,61,0,.45))}
.dimmed{opacity:.15!important}
.housenum{font-size:13px;fill:var(--dim);text-anchor:middle;dominant-baseline:central;
  letter-spacing:.1em}
#card{position:fixed;right:0;bottom:0;margin:22px;max-width:330px;width:calc(100vw - 44px);
  background:rgba(18,12,46,.6);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border:1px solid rgba(139,108,240,.35);border-radius:18px;padding:22px 24px;
  transform:translateX(120%);transition:transform .6s cubic-bezier(0.16,1,0.3,1);z-index:5}
#card.show{transform:translateX(0)}
#card h2{font-size:22px;font-weight:400;letter-spacing:.04em;margin-bottom:2px}
#card .deg{color:var(--uv);font-size:15px;letter-spacing:.08em;margin-bottom:12px}
#card dl{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:13px}
#card dt{color:var(--dim);text-transform:uppercase;letter-spacing:.18em;font-size:10px;
  align-self:center}
#card dd{color:var(--silver)}
#card .blurb{margin-top:12px;font-size:13px;line-height:1.65;color:var(--dim);
  font-style:italic}
#title{position:fixed;top:22px;left:26px;z-index:4}
#title h1{font-size:15px;letter-spacing:.42em;text-transform:uppercase;font-weight:400}
#title p{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--dim);
  margin-top:6px}
@media (prefers-reduced-motion:reduce){
  #stars,.aspect,#stage{animation:none}
  #stage{transform:none;opacity:1}
  .aspect{stroke-dashoffset:0}
}
</style>
</head>
<body>
<svg id="stars" aria-hidden="true"></svg>
<div id="title"><h1>✶ BeaconGaze</h1><p id="subtitle"></p></div>
<div id="stage"><svg id="wheel" viewBox="0 0 1000 1000" role="img"
  aria-label="Interactive natal chart wheel"></svg></div>
<aside id="card" aria-live="polite"></aside>
<script>
const DATA = ${island};
const NS = "http://www.w3.org/2000/svg";
const CX = 500, CY = 500;
const GLYPH = {sun:"\\u2609",moon:"\\u263D",mercury:"\\u263F",venus:"\\u2640",
  mars:"\\u2642",jupiter:"\\u2643",saturn:"\\u2644",uranus:"\\u26E2",
  neptune:"\\u2646",pluto:"\\u2647"};
const ZGLYPH = ["\\u2648","\\u2649","\\u264A","\\u264B","\\u264C","\\u264D",
  "\\u264E","\\u264F","\\u2650","\\u2651","\\u2652","\\u2653"];
const ELEMENTS = {Aries:"Fire",Leo:"Fire",Sagittarius:"Fire",
  Taurus:"Earth",Virgo:"Earth",Capricorn:"Earth",
  Gemini:"Air",Libra:"Air",Aquarius:"Air",
  Cancer:"Water",Scorpio:"Water",Pisces:"Water"};
const BLURB = {Fire:"A fire placement — it moves first and asks later, feeding on momentum and honest heat.",
  Earth:"An earth placement — it builds slowly, holds its ground, and trusts what it can touch.",
  Air:"An air placement — it thinks in connections, breathes through conversation, refuses stale rooms.",
  Water:"A water placement — it reads the room before the room speaks, and remembers everything."};

// θ mapping: Ascendant calibrated to the left horizon; longitudes
// increase counter-clockwise.  a = 180° − (L − asc)
const pt = (deg, r) => {
  const a = (180 - (deg - DATA.asc)) * Math.PI / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
const el = (tag, attrs, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
};

// ---------- ambient starfield ----------
(() => {
  const s = document.getElementById("stars");
  s.setAttribute("viewBox","0 0 1000 1000");
  for (let i = 0; i < 130; i++)
    el("circle", { cx: Math.random()*1000, cy: Math.random()*1000,
      r: Math.random()*1.3 + .2, fill: "#e9e6f4",
      opacity: (Math.random()*.5 + .08).toFixed(2) }, s);
})();

// ---------- wheel ----------
const svg = document.getElementById("wheel");
const defs = el("defs", {}, svg);
defs.innerHTML =
 '<linearGradient id="gradHarm" x1="0" y1="0" x2="1" y2="1">'
+'<stop offset="0" stop-color="#00e676"/><stop offset="1" stop-color="#00b0ff"/></linearGradient>'
+'<linearGradient id="gradChal" x1="0" y1="0" x2="1" y2="1">'
+'<stop offset="0" stop-color="#ff3d00"/><stop offset="1" stop-color="#ff1744"/></linearGradient>';

const R_OUT = 470, R_ZOD = 420, R_TICK = 428, R_HOUSE = 330, R_PLANET = 372, R_ASPECT = 300;

// rings
[R_OUT, R_ZOD, R_HOUSE, R_ASPECT].forEach((r, i) =>
  el("circle", { cx: CX, cy: CY, r, class: i % 2 ? "seg segA" : "seg" }, svg));

// zodiac segments + glyphs (0° Aries at ecliptic 0, wheel calibrated to asc)
for (let i = 0; i < 12; i++) {
  const [x1, y1] = pt(i * 30, R_ZOD), [x2, y2] = pt(i * 30, R_OUT);
  el("line", { x1, y1, x2, y2, class: "seg" }, svg);
  const [gx, gy] = pt(i * 30 + 15, (R_ZOD + R_OUT) / 2);
  const g = el("text", { x: gx, y: gy, class: "glyph" }, svg);
  g.textContent = ZGLYPH[i];
}
// 5° ticks
for (let dgr = 0; dgr < 360; dgr += 5) {
  const len = dgr % 30 === 0 ? 0 : (dgr % 10 === 0 ? 9 : 5);
  if (!len) continue;
  const [x1, y1] = pt(dgr, R_ZOD), [x2, y2] = pt(dgr, R_ZOD + len);
  el("line", { x1, y1, x2, y2, class: "seg segA" }, svg);
}
// houses
DATA.houses.forEach(h => {
  const [x1, y1] = pt(h.cusp_degree, R_ASPECT), [x2, y2] = pt(h.cusp_degree, R_ZOD);
  el("line", { x1, y1, x2, y2, class: "seg segA" }, svg);
});
DATA.houses.forEach((h, i) => {
  const next = DATA.houses[(i + 1) % DATA.houses.length];
  let span = ((next?.cusp_degree ?? h.cusp_degree + 30) - h.cusp_degree + 360) % 360 || 30;
  const [nx, ny] = pt(h.cusp_degree + span / 2, R_HOUSE + 18);
  const t = el("text", { x: nx, y: ny, class: "housenum" }, svg);
  t.textContent = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"][h.number - 1] || h.number;
});

// planet position map (with simple collision nudge)
const pos = {};
const placed = [];
DATA.planets.forEach(p => {
  let d = p.degree;
  while (placed.some(q => Math.abs(((q - d + 540) % 360) - 180) < 6)) d += 6;
  placed.push(d);
  pos[p.id] = { draw: d, true: p.degree };
});

// aspect lines (drawn first, under planets)
const aspectEls = [];
DATA.aspects.forEach(a => {
  if (!pos[a.planet_1] || !pos[a.planet_2]) return;
  const [x1, y1] = pt(pos[a.planet_1].true, R_ASPECT);
  const [x2, y2] = pt(pos[a.planet_2].true, R_ASPECT);
  const len = Math.hypot(x2 - x1, y2 - y1).toFixed(1);
  const path = el("path", { d: \`M \${x1} \${y1} L \${x2} \${y2}\`,
    class: "aspect " + (a.harmonious ? "harm" : "chal"),
    style: \`--len:\${len}; animation-delay:\${(Math.random()*900+500).toFixed(0)}ms\`,
    "data-kind": "aspect" }, svg);
  path._meta = a; aspectEls.push(path);
});

// planet glyph groups
const planetEls = [];
DATA.planets.forEach(p => {
  const [x, y] = pt(pos[p.id].draw, R_PLANET);
  const g = el("g", { class: "planet", transform: \`translate(\${x} \${y})\`,
    tabindex: 0, role: "button", "aria-label": p.name }, svg);
  el("circle", { class: "ringpulse", cx: 0, cy: 0, r: 16 }, g);
  el("circle", { class: "hit", cx: 0, cy: 0, r: 26 }, g);
  const t = el("text", { x: 0, y: 0 }, g);
  t.textContent = GLYPH[p.id.toLowerCase()] || p.name[0];
  g._meta = p; planetEls.push(g);
});

// ---------- interactivity matrix ----------
const card = document.getElementById("card");
const fmtDeg = d => {
  const inSign = d % 30, whole = Math.floor(inSign);
  const mins = Math.round((inSign - whole) * 60);
  return whole + "\\u00B0 " + String(mins).padStart(2, "0") + "\\u2032";
};
function focusEl(target) {
  [...planetEls, ...aspectEls].forEach(n =>
    n.classList.toggle("dimmed", n !== target));
  planetEls.forEach(n => n.classList.toggle("sel", n === target));
  const m = target._meta;
  if (m.degree !== undefined) {           // planet
    const elmt = ELEMENTS[m.sign] || "Fire";
    card.innerHTML =
      "<h2>" + (GLYPH[m.id.toLowerCase()] || "") + " " + m.name + "</h2>"
    + "<div class='deg'>" + fmtDeg(m.degree) + " " + m.sign + "</div>"
    + "<dl><dt>House</dt><dd>" + (m.house || "\\u2014") + "</dd>"
    + "<dt>Motion</dt><dd>" + (m.speed >= 0 ? "Direct" : "Retrograde") + "</dd>"
    + "<dt>Element</dt><dd>" + elmt + "</dd></dl>"
    + "<p class='blurb'>" + BLURB[elmt] + "</p>";
  } else {                                 // aspect
    card.innerHTML =
      "<h2>" + m.type + "</h2>"
    + "<div class='deg'>" + m.planet_1 + " \\u2194 " + m.planet_2 + "</div>"
    + "<dl><dt>Orb</dt><dd>" + m.orb + "\\u00B0</dd>"
    + "<dt>Nature</dt><dd>" + (m.harmonious ? "Harmonious" : "Challenging") + "</dd></dl>"
    + "<p class='blurb'>" + (m.harmonious
        ? "An easy channel — these two energies trade gifts without being asked."
        : "A productive friction — these two energies sharpen each other through tension.") + "</p>";
  }
  card.classList.add("show");
}
function clearFocus() {
  [...planetEls, ...aspectEls].forEach(n => n.classList.remove("dimmed", "sel"));
  card.classList.remove("show");
}
[...planetEls, ...aspectEls].forEach(n => {
  n.addEventListener("pointerenter", () => focusEl(n));
  n.addEventListener("click", e => { e.stopPropagation(); focusEl(n); });
  n.addEventListener("focus", () => focusEl(n));
});
svg.addEventListener("pointerleave", clearFocus);
document.body.addEventListener("click", clearFocus);
addEventListener("keydown", e => { if (e.key === "Escape") clearFocus(); });

// ---------- title ----------
document.getElementById("subtitle").textContent =
  DATA.name + " \\u00B7 " + [DATA.birth_date, DATA.birth_time, DATA.birth_place]
    .filter(Boolean).join(" \\u00B7 ");
</script>
</body>
</html>`;
}

// ---------- storage + db ----------
async function uploadHTML(path: string, html: string): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: {
        ...AUTH_HEADERS,
        "Content-Type": "text/html; charset=utf-8",
        "x-upsert": "true",
        "cache-control": "public, max-age=31536000, immutable",
      },
      body: new Blob([html], { type: "text/html; charset=utf-8" }),
    });
  if (!res.ok) throw new Error(`storage upload ${res.status}: ${await res.text()}`);
}

async function updateOrder(orderRef: string, url: string): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/orders?order_ref=eq.${encodeURIComponent(orderRef)}`, {
      method: "PATCH",
      headers: {
        ...AUTH_HEADERS,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ chart_wheel_pdf_url: url }),
    });
  if (!res.ok) throw new Error(`orders update ${res.status}: ${await res.text()}`);
}

// ---------- handler ----------
serve(async (req: Request): Promise<Response> => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b),
    { status: s, headers: { "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ status: "error", message: "POST only" }, 405);
  if (!FULFILL_KEY || req.headers.get("x-beacon-key") !== FULFILL_KEY)
    return json({ status: "error", message: "unauthorized" }, 401);

  try {
    const payload = parsePayload(await req.json());
    const html = buildHTML(payload);
    const file = `wheel_${payload.order_id.replace(/[^a-zA-Z0-9_-]/g, "")}_${Date.now()}.html`;
    await uploadHTML(file, html);
    const cdnUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${file}`;
    await updateOrder(payload.order_id, cdnUrl);
    return json({ status: "success", url: cdnUrl });
  } catch (err) {
    return json({ status: "error", message: String(err?.message ?? err) }, 400);
  }
});
