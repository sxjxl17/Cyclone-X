import React, { useState, useEffect } from "react";
import { ResponsiveContainer, ComposedChart, AreaChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { Panel, Stat, ConfGauge, ConfBars, ClassBadge, Label, PageHead, CycloneSelect } from "../components/ui";
import { FORECAST, PEAK, LAND, LAND_SHORT, CONF_PARTS, CONF_ALL, V, PRIMARY_ID, stamp, tLabel } from "../lib/data";
import { useStorm } from "../state";
import { classify, compass, fmtPos } from "../lib/geo";

const ax = { fill: "#8b98ab", fontSize: 11 }, tip = { background: "#101f6e", border: "1px solid rgba(255,255,255,.12)", borderRadius: 6, fontSize: 12 };
const TICKS = [0, 6, 12, 24, 36, 48, 60, 72], CATS = [[34, "TS"], [64, "C1"], [83, "C2"], [96, "C3"], [113, "C4"]];
const M = { top: 8, right: 8, left: -18, bottom: 0 };
const xa = (k) => <XAxis key={k} dataKey="h" type="number" domain={[0, 72]} ticks={TICKS} tick={ax} tickFormatter={(v) => `+${v}h`} stroke="#3a58b8" />;

function Compass({ dir }) {
  return (
    <svg viewBox="0 0 160 160" className="w-36" role="img" aria-label={`Heading ${dir} degrees, ${compass(dir)}`}>
      <circle cx="80" cy="80" r="66" fill="none" stroke="#3a58b8" strokeWidth="1.5" />
      {Array.from({ length: 16 }, (_, i) => { const a = (i * 22.5 * Math.PI) / 180, l = i % 4 === 0 ? 8 : 4; return <line key={i} x1={80 + Math.sin(a) * 66} y1={80 - Math.cos(a) * 66} x2={80 + Math.sin(a) * (66 - l)} y2={80 - Math.cos(a) * (66 - l)} stroke="#475569" />; })}
      {[["N", 80, 24], ["E", 138, 84], ["S", 80, 146], ["W", 22, 84]].map(([t, x, y]) => <text key={t} x={x} y={y} textAnchor="middle" fontSize="11" fill="#94a3b8">{t}</text>)}
      <g transform={`rotate(${dir} 80 80)`}><path d="M80 30L89 86L80 78L71 86Z" fill="#6f8fff" /><path d="M80 130L84 92L80 96L76 92Z" fill="#334155" /></g>
      <text x="80" y="84" textAnchor="middle" fontSize="0" fill="#fff">{dir}</text>
    </svg>
  );
} 

export default function Prediction() {
  const { sid } = useStorm(), home = () => FORECAST.indexOf(LAND || PEAK);
  const [k, setK] = useState(home);
  useEffect(() => setK(home()), [sid]);
  const s = FORECAST[k] || FORECAST[0], c = classify(s.wind);
  const w0 = FORECAST[0].wind, w24 = FORECAST[3].wind, w48 = FORECAST[5].wind, cl = (x) => Math.max(3, Math.min(97, Math.round(x)));
  const probs = sid === PRIMARY_ID ? V.prob : [["Rapid intensification (30 kt in 24 h)", cl(8 + 4 * (w24 - w0 - 12))], ["Category 3 or stronger at peak", cl(10 + 2 * (PEAK.wind - 85))], [LAND ? `Landfall within 100 km of ${LAND_SHORT}` : "Remains over open water for 72 h", LAND ? 86 : 91], ["Dangerous winds (64 kt) at 48 h", cl(w48 >= 64 ? 60 + (w48 - 64) : 25 - (64 - w48) * 1.5)]];
  return (
    <div className="mx-auto max-w-[1440px] space-y-4 p-4 sm:p-6">
      <PageHead eyebrow="Prediction" title="Intensity, movement and confidence" sub="How strong the cyclone will become, where it is heading and how much each forecast can be trusted, with verification against a standard benchmark."><CycloneSelect /></PageHead>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat k="Peak intensity" v={`${PEAK.wind} kt`} sub={`${classify(PEAK.wind).k} at ${tLabel(PEAK.h)}`} />
        <Stat k="Expected direction" v={`${compass(s.dir)} (${s.dir}°)`} sub={`${s.speed} km/h at ${tLabel(s.h)}`} />
        {LAND ? <Stat k="Landfall" v={`+${LAND.h} h`} sub={`${LAND_SHORT}, ${LAND.wind} kt ${classify(LAND.wind).k}`} /> : <Stat k="Landfall" v="None in 72 h" sub="Stays over open water" />}
        <Stat k="Overall confidence" v={`${CONF_ALL}%`} sub={`${s.conf}% at ${tLabel(s.h)}`} tone={CONF_ALL >= 85 ? "text-emerald-300" : "text-amber-300"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Intensity trend" sub="Wind speed in knots. The band is the likely range, dashed lines are category limits.">
          <div className="h-72"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={FORECAST} margin={M}>
            <CartesianGrid stroke="#26409f" vertical={false} />{xa("x")}<YAxis tick={ax} domain={[0, 130]} stroke="#3a58b8" /><Tooltip contentStyle={tip} />
            {CATS.map(([v, t]) => <ReferenceLine key={t} y={v} stroke="#94a3b8" strokeOpacity={0.3} strokeDasharray="4 4" label={{ value: t, fill: "#94a3b8", fontSize: 10, position: "insideRight" }} />)}
            <ReferenceLine x={s.h} stroke="#e2e8f0" strokeOpacity={0.4} />
            <Area dataKey="band" name="Likely range" stroke="none" fill="#6f8fff" fillOpacity={0.14} /><Line dataKey="wind" name="Wind (kt)" stroke="#6f8fff" strokeWidth={2} dot={{ r: 3, fill: "#101f6e", strokeWidth: 2 }} />
          </ComposedChart></ResponsiveContainer></div>
        </Panel>
        <Panel title="Prediction confidence" sub="How sure the models are, by lead time">
          <div className="flex items-center gap-4"><ConfGauge value={s.conf} /><div className="text-sm text-slate-300"><div className="font-semibold text-white">{tLabel(s.h)} forecast</div>Confidence falls as the forecast looks further ahead.</div></div>
          <div className="mt-3 h-36"><ResponsiveContainer width="100%" height="100%"><AreaChart data={FORECAST} margin={M}>
            <CartesianGrid stroke="#26409f" vertical={false} />{xa("x")}<YAxis tick={ax} domain={[40, 100]} stroke="#3a58b8" /><Tooltip contentStyle={tip} />
            <ReferenceLine y={70} stroke="#d9a441" strokeDasharray="4 4" label={{ value: "Act on", fill: "#d9a441", fontSize: 10, position: "insideTopRight" }} />
            <Area dataKey="conf" name="Confidence (%)" stroke="#6f8fff" strokeWidth={2} fill="#6f8fff" fillOpacity={0.1} />
          </AreaChart></ResponsiveContainer></div>
          <div className="mt-3"><ConfBars parts={CONF_PARTS} /></div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Movement" sub="Speed in km/h (left) and heading in degrees (right)">
          <div className="h-60"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={FORECAST} margin={{ top: 8, right: 0, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#26409f" vertical={false} />{xa("x")}
            <YAxis yAxisId="s" tick={ax} domain={[0, 30]} stroke="#3a58b8" /><YAxis yAxisId="h" orientation="right" tick={ax} domain={[300, 360]} stroke="#3a58b8" /><Tooltip contentStyle={tip} />
            <ReferenceLine yAxisId="s" x={s.h} stroke="#e2e8f0" strokeOpacity={0.4} />
            <Line yAxisId="s" dataKey="speed" name="Speed (km/h)" stroke="#d9a441" strokeWidth={2} dot={{ r: 3 }} /><Line yAxisId="h" dataKey="dir" name="Heading (°)" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart></ResponsiveContainer></div>
        </Panel>
        <Panel title="Expected direction" sub={`At ${tLabel(s.h)}`}>
          <div className="flex items-center gap-5"><Compass dir={s.dir} /><div><div className="text-3xl font-semibold text-white">{compass(s.dir)}</div><div className="text-sm text-slate-400">Heading {s.dir}°, {s.speed} km/h</div><div className="mt-3 text-sm text-slate-300">Position {fmtPos(s)}</div><div className="mt-1 text-sm text-slate-300">Pressure {s.pres} hPa</div></div></div>
        </Panel>
      </div>

      <Panel title="Forecast table" sub="Select a row to update the direction and confidence above" body="p-0">
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
          <thead><tr className="border-b border-line text-slate-400">{["Time", "Lead", "Position", "Wind", "Class", "Pressure", "Heading", "Speed", "Confidence"].map((h) => <th key={h} className="px-4 py-2.5"><Label>{h}</Label></th>)}</tr></thead>
          <tbody>{FORECAST.map((f, i) => (
            <tr key={f.h} onClick={() => setK(i)} className={`cursor-pointer border-b border-line hover:bg-panel-hi/60 ${i === k ? "bg-brand/10" : ""}`}>
              <td className="px-4 py-2.5 tabular-nums text-slate-200">{stamp(f.h)}</td><td className="px-4 py-2.5 tabular-nums">{tLabel(f.h)}</td><td className="px-4 py-2.5 tabular-nums text-slate-300">{fmtPos(f)}</td>
              <td className="px-4 py-2.5 tabular-nums">{f.wind} kt</td><td className="px-4 py-2.5"><ClassBadge w={f.wind} /></td><td className="px-4 py-2.5 tabular-nums">{f.pres} hPa</td>
              <td className="px-4 py-2.5 tabular-nums">{compass(f.dir)} {f.dir}°</td><td className="px-4 py-2.5 tabular-nums">{f.speed} km/h</td><td className="px-4 py-2.5 tabular-nums">{f.conf}%</td>
            </tr>))}</tbody>
        </table></div>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Model verification" sub="Mean error by lead time against a climatology and persistence benchmark">
          <div className="grid gap-4 md:grid-cols-2">{[["Track error (km)", "trackErr"], ["Intensity error (kt)", "intErr"]].map(([t, key]) => (
            <div key={key}><div className="mb-1 text-xs text-slate-400">{t}</div><div className="h-48"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={V[key]} margin={M}>
              <CartesianGrid stroke="#26409f" vertical={false} /><XAxis dataKey="h" tick={ax} tickFormatter={(v) => `+${v}h`} stroke="#3a58b8" /><YAxis tick={ax} stroke="#3a58b8" /><Tooltip contentStyle={tip} />
              <Line dataKey="base" name="Benchmark" stroke="#7b8cd0" strokeDasharray="4 4" strokeWidth={2} dot={false} /><Line dataKey="cx" name="CycloneX" stroke="#6f8fff" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart></ResponsiveContainer></div></div>))}</div>
          <p className="mt-3 text-xs text-slate-400">At 48 h the track error is {V.trackErr[3].cx} km against {V.trackErr[3].base} km for the benchmark, a {Math.round((1 - V.trackErr[3].cx / V.trackErr[3].base) * 100)}% improvement. Simulated verification data.</p>
        </Panel>
        <Panel title="Event probabilities" sub="From the 52-member ensemble">
          <ul className="space-y-3">{probs.map(([k, v]) => <li key={k}><div className="flex justify-between gap-3 text-sm"><span className="text-slate-300">{k}</span><span className="font-semibold tabular-nums text-white">{v}%</span></div><div className="mt-1.5 h-1 bg-line"><div className="h-1 bg-brand" style={{ width: `${v}%` }} /></div></li>)}</ul>
        </Panel>
      </div>
      {sid === PRIMARY_ID && (
      <Panel title="Historical analogues" sub="Past Arabian Sea cyclones with a similar track and structure. Class at landfall is approximate." body="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
        <thead><tr className="border-b border-line">{["Cyclone", "Year", "Landfall area", "Class", "Similarity"].map((h) => <th key={h} className="px-4 py-2.5"><Label>{h}</Label></th>)}</tr></thead>
        <tbody>{V.analogs.map((a) => <tr key={a.n} className="border-b border-line/60"><td className="px-4 py-2.5 font-medium text-white">{a.n}</td><td className="px-4 py-2.5 tabular-nums">{a.y}</td><td className="px-4 py-2.5 text-slate-300">{a.area}</td><td className="px-4 py-2.5">{a.cls}</td><td className="px-4 py-2.5"><div className="flex items-center gap-2"><div className="h-1 w-24 bg-line"><div className="h-1 bg-brand" style={{ width: `${a.sim}%` }} /></div><span className="tabular-nums text-slate-300">{a.sim}%</span></div></td></tr>)}</tbody>
      </table></div></Panel>
      )}
    </div>
  );
}
