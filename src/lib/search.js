
import { KB } from "./knowledge";

const STOP = new Set(("a an the is are was were be been being am do does did of in on at to for from by with about as it its this that these those and or but if then so than too very can could will would should shall may might must i me my we our you your he she they them what which who whom whose when where why how tell please explain define give show describe kya hai hain ka ki ke kaise kab kahan kyun mujhe batao bataiye batayein some any there here also just really much many more most such into out up down over under again once only own same both each few other not no nor yes ok okay hello hi hey vs versus happen happens happened wat wht whats whts hw hows wot wut wats tel pls plz kindly u ur r go going goes get got make makes made thing things know want like ever role").split(" "));
/* different spellings of the same idea are merged into one term */
const CANON = {
  cyclonic: "cyclone", cyclones: "cyclone", formation: "form", genesis: "form", cyclogenesis: "form", intensification: "intens", intensity: "intens", intense: "intens", intensify: "intens",
  strength: "strong", strengthen: "strong", stronger: "strong", strongest: "strong", weaker: "weak", weaken: "weak", weakest: "weak", evacuation: "evacuat", evacuate: "evacuat", evacuee: "evacuat",
  warning: "warn", prediction: "predict", predicting: "predict", preparedness: "prepar", prepare: "prepar", preparation: "prepar", dangerous: "danger", deadly: "death", dead: "death",
  killed: "death", kill: "death", fatality: "death", fatalities: "death", casualty: "death", casualties: "death", rainfall: "rain", precipitation: "rain", rainy: "rain", flooding: "flood", floods: "flood",
  hurricanes: "hurricane", typhoons: "typhoon", tornadoes: "tornado", kt: "knot", kts: "knot", kmph: "kmh", kph: "kmh", millibar: "hpa", mb: "hpa", sst: "sst", temperatures: "temperature",
  toofan: "cyclone", tufan: "cyclone", tuphan: "cyclone", chakravat: "cyclone", चक्रवात: "cyclone", तूफान: "cyclone", तूफ़ान: "cyclone", banta: "form", banti: "form", bante: "form", banata: "form", banna: "form", bana: "form",
  bachav: "safety", suraksha: "safety", chetavani: "warn", samundar: "sea", samudra: "sea",
  lasts: "last", lasting: "last", longest: "long", shelters: "shelter", names: "name", named: "name", naming: "name", scales: "scale", categories: "category", cats: "category", cat: "category",
  satellites: "satellite", radars: "radar", forecasts: "forecast", forecasting: "forecast", forecaster: "forecast", seasons: "season", basins: "basin", bands: "band", records: "record",
};
/* query-only expansions: a question word also searches for these terms, with a lower weight */
const SYN = {
  hurricane: ["cyclone", "typhoon"], typhoon: ["cyclone", "hurricane"], tc: ["cyclone"], twister: ["tornado"], fast: ["speed"], quick: ["speed"], big: ["size"], large: ["size"], largest: ["size"], biggest: ["size"],
  wide: ["size"], diameter: ["size"], width: ["size"], origin: ["form"], start: ["form"], begin: ["form"], born: ["form"], develop: ["form"], create: ["form"], danger: ["hazard", "risk"], hazard: ["danger"],
  safe: ["safety"], precaution: ["prepar"], sea: ["ocean"], ocean: ["sea"], hot: ["warm"], warm: ["hot"], kill: ["death"], harm: ["damage"], damage: ["destruct"], money: ["cost"], costly: ["cost"],
  costliest: ["cost"], chakravat: ["cyclone"], toofan: ["cyclone"], tufan: ["cyclone"], tuphan: ["cyclone"], चक्रवात: ["cyclone"], तूफान: ["cyclone"], तूफ़ान: ["cyclone"], samudri: ["sea"], barish: ["rain"], hawa: ["wind"],
  gale: ["wind"], squall: ["wind"], spin: ["rotate"], rotate: ["spin"], circle: ["rotate"], rotation: ["spin"], center: ["centre"], centre: ["center"], colour: ["color"], color: ["colour"],
  jump: ["intens"], gain: ["intens"], grow: ["intens", "form"], increase: ["intens"], quickly: ["rapid"], suddenly: ["rapid"], explosive: ["rapid"], bomb: ["rapid"], shield: ["protect"], protect: ["safety"], leave: ["evacuat"], flee: ["evacuat"], shelter: ["safety"],
};

export const normalise = (s) => s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}+.%° ]/gu, " ").replace(/(\d)\.(?!\d)/g, "$1 ").replace(/\s\.+/g, " ").replace(/\s+/g, " ").trim();

export function stem(w) {
  if (CANON[w]) return CANON[w];
  if (w.length <= 3 || /[^a-z0-9]/.test(w)) return w;
  let r = w;
  if (r.endsWith("ies") && r.length > 4) r = r.slice(0, -3) + "y";
  else if (r.endsWith("sses")) r = r.slice(0, -2);
  else if (r.endsWith("ing") && r.length > 5) { r = r.slice(0, -3); if (/([^aeiou])\1$/.test(r)) r = r.slice(0, -1); }
  else if (r.endsWith("ed") && r.length > 4) { r = r.slice(0, -2); if (/([^aeiou])\1$/.test(r)) r = r.slice(0, -1); }
  else if (/(ch|sh|x|z|ss)es$/.test(r) && r.length > 4) r = r.slice(0, -2);
  else if (r.endsWith("s") && !r.endsWith("ss") && !r.endsWith("us") && !r.endsWith("is")) r = r.slice(0, -1);
  else if (r.endsWith("ly") && r.length > 5) r = r.slice(0, -2);
  return CANON[r] || r;
}
export const tokens = (s) => normalise(s).split(" ").filter((w) => w && !STOP.has(w)).map(stem);
/* adjacent word pairs, so that phrases such as "storm surge" or "wind shear" count more than the two words apart */
const bigrams = (s) => { const t = tokens(s), out = []; for (let i = 0; i < t.length - 1; i++) out.push(t[i] + "_" + t[i + 1]); return out; };

const GENERIC = new Set(["cyclone", "storm", "hurricane", "typhoon", "tropical", "tc", "weather", "system"]);

/* ---------- index ---------- */
let IDX = null;
function build() {
  const docs = KB.map((e) => {
    const tf = new Map(), add = (text, rep) => { for (const t of tokens(text)) tf.set(t, (tf.get(t) || 0) + rep); for (const g of bigrams(text)) tf.set(g, (tf.get(g) || 0) + rep); };
    add(e.t, 4); add(e.k, 2); add(e.a, 1); if (e.more) add(e.more, 1);
    let len = 0; tf.forEach((v) => (len += v));
    return { e, tf, len, tt: new Set(tokens(e.t)), kt: new Set(tokens(e.t + " " + e.k)) };
  });
  const df = new Map(); docs.forEach((d) => d.tf.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1)));
  const N = docs.length, avg = docs.reduce((s, d) => s + d.len, 0) / N;
  const idf = (t) => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
  IDX = { docs, df, N, avg, idf, vocab: [...df.keys()] };
}

/* edit distance with an early exit */
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let min = i;
    for (let j = 1; j <= b.length; j++) { const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); cur[j] = v; if (v < min) min = v; }
    if (min > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
const fix = (t) => {
  if (IDX.df.has(t) || t.length < 5 || /[^a-z]/.test(t)) return null;
  const max = t.length <= 5 ? 1 : 2; let best = null, bd = max + 1;
  for (const v of IDX.vocab) { const d = lev(t, v, bd - 1 < 0 ? 0 : Math.min(max, bd)); if (d < bd || (d === bd && best && IDX.df.get(v) > IDX.df.get(best))) { bd = d; best = v; } }
  return bd <= max ? best : null;
};

/* Returns the best entries for a question: [{ e, score, cov }], best first. */
export function search(question, top = 3) {
  if (!IDX) build();
  const base = tokens(question), q = new Map(), core = []; let unk = 0;
  for (const raw of base) {
    let t = raw, w = 1;
    if (!IDX.df.has(t)) { const f = fix(t); if (f) { t = f; w = 0.9; } else if (t.length >= 5 && !/\d/.test(t)) unk++; }
    q.set(t, Math.max(q.get(t) || 0, w)); core.push(t);
    for (const s of SYN[raw] || []) { const st = stem(s); if (!q.has(st)) q.set(st, 0.5); }
  }
  if (!core.length) return [];
  for (let i = 0; i < core.length - 1; i++) { const g = core[i] + "_" + core[i + 1]; if (IDX.df.has(g)) q.set(g, 1.2); }
  const unknownW = Math.log(1 + IDX.N) * 0.5;
  const total = core.reduce((s, t) => s + (IDX.df.has(t) ? IDX.idf(t) : unknownW), 0);
  const k1 = 1.4, b = 0.7, out = [];
  for (const d of IDX.docs) {
    let score = 0;
    q.forEach((w, t) => { const f = d.tf.get(t); if (f) score += w * IDX.idf(t) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / IDX.avg))); });
    if (score <= 0) continue;
    /* a question that is (almost) the entry's own title is a very strong signal */
    if (d.tt.size) { let inter = 0; d.tt.forEach((t) => { if (q.has(t) && core.includes(t)) inter++; }); const qc = inter / new Set(core).size, tc = inter / d.tt.size; if (qc >= 0.99 && tc >= 0.6) score += 8 * tc; }
    const hit = core.reduce((s, t) => s + (d.tf.has(t) ? IDX.idf(t) : 0), 0);
    const ng = [...new Set(core)].filter((t) => !GENERIC.has(t)), th = ng.filter((t) => d.tt.has(t)).length, kh = ng.filter((t) => d.kt.has(t)).length;
    out.push({ e: d.e, score, cov: total ? hit / total : 0, th, kh, nq: ng.length, unk });
  }
  return out.sort((a, c) => c.score + 0.4 * c.kh + 0.4 * c.th - (a.score + 0.4 * a.kh + 0.4 * a.th)).slice(0, top);
}
export const entry = (id) => KB.find((e) => e.id === id);
export const KB_SIZE = KB.length;

export const byTitle = (n) => KB.find((e) => normalise(e.t) === n);

/* a question made only of generic words such as "cyclone" or "explain hurricane" */
export const onlyGeneric = (question) => { if (!IDX) build(); const t = tokens(question).map((x) => (GENERIC.has(x) ? x : fix(x) || x)); return t.length > 0 && t.every((x) => GENERIC.has(x)) ? t : null; };