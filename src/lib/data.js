import STORM0 from "../data/storm.json";
import RAW from "../data/forecast.json";
import ANALYSIS from "../data/analysis.json";
import ALERTS from "../data/alerts.json";
import D from "../data/dashboard.json";
import DECISION from "../data/decision.json";
import SYS from "../data/systems.json";
import { dest, bearing, RAD } from "./geo";

export { ANALYSIS, ALERTS, D, DECISION };
export { default as V } from "../data/verification.json";
export const PRIMARY_ID = "ARB-02";

const H = [0, 6, 12, 24, 36, 48, 60, 72];
const PRE = Array.from({ length: 21 }, (_, i) => -720 + 24 * i);   
const EARLY = [-216, -192, -168, -144, -120, -96, -72, -48];       
const sm = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const press = (w) => Math.round(1010 - Math.pow(w / 8.5, 1.55));
const km = (a, b) => { const p1 = a[1] * RAD, p2 = b[1] * RAD, dl = (b[0] - a[0]) * RAD, h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); };
const stageOf = (w) => (w < 64 ? "developing" : "mature");
const lat1 = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? "N" : "S"}`, lon1 = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? "E" : "W"}`;


function assemble(m, fcst, past, landfall) {
  const now = fcst[0], hdg = bearing([now.lon, now.lat], [fcst[1].lon, fcst[1].lat]), sp = now.speed;
  const pt = (t, lon, lat, wind, extra = {}) => ({ t, lon, lat, wind, pres: press(wind), dir: Math.round(hdg), speed: sp, conf: 100, exists: true, sh: m.sh, kind: "obs", ...extra });
  const w24 = past[0].wind, p24 = past[0];
  const early = EARLY.map((t) => { const q = dest(p24.lon, p24.lat, hdg + 180, sp * 0.25 * (-24 - t)); return pt(t, q[0], q[1], Math.round(20 + (w24 - 20) * sm((t + 216) / 192))); });
  const pre = PRE.map((t) => ({ t, lon: early[0].lon, lat: early[0].lat, wind: 0, pres: 1010, dir: 0, speed: 0, conf: 0, exists: false, sh: m.sh, kind: "pre" }));
  const fc = fcst.map((p) => ({ ...p, post: !!landfall && p.h > landfall.h }));
  const land = landfall ? fc.find((f) => f.h === landfall.h) : null;
  const peak = fc.reduce((a, b) => (b.wind > a.wind ? b : a));
  const c24 = fc[3].conf;
  const parts = [["Track", c24 - 2], ["Intensity", c24 - 8], [land ? "Landfall" : "Long range", land ? land.conf : fc[7].conf], ["Classification", 87]];
  return { m, timeline: [...pre, ...early, ...past, ...fc], forecast: fc, land, landfall, peak, parts, all: Math.round(parts.reduce((s, [, v]) => s + v, 0) / 4),
    storm: { id: m.full || m.id, name: m.name, basin: m.basin, lat: lat1(now.lat), lon: lon1(now.lon), motion: m.move } };
}
const pastPts = (now, hdg, sp, w0, sh) => [4, 3, 2, 1].map((k) => { const q = dest(now[0], now[1], hdg + 180, sp * 6 * k), w = Math.max(20, Math.round(w0 - 7.5 * k)); return { t: -6 * k, lon: q[0], lat: q[1], wind: w, pres: press(w), dir: Math.round(hdg), speed: sp, conf: 100, exists: true, sh, kind: "obs" }; });

function buildPrimary() {
  const track = D.track;
  const fcst = RAW.map((d, i) => ({ ...d, t: d.h, lon: track[i][0], lat: track[i][1], pres: D.pressure[i], band: [d.lo, d.hi], kind: i ? "fc" : "now", exists: true, sh: false }));
  const past = D.past.map(([lon, lat], i) => ({ t: -24 + i * 6, lon, lat, wind: D.pastWind[i], pres: D.pastPressure[i], dir: 48, speed: 17, conf: 100, exists: true, sh: false, kind: "obs" }));
  return assemble({ id: PRIMARY_ID, full: STORM0.id, name: "Cyclone ARB-02", basin: "Arabian Sea", sh: false, move: STORM0.motion }, fcst, past, { h: 48, name: "Mumbai, Maharashtra", short: "Mumbai" });
}
function buildOther(s) {
  const now = [s.lon, s.lat], brg = bearing(now, s.end);
  const pos = (h) => { const f = h / 72, b = [now[0] + (s.end[0] - now[0]) * f, now[1] + (s.end[1] - now[1]) * f]; return dest(b[0], b[1], brg + 90, s.curve * Math.sin(Math.PI * f)); };
  const wnd = (h) => Math.round(h <= s.peak[0] ? s.wind + (s.peak[1] - s.wind) * sm(h / s.peak[0]) : s.peak[1] - (s.peak[1] - s.end72) * sm((h - s.peak[0]) / (72 - s.peak[0])));
  const ll = H.map(pos), fcst = ll.map((p, i) => {
    const j = Math.min(i, 6), half = Math.round(1.5 + 0.14 * H[i]), w = wnd(H[i]);
    return { h: H[i], t: H[i], lon: p[0], lat: p[1], wind: w, lo: w - half, hi: w + half, band: [w - half, w + half], pres: press(w), dir: Math.round(bearing(ll[j], ll[j + 1])), speed: Math.round(km(ll[j], ll[j + 1]) / (H[j + 1] - H[j])), conf: Math.round(97 - 0.585 * H[i]), kind: i ? "fc" : "now", exists: true, sh: s.sh };
  });
  return assemble({ id: s.id, name: s.name, basin: s.basin, sh: s.sh, move: s.move }, fcst, pastPts(now, bearing(ll[0], ll[1]), fcst[0].speed, s.wind, s.sh), s.landfall);
}
const BUILT = { [PRIMARY_ID]: buildPrimary() };
SYS.forEach((s) => { BUILT[s.id] = buildOther(s); });
export const SYSTEM_LIST = Object.values(BUILT).map((b) => { const n = b.forecast[0]; return { id: b.m.id, name: b.m.name, basin: b.m.basin, lon: n.lon, lat: n.lat, wind: n.wind, sh: b.m.sh, move: b.m.move, stage: stageOf(n.wind) }; });
export const NOW_I = PRE.length + EARLY.length + 4;


export let SID, STORM, TIMELINE, FORECAST, LAND, PEAK, CONF_PARTS, CONF_ALL, LAND_NAME, LAND_SHORT;
export const selectSystem = (id) => {
  const b = BUILT[id]; SID = id; STORM = b.storm; TIMELINE = b.timeline; FORECAST = b.forecast; LAND = b.land; PEAK = b.peak;
  CONF_PARTS = b.parts; CONF_ALL = b.all; LAND_NAME = b.landfall ? b.landfall.name : ""; LAND_SHORT = b.landfall ? b.landfall.short : "";
};
selectSystem(PRIMARY_ID);
export const frameFor = (p) => ANALYSIS.frames[p.t >= 0 ? 4 : p.t >= -6 ? 3 : p.t >= -12 ? 2 : p.t >= -18 ? 1 : 0];


export const tzName = (d = new Date()) => (new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName") || {}).value || "";
const slot = () => Math.floor(Date.now() / 1800000) * 1800000;
export const stamp = (t) => { const d = new Date(slot() + t * 3600000); return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })} ${tzName(d)}`; };
export const fmtTime = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
export const ago = (ms) => { const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 1 ? "Just now" : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`; };
export const tLabel = (t) => (t === 0 ? "Now" : t <= -48 && t % 24 === 0 ? `${t / 24}d` : t > 0 ? `+${t}h` : `${t}h`);
