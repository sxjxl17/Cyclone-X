import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ALERTS, NOW_I, PRIMARY_ID, SYSTEM_LIST, selectSystem } from "./lib/data";

export const BANDS = {
  visible: { label: "Visible", wl: "0.55–0.75 µm", use: "Cloud structure in daylight", detail: "Reflected sunlight. The eye, spiral bands and the cloud edge are clearest here, but it only works in daylight." },
  infrared: { label: "Infrared", wl: "10.3–11.3 µm", use: "Cloud-top temperature, day and night", detail: "Heat from cloud tops. Colder tops are higher, so this is the main channel for judging how strong the storm is." },
  vapour: { label: "Water vapour", wl: "6.5–7.1 µm", use: "Upper-air moisture and steering flow", detail: "Moisture in the upper troposphere. It shows dry air that can weaken the storm and the flow that steers it." },
};
const LAYERS0 = {
  cloud: { on: true, l: "Cloud field" }, wind: { on: true, l: "Wind flow" }, track: { on: true, l: "Track and forecast points" }, cone: { on: true, l: "Uncertainty cone" },
  rings: { on: true, l: "Wind radii" }, risk: { on: true, l: "Risk zones" }, labels: { on: true, l: "Boundaries and places" },
};
const Ctx = createContext(null);
export const useStorm = () => useContext(Ctx);
const LOAD = Date.now();

export function StormProvider({ children }) {
  const [band, setBand] = useState("visible"); 
  const [ti, setTi] = useState(NOW_I);
  const [sid, setSidState] = useState(PRIMARY_ID);
  const [layers, setLayers] = useState(LAYERS0);
  const [alerts, setAlerts] = useState(() => ALERTS.seed.map((a) => ({ ...a, at: LOAD - a.ago * 60000 })));
  const [read, setRead] = useState(() => new Set());
  const [view, setView] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAlerts((s) => (s.some((a) => a.id === ALERTS.live.id) ? s : [{ ...ALERTS.live, at: Date.now() }, ...s])), 12000);
    const i = setInterval(() => setTick((n) => n + 1), 30000);   // keeps relative times and forecast stamps current
    return () => { clearTimeout(t); clearInterval(i); };
  }, []);
  const value = useMemo(() => ({
    band, setBand, ti, setTi, sid, layers, alerts, read, view, setView, tick,
    setSid: (id) => { selectSystem(id); setSidState(id); setTi(NOW_I); const s = SYSTEM_LIST.find((x) => x.id === id); setView({ center: [s.lon, s.lat], zoom: 4.6, k: Date.now() }); },
    toggle: (id) => setLayers((s) => ({ ...s, [id]: { ...s[id], on: !s[id].on } })),
    markRead: (id) => setRead((s) => new Set(s).add(id)),
    unread: alerts.filter((a) => !read.has(a.id)).length,
  }), [band, ti, sid, layers, alerts, read, view, tick]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
