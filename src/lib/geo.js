export const RE = 6371, RAD = Math.PI / 180;
export const dest = (lon, lat, brg, km) => {
  const d = km / RE, b = brg * RAD, la = lat * RAD, lo = lon * RAD;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return [lo2 / RAD, la2 / RAD];
};
export const bearing = (a, b) => {
  const dl = (b[0] - a[0]) * RAD, y = Math.sin(dl) * Math.cos(b[1] * RAD);
  const x = Math.cos(a[1] * RAD) * Math.sin(b[1] * RAD) - Math.sin(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.cos(dl);
  return (Math.atan2(y, x) / RAD + 360) % 360;
};
export const ring = (c, km, skew = 0, dir = 0, n = 72) => {
  const p = [];
  for (let k = 0; k <= n; k++) { const a = (k / n) * 360; p.push(dest(c[0], c[1], a, km * (1 + skew * Math.cos((a - dir - 90) * RAD)))); }
  return p;
};
const CONE_KM = [18, 28, 38, 65, 100, 135, 175, 220];
export const cone = (pts) => {
  const Lf = [], Rt = [];
  pts.forEach((p, i) => { const b = i < pts.length - 1 ? bearing(p, pts[i + 1]) : bearing(pts[i - 1], p); Lf.push(dest(p[0], p[1], b - 90, CONE_KM[i])); Rt.push(dest(p[0], p[1], b + 90, CONE_KM[i])); });
  const last = pts[pts.length - 1], bl = bearing(pts[pts.length - 2], last), cap = [];
  for (let a = -90; a <= 90; a += 30) cap.push(dest(last[0], last[1], bl + a, CONE_KM[CONE_KM.length - 1]));
  const r = [...Lf, ...cap, ...Rt.reverse()]; r.push(r[0]); return r;
};
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
const inv = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;
/* square (in Web Mercator) image footprint centred on lon/lat, half-width in degrees of longitude */
export const squareBox = (lon, lat, h) => { const d = h * RAD, y = merc(lat), t = inv(y + d), b = inv(y - d); return [[lon - h, t], [lon + h, t], [lon + h, b], [lon - h, b]]; };

export const TC = ["TD", "TS", "C1", "C2", "C3", "C4", "C5"];
export const CLASS_NAMES = ["Tropical depression", "Tropical storm", "Category 1 cyclone", "Category 2 cyclone", "Category 3 cyclone", "Category 4 cyclone", "Category 5 cyclone"];
export const COL = ["#6aa8d8", "#5fb88a", "#d6c45a", "#e0903f", "#d9534f", "#c0409a", "#8e5bd0"];
export const cat = (w) => (w >= 137 ? 6 : w >= 113 ? 5 : w >= 96 ? 4 : w >= 83 ? 3 : w >= 64 ? 2 : w >= 34 ? 1 : 0);
export const classify = (w) => { const i = cat(w); return { i, k: TC[i], n: CLASS_NAMES[i], c: COL[i] }; };
/* wind-radius contours in km for 34, 50 and 64 kt winds */
export const RADII = (w) => [[34, 120 + w * 2.8, "#d9b84a"], [50, 70 + w * 1.7, "#e0803f"], [64, 40 + w * 1.1, "#d9534f"]].filter(([kt]) => w >= kt);
export const fmtPos = (p) => `${p.lat.toFixed(1)}°N ${p.lon.toFixed(1)}°E`;
const CARD = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = (deg) => CARD[Math.round(deg / 22.5) % 16];
