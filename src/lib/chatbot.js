
import * as DATA from "./data";
import { ALERTS, D, DECISION as DC, V, SYSTEM_LIST, PRIMARY_ID, ago } from "./data";
import { classify, compass, RADII } from "./geo";
import { search, entry, byTitle, onlyGeneric, KB_SIZE, normalise as norm } from "./search";

/* ---------- small helpers ---------- */
const lat = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? "N" : "S"}`;
const lon = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? "E" : "W"}`;
const P = (p) => `${lat(p.lat)} ${lon(p.lon)}`;
const bullets = (a) => a.map((x) => `• ${x}`).join("\n");
const SEV = { evacuate: "Evacuate", warning: "Warning", watch: "Watch", update: "Update" };
const primary = () => SYSTEM_LIST.find((s) => s.id === PRIMARY_ID);
const cur = () => ({ id: DATA.SID, name: DATA.STORM.name, basin: DATA.STORM.basin, motion: DATA.STORM.motion, f: DATA.FORECAST, land: DATA.LAND, peak: DATA.PEAK, parts: DATA.CONF_PARTS, all: DATA.CONF_ALL });
const primaryNote = () => (DATA.SID !== PRIMARY_ID ? `(These details are prepared for ${primary().name}, ${primary().basin}, the cyclone heading for Mumbai.)\n` : "");

/* Facts that appear as text on the Overview page */
const SOURCES = [
  ["INSAT-3DR and INSAT-3DS Imager", "Geostationary imagery", "Visible, water vapour and thermal infrared channels for detection and evolution"],
  ["Himawari-9 AHI", "Geostationary imagery", "Cross-check of centre position and cloud-top temperature"],
  ["Scatterometer ocean winds (Metop-C ASCAT, ScatSat-1)", "Ocean surface vector winds", "Wind radii and the extent of strong winds"],
  ["Sea surface temperature analyses", "Ocean heat", "Environment for strengthening or weakening"],
  ["Global model analyses", "Wind shear and humidity", "Steering flow and intensity environment"],
  ["Historical best-track archives", "Training and verification", "Labels for classification and forecast verification"],
];
const STEPS = [
  ["Identify", "Convolutional network", "Finds the cyclone in each multi-channel satellite scene and fixes its centre."],
  ["Classify", "CNN with intensity regression", "Assigns the stage from tropical depression to Category 5."],
  ["Evolve", "Transformer over image sequences", "Reads six-hourly frames to track cloud pattern, shape and temperature change."],
  ["Predict", "Time-series ensemble, 52 members", "Forecasts track, intensity and landfall with a calibrated confidence."],
  ["Warn", "Decision-support rules", "Turns the forecast into district alerts and timed actions."],
];
const AUDIENCES = [
  ["Authorities", /authorit|government|ndrf|sdrf|official|admin/],
  ["Coastal communities", /communit|villager|resident|people living|public|famil|citizen/],
  ["Fisheries and shipping", /fish|boat|trawler|ship|port|vessel|jnpt/],
  ["Power and telecom", /power|telecom|electric|tower|substation|grid/],
  ["Agriculture and industry", /agricultur|farm|crop|industr|chemical/],
];

/* A storm other than the selected one that the question names (by id, basin or landfall place) */
function namedOther(n) {
  for (const s of SYSTEM_LIST) {
    if (s.id === DATA.SID) continue;
    const id = s.id.toLowerCase().replace(/-/g, " ");
    if (new RegExp(`\\b${id}\\b`).test(n) || n.includes(s.basin.toLowerCase())) return s;
  }
  const alias = [[/cuba|atlantic/, "12L"], [/luzon|philippines|typhoon/, "09W"], [/east pacific/, "08E"], [/south indian/, "06S"], [/south pacific/, "05P"]];
  for (const [re, id] of alias) if (re.test(n) && id !== DATA.SID) return SYSTEM_LIST.find((s) => s.id === id);
  return null;
}
const describeOther = (s) => ({
  text: `${s.name.includes(s.id) ? s.name : `${s.name} (${s.id})`}, ${s.basin}\n${bullets([`Strength: ${classify(s.wind).n}, ${s.wind} kt winds`, `Position: ${lat(s.lat)} ${lon(s.lon)}`, `Motion: ${s.move}`])}\nTo see its forecast, landfall and confidence, select it from the cyclone list on the Dashboard page and ask me again.`,
  next: ["What other cyclones are monitored?"],
});

/* ---------- answers ---------- */
const status = () => {
  const c = cur(), n0 = c.f[0], k = classify(n0.wind);
  return { text: `${c.name}, ${c.basin}\n${bullets([`Strength: ${k.n}, ${n0.wind} kt winds, pressure ${n0.pres} hPa`, `Position: ${P(n0)}`, `Motion: ${c.motion}`])}`, next: ["Where will it land?", "Show the forecast"] };
};
const summary = () => {
  const c = cur();
  if (c.id === PRIMARY_ID) return { text: `${D.ai.summary.join(" ")}\n\n${status().text}`, next: ["Who should evacuate?", "Show active alerts"] };
  const s = status().text, l = c.land ? `Landfall is forecast near ${DATA.LAND_NAME || "the coast"} at about +${c.land.h} h.` : "No landfall is forecast within 72 hours; it stays over open water.";
  return { text: `${s}\n${l} Peak forecast intensity is ${c.peak.wind} kt (${classify(c.peak.wind).n}) at ${c.peak.h === 0 ? "now" : `+${c.peak.h} h`}.`, next: ["Show the forecast"] };
};
const forecast = ({ raw }) => {
  const c = cur(), m = raw.match(/(?:\+|\b)(\d{1,2}) ?(?:h|hr|hrs|hour|hours)\b/), line = (p) => `${p.h === 0 ? "Now" : `+${p.h} h`}: ${classify(p.wind).k}, ${p.wind} kt (range ${p.lo}-${p.hi} kt), ${P(p)}, ${p.pres} hPa, ${compass(p.dir)} at ${p.speed} km/h, confidence ${p.conf}%${p.post ? ", after landfall" : ""}`;
  if (m) {
    const p = c.f.find((x) => x.h === +m[1]);
    if (!p) return { text: `The forecast has steps at ${c.f.map((x) => `+${x.h} h`).join(", ")}. Ask for one of those.`, next: ["Show the forecast"] };
    return { text: `${c.name} at ${p.h === 0 ? "now" : `+${p.h} h`}\n${line(p)}`, next: ["Where will it land?"] };
  }
  return { text: `${c.name}, 72-hour forecast\n${bullets(c.f.map(line))}`, next: ["Where will it land?", "How confident is the forecast?"] };
};
const landfall = () => {
  const c = cur();
  if (!c.land) return { text: `${c.name} has no landfall in the 72-hour forecast; it stays over open water.`, next: ["Show the forecast"] };
  const l = c.land, extra = c.id === PRIMARY_ID ? `\n${D.ai.qa["Where will it land?"]}` : "";
  return { text: `${c.name}: landfall is forecast at about +${l.h} h near ${DATA.LAND_NAME || l.name}, as a ${classify(l.wind).n} (${l.wind} kt, range ${l.lo}-${l.hi} kt).${c.id === PRIMARY_ID ? "" : ` Confidence at landfall is ${l.conf}%.`}${extra}`, next: ["Who should evacuate?", "Which districts are most at risk?"] };
};
const intensity = () => {
  const c = cur(), w0 = c.f[0].wind, pk = c.peak, w72 = c.f[7].wind;
  const trend = pk.h === 0 ? `Winds are at their forecast peak now (${w0} kt) and are expected to ease to ${w72} kt by +72 h.` : `Winds are forecast to rise from ${w0} kt to a peak of ${pk.wind} kt (${classify(pk.wind).n}) at +${pk.h} h, then ${w72 < pk.wind ? "fall" : "change"} to ${w72} kt by +72 h.`;
  const why = c.id === PRIMARY_ID ? `${D.ai.qa["Why is it strengthening?"]}\n` : "";
  return { text: `${why}${trend}${c.id === PRIMARY_ID ? ` The chance of rapid intensification (30 kt in 24 h) is ${V.prob[0][1]}%.` : ""}`, next: ["What is the peak intensity?"] };
};
const peak = () => { const c = cur(); return { text: `${c.name}: peak forecast intensity is ${c.peak.wind} kt, a ${classify(c.peak.wind).n}, at ${c.peak.h === 0 ? "now" : `+${c.peak.h} h`}.`, next: ["Show the forecast"] }; };
const confidence = () => {
  const c = cur();
  return { text: `${c.name}: overall confidence is ${c.all}%.\n${bullets(c.parts.map(([k, v]) => `${k}: ${v}%`))}\nForecast confidence falls with lead time: ${c.f.map((p) => `${p.h === 0 ? "now" : `+${p.h} h`} ${p.conf}%`).join(", ")}.`, next: ["How accurate is CycloneX?"] };
};
const risk = () => {
  const rain = ALERTS.seed.find((a) => a.id === 5);
  return { text: `${primaryNote()}Risk zones around landfall\n${bullets(D.risk.map((z) => `Within ${z.km} km, ${z.l}: ${z.d}`))}\nImpact\n${bullets(DC.impact.map((i) => `${i.k}: ${i.v}`))}\n${rain.title}. ${rain.body}`, next: ["Which districts are most at risk?", "Who should evacuate?"] };
};
const districts = ({ n }) => {
  const d = DC.districts.find((x) => x.n.toLowerCase().split(" ").some((t) => t.length > 3 && t !== "city" && t !== "suburban" && n.includes(t)) || (n.includes("mumbai") && x.n.startsWith("Mumbai")));
  if (d) return { text: `${primaryNote()}${d.n}, ${d.s}: ${d.risk} risk\n${bullets([`Expected winds: ${d.wind}`, `Storm surge: ${d.surge}`, `Population: ${d.pop}`, `Cyclone shelters: ${d.shelters}`, `Action: ${d.act}`])}`, next: ["Which districts are most at risk?"] };
  return { text: `${primaryNote()}District risk, highest first\n${bullets(DC.districts.map((x) => `${x.n}, ${x.s}: ${x.risk} risk, winds ${x.wind}, surge ${x.surge}, ${x.shelters} shelters. ${x.act}.`))}`, next: ["Who should evacuate?"] };
};
const evacuate = () => ({ text: `${primaryNote()}${D.ai.qa["Who should evacuate?"]}\n${bullets(DC.phases.slice(1).map((p) => `${p.label}: ${p.note}`))}`, next: ["What should authorities do?", "Show active alerts"] });
const actions = ({ n }) => {
  const hit = AUDIENCES.find(([, re]) => re.test(n));
  if (hit) return { text: `${primaryNote()}Actions for ${hit[0]}\n${bullets(DC.audiences[hit[0]].map((a) => `T-${a.due} h: ${a.a}`))}`, next: ["Show the decision timeline"] };
  return { text: `${primaryNote()}CycloneX gives timed actions for ${AUDIENCES.map((a) => a[0]).join(", ")}. Ask about one, for example "What should fishermen do?". T-24 h means 24 hours before landfall.\n${bullets(DC.phases.map((p) => `${p.label}: ${p.note}`))}`, next: ["What should authorities do?", "What should fishermen do?"] };
};
const timeline = () => ({ text: `${primaryNote()}Decision timeline (hours before landfall)\n${bullets(DC.phases.map((p) => `${p.label}: ${p.note}`))}`, next: ["What should authorities do?"] });
const alerts = ({ alerts: list }) => {
  const a = [...(list && list.length ? list : ALERTS.seed)].sort((x, y) => (y.at || 0) - (x.at || 0));
  const counts = Object.keys(SEV).map((k) => [k, a.filter((x) => x.sev === k).length]).filter(([, c]) => c).map(([k, c]) => `${c} ${SEV[k].toLowerCase()}`).join(", ");
  return { text: `${primaryNote()}${a.length} alerts (${counts}), newest first\n${bullets(a.map((x) => `${SEV[x.sev]}: ${x.title} (${x.region}${x.at ? `, ${ago(x.at)}` : ""})`))}\nOpen the Early warning page for full details.`, next: ["What do the warning levels mean?", "Who should evacuate?"] };
};
const levels = () => {
  const red = DC.impact.find((i) => i.k === "Districts on red alert");
  return { text: `${primaryNote()}Warning levels\n${bullets(V.levels.map((l) => `${l.n} (${l.t}): ${l.a}`))}\nCurrent level by region\n${bullets(V.regions.map((r) => `${r.r}: ${r.lv}`))}${red ? `\nDistricts on red alert: ${red.v}.` : ""}`, next: ["Show active alerts"] };
};
const dissem = () => ({ text: `${primaryNote()}How warnings are sent\n${bullets(V.dissem.map((d) => `${d.c}: ${d.r} (${d.s})`))}`, next: ["What do the warning levels mean?"] });
const accuracy = () => {
  const t = V.trackErr, i = V.intErr, at = (a, h) => a.find((x) => x.h === h);
  return { text: `Verification (prototype figures from simulated verification data)\n${bullets([`Detection: 97% probability of detection`, `Classification: 87% stage accuracy, TD to C5`, `Track error: ${t.map((x) => `+${x.h} h ${x.cx} km (benchmark ${x.base} km)`).join(", ")}`, `Intensity error: ${i.map((x) => `+${x.h} h ${x.cx} kt (benchmark ${x.base} kt)`).join(", ")}`])}\nAt 24 h the track error is ${at(t, 24).cx} km against a benchmark of ${at(t, 24).base} km.`, next: ["How confident is the forecast?"] };
};
const probs = () => ({ text: `${primaryNote()}Probabilities for ${primary().name}\n${bullets(V.prob.map(([l, p]) => `${l}: ${p}%`))}`, next: ["Which past cyclones are similar?"] });
const analogs = () => ({ text: `${primaryNote()}Most similar past cyclones\n${bullets(V.analogs.map((a) => `${a.n} (${a.y}): ${a.area}, ${a.cls}, ${a.sim}% similar`))}`, next: ["What is the chance of Category 3 at landfall?"] });
const channels = () => ({ text: `Satellite channels\n${bullets(V.channels.map((c) => `${c.b} (${c.wl}, ${c.res}): ${c.shows}. Used for ${c.use.toLowerCase()}.`))}`, next: ["What is the Dvorak T-number?"] });
const evolution = () => {
  const now = DATA.ANALYSIS.frames[DATA.ANALYSIS.frames.length - 1];
  return { text: `${primaryNote()}Latest satellite evolution reading for ${primary().name}\n${bullets([`Coldest cloud top: ${now.ctt} °C`, `Eye diameter: ${now.eye} km`, `Symmetry: ${now.sym}%`])}\n${now.note}\nEarlier frames:\n${bullets(DATA.ANALYSIS.frames.slice(0, -1).map((f) => `${f.t}: coldest cloud top ${f.ctt} °C, eye ${f.eye ? `${f.eye} km` : "none"}, symmetry ${f.sym}%. ${f.note}`))}`, next: ["Which satellite channels are used?"] };
};
const dvorak = () => ({ text: `CycloneX matches the wind speed to the nearest Dvorak T-number:\n${bullets(Object.entries(V.dvorak).map(([t, w]) => `T${t} = ${w} kt`))}`, next: ["Which satellite channels are used?"] });
const sources = () => ({ text: `What CycloneX reads\n${bullets(SOURCES.map(([a, , d]) => `${a}: ${d}`))}`, next: ["How does CycloneX work?"] });
const method = () => ({ text: `From image to forecast, in five steps\n${bullets(STEPS.map(([a, m, d]) => `${a} (${m}): ${d}`))}`, next: ["Which data sources does it use?", "How accurate is CycloneX?"] });
const others = () => {
  const sel = DATA.SID;
  return { text: `CycloneX is monitoring ${SYSTEM_LIST.length} cyclones worldwide\n${bullets(SYSTEM_LIST.map((s) => `${s.name.includes(s.id) ? s.name : `${s.name} (${s.id})`}, ${s.basin}: ${classify(s.wind).n}, ${s.wind} kt, moving ${s.move}${s.id === sel ? " [selected]" : ""}`))}\nSelect any of them on the Dashboard page to see its forecast.`, next: ["Show the forecast"] };
};
const categories = () => ({ text: `CycloneX classifies storms by 1-minute wind speed in knots\n${bullets(["Tropical depression: below 34 kt", "Tropical storm: 34 to 63 kt", "Category 1: 64 to 82 kt", "Category 2: 83 to 95 kt", "Category 3: 96 to 112 kt", "Category 4: 113 to 136 kt", "Category 5: 137 kt or more"])}`, next: ["How strong is it now?"] });
const pages = () => ({ text: `The site has five pages\n${bullets(["Overview: what CycloneX does, methodology, verified performance and data sources", "Satellite imagery: visible, infrared and water vapour views with a timeline and map layers", "Prediction: forecast table, confidence, movement, probabilities and similar past cyclones", "Dashboard: cyclone location, risk map, the list of monitored cyclones and the AI summary", "Early warning: alerts, impact, decision timeline, district risk, warning levels and dissemination"])}`, next: ["What is CycloneX?"] });
const about = () => ({ text: "CycloneX analyses multi-source satellite imagery to identify tropical cyclones, classify their development stage and forecast intensity, track and landfall with a stated confidence. It is built for disaster management authorities and meteorological departments who must act hours before the storm arrives. It is a prototype, and the same pipeline covers every ocean basin.", next: ["How does CycloneX work?", "Which pages are there?"] });

/* ---------- wind calculator: converts units and classifies any wind speed ---------- */
const imdClass = (kt) => (kt >= 120 ? "super cyclonic storm" : kt >= 90 ? "extremely severe cyclonic storm" : kt >= 64 ? "very severe cyclonic storm" : kt >= 48 ? "severe cyclonic storm" : kt >= 34 ? "cyclonic storm" : kt >= 28 ? "deep depression" : kt >= 17 ? "depression" : "low pressure area");
const ssClass = (kt) => (kt >= 34 ? classify(kt).n.toLowerCase() : kt >= 17 ? "tropical depression strength (below 34 kt)" : "weaker than a tropical depression");
const r1 = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);
const WIND_RE = /(\d+(?:\.\d+)?)\s*(kt|kts|knots?|km\s*\/?\s*h|kmph|kph|mph|m\s*\/\s*s)(?![a-z])/i;
function windTool(raw) {
  const m = raw.match(WIND_RE); if (!m) return null;
  const v = +m[1], u = m[2].toLowerCase().replace(/\s/g, "");
  const kt = /^(kt|knot)/.test(u) ? v : /^(km|kmph|kph)/.test(u) ? v / 1.852 : /^mph/.test(u) ? v / 1.15078 : v * 1.94384;
  const unit = /^(kt|knot)/.test(u) ? "kt" : /^(km|kmph|kph)/.test(u) ? "km/h" : /^mph/.test(u) ? "mph" : "m/s";
  return { text: `${v} ${unit} is about ${r1(kt)} kt = ${r1(kt * 1.852)} km/h = ${r1(kt * 1.15078)} mph.\n${bullets([`Saffir-Simpson (1-minute wind): ${ssClass(kt)}`, `IMD scale (3-minute wind): ${imdClass(kt)}`])}\nThe two scales average the wind over different periods, so the same storm can fall in slightly different classes on each.`, next: ["What is the Saffir-Simpson scale?", "How does the IMD classify cyclones?"], id: "windconv" };
}

/* ---------- things CycloneX's own data can add to a general answer ---------- */
const isP = () => DATA.SID === PRIMARY_ID;
const nearestT = (w) => { const t = Object.keys(V.dvorak).reduce((a, b) => (Math.abs(V.dvorak[b] - w) < Math.abs(V.dvorak[a] - w) ? b : a)); return (+t).toFixed(1); };
const analog = (name) => { const a = V.analogs.find((x) => x.n.toLowerCase() === name); return a ? `CycloneX rates ${a.n} (${a.y}) as ${a.sim}% similar to ${primary().name}, with its landfall area given as "${a.area}" and class ${a.cls}.` : null; };
const LIVE = {
  saffir: () => { const c = cur(); return `${c.name} is currently a ${classify(c.f[0].wind).n} (${c.f[0].wind} kt).`; },
  imd: () => { const c = cur(); return `${c.name} has ${c.f[0].wind} kt winds, which falls in the IMD ${imdClass(c.f[0].wind)} range.`; },
  surge: () => (isP() ? `for ${primary().name}, the zone within ${D.risk[2].km} km of landfall shows ${D.risk[2].d.charAt(0).toLowerCase() + D.risk[2].d.slice(1)}.` : null),
  rapid: () => (isP() ? `the chance of rapid intensification for ${primary().name} is ${V.prob[0][1]}%.` : null),
  eye: () => { const f = DATA.ANALYSIS.frames.slice(-1)[0]; return isP() ? `${primary().name} has an eye about ${f.eye} km wide, and its coldest cloud top is ${f.ctt} °C.` : null; },
  shear: () => (isP() ? D.ai.qa["Why is it strengthening?"] : null),
  sst: () => (isP() ? D.ai.qa["Why is it strengthening?"] : null),
  conditions: () => (isP() ? D.ai.qa["Why is it strengthening?"] : null),
  landfall: () => { const c = cur(); return c.land ? `${c.name} is forecast to make landfall near ${DATA.LAND_NAME} at about +${c.land.h} h.` : `${c.name} has no landfall in its 72-hour forecast.`; },
  evacuation: () => (isP() ? D.ai.qa["Who should evacuate?"] : null),
  before: () => (isP() ? `for ${primary().name}, CycloneX advises: ${D.ai.qa["Who should evacuate?"]}` : null),
  colours: () => (isP() ? `current levels are ${V.regions.map((r) => `${r.r}: ${r.lv}`).join("; ")}.` : null),
  accuracy: () => { const t = V.trackErr.find((x) => x.h === 24); return `at 24 h its track error is ${t.cx} km against a benchmark of ${t.base} km (prototype figures from simulated verification data).`; },
  fishermen: () => (isP() ? `for ${primary().name}, CycloneX's timed actions for fisheries and shipping are:\n${bullets(DC.audiences["Fisheries and shipping"].map((a) => `T-${a.due} h: ${a.a}`))}` : null),
  tauktae: () => analog("tauktae"), biparjoy: () => analog("biparjoy"), nisarga: () => analog("nisarga"), vayu: () => analog("vayu"),
  radii: () => { const c = cur(); return `${c.name} now has ${RADII(c.f[0].wind).map(([kt, km]) => `${kt} kt winds out to about ${Math.round(km)} km`).join(", ")}.`; },
  dvorak: () => { const c = cur(); return `${c.name}'s ${c.f[0].wind} kt wind matches about T${nearestT(c.f[0].wind)}.`; },
  pressure: () => { const c = cur(); return `${c.name} has a central pressure of ${c.f[0].pres} hPa.`; },
  names: () => `ARB-02 is an internal CycloneX scenario identifier, not an official IMD name.`,
  arabian: () => `CycloneX's focus system, ${primary().name}, is an Arabian Sea cyclone with landfall forecast near Mumbai.`,
};
const kbAnswer = (e, partial) => {
  let live = null; try { live = LIVE[e.id] ? LIVE[e.id]() : null; } catch (err) { live = null; }
  return { text: (partial ? "I do not have specific information on every part of that, but the closest topic I know is:\n\n" : "") + e.a + (live ? `\n\nIn CycloneX: ${live}` : ""), next: (e.rel || []).map((id) => (entry(id) || {}).t).filter(Boolean).slice(0, 3), id: e.id };
};

/* ---------- places that CycloneX has no forecast for ---------- */
const PLACE_RE = /\b(chennai|madras|kolkata|calcutta|visakhapatnam|vizag|puri|odisha|orissa|bhubaneswar|andhra|tamil nadu|kerala|kochi|cochin|goa|gujarat|kutch|surat|ahmedabad|karachi|pakistan|oman|yemen|bangladesh|dhaka|myanmar|sri lanka|delhi|pune|bengaluru|bangalore|hyderabad|mangalore|puducherry|pondicherry|west bengal|maharashtra|dwarka|porbandar|diu|paradip|kakinada|nellore|lakshadweep|andaman)\b/;
const PLACE_CUE = /\b(will|would|going to|expected|currently|now|today|tomorrow|safe|affect|hit|reach|threat|warning|alert|should i|danger|risk)\b/;
const PLACE_PAST = /\b(was|were|history|past|ever|previous|last|happened|\d{4})\b/;
function placeAnswer(n) {
  const m = n.match(PLACE_RE); if (!m || !PLACE_CUE.test(n) || PLACE_PAST.test(n)) return null;
  const p = m[1], pn = p.replace(/\b\w/g, (c) => c.toUpperCase());
  const lvl = (re) => V.regions.find((r) => re.test(r.r.toLowerCase()));
  if (p === "goa") { const r = lvl(/goa/); return { text: `${primaryNote()}Goa is at ${r.lv} level in CycloneX (${V.levels.find((l) => l.n === r.lv).t}: ${V.levels.find((l) => l.n === r.lv).a.toLowerCase()}).`, next: ["What do the warning levels mean?"] }; }
  if (p === "gujarat") { const r = lvl(/gujarat/), d = DC.districts.find((x) => x.n === "Valsad"); return { text: `${primaryNote()}${r.r} is at ${r.lv} level, and Valsad district has ${d.risk.toLowerCase()} risk with expected winds of ${d.wind} and a storm surge of ${d.surge}. Action: ${d.act}.`, next: ["Which districts are most at risk?"] }; }
  if (p === "maharashtra") return { text: `${primaryNote()}Maharashtra holds all of the landfall zone. The Mumbai, Thane and Raigad coast is at Red level.\n${bullets(DC.districts.filter((x) => x.s === "Maharashtra").map((x) => `${x.n}: ${x.risk} risk, winds ${x.wind}, surge ${x.surge}`))}`, next: ["Which districts are most at risk?"] };
  const regions = V.regions.map((r) => `${r.r} (${r.lv})`).join(", ");
  return { text: `CycloneX has no forecast or warning for ${pn}. The current scenario, ${primary().name}, is forecast to make landfall near Mumbai, and the regions with warning levels are ${regions}.\nFor ${pn}, please check the IMD (mausam.imd.gov.in) and your local authorities.`, next: ["Where will it land?", "What do the warning levels mean?"] };
}

/* ---------- small talk and help ---------- */
const STARTERS = ["How strong is it now?", "Where will it land?", "Who should evacuate?", "How do cyclones form?", "What is storm surge?", "How does the IMD classify cyclones?", "Which cyclone was the deadliest?", "What should I do before a cyclone?"];
function smalltalk(n) {
  const w = n.split(" ").length;
  if (w <= 5 && /^(hi|hello|hey|hii+|namaste|namaskar|good (morning|afternoon|evening)|yo)\b/.test(n)) return { text: "Hello, I am the CycloneX assistant. Ask me anything about cyclones, or about the storm shown in CycloneX.", next: STARTERS.slice(0, 4) };
  if (w <= 6 && /\b(thanks|thank you|thx|thankyou|shukriya|dhanyavad)\b/.test(n)) return { text: "You are welcome. Ask me anything else about cyclones.", next: [] };
  if (w <= 4 && /^(bye|goodbye|see you|good night)\b/.test(n)) return { text: "Goodbye. Stay safe, and follow official warnings during a real cyclone.", next: [] };
  if (/how are you|how r u|how do you do|whats up|what s up/.test(n)) return { text: "I am doing well, thank you. What would you like to know about cyclones?", next: STARTERS.slice(0, 4) };
  if (w <= 3 && /^(ok|okay|cool|nice|great|good|wow|awesome|fine|alright|got it)\b/.test(n)) return { text: "Glad that helps. Ask another question any time.", next: STARTERS.slice(0, 4) };
  if (/\bhelp\b|what can you (do|answer|tell)|what (should|can) i ask|what do you know|your (features|abilities)/.test(n)) return { text: `I can answer questions about:\n${bullets(["How cyclones form, their structure, scales and records", "Storm surge, rain and other hazards", "Cyclone history in India and around the world", "Naming, seasons, basins and the IMD warning system", "Safety: what to do before, during and after a cyclone", "Wind-speed conversion, for example: convert 90 kt to km/h", "The storm in CycloneX: position, forecast, landfall, districts, alerts"])}\nI know ${KB_SIZE} topics and I work offline.`, next: STARTERS.slice(0, 4) };
  return null;
}

/* ---------- CycloneX data intents: [regex, weight] pairs, the highest total wins, ties go to the earlier entry ---------- */
const STORM_Q = new Set(["status", "summary", "forecast", "landfall", "intensity", "peak", "confidence"]);
const INTENTS = [
  ["about", [[/what is cyclonex|about cyclonex|what does cyclonex do|who is (it|cyclonex) for|purpose/, 3], [/\bcyclonex\b/, 1]], about],
  ["dvorak", [[/dvorak|t number|t num/, 4]], dvorak],
  ["status", [[/where is|current(ly)? (position|location|status|state|strength|intensity)|right now|currently|how strong is|how powerful|what category|which category|what stage|wind speed|pressure|latitude|longitude|position|location|moving|motion|heading|how fast|speed of (the|this) (cyclone|storm)|(cyclone|storm) s speed|its speed|forward speed/, 2], [/\b(status|now)\b/, 1]], status],
  ["summary", [[/arb ?0?2|summar|brief me|situation|overview of the (storm|cyclone)|what is happening|what s happening|big picture|tell me about (the |this )?(cyclone|storm)|latest news/, 3]], summary],
  ["forecast", [[/forecast|next (24|48|72)|predict|outlook|\+\d+|\b\d{1,2} ?(h|hr|hrs|hours?)\b/, 2], [/track/, 1]], forecast],
  ["probs", [[/probabilit|chance|likel|odds/, 4]], probs],
  ["landfall", [[/land ?fall|make land|will (it|the (cyclone|storm)|this (cyclone|storm)) (land|hit|cross|reach)|where will (it|the (cyclone|storm)|this (cyclone|storm)) (land|hit|go)|where (is it|does it) (going|land)|when will it (land|hit|reach|arrive)|cross the coast|coast/, 3], [/mumbai|maharashtra|konkan|gujarat|alibag/, 1]], landfall],
  ["intensity", [[/strengthen|intensif|weaken|stronger|why is it|rapid|getting (stronger|weaker)|will it get/, 3]], intensity],
  ["peak", [[/peak|strongest|maximum|max(imum)? wind|highest wind|how strong will/, 3]], peak],
  ["confidence", [[/confiden|how sure|certain|reliab|how much can i trust/, 3]], confidence],
  ["risk", [[/risk|surge|flood|rain|impact|danger|hazard|damage|affected|how bad|zone/, 2]], risk],
  ["districts", [[/district|shelters?|population|raigad|thane|palghar|ratnagiri|valsad|sindhudurg|mumbai city|suburban/, 3], [/mumbai/, 1]], districts],
  ["evacuate", [[/evacuat|who should (leave|move)|should i (leave|go)|go to (a )?shelter/, 3]], evacuate],
  ["actions", [[/what should|what to do|actions?|prepare|preparedness|checklist|authorit|government|ndrf|sdrf|communit|villager|resident|fisher|boat|trawler|shipping|port|power|telecom|electric|farmer|agricult|crop|industr/, 2]], actions],
  ["timeline", [[/timeline|phases?|schedule|decision|\bt (36|24|12)\b/, 3]], timeline],
  ["levels", [[/warning levels?|colou?r|red alert|orange|yellow|green|regions?|what do the levels/, 3]], levels],
  ["alerts", [[/alerts?|notification|bulletin|warnings|active warning|latest warning|unread/, 2]], alerts],
  ["dissem", [[/disseminat|sms|cell broadcast|siren|radio|television|\btv\b|broadcast|vhf|navic|\bsent\b|\bsend\b|how (are|is) (people|the public|warnings?|officials) (informed|notified|alerted|reached)/, 3]], dissem],
  ["accuracy", [[/accura|verif|error|perform|how good|validat|benchmark|detection|skill/, 3]], accuracy],
  ["analogs", [[/analog|similar|past (storms?|cyclones?)|tauktae|biparjoy|nisarga|vayu|phyan|previous cyclones?/, 3]], analogs],
  ["channels", [[/channels?|visible|infrared|vapou?r|wavelength|satellite imagery|resolution|µm|micron/, 3]], channels],
  ["evolution", [[/\beye\b|cloud top|symmetr|evolution|how did it (form|develop)|formation/, 3]], evolution],
  ["sources", [[/data sources?|where does .* data|insat|himawari|ascat|scatsat|scatterometer|sea surface temp|best track|what data|datasets?|sources?/, 3]], sources],
  ["method", [[/how (does|do) (it|cyclonex|the (system|model|platform|pipeline|website|site)) work|how it works|which (model|algorithm|technique)s?|what (model|algorithm|technique)s?|methodolog|pipeline|\bcnn\b|transformer|ensemble|neural|algorithm|machine learning|\bai\b|deep learning|steps|52 members/, 2]], method],
  ["others", [[/other (cyclones?|storms?|systems?)|all (cyclones?|storms?)|monitored|worldwide|global|every basin|which (cyclones?|storms?)|how many (cyclones?|storms?) (are|is) (there|being|monitored|active|tracked)|basins?/, 3]], others],
  ["categories", [[/categor|saffir|what is a (tropical )?(depression|storm)|stages?|classif|what does c\d mean/, 2]], categories],
  ["pages", [[/which pages?|(show me|open|go to|take me to|where is) (the )?(dashboard|prediction|imagery|satellite imagery|early warning|warnings? page|overview|home ?page)|where can i (find|see)|how do i (use|navigate|see)|navigate|menu|\bpages\b|\btabs?\b/, 3]], pages],
];
/* data intents that also have a general-knowledge counterpart: the general answer wins unless the question is about CycloneX itself */
const GENERAL = new Set(["dvorak", "categories", "channels", "accuracy", "evacuate", "levels", "risk", "method", "evolution", "analogs", "actions"]);
const LIVE_RE = /\b(this|our|current|currently|now|today|arb|cyclonex|selected|dashboard|here|expected|ready|available|at risk|in danger|the (cyclone|storm)|mumbai|raigad|thane|palghar|ratnagiri|valsad|sindhudurg|alibag|konkan)\b|will (it|there|the)|in cyclonex|on the (site|website|page)|forecast for|the forecast|\b\d{1,2} ?(h|hrs?|hours?)\b|\+\d+/;
const DEFN_RE = /^(what is|what are|what s|what was|what were|what does|what do|define|meaning of|explain|how (do|does|are|is|can|did|many|much|long|big|fast)|why (do|does|are|is|did|was)|difference between|tell me about|describe|full form|which|can|could|is there|are there|who (was|is|were)|when (is|was|do|does)|where (do|does|is|was))/;
const SCOPE = /\bace\b|\bimd\b|\bndrf\b|\bsdrf\b|\bndma\b|\bincois\b|cyclon|storm|hurricane|typhoon|weather|rain|wind|flood|monsoon|ocean|\bsea\b|coast|tide|surge|warn|alert|satellite|forecast|climate|tropical|depression|evacuat|shelter|disaster|ndma|ndrf|sdrf|imd|gale|squall|thunder|cloud|pressure|humid|season|landfall|knot|\beye\b|categor|saffir|dvorak|radar|buoy|nino|nina|mausam|odisha|bengal|arabian|tauktae|fani|amphan|nisarga|biparjoy|vayu|hpa|coriolis|scatterometer|cnn|neural|transformer|machine learning|\bai\b|latent|convection|trough|ridge|fujiwhara|shear|sst|bhola|haiyan|katrina|harvey|gonu|mocha|michaung|remal|dana|fengal|phailin|hudhud|rsmc|wmo|tornado|tsunami|myth|emergency|rescue|fisher|energy|rotat|spin|equator|gust|temperature|heat/;
const HIST = /\b(bhola|nargis|haiyan|phailin|hudhud|fani|amphan|nisarga|tauktae|biparjoy|vayu|mocha|michaung|remal|dana|fengal|katrina|harvey|patricia|gonu)\b/;
const TH = { score: 4, cov: 0.5 }, TH_WEAK = { score: 2.5, cov: 0.34 };

function dataMatch(n, raw) {
  let best = null, top = 0;
  for (const [id, keys, run] of INTENTS) {
    let s = 0; for (const [re, w] of keys) if (re.test(n) || (id === "forecast" && re.test(raw))) s += w;
    if (id === "districts" && DC.districts.some((d) => d.n.toLowerCase().split(" ").some((t) => t.length > 4 && n.includes(t)))) s += 3;
    if (s > top) { top = s; best = { id, run }; }
  }
  return { id: best ? best.id : null, run: best ? best.run : null, score: top };
}
const REL_DATA = { status: "How strong is it now?", landfall: "Where will it land?", evacuate: "Who should evacuate?" };

const process_debug = typeof globalThis !== "undefined" && globalThis.__CX_DEBUG === true;
/* questions about the chatbot itself or about whether CycloneX can be trusted */
function metaRoute(n) {
  if (/^(are|r) (you|u)\b|\byour name\b|who (are|r) (you|u)|what are you\b|introduce yourself|\b(you|u) (a |an )?(bot|robot|human|chatgpt|gpt|gemini|llm)\b/.test(n)) return entry("who");
  if (/cyclonex|this (site|website|app|project|system)|the data|your data|these (cyclones|storms|numbers|figures)/.test(n) && /\b(real|fake|genuine|actual|live|simulat\w*|demo|mock|synthetic|true)\b/.test(n)) return entry("simulated");
  if (/cyclonex|this (site|website|app|system)/.test(n) && /\b(trust|rely|depend|official|safe to use)\b/.test(n)) return entry("rely");
  if (/\b(cat|category)\s*[1-5]\b/.test(n) && !/\b(this|our|arb|chance|landfall|probab|will|risk)\b/.test(n)) return entry("saffir");
  if (/\b(simple (words|terms|language)|to a (child|kid)|for (a )?(child|kid|kids|children)|eli5|like i am (5|five)|for dummies|beginner)\b/.test(n) && /cyclon|storm|hurricane|typhoon/.test(n)) return entry("simple");
  if (/\beye\b/.test(n) && /\b(outside|go out|step out|calm|safe)\b/.test(n) && !/\b(this|our|arb)\b/.test(n)) return entry("eyetrap");
  if (/how (long|early|far|soon) (before|ahead|in advance)|lead time|how much (notice|warning)|advance warning/.test(n) && /warn|alert|watch|notice/.test(n)) return entry("imdwarn");
  if (/\b(stand|stands) for\b|full form|abbreviation|acronym/.test(n) && /\b(imd|ndma|ndrf|sdrf|incois|wmo|rsmc|jtwc|nhc|sst|ace|hpa|kt|insat|isro)\b/.test(n)) return entry("acronyms");
  return null;
}
/* ordinary weather questions for a place and day, which CycloneX cannot answer */
function localWeather(n) {
  const asks = /\b(weather|rain|raining|temperature|forecast|humid\w*|hot|cold)\b/.test(n);
  const timeOrPlace = /\b(tomorrow|today|tonight|now|next (week|few days)|this (week|weekend))\b/.test(n) || /\bin (delhi|mumbai|chennai|kolkata|bangalore|bengaluru|hyderabad|pune|ahmedabad|jaipur|lucknow|london|paris|new york|tokyo|dubai|my (city|town|area))\b/.test(n);
  if (asks && timeOrPlace && !/cyclon|storm|landfall|hurricane|typhoon|surge|\bsea\b|ocean|climate|monsoon|cyclonex/.test(n)) return { text: "CycloneX does not give local day-to-day weather or temperature. For that, please check the IMD (mausam.imd.gov.in) or the Mausam app. I can tell you about cyclones and the storm shown in CycloneX.", next: STARTERS.slice(0, 4) };
  return null;
}
function single(q, alertList, mem) {
  const n = norm(q), raw = q.toLowerCase();
  if (!n) return { text: "Type a question about cyclones.", next: STARTERS.slice(0, 4) };
  const exact = byTitle(n); if (exact) return kbAnswer(exact);
  const wt = windTool(raw); if (wt) return wt;
  const st = smalltalk(n); if (st) return st;
  /* follow-ups such as "tell me more" or "why?" */
  if (mem && mem.last && n.split(" ").length <= 5 && /^(tell me more|more|more details|more info|elaborate|go on|continue|explain (more|further|that|it)|can you explain|what else)\b/.test(n) || (n.split(" ").length <= 2 && /^(why|how so|and)\b/.test(n))) {
    const e = entry(mem.last), rel = e ? (e.rel || []).map((id) => (entry(id) || {}).t).filter(Boolean).slice(0, 3) : [];
    if (e && e.more && !mem.more) return { text: e.more, next: rel, id: e.id, more: true };
    if (e) return { text: "That covers the main points on this topic. These related topics may help:", next: rel, id: e.id, more: true };
  }
  const hs = HIST.exec(n);
  if (hs && !LIVE_RE.test(n) && !/\b(compare|similar|analog\w*|vs|versus)\b/.test(n) && entry(hs[1])) return kbAnswer(entry(hs[1]));
  const place = placeAnswer(n); if (place) return place;
  const meta = metaRoute(n); if (meta) return kbAnswer(meta);
  const lw = localWeather(n); if (lw) return lw;
  const gen = n.split(" ").length <= 4 && !/\b(same|different|difference|vs|versus|between|or)\b/.test(n) && onlyGeneric(q); if (gen) return kbAnswer(entry(/hurricane|typhoon/.test(n) && !/cyclone/.test(n) ? "names" : "what"));
  const data = dataMatch(n, raw), kb = search(n, 3), top = kb[0];
  const inScope = SCOPE.test(n);
  const anchored = !!top && (top.nq === 0 || top.kh >= 1);
  const conf = !!top && anchored && top.score >= TH.score && top.cov >= TH.cov && (inScope || (top.score >= 9 && top.unk === 0)), weak = !!top && anchored && inScope && top.score >= TH_WEAK.score && top.cov >= TH_WEAK.cov;
  const strong = !!top && top.score >= 9 && top.th >= 2 && top.th / top.nq >= 0.6;
  const defn = DEFN_RE.test(n), live = LIVE_RE.test(n) || (/\b(it|its)\b/.test(n) && !defn && n.split(" ").length <= 6);
  const useData = () => {
    const other = STORM_Q.has(data.id) ? namedOther(n) : null;
    return other ? describeOther(other) : { ...data.run({ n, raw, alerts: alertList }), id: data.id };
  };
  if (process_debug) console.log("DBG", q, "| data", data.id, data.score, "| kb", top && top.e.id, top && top.score.toFixed(1), top && top.cov.toFixed(2), "| live", live, "defn", defn, "conf", conf);
  if (live && data.score >= 2) return useData();
  if (!live && conf && data.score < 3 && !/cyclonex/.test(n)) return kbAnswer(top.e, top.unk > 0 && top.cov < 0.75);
  if (conf && (defn && data.score < 4 || data.score < 3 || GENERAL.has(data.id) || (strong && data.score < 4))) return kbAnswer(top.e, top.unk > 0 && top.cov < 0.75);
  if (data.score >= 2) return useData();
  if (weak) return kbAnswer(top.e, top.unk > 0 || top.cov < 0.6);
  const o = namedOther(n); if (o) return describeOther(o);
  if (!inScope) return { text: "I am built to answer questions about cyclones, tropical storms, weather hazards and the CycloneX system, so I cannot help with that one. Here are some things you can ask me.", next: STARTERS.slice(0, 4) };
  const near = kb.filter((x) => x.score >= 1.5).map((x) => x.e.t).slice(0, 3);
  return { text: "I do not have a reliable answer to that, and I would rather not guess." + (near.length ? " These are the closest topics I know:" : " Try one of these questions."), next: near.length ? near : STARTERS.slice(0, 4) };
}

/* Splits "A? B?" into separate questions so each one is answered */
const splitQ = (q) => q.split(/\?+|;|\s+and also\s+|\s+also tell me\s+/i).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 2);

export { STARTERS };
export function answer(question, alertList = [], mem = {}) {
  const q = (question || "").trim();
  if (!q) return { text: "Type a question about cyclones.", next: STARTERS.slice(0, 4) };
  const hasDeva = /[ऀ-ॿ]/.test(q), parts = splitQ(q);
  let r;
  if (parts.length > 1 && parts.length <= 3) {
    const rs = parts.map((p, i) => { let x = single(p, alertList, mem); if (i > 0 && !x.id) { const y = single("cyclone " + p, alertList, mem); if (y.id) x = y; } return x; });
    r = { text: rs.map((x) => x.text).join("\n\n"), next: rs[rs.length - 1].next, id: rs[rs.length - 1].id };
  } else r = single(parts.length === 1 ? parts[0] : q, alertList, mem);
  if (hasDeva) r = { ...r, text: `${r.text}\n\n(I currently reply in English.)` };
  return r;
}
