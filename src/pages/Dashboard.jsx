import React from "react";
import { Link } from "react-router-dom";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import SatelliteMap from "../components/SatelliteMap";
import { Panel, BandSwitch, Timeline, StageLadder, ConfGauge, ConfBars, ClassBadge, Stat, CycloneSelect } from "../components/ui";
import { useStorm } from "../state";
import { TIMELINE, FORECAST, CONF_PARTS, D, STORM, LAND, LAND_NAME, SYSTEM_LIST, PRIMARY_ID, tLabel } from "../lib/data";
import { compass, fmtPos, cat, TC } from "../lib/geo";

const ax = { fill: "#9db0e6", fontSize: 10 }, tip = { background: "#101f6e", border: "1px solid #2a47b8", borderRadius: 4, fontSize: 12 };
const stageProbs = (w) => { const i = cat(w), up = i < 6 ? 14 : 0, dn = i > 0 ? 8 : 0; return [[TC[i], 100 - up - dn], ...(up ? [[TC[i + 1], up]] : []), ...(dn ? [[TC[i - 1], dn]] : [])]; };

export default function Dashboard() {
  const { layers, toggle, ti, alerts, read, sid, setSid } = useStorm();
  const p = TIMELINE[ti], live = p.exists !== false, show = Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.on]));
  const top = sid === PRIMARY_ID ? alerts.filter((a) => a.sev === "evacuate" && !read.has(a.id)).slice(0, 2) : [];
  return (
    <div className="grid gap-4 p-4 sm:p-5 xl:h-full xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-[minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-display text-[12px] font-bold uppercase tracking-[0.16em] text-white">Command dashboard</h1>
          <CycloneSelect /><BandSwitch />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Map layers">
          {Object.entries(layers).map(([k, v]) => <button key={k} onClick={() => toggle(k)} aria-pressed={v.on} className={`rounded border px-3 py-1 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${v.on ? "border-brand/60 bg-brand/10 text-brand-soft" : "border-line text-slate-400 hover:text-white"}`}>{v.l}</button>)}
        </div>
        <div className="relative min-h-[440px] flex-1 overflow-hidden rounded border border-line"><SatelliteMap show={show} /></div>
        <Timeline />
      </div>

      <aside className="min-h-0 space-y-4 xl:overflow-y-auto xl:pr-1" aria-label="Cyclone intelligence">
        {top.length > 0 && (
          <Link to="/warnings" className="block rounded border border-rose-500/50 bg-rose-500/[0.07] p-3 shadow-[0_0_20px_-8px_rgba(244,63,94,0.6)] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-300"><span className="h-2 w-2 rounded-full bg-rose-500" />Evacuation alert</div>
            <div className="mt-1 text-sm font-semibold text-white">{top[0].title}</div><div className="mt-0.5 text-xs text-slate-400">{top[0].region}. Open early warning page</div>
          </Link>
        )}
        {live ? (
          <>
            <Panel title="Cyclone location" sub={`${STORM.name}, ${STORM.basin}`} action={<ClassBadge w={p.wind} />}>
              <div className="font-display text-base font-bold tabular-nums text-white">{fmtPos(p)}</div>
              <div className="mt-1 text-xs text-slate-400">{tLabel(p.t)}, {p.t <= 0 ? "observed" : "forecast"}</div>
              <div className="mt-3 grid grid-cols-3 gap-2"><Stat k="Wind" v={`${p.wind}`} sub="kt" /><Stat k="Pressure" v={`${p.pres}`} sub="hPa" /><Stat k="Moving" v={compass(p.dir)} sub={`${p.speed} km/h`} /></div>
            </Panel>
            <Panel title="Development stage" sub="AI classification from the satellite sequence">
              <StageLadder w={p.wind} />
              <div className="mt-3 space-y-1.5">{stageProbs(p.wind).map(([l, v]) => <div key={l} className="flex items-center gap-2 text-xs text-slate-400"><span className="w-8">{l}</span><div className="h-1.5 flex-1 bg-line"><div className="h-1.5 bg-brand" style={{ width: `${v}%` }} /></div><span className="w-8 text-right tabular-nums">{v}%</span></div>)}</div>
            </Panel>
          </>
        ) : (
          <Panel title="No cyclone at this time" sub={tLabel(p.t)}><p className="text-sm leading-relaxed text-slate-300">{STORM.name} had not formed yet. Move the timeline forward to the first day it appears as a weak disturbance.</p></Panel>
        )}
        <Panel title="Intensity graph" sub="Wind speed in knots">
          <div className="h-40"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={FORECAST} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
            <CartesianGrid stroke="#26409f" vertical={false} /><XAxis dataKey="h" type="number" domain={[0, 72]} ticks={[0, 24, 48, 72]} tick={ax} tickFormatter={(v) => `+${v}h`} stroke="#3a58b8" /><YAxis tick={ax} domain={[0, 160]} stroke="#3a58b8" /><Tooltip contentStyle={tip} />
            <ReferenceLine x={Math.max(0, p.t)} stroke="#e2e8f0" strokeOpacity={0.4} />
            <Area dataKey="band" name="Likely range" stroke="none" fill="#6f8fff" fillOpacity={0.16} /><Line dataKey="wind" name="Wind (kt)" stroke="#6f8fff" strokeWidth={2} dot={{ r: 2.5 }} />
          </ComposedChart></ResponsiveContainer></div>
        </Panel>
        <Panel title="Landfall and risk zones" sub={LAND ? `Around the predicted landfall point, ${LAND_NAME}` : "Selected cyclone"}>
          {LAND ? <ul className="space-y-2">{D.risk.slice().reverse().map((z) => <li key={z.km} className="flex gap-3 text-sm"><span className="mt-1 h-2.5 w-2.5 shrink-0" style={{ background: z.c }} /><div><div className="font-medium text-white">{z.l} <span className="font-normal text-slate-500">within {z.km} km</span></div><div className="text-xs text-slate-400">{z.d}</div></div></li>)}</ul>
            : <p className="text-sm leading-relaxed text-slate-300">No landfall is predicted within 72 hours. The forecast keeps this cyclone over open water, so there are no coastal risk zones.</p>}
        </Panel>
        {live && <Panel title="Prediction confidence">
          <div className="flex items-center gap-3"><ConfGauge value={p.conf} size={120} /><div className="text-sm text-slate-300">{p.t <= 0 ? "Observed position, high certainty." : `Forecast at ${tLabel(p.t)}.`}</div></div>
          <div className="mt-3"><ConfBars parts={CONF_PARTS} /></div> 
        </Panel>}
        <Panel title="Monitored worldwide" sub="Select a cyclone to see its details">
          <ul className="-my-1 divide-y divide-line/60">{SYSTEM_LIST.map((x) => (
            <li key={x.id}><button onClick={() => setSid(x.id)} aria-current={x.id === sid} className={`flex w-full items-center gap-3 px-1 py-2 text-left text-sm hover:bg-panel-hi/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${x.id === sid ? "bg-brand/10" : ""}`}><ClassBadge w={x.wind} /><span className="flex-1"><span className="block text-white">{x.name}</span><span className="block text-xs text-slate-400">{x.basin}</span></span><span className="tabular-nums text-slate-300">{x.wind} kt</span></button></li>))}</ul>
        </Panel>
      </aside>
    </div>
  );
}
