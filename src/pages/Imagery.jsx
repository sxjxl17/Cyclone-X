import React, { useEffect } from "react";
import { Panel, Label, BandSwitch, Timeline, Stat, PageHead, CycloneSelect } from "../components/ui";
import SatelliteMap from "../components/SatelliteMap";
import { useStorm, BANDS } from "../state";
import { getProvider } from "../lib/imagery";
import { NOW_I, TIMELINE, V, STORM, frameFor, tLabel } from "../lib/data";
import { classify } from "../lib/geo";

const BG = { visible: "#0b2a78", infrared: "#040a26", vapour: "#0a1a4a" };
const DV = { 3.0: 45, 3.5: 55, 4.0: 65, 4.5: 77, 5.0: 90, 5.5: 102, 6.0: 115, 6.5: 127, 7.0: 140 };
const dvorak = (w) => { const t = Object.keys(DV).reduce((a, b) => (Math.abs(DV[b] - w) < Math.abs(DV[a] - w) ? b : a)); return [(+t).toFixed(1), DV[t]]; };

export default function Imagery() {
  const { band, setBand, ti, setTi, layers, toggle } = useStorm(), prov = getProvider(), B = BANDS[band], p = TIMELINE[ti], live = p.exists !== false, fr = frameFor(p);
  useEffect(() => { if (ti > NOW_I) setTi(NOW_I); }, []); // satellite frames only exist up to now
  const readout = band === "infrared" ? ["Coldest cloud top", `${fr.ctt} °C`] : band === "visible" ? ["Eye diameter", fr.eye && p.wind >= 64 ? `${fr.eye} km` : "No eye yet"] : ["Core moisture", `${Math.min(99, 60 + (fr.sym / 3 | 0))}%`];
  const rows = TIMELINE.slice(NOW_I - 4, NOW_I + 1), show = Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.on]));
  return (
    <div className="mx-auto max-w-[1440px] space-y-4 p-4 sm:p-6">
      <PageHead eyebrow="Satellite imagery" title="Visible, infrared and water vapour" sub="Switch channel to see the same storm in reflected light, cloud-top temperature and upper-air moisture. Step back through the archive, from the last 24 hours to the last 30 days."><CycloneSelect /></PageHead>
      <div className="grid gap-3 md:grid-cols-3">
        {Object.entries(BANDS).map(([k, v]) => (
          <button key={k} onClick={() => setBand(k)} aria-pressed={band === k} className={`flex items-center gap-4 rounded border p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${band === k ? "border-brand/70 bg-brand/10" : "border-line bg-panel hover:border-brand/40"}`}>
            <span className="h-16 w-16 shrink-0 overflow-hidden rounded" style={{ background: BG[k] }}><img src={prov.thumb(k)} alt="" className="h-full w-full object-contain" /></span>
            <span><span className="block text-sm font-semibold text-white">{v.label} <span className="font-normal text-slate-500">{v.wl}</span></span><span className="mt-0.5 block text-xs text-slate-400">{v.use}</span></span>
          </button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Map layers">
            {Object.entries(layers).map(([k, v]) => <button key={k} onClick={() => toggle(k)} aria-pressed={v.on} className={`rounded border px-3 py-1 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${v.on ? "border-brand/60 bg-brand/10 text-brand-soft" : "border-line text-slate-400 hover:text-white"}`}>{v.l}</button>)}
          </div>
          <div className="relative h-[460px] overflow-hidden rounded border border-line md:h-[560px]"><SatelliteMap show={show} /></div>
          <Timeline max={NOW_I} />
        </div>
        <div className="space-y-4">
          <Panel title={`${B.label} channel`} sub={B.wl} action={<BandSwitch compact />}><p className="text-sm leading-relaxed text-slate-300">{B.detail}</p></Panel>
          <Panel title="Observed structure" sub={`${STORM.name}, ${tLabel(p.t)}`}>
            {live ? (<><div className="grid grid-cols-2 gap-2"><Stat k={readout[0]} v={readout[1]} /><Stat k="Symmetry" v={`${fr.sym}%`} /></div><p className="mt-3 text-sm leading-relaxed text-slate-300">{fr.note}</p></>)
              : <p className="text-sm leading-relaxed text-slate-300">No cyclone in this frame. The map shows regional cloud cover before the system formed.</p>}
          </Panel>
          <Panel title="Source"><dl className="space-y-1.5 text-sm">{[["Imagery", prov.name], ["Resolution", prov.resolution], ["Basemap", import.meta.env.VITE_MAPTILER_KEY ? "MapTiler Satellite" : "Esri World Imagery"]].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-slate-400">{k}</dt><dd className="text-right text-slate-200">{v}</dd></div>)}</dl></Panel>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Channel reference" sub="INSAT-3DR Imager class channels" body="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm">
          <thead><tr className="border-b border-line">{["Channel", "Wavelength", "Resolution", "Shows", "Used for"].map((h) => <th key={h} className="px-4 py-2.5"><Label>{h}</Label></th>)}</tr></thead>
          <tbody>{V.channels.map((c) => <tr key={c.b} className="border-b border-line/60"><td className="px-4 py-2.5 font-medium text-white">{c.b}</td><td className="px-4 py-2.5 tabular-nums text-slate-300">{c.wl}</td><td className="px-4 py-2.5 tabular-nums text-slate-300">{c.res}</td><td className="px-4 py-2.5 text-slate-300">{c.shows}</td><td className="px-4 py-2.5 text-slate-300">{c.use}</td></tr>)}</tbody>
        </table></div></Panel>
        <Panel title="Intensity estimate" sub="Dvorak-style estimate from infrared against the CycloneX AI estimate" body="p-0"><table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line">{["Frame", "T-number", "Dvorak", "CycloneX", "Diff"].map((h) => <th key={h} className="px-4 py-2.5"><Label>{h}</Label></th>)}</tr></thead>
          <tbody>{rows.map((q, i) => { const [t, dv] = dvorak(q.wind), d = q.wind - dv; return <tr key={i} className={`border-b border-line/60 ${NOW_I - 4 + i === ti ? "bg-brand/10" : ""}`}><td className="px-4 py-2.5 tabular-nums">{tLabel(q.t)}</td><td className="px-4 py-2.5 tabular-nums">T{t}</td><td className="px-4 py-2.5 tabular-nums">{dv} kt</td><td className="px-4 py-2.5 tabular-nums">{q.wind} kt</td><td className="px-4 py-2.5 tabular-nums text-slate-300">{d > 0 ? "+" : ""}{d} kt</td></tr>; })}</tbody>
        </table></Panel>
      </div>
    </div>
  );
}
