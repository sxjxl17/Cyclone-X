import React from "react";
import { Link } from "react-router-dom";
import { Radar, Brain, Activity, Navigation, Siren, Gauge, Satellite, Target, Layers, ShieldCheck, ArrowRight } from "lucide-react";
import HeroWind from "../components/HeroWind";
import { Panel, Label, Eyebrow, Framed, Waves } from "../components/ui";
import { Logo } from "../components/Shell";
import { FORECAST, V } from "../lib/data";
import { classify } from "../lib/geo";
import { getProvider } from "../lib/imagery";

const STEPS = [
  [Radar, "Identify", "Convolutional network", "Finds the cyclone in each multi-channel satellite scene and fixes its centre."],
  [Layers, "Classify", "CNN with intensity regression", "Assigns the stage from tropical depression to Category 5."],
  [Activity, "Evolve", "Transformer over image sequences", "Reads six-hourly frames to track cloud pattern, shape and temperature change."],
  [Navigation, "Predict", "Time-series ensemble, 52 members", "Forecasts track, intensity and landfall with a calibrated confidence."],
  [Siren, "Warn", "Decision-support rules", "Turns the forecast into district alerts and timed actions."],
];
const SOURCES = [
  ["INSAT-3DR and INSAT-3DS Imager", "Geostationary imagery", "Visible, water vapour and thermal infrared channels for detection and evolution"],
  ["Himawari-9 AHI", "Geostationary imagery", "Cross-check of centre position and cloud-top temperature"],
  ["Scatterometer ocean winds (Metop-C ASCAT, ScatSat-1)", "Ocean surface vector winds", "Wind radii and the extent of strong winds"],
  ["Sea surface temperature analyses", "Ocean heat", "Environment for strengthening or weakening"],
  ["Global model analyses", "Wind shear and humidity", "Steering flow and intensity environment"],
  ["Historical best-track archives", "Training and verification", "Labels for classification and forecast verification"],
];

export default function Overview() {
  const now = FORECAST[0], c = classify(now.wind), prov = getProvider();
  return (
    <div>
      <section className="relative min-h-[640px] overflow-hidden">
        <div className="absolute inset-y-0 right-0 w-full md:w-[72%]" style={{ WebkitMaskImage: "linear-gradient(90deg, transparent 0%, #000 38%)", maskImage: "linear-gradient(90deg, transparent 0%, #000 38%)" }}><img src={`${import.meta.env.BASE_URL}imagery/hero/world-cyclones.jpg`} alt="World map showing wind flow and three tropical cyclones over the Indian and western Pacific oceans" className="h-full w-full object-cover object-right" /><HeroWind /></div>
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#050f36] to-transparent" />
        <div className="relative mx-auto max-w-[1280px] px-5 pb-28 pt-16 sm:px-10">
          <h1 className="max-w-xl font-display text-3xl font-bold uppercase leading-[1.15] tracking-wide text-white sm:text-[42px]">Cyclone intelligence from space</h1>
          <p className="mt-7 max-w-md text-[14px] leading-relaxed text-slate-300">CycloneX analyses multi-source satellite imagery to identify tropical cyclones, classify their development stage and forecast intensity, track and landfall with a stated confidence. It is built for disaster management authorities and meteorological departments who must act hours before the storm arrives. Satellite coverage is global, so every ocean basin is monitored by the same pipeline.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/dashboard" className="bg-brand px-8 py-3 text-[14px] font-medium text-white hover:bg-brand-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-white">Open dashboard</Link>
            <Link to="/warnings" className="border border-brand/70 px-8 py-3 text-[14px] font-medium text-white hover:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">Early warnings</Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1280px] space-y-24 px-5 py-20 sm:px-10">
        <section className="grid items-center gap-10 md:grid-cols-[1fr_1.1fr]">
          <div><Eyebrow>Our capability</Eyebrow><h2 className="mt-4 font-display text-3xl font-bold uppercase tracking-wide text-white">Satellite imagery</h2>
            <p className="mt-6 max-w-md text-[14px] leading-relaxed text-slate-300">Three channels, one storm. Visible shows cloud structure, infrared measures cloud-top temperature and water vapour reveals moisture and steering flow. Analysts step through observed frames and compare channels on the same georeferenced map.</p>
            <Link to="/imagery" className="mt-7 inline-flex bg-brand px-8 py-3 text-[14px] font-medium text-white hover:bg-brand-soft">View imagery</Link></div>
          <Framed><img src={prov.thumb("infrared")} alt="Infrared satellite view of the cyclone" className="aspect-[16/10] w-full object-contain p-3" /></Framed>
        </section>
        <section aria-labelledby="glob">
          <Eyebrow>Global coverage</Eyebrow><h2 id="glob" className="mt-4 font-display text-2xl font-bold uppercase tracking-wide text-white">Every ocean basin</h2>
          <p className="mt-5 max-w-2xl text-[14px] leading-relaxed text-slate-300">Geostationary satellites over each ocean and polar-orbiting passes give round-the-clock imagery of the whole planet. CycloneX runs identification, classification and forecasting on every tropical cyclone it finds, not only the one near India.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">{[["Geostationary coverage", "Satellites parked over each ocean see the same area every few minutes, day and night."], ["Polar-orbiting passes", "Instruments that circle the poles add ocean surface winds and fill the gaps between geostationary views."], ["One pipeline everywhere", "The same models identify, classify and forecast cyclones in every basin, so the output is consistent."]].map(([t, d]) => <div key={t} className="bg-panel p-5"><div className="font-display text-[12px] font-bold uppercase tracking-[0.14em] text-white">{t}</div><p className="mt-3 text-[13px] leading-relaxed text-slate-300">{d}</p></div>)}</div>
        </section>
      </div>
      <Waves />
      <div className="mx-auto max-w-[1280px] space-y-24 px-5 py-20 sm:px-10">
        <section className="grid items-center gap-10 md:grid-cols-[1.1fr_1fr]">
          <Framed className="order-2 md:order-1"><div style={{ background: "#101f6e" }}><img src={prov.thumb("visible")} alt="Visible satellite view of the cyclone" className="aspect-[16/10] w-full object-contain p-3" /></div></Framed>
          <div className="order-1 md:order-2"><Eyebrow>Function</Eyebrow><h2 className="mt-4 font-display text-3xl font-bold uppercase tracking-wide text-white">Early warning</h2>
            <p className="mt-6 max-w-md text-[14px] leading-relaxed text-slate-300">Forecasts become plain-language alerts, district-level risk and a decision timeline that shows which actions are due before landfall, for authorities, coastal communities, fisheries, power and telecom.</p>
            <div className="mt-7 flex gap-3"><Link to="/warnings" className="bg-brand px-8 py-3 text-[14px] font-medium text-white hover:bg-brand-soft">View alerts</Link><Link to="/prediction" className="border border-brand/70 px-8 py-3 text-[14px] font-medium text-white hover:bg-brand/10">Forecast</Link></div></div>
        </section>

        <section aria-labelledby="meth">
          <Eyebrow>Methodology</Eyebrow><h2 id="meth" className="mt-4 font-display text-2xl font-bold uppercase tracking-wide text-white">From image to forecast</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-5">
            {STEPS.map(([I, t, m, d], i) => (
              <div key={t} className="bg-panel p-5"><div className="flex items-center justify-between"><I className="h-8 w-8 text-brand" strokeWidth={1.2} /><span className="font-display text-[10px] text-slate-500">0{i + 1}</span></div><div className="mt-4 font-display text-[12px] font-bold uppercase tracking-[0.14em] text-white">{t}</div><div className="mt-1 text-[12px] text-brand-soft">{m}</div><p className="mt-3 text-[13px] leading-relaxed text-slate-300">{d}</p></div>
            ))}
          </div>
        </section>

        <section aria-labelledby="val">
          <Eyebrow>Validation</Eyebrow><h2 id="val" className="mt-4 font-display text-2xl font-bold uppercase tracking-wide text-white">Verified performance</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[[Target, "Detection", "97%", "Probability of detection"], [ShieldCheck, "Classification", "87%", "Stage accuracy, TD to C5"], [Navigation, "24 h track", `${V.trackErr[1].cx} km`, `Benchmark ${V.trackErr[1].base} km`], [Gauge, "24 h intensity", `${V.intErr[1].cx} kt`, `Benchmark ${V.intErr[1].base} kt`]].map(([I, k, v, s]) => (
              <div key={k} className="bg-panel px-6 py-7 text-center"><I className="mx-auto h-9 w-9 text-brand" strokeWidth={1.1} /><div className="mt-4 font-display text-[12px] uppercase tracking-[0.18em] text-white">{k}</div><div className="mt-3 font-display text-xl font-bold text-white">{v}</div><div className="mt-2 text-[13px] text-slate-300">{s}</div></div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Prototype figures from simulated verification data.</p>
        </section>

        <section aria-labelledby="src">
          <Eyebrow>Data sources</Eyebrow><h2 id="src" className="mt-4 font-display text-2xl font-bold uppercase tracking-wide text-white">What CycloneX reads</h2>
          <div className="mt-8 overflow-x-auto bg-panel"><table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr className="border-b border-line">{["Source", "Type", "Used for"].map((h) => <th key={h} className="px-5 py-3"><Label>{h}</Label></th>)}</tr></thead>
            <tbody>{SOURCES.map(([a, b, d]) => <tr key={a} className="border-b border-line/60"><td className="px-5 py-3 font-medium text-white">{a}</td><td className="px-5 py-3 text-slate-300">{b}</td><td className="px-5 py-3 text-slate-300">{d}</td></tr>)}</tbody>
          </table></div>
        </section>
      </div>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-10 gap-y-3 px-5 py-8 text-[13px] text-slate-300 sm:px-10">
          <span>Technology</span><span>© Copyright 2026, Developed by Sajal Rawat - Team Diamond - PIEMR, Indore, India.</span><span>CycloneX ©2026</span>
          <span className="flex items-center gap-3 sm:ml-auto"><Logo size={28} /><span className="font-display text-[13px] font-bold tracking-[0.18em] text-white">CYCLONEX</span></span>
        </div>
        <p className="mx-auto max-w-[1280px] px-5 pb-8 text-xs text-slate-500 sm:px-10">Satellite Imagery © INSAT-3DR, INSAT-3DS, Himawari-9. Boundaries © Esri.</p>
      </footer>
    </div>
  );
}
