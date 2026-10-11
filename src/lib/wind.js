import { RAD } from "./geo";

/* Global wind field: trade easterlies, mid-latitude westerlies, the Indian monsoon flow, plus a vortex around every cyclone. */
export const fieldAt = (lon, lat, vs) => {
  const a = Math.abs(lat);
  let u = a < 30 ? -4.5 * Math.sin((Math.PI * a) / 30) : a < 60 ? 7 * Math.sin((Math.PI * (a - 30)) / 30) : -2;
  let v = 1.5 * Math.sin(lat * RAD * 3) * Math.cos(lon * RAD * 2);
  u += 1.5 * Math.sin(lon * RAD * 3 + lat * RAD);
  const mw = Math.exp(-(((lon - 75) / 22) ** 2 + ((lat - 10) / 12) ** 2)); u += 7 * mw; v += 3 * mw;
  for (const s of vs) {
    const kk = Math.cos(lat * RAD), dx = (lon - s.lon) * kk, dy = lat - s.lat, r = Math.hypot(dx, dy) + 1e-3, m = s.k * ((9 * (r / 3)) / (1 + (r / 3) ** 2)) * Math.exp(-r / 14);
    u += (s.h * -m * dy) / r - (0.3 * m * dx) / r; v += (s.h * m * dx) / r - (0.3 * m * dy) / r;
  }
  return [u, v];
};

/* Animated particles with fading trails, drawn on a canvas over the map (like a live wind map). */
export function startWind(map, canvas, getVs, { count = 4000, tones } = {}) {
  const ctx = canvas.getContext("2d"), reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0, run = false, frames = 0;
  const seed = (p) => {
    const b = map.getBounds(), w = b.getWest(), e = b.getEast(), s = b.getSouth(), n = b.getNorth();
    p.lon = Math.max(-179, Math.min(179, w + Math.random() * (e - w))); p.lat = Math.max(-72, Math.min(72, s + Math.random() * (n - s)));
    p.age = 0; p.life = 60 + ((Math.random() * 70) | 0); return p;
  };
  const parts = Array.from({ length: count }, () => { const p = seed({}); p.age = (Math.random() * p.life) | 0; return p; });
  const size = () => { const d = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight; if (canvas.width !== w * d || canvas.height !== h * d) { canvas.width = w * d; canvas.height = h * d; } ctx.setTransform(d, 0, 0, d, 0, 0); };
  const clear = () => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore(); };
  const tone = tones || ["rgba(210,230,255,0.28)", "rgba(220,236,255,0.5)", "rgba(232,243,255,0.75)", "rgba(255,255,255,0.95)"];
  const step = () => {
    if (!run) return;
    size(); const w = canvas.clientWidth, h = canvas.clientHeight, vs = getVs(), k = 0.24 * (360 / (512 * Math.pow(2, map.getZoom())));
    ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "rgba(0,0,0,0.075)"; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over"; ctx.lineWidth = 1.2; ctx.lineCap = "round";
    const buckets = [[], [], [], []];
    for (const p of parts) {
      if (p.age++ > p.life) { seed(p); continue; }
      const a = map.project([p.lon, p.lat]), [u, v] = fieldAt(p.lon, p.lat, vs), sp = Math.hypot(u, v);
      p.lon += (u * k) / Math.max(0.2, Math.cos(p.lat * RAD)); p.lat += v * k;
      if (Math.abs(p.lon) > 179.5 || Math.abs(p.lat) > 73) { seed(p); continue; }
      const b = map.project([p.lon, p.lat]);
      if (a.x < -20 || a.y < -20 || a.x > w + 20 || a.y > h + 20) { seed(p); continue; }
      buckets[Math.min(3, (sp / 3.5) | 0)].push(a.x, a.y, b.x, b.y);
    }
    buckets.forEach((seg, i) => { if (!seg.length) return; ctx.strokeStyle = tone[i]; ctx.beginPath(); for (let j = 0; j < seg.length; j += 4) { ctx.moveTo(seg[j], seg[j + 1]); ctx.lineTo(seg[j + 2], seg[j + 3]); } ctx.stroke(); });
    if (reduced && ++frames > 150) { run = false; return; }
    raf = requestAnimationFrame(step);
  };
  map.on("move", clear);
  return {
    start() { canvas.style.display = "block"; if (!run) { run = true; frames = 0; raf = requestAnimationFrame(step); } },
    stop() { run = false; cancelAnimationFrame(raf); clear(); canvas.style.display = "none"; },
    destroy() { run = false; cancelAnimationFrame(raf); map.off("move", clear); },
  };
}

/* Static global streamlines (long thin curved lines), used on the Dashboard and Imagery maps. */
const LC = {};
export const windLines = (vs, key) => {
  if (LC[key]) return LC[key];
  const out = [];
  for (let lo = -177; lo < 180; lo += 6) for (let la = -67.5; la <= 67.5; la += 5) {
    let x = lo + ((la * 7) % 2.5), y = la; const line = [[x, y]];
    for (let s = 0; s < 24; s++) { const [u, v] = fieldAt(x, y, vs), h = Math.hypot(u, v) + 1e-6; x += ((u / h) * 0.85) / Math.max(0.2, Math.cos(y * RAD)); y += (v / h) * 0.85; if (Math.abs(x) > 179.5 || Math.abs(y) > 74) break; line.push([x, y]); }
    if (line.length > 3) out.push(line);
  }
  const keys = Object.keys(LC); if (keys.length > 6) delete LC[keys[0]];
  return (LC[key] = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: out } }] });
};
