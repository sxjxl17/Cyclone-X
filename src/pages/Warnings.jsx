import React, { useState } from "react";
import { Check, Users, Anchor, Zap, Building2, Wheat, Clock } from "lucide-react";
import { Panel, Label, Stat, PageHead } from "../components/ui";
import { useStorm } from "../state";
import { DECISION as DC, LAND, V, PRIMARY_ID, STORM, fmtTime, ago } from "../lib/data";
import { classify } from "../lib/geo"; 

const SEV = {
  evacuate: { l: "Evacuate", t: "text-rose-300", bar: "bg-rose-500", glow: "shadow-[0_0_18px_-8px_rgba(244,63,94,0.7)] border-rose-500/50" },
  warning: { l: "Warning", t: "text-amber-300", bar: "bg-amber-400", glow: "border-line" },
  watch: { l: "Watch", t: "text-brand-soft", bar: "bg-brand", glow: "border-line" },
  update: { l: "Update", t: "text-slate-300", bar: "bg-slate-500", glow: "border-line" },
};
const RISK = { Extreme: "bg-rose-500/15 text-rose-300", High: "bg-orange-500/15 text-orange-300", Moderate: "bg-amber-400/15 text-amber-300" };
const ICON = { Authorities: Building2, "Coastal communities": Users, "Fisheries and shipping": Anchor, "Power and telecom": Zap, "Agriculture and industry": Wheat };

export default function Warnings() {
  const { alerts, read, markRead, unread, sid, setSid } = useStorm();
  const [filter, setFilter] = useState("all"), [sel, setSel] = useState(null), [aud, setAud] = useState("Authorities"), [tl, setTl] = useState(48), [done, setDone] = useState({});
  const list = alerts.filter((a) => filter === "all" || a.sev === filter), cur = alerts.find((a) => a.id === sel) || list[0];
  const phase = [...DC.phases].reverse().find((p) => tl <= p.h) || DC.phases[0];
  if (sid !== PRIMARY_ID) return (
    <div className="mx-auto max-w-[1440px] p-4 sm:p-6"><PageHead eyebrow="Early warning" title="Alerts and decision support" sub="Alerts, timed actions and district risk are prepared for the cyclone that threatens a configured coastline." />
      <Panel title={`${STORM.name} selected`} sub={STORM.basin}><p className="max-w-2xl text-sm leading-relaxed text-slate-300">This cyclone is not forecast to threaten the coastline that the warning workflow is configured for in this prototype, so there are no district alerts to issue. Switch to the focus cyclone to see its alerts and decision support.</p>
        <button onClick={() => setSid(PRIMARY_ID)} className="mt-4 bg-brand px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-white">Show Cyclone ARB-02</button></Panel>
    </div>
  );
  return (
    <div className="mx-auto max-w-[1440px] p-4 sm:p-6"><PageHead eyebrow="Early warning" title="Alerts and decision support" sub="Plain-language alerts, the actions due at each hour before landfall, district-level risk and how warnings reach people." />
    <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
      <Panel title="Early warning feed" sub={`${unread} unread of ${alerts.length}`} body="p-0" className="xl:sticky xl:top-0 xl:self-start">
        <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-3" role="group" aria-label="Filter alerts">
          {["all", "evacuate", "warning", "watch", "update"].map((f) => <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`rounded border px-3 py-1 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${filter === f ? "border-brand/60 bg-brand/10 text-brand-soft" : "border-line text-slate-400 hover:text-white"}`}>{f === "all" ? "All" : SEV[f].l}</button>)}
        </div>
        <ul className="max-h-[calc(100vh-280px)] min-h-[320px] space-y-2 overflow-y-auto p-3">
          {list.length === 0 && <li className="py-10 text-center text-sm text-slate-400">No alerts of this type.</li>}
          {list.map((a) => { const s = SEV[a.sev], isRead = read.has(a.id); return (
            <li key={a.id}><button onClick={() => { setSel(a.id); markRead(a.id); }} aria-current={cur && cur.id === a.id} className={`relative w-full overflow-hidden rounded border bg-ink-900 p-3 pl-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${s.glow} ${cur && cur.id === a.id ? "ring-1 ring-brand/60" : ""} ${isRead ? "opacity-60" : ""}`}>
              <span className={`absolute inset-y-0 left-0 w-1 ${s.bar}`} />
              <div className="flex items-center justify-between text-xs"><span className={`font-semibold ${s.t}`}>{s.l}</span><span className="tabular-nums text-slate-500">{fmtTime(a.at)}</span></div>
              <div className="mt-1 text-sm font-semibold leading-snug text-white">{a.title}</div><div className="mt-0.5 text-xs text-slate-400">{a.region}</div>
            </button></li>); })}
        </ul>
      </Panel>

      <div className="min-w-0 space-y-4">
        {cur && (
          <Panel title="Alert detail" action={<span className={`text-xs font-semibold ${SEV[cur.sev].t}`}>{SEV[cur.sev].l}</span>}>
            <div className="text-lg font-semibold leading-snug text-white">{cur.title}</div>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">{cur.body}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-400"><span>{cur.region}</span><span>Source: {cur.src}</span><span className="tabular-nums">{fmtTime(cur.at)}, {ago(cur.at)}</span>
              <button onClick={() => markRead(cur.id)} disabled={read.has(cur.id)} className="ml-auto inline-flex items-center gap-1 rounded border border-line px-2.5 py-1 text-slate-200 hover:bg-panel-hi disabled:opacity-60"><Check className="h-3 w-3" />{read.has(cur.id) ? "Acknowledged" : "Acknowledge"}</button></div>
          </Panel>
        )}

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{DC.impact.map((i) => <Stat key={i.k} k={i.k} v={i.v} />)}</div>

        <Panel title="Decision timeline" sub={`Landfall predicted in ${tl} h near Mumbai as ${classify(LAND.wind).k}, ${LAND.conf}% confidence`}>
          <div className="mb-4 flex items-center gap-4"><Clock className="h-4 w-4 text-slate-400" /><label className="flex flex-1 items-center gap-3 text-sm text-slate-300">Time to landfall<input type="range" min="0" max="48" value={tl} onChange={(e) => setTl(+e.target.value)} className="flex-1 accent-brand" aria-label="Hours to landfall" /><span className="w-14 text-right font-semibold tabular-nums text-white">T-{tl} h</span></label></div>
          <ol className="grid gap-2 md:grid-cols-5">{DC.phases.map((p) => { const active = p === phase, past = tl < p.h; return (
            <li key={p.label} className={`rounded border p-3 ${active ? "border-brand/60 bg-brand/10" : past ? "border-line opacity-50" : "border-line"}`}><div className={`text-xs font-semibold ${active ? "text-brand-soft" : "text-slate-400"}`}>{p.label}</div><div className="mt-1 text-xs leading-relaxed text-slate-300">{p.note}</div></li>); })}</ol>
        </Panel>

        <Panel title="Recommended actions" sub="Move the timeline above to see what is due">
          <div className="flex flex-wrap gap-1.5" role="tablist">{Object.keys(DC.audiences).map((k) => { const I = ICON[k]; return <button key={k} role="tab" aria-selected={aud === k} onClick={() => setAud(k)} className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${aud === k ? "border-brand/60 bg-brand/10 text-white" : "border-line text-slate-400 hover:text-white"}`}><I className="h-3.5 w-3.5" />{k}</button>; })}</div>
          <ul className="mt-3 divide-y divide-white/[0.06]">{DC.audiences[aud].map((x) => { const key = aud + x.a, due = tl <= x.due; return (
            <li key={key} className="flex items-start gap-3 py-2.5"><input type="checkbox" checked={!!done[key]} onChange={() => setDone({ ...done, [key]: !done[key] })} className="mt-1 h-4 w-4 accent-brand" aria-label={x.a} />
              <span className={`flex-1 text-sm ${done[key] ? "text-slate-500 line-through" : "text-slate-200"}`}>{x.a}</span>
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${done[key] ? "bg-emerald-500/10 text-emerald-300" : due ? "bg-rose-500/15 text-rose-300" : "bg-white/[0.05] text-slate-400"}`}>{done[key] ? "Done" : due ? "Due now" : `By T-${x.due} h`}</span></li>); })}</ul>
        </Panel>

        <Panel title="District risk" sub="Simulated exposure estimates for the predicted landfall" body="p-0">
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
            <thead><tr className="border-b border-line">{["District", "Risk", "Peak wind", "Surge", "People exposed", "Shelters", "Action"].map((h) => <th key={h} className="px-4 py-2.5"><Label>{h}</Label></th>)}</tr></thead>
            <tbody>{DC.districts.map((d) => <tr key={d.n} className="border-b border-line"><td className="px-4 py-2.5"><div className="font-medium text-white">{d.n}</div><div className="text-xs text-slate-500">{d.s}</div></td><td className="px-4 py-2.5"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${RISK[d.risk]}`}>{d.risk}</span></td><td className="px-4 py-2.5 tabular-nums">{d.wind}</td><td className="px-4 py-2.5 tabular-nums">{d.surge}</td><td className="px-4 py-2.5 tabular-nums">{d.pop}</td><td className="px-4 py-2.5 tabular-nums">{d.shelters}</td><td className="px-4 py-2.5 text-slate-300">{d.act}</td></tr>)}</tbody>
          </table></div>
        </Panel>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Warning levels" sub="Colour-coded levels and current status by region" body="p-0">
            <ul className="divide-y divide-line/60">{V.levels.map((l) => <li key={l.n} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span className="h-3 w-3 shrink-0" style={{ background: l.c }} /><span className="w-16 font-medium text-white">{l.n}</span><span className="w-20 text-slate-300">{l.t}</span><span className="text-slate-400">{l.a}</span></li>)}</ul>
            <ul className="border-t border-line">{V.regions.map((r) => { const l = V.levels.find((x) => x.n === r.lv); return <li key={r.r} className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-2.5 text-sm"><span className="text-slate-200">{r.r}</span><span className="px-2 py-0.5 text-xs font-semibold text-[#06101c]" style={{ background: l.c }}>{r.lv}</span></li>; })}</ul>
          </Panel>
          <Panel title="Warning dissemination" sub="Channels used to reach officials and the public" body="p-0">
            <ul className="divide-y divide-line/60">{V.dissem.map((d) => <li key={d.c} className="px-4 py-2.5 text-sm"><div className="flex items-center justify-between gap-3"><span className="font-medium text-white">{d.c}</span><span className={`shrink-0 text-xs font-semibold ${d.s === "Sent" || d.s === "Running" ? "text-emerald-300" : "text-amber-300"}`}>{d.s}</span></div><div className="text-xs text-slate-400">{d.r}</div></li>)}</ul>
          </Panel>
        </div>
      </div>
    </div>
    </div>
  );
}
