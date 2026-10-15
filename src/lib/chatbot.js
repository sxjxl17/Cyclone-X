import * as DATA from "./data";
import { ALERTS, D, DECISION as DC, V, SYSTEM_LIST, PRIMARY_ID, ago } from "./data";
import { classify, compass } from "./geo";

/* ---------- small helpers ---------- */
const lat = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? "N" : "S"}`;
const lon = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? "E" : "W"}`;
const P = (p) => `${lat(p.lat)} ${lon(p.lon)}`;
const bullets = (a) => a.map((x) => `• ${x}`).join("\n");
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9+.%°µ ]/g, " ").replace(/\s+/g, " ").trim();
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
const help = () => ({ text: "I answer from CycloneX's own data. You can ask about:\n" + bullets(["The current cyclone: position, strength, forecast, landfall, peak, confidence", "Impact: risk zones, districts, evacuation, actions for each group, decision timeline", "Alerts, warning levels and how warnings are sent", "Accuracy, probabilities and similar past cyclones", "Satellite channels, data sources and how the models work", "Other cyclones being monitored worldwide"]), next: [] });
const greet = () => ({ text: "Hello, I am the CycloneX assistant. I answer only from the data in CycloneX. What would you like to know?", next: [] });
const thanks = () => ({ text: "You are welcome. Ask me anything else about CycloneX.", next: [] });

/* ---------- intent table: [regex, weight] pairs, the highest total wins, ties go to the earlier entry ---------- */
const STORM_Q = new Set(["status", "summary", "forecast", "landfall", "intensity", "peak", "confidence"]);
const INTENTS = [
  ["greet", [[/^(hi|hello|hey|namaste|good (morning|afternoon|evening))\b/, 3]], greet],
  ["thanks", [[/\b(thanks|thank you|thx)\b/, 3], [/^(bye|goodbye)\b/, 3]], thanks],
  ["help", [[/\bhelp\b/, 3], [/what can you (do|answer|tell)/, 3], [/what (should|can) i ask/, 3]], help],
  ["about", [[/what is cyclonex|about cyclonex|what does cyclonex do|who (made|built|created)|who is (it|cyclonex) for|purpose/, 3], [/\bcyclonex\b/, 1]], about],
  ["dvorak", [[/dvorak|t number|t num/, 4]], dvorak],
  ["status", [[/where is|current(ly)? (position|location|status|state|strength|intensity)|right now|currently|how strong is|how powerful|what category|which category|what stage|wind speed|pressure|latitude|longitude|position|location|moving|motion|heading|how fast/, 2], [/\b(status|now)\b/, 1]], status],
  ["summary", [[/summar|brief me|situation|overview of the (storm|cyclone)|what is happening|what s happening|big picture|tell me about (the |this )?(cyclone|storm)|latest news/, 3]], summary],
  ["forecast", [[/forecast|next (24|48|72)|predict|outlook|\+\d+|\b\d{1,2} ?(h|hr|hrs|hours?)\b/, 2], [/track/, 1]], forecast],
  ["probs", [[/probabilit|chance|likel|odds/, 4]], probs],
  ["landfall", [[/land ?fall|make land|will it (land|hit|cross|reach)|where will it (land|hit|go)|when will it (land|hit|reach|arrive)|cross the coast|coast/, 3], [/mumbai|maharashtra|konkan|gujarat|alibag/, 1]], landfall],
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
  ["analogs", [[/analog|similar|past (storms?|cyclones?)|histor|tauktae|biparjoy|nisarga|vayu|phyan|previous cyclones?/, 3]], analogs],
  ["channels", [[/channels?|visible|infrared|vapou?r|wavelength|satellite imagery|resolution|µm|micron/, 3]], channels],
  ["evolution", [[/\beye\b|cloud top|symmetr|evolution|how did it (form|develop)|formation/, 3]], evolution],
  ["sources", [[/data sources?|where does .* data|insat|himawari|ascat|scatsat|scatterometer|sea surface temp|best track|what data|datasets?|sources?/, 3]], sources],
  ["method", [[/how does|how do you|how it works|method|pipeline|cnn|transformer|ensemble|neural|algorithm|machine learning|\bai\b|deep learning|steps|52/, 2]], method],
  ["others", [[/other (cyclones?|storms?|systems?)|all (cyclones?|storms?)|monitored|worldwide|global|every basin|which (cyclones?|storms?)|how many (cyclones?|storms?)|basins?/, 3]], others],
  ["categories", [[/categor|saffir|scale|what is a (tropical )?(depression|storm)|stages?|classif|what does c\d mean/, 2]], categories],
  ["pages", [[/which pages?|where can i (find|see)|how do i (use|navigate|see)|navigate|menu|\bpages\b|\btabs?\b/, 3]], pages],
];

export const STARTERS = ["How strong is it now?", "Where will it land?", "Who should evacuate?", "Show active alerts", "Which districts are most at risk?", "How accurate is CycloneX?", "What other cyclones are monitored?", "How does CycloneX work?"];
const FALLBACK = { text: "I can only answer from the data inside CycloneX, and I do not have that. I will not guess. Try one of these questions.", next: STARTERS.slice(0, 4) };

export function answer(question, alertList = []) {
  const n = norm(question || ""), raw = (question || "").toLowerCase();
  if (!n) return { text: "Type a question about CycloneX.", next: STARTERS.slice(0, 4) };
  let best = null, top = 0;
  for (const [id, keys, run] of INTENTS) {
    let s = 0; for (const [re, w] of keys) if (re.test(n) || (id === "forecast" && re.test(raw))) s += w;
    if (id === "districts" && DC.districts.some((d) => d.n.toLowerCase().split(" ").some((t) => t.length > 4 && n.includes(t)))) s += 3;
    if (s > top) { top = s; best = [id, run]; }
  }
  if (!best) { const o = namedOther(n); return o ? describeOther(o) : FALLBACK; }
  const other = STORM_Q.has(best[0]) ? namedOther(n) : null;
  if (other) return describeOther(other);
  return best[1]({ n, raw, alerts: alertList });
}
