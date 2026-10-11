import React, { useEffect, useState } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { useStorm, BANDS } from "../state";
import { TIMELINE, NOW_I, SYSTEM_LIST, tLabel, stamp, tzName } from "../lib/data";
import { TC, CLASS_NAMES, COL, classify } from "../lib/geo";

export const Panel = ({ title, sub, action, children, className = "", body = "p-4" }) => (
  <section className={`rounded border border-line bg-panel ${className}`}>
    {(title || action) && (
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div><h2 className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-white">{title}</h2>{sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}</div>{action}
      </header>
    )}
    <div className={body}>{children}</div>
  </section>
);
export const Label = ({ children, className = "" }) => <div className={`font-display text-[9px] uppercase tracking-[0.16em] text-slate-400 ${className}`}>{children}</div>;
export const Stat = ({ k, v, sub, tone }) => (
  <div className="rounded border border-line bg-panel-hi/50 px-3 py-2.5">
    <Label>{k}</Label><div className={`mt-1.5 font-display text-lg font-bold tracking-wide tabular-nums ${tone || "text-white"}`}>{v}</div>{sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
  </div>
);
export const ClassBadge = ({ w }) => { const c = classify(w); return <span className="inline-flex items-center gap-1.5 rounded border border-line px-2 py-0.5 text-xs font-semibold text-white"><span className="h-2 w-2 rounded-full" style={{ background: c.c }} />{c.k}</span>; };

export function BandSwitch({ compact }) {
  const { band, setBand } = useStorm();
  return (
    <div role="group" aria-label="Satellite channel" className="inline-flex rounded border border-line bg-ink-900 p-0.5">
      {Object.entries(BANDS).map(([k, v]) => (
        <button key={k} onClick={() => setBand(k)} aria-pressed={band === k} className={`rounded px-3.5 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${band === k ? "bg-brand text-white" : "text-slate-300 hover:text-white"}`}>{compact ? v.label.replace("Water vapour", "WV").replace("Infrared", "IR") : v.label}</button>
      ))}
    </div>
  );
}

export function StageLadder({ w }) {
  const now = classify(w).i;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1" role="list" aria-label="Cyclone classification">
        {TC.map((s, i) => <div key={s} role="listitem" title={CLASS_NAMES[i]} className={`rounded py-1.5 text-center text-xs font-semibold ${i === now ? "text-[#0b111d]" : i < now ? "bg-line text-slate-300" : "bg-panel-hi/50 text-slate-500"}`} style={i === now ? { background: COL[i] } : undefined}>{s}</div>)}
      </div>
      <p className="mt-2 text-sm font-medium text-white">{CLASS_NAMES[now]}</p>
    </div>
  );
}

export function ConfGauge({ value, size = 132 }) {
  const color = value >= 85 ? "#5fb88a" : value >= 70 ? "#d9a441" : "#d9534f", len = Math.PI * 52;
  return (
    <svg viewBox="0 0 130 78" width={size} role="img" aria-label={`Confidence ${value} percent`}>
      <path d="M13 65A52 52 0 0 1 117 65" fill="none" stroke="#1c2638" strokeWidth="8" strokeLinecap="round" />
      <path d="M13 65A52 52 0 0 1 117 65" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(value / 100) * len} ${len}`} style={{ transition: "stroke-dasharray .4s" }} />
      <text x="65" y="60" textAnchor="middle" fontSize="26" fontWeight="600" fill="#f1f5f9">{value}%</text>
    </svg>
  );
}
export const ConfBars = ({ parts }) => (
  <div className="grid grid-cols-2 gap-2">
    {parts.map(([k, v]) => { const c = v >= 85 ? "#5fb88a" : v >= 70 ? "#d9a441" : "#d9534f"; return (
      <div key={k} className="rounded border border-line bg-panel-hi/50 px-2.5 py-2"><div className="flex justify-between text-xs"><span className="text-slate-400">{k}</span><span className="font-semibold tabular-nums" style={{ color: c }}>{v}%</span></div><div className="mt-1.5 h-1 rounded bg-line"><div className="h-1 rounded" style={{ width: `${v}%`, background: c }} /></div></div>
    ); })}
  </div>
);

const SCALES = [["24 h", 24], ["7 days", 168], ["30 days", 720]];
export function Timeline({ max = TIMELINE.length - 1 }) {
  const { ti, setTi } = useStorm();
  const [scale, setScale] = useState(24), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1);
  const first = TIMELINE.findIndex((q) => q.t >= -scale), last = Math.min(max, TIMELINE.length - 1);
  useEffect(() => { if (ti < first) setTi(first); }, [scale]);
  useEffect(() => { if (!playing) return; const t = setInterval(() => setTi((i) => (i >= last || i < first ? first : i + 1)), 1400 / speed); return () => clearInterval(t); }, [playing, speed, first, last]);
  const p = TIMELINE[Math.min(ti, last)], win = TIMELINE.slice(first, last + 1), step = Math.ceil(win.length / 9);
  const btn = "grid h-8 w-8 place-items-center rounded border border-line text-slate-200 hover:bg-panel-hi focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";
  return (
    <div className="rounded border border-line bg-panel px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <button className={btn} onClick={() => setTi(Math.max(first, ti - 1))} aria-label="Previous frame"><SkipBack className="h-4 w-4" /></button>
        <button className={`${btn} border-brand bg-brand text-white hover:bg-brand-soft`} onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
        <button className={btn} onClick={() => setTi(Math.min(last, ti + 1))} aria-label="Next frame"><SkipForward className="h-4 w-4" /></button>
        <select value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="Playback speed" className="rounded border border-line bg-ink-900 px-2 py-1.5 text-sm"><option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option></select>
        <div role="group" aria-label="Time range" className="inline-flex overflow-hidden rounded border border-line">{SCALES.map(([l, h]) => <button key={h} onClick={() => setScale(h)} aria-pressed={scale === h} className={`px-3 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${scale === h ? "bg-brand text-white" : "text-slate-300 hover:bg-panel-hi"}`}>{l}</button>)}</div>
        <div className="ml-auto text-right"><div className="text-sm font-semibold tabular-nums text-white">{stamp(p.t)}</div><div className="text-xs text-slate-400">{p.exists === false ? "Before the cyclone formed" : p.t <= 0 ? "Observed" : "Forecast"}, {tLabel(p.t)}</div></div>
      </div>
      <input type="range" min={first} max={last} value={Math.min(Math.max(ti, first), last)} onChange={(e) => setTi(+e.target.value)} aria-label="Time" className="mt-3 w-full accent-brand" />
      <div className="mt-1 flex text-[11px] tabular-nums text-slate-500">{win.map((q, i) => <span key={q.t} className={`flex-1 ${i === ti - first ? "font-semibold text-brand-soft" : ""}`}>{i % step === 0 || i === ti - first ? tLabel(q.t) : ""}</span>)}</div>
    </div>
  );
}


export function Clock({ className = "" }) {
  const [d, setD] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setD(new Date()), 1000); return () => clearInterval(i); }, []);
  return (
    <span className={`tabular-nums ${className}`} aria-label="Current time">
      {d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
      <span className="mx-2 text-white">{d.toLocaleTimeString("en-GB", { hour12: false })} {tzName(d)}</span>
      <span className="text-slate-500">UTC {d.toISOString().slice(11, 16)}</span>
    </span>
  );
}


export function CycloneSelect() {
  const { sid, setSid } = useStorm();
  return (
    <label className="flex items-center gap-3">
      <span className="font-display text-[9px] uppercase tracking-[0.16em] text-slate-400">Cyclone</span>
      <select value={sid} onChange={(e) => setSid(e.target.value)} className="min-w-[260px] rounded border border-line bg-panel px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        {SYSTEM_LIST.map((s) => <option key={s.id} value={s.id}>{s.name}, {s.basin}, {classify(s.wind).k} {s.wind} kt</option>)}
      </select>
    </label>
  );
}

export const PageHead = ({ eyebrow, title, sub, children }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <div className="flex items-center gap-3 font-display text-[11px] uppercase tracking-[0.22em] text-brand"><span className="h-px w-8 bg-brand" />{eyebrow}</div>
      <h1 className="mt-3 font-display text-xl font-bold uppercase leading-tight tracking-wide text-white sm:text-2xl">{title}</h1>
      {sub && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">{sub}</p>}
    </div>{children}
  </div>
);
export const Eyebrow = ({ children }) => <div className="flex items-center gap-3 font-display text-[11px] uppercase tracking-[0.22em] text-brand"><span className="h-px w-8 bg-brand" />{children}</div>;
export const Framed = ({ children, className = "" }) => (
  <div className={`relative mb-3 mr-3 ${className}`}><div aria-hidden className="pointer-events-none absolute -bottom-3 -right-3 left-1/4 top-1/4 border-b border-r border-brand/70" /><div className="relative overflow-hidden bg-ink-950">{children}</div></div>
);
export const Waves = () => (
  <svg viewBox="0 0 1440 220" preserveAspectRatio="none" aria-hidden className="block h-28 w-full sm:h-40">
    <defs>
      <linearGradient id="wv" x1="0" x2="1"><stop offset="0" stopColor="#4a73f0" stopOpacity="0" /><stop offset="0.25" stopColor="#6a8cf8" stopOpacity="0.95" /><stop offset="0.75" stopColor="#b4c6ff" stopOpacity="0.95" /><stop offset="1" stopColor="#4a73f0" stopOpacity="0" /></linearGradient>
      <filter id="wb" x="-5%" y="-50%" width="110%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
    </defs>
    <g filter="url(#wb)" opacity="0.55">{[0, 3].map((i) => <path key={i} d={`M0 ${110 + i * 6} C 220 ${20 + i * 14}, 460 ${200 - i * 12}, 720 ${110 + i * 3} S 1220 ${20 + i * 10}, 1440 ${110 - i * 4}`} fill="none" stroke="url(#wv)" strokeWidth="14" />)}</g>
    {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M0 ${110 + i * 3} C 220 ${24 + i * 11}, 460 ${196 - i * 10}, 720 ${110 + i * 2} S 1220 ${24 + i * 9}, 1440 ${110 - i * 3}`} fill="none" stroke="url(#wv)" strokeWidth="1.1" opacity={0.95 - i * 0.09} />)}
  </svg>
);
