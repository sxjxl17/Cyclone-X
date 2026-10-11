import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useStorm, BANDS } from "../state";
import { getProvider } from "../lib/imagery";
import { TIMELINE, FORECAST, NOW_I, LAND, LAND_SHORT, D, SYSTEM_LIST, SID } from "../lib/data";
import { ring, cone, RADII, cat, TC, COL, fmtPos, classify } from "../lib/geo";
import { startWind, windLines } from "../lib/wind";


const KEY = import.meta.env.VITE_MAPTILER_KEY;
const SAT_SRC = KEY
  ? { type: "raster", tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${KEY}`], tileSize: 512, maxzoom: 18 }
  : { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 17 };
const REF_SRC = { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 12 };
const FILT = {
  visible: { sat: { "raster-saturation": -0.08, "raster-contrast": 0.1, "raster-brightness-min": 0, "raster-brightness-max": 0.92, "raster-hue-rotate": 0 }, ref: 0.7 },
  infrared: { sat: { "raster-saturation": -1, "raster-contrast": 0.3, "raster-brightness-min": 0, "raster-brightness-max": 0.32, "raster-hue-rotate": 0 }, ref: 0.45 },
  vapour: { sat: { "raster-saturation": -0.55, "raster-contrast": 0.15, "raster-brightness-min": 0, "raster-brightness-max": 0.5, "raster-hue-rotate": 175 }, ref: 0.45 },
};
FILT.hero = { sat: { "raster-saturation": 0.3, "raster-contrast": 0.3, "raster-brightness-min": 0, "raster-brightness-max": 0.6, "raster-hue-rotate": 18 }, ref: 0.5 };
const HERO_TONES = ["rgba(90,170,255,0.55)", "rgba(80,225,170,0.7)", "rgba(255,226,90,0.85)", "rgba(255,120,90,0.95)"];
const SCALE = {
  visible: ["Surface", "Thick cloud", "linear-gradient(90deg,#1b2a3b,#8d99a8,#ffffff)"],
  infrared: ["Warm +20 °C", "Cold -86 °C", "linear-gradient(90deg,#0a0c10,#5a606b,#dfe3ea,#9ccbe0,#e8dc8c,#d6645f)"],
  vapour: ["Dry", "Moist", "linear-gradient(90deg,#1a2836,#3a647c,#96c0d0,#eef7fa)"],
};
const VIEWS = { Global: { center: [45, 16], zoom: 1.9 }, Region: { center: [72, 17], zoom: 4.7 } };
const fc = (features) => ({ type: "FeatureCollection", features });
const ft = (geometry, properties = {}) => ({ type: "Feature", geometry, properties });
const ringsGeo = (p) => fc(p.exists === false ? [] : RADII(p.wind).map(([kt, km, color]) => ft({ type: "Polygon", coordinates: [ring([p.lon, p.lat], km, 0.22, p.dir)] }, { color })));

const staticGeo = () => {
  const pts = FORECAST.map((p) => [p.lon, p.lat]), obs = TIMELINE.filter((q) => q.exists !== false && q.t <= 0), land = LAND ? [LAND.lon, LAND.lat] : null;
  return {
    cone: fc([ft({ type: "Polygon", coordinates: [cone(pts)] })]),
    fc: fc([ft({ type: "LineString", coordinates: pts })]),
    hist: fc([ft({ type: "LineString", coordinates: obs.map((q) => [q.lon, q.lat]) })]),
    histpts: fc(obs.slice(0, -1).map((q) => ft({ type: "Point", coordinates: [q.lon, q.lat] }))),
    fcpts: fc(FORECAST.slice(1).map((p) => ft({ type: "Point", coordinates: [p.lon, p.lat] }, { color: COL[cat(p.wind)] }))),
    risk: fc(land ? D.risk.map((z) => ft({ type: "Polygon", coordinates: [ring(land, z.km)] }, { color: z.c })) : []),
  };
};

const makeStyle = () => ({ version: 8, sources: { sat: { ...SAT_SRC, tiles: [...SAT_SRC.tiles] } }, layers: [{ id: "bg", type: "background", paint: { "background-color": "#040a26" } }, { id: "sat", type: "raster", source: "sat" }] });

function buildMarkers(map, R, hero) {
  R.mk.forEach((m) => m.remove()); R.mk = []; R.track = [];
  const put = (el, ll, opt = {}) => { const m = new maplibregl.Marker({ element: el, ...opt }).setLngLat(ll).addTo(map); R.mk.push(m); return m; };
  const text = (txt, css = "") => { const e = document.createElement("div"); e.textContent = txt; e.style.cssText = "font:600 11px Hind,system-ui,sans-serif;color:#eef3fa;text-shadow:0 0 3px #000,0 0 3px #000,0 1px 4px #000;white-space:nowrap;pointer-events:none;" + css; return e; };
  [6, 12, 24, 36, 60, 72].forEach((h, k) => { const q = FORECAST.find((x) => x.h === h), right = k % 2 === 0, e = text(`+${h}h ${TC[cat(q.wind)]}`); R.track.push(e); put(e, [q.lon, q.lat], { anchor: right ? "left" : "right", offset: [right ? 9 : -9, 0] }); });
  if (LAND) {
    const le = document.createElement("div"); le.style.cssText = "width:12px;height:12px;transform:rotate(45deg);border:2px solid #ef4444;background:rgba(4,10,38,.6);pointer-events:none";
    const ll = text(`Landfall, ${LAND_SHORT}, +${LAND.h}h`, "color:#fecaca"); R.track.push(le, ll); put(le, [LAND.lon, LAND.lat]); put(ll, [LAND.lon, LAND.lat], { anchor: "left", offset: [12, 2] });
  }
  const cp = FORECAST[0], cur = document.createElement("div");
  cur.style.cssText = "width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid #040a26;box-shadow:0 0 0 1.5px rgba(255,255,255,.7);pointer-events:none";
  put(cur, [cp.lon, cp.lat]); if (!hero) put(text(`Current position ${fmtPos(cp)}`), [cp.lon, cp.lat], { anchor: "top", offset: [0, 10] });
  SYSTEM_LIST.filter((s) => s.id !== SID).forEach((s) => { const d = document.createElement("div"); d.style.cssText = "width:7px;height:7px;border-radius:50%;background:#fff;border:1.5px solid #040a26;pointer-events:none"; put(d, [s.lon, s.lat]); put(text(`${s.name}, ${classify(s.wind).k}`, "color:#cfe0ff;font-size:10px"), [s.lon, s.lat], { anchor: "left", offset: [9, -9] }); });
  const se = document.createElement("div"); se.style.cssText = "width:28px;height:28px;border-radius:50%;border:1.5px solid rgba(255,255,255,.85);pointer-events:none;display:none";
  R.sel = put(se, [cp.lon, cp.lat]);
}

export default function SatelliteMap({ show, hero }) {
  const { band, ti, view, sid } = useStorm();
  const box = useRef(null), ref = useRef({}), latest = useRef({});
  latest.current = { band, ti, show };

  const update = () => {
    const R = ref.current, map = R.map, { band, ti, show } = latest.current, p = TIMELINE[ti], prov = getProvider(), f = hero ? FILT.hero : FILT[band], on = p.exists !== false;
    if (R.sid !== SID) {
      const G = staticGeo(); for (const k in G) map.getSource(k)?.setData(G[k]);
      buildMarkers(map, R, hero); R.sid = SID;
      SYSTEM_LIST.forEach((s, i) => map.getLayer("sys" + i) && map.setLayoutProperty("sys" + i, "visibility", s.id === SID ? "none" : "visible"));
    }
    for (const k in f.sat) map.setPaintProperty("sat", k, f.sat[k]);
    map.setPaintProperty("ref", "raster-opacity", f.ref);
    if (R.band !== band) { map.getSource("region")?.updateImage(prov.region(band)); SYSTEM_LIST.forEach((s, i) => map.getSource("sys" + i)?.updateImage(prov.system(band, s))); R.band = band; }
    const cy = prov.cyclone(band, p); map.getSource("cyclone")?.updateImage({ url: cy.url, coordinates: cy.coordinates }); map.setPaintProperty("cyclone", "raster-opacity", cy.opacity);
    const vis = (ids, v) => ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", v ? "visible" : "none"));
    vis(["cyclone"], on);
    if (hero) { const rd = prov.radar(p); map.getSource("radar")?.updateImage(rd); vis(["radar"], on); SYSTEM_LIST.forEach((s, i) => map.getLayer("rad" + i) && map.setLayoutProperty("rad" + i, "visibility", s.id === SID ? "none" : "visible")); } vis(["region"], show.cloud); vis(["ref"], show.labels); vis(["cone-fill", "cone-line"], show.cone);
    vis(["hist", "histpts", "fc", "fcpts"], show.track); vis(["rings-fill", "rings-line"], show.rings && on); vis(["risk-fill", "risk-line"], show.risk);
    map.getSource("rings")?.setData(ringsGeo(p));
    if (R.sel) { R.sel.setLngLat([p.lon, p.lat]); R.sel.getElement().style.display = ti === NOW_I || !on ? "none" : "block"; }
    R.track.forEach((e) => (e.style.display = show.track ? "block" : "none"));
    R.vs = [...(on ? [{ lon: p.lon, lat: p.lat, k: p.wind / 85, h: p.sh ? -1 : 1 }] : []), ...SYSTEM_LIST.filter((s) => s.id !== SID).map((s) => ({ lon: s.lon, lat: s.lat, k: s.wind / 85, h: s.sh ? -1 : 1 }))];
    if (R.wind) { if (show.wind) R.wind.start(); else R.wind.stop(); }
    vis(["wind"], !hero && show.wind);
    if (!hero && show.wind) map.getSource("wind")?.setData(windLines(R.vs, SID + ":" + p.t));
  };

  const safe = () => { try { update(); } catch (e) { console.error("CycloneX map update failed:", e); } };

  useEffect(() => {
    const map = new maplibregl.Map({ container: box.current, style: makeStyle(), center: hero ? [58, 17] : VIEWS.Region.center, zoom: hero ? 2.1 : VIEWS.Region.zoom, minZoom: hero ? 1.2 : 1.6, maxZoom: 9, renderWorldCopies: false, attributionControl: false, interactive: !hero });
    if (!hero) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    ref.current = { map, track: [], mk: [], vs: [] };
    map.on("error", (e) => console.warn("Map:", e.error && e.error.message));
    if (hero) {
    const cv = document.createElement("canvas"); cv.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;display:none";
    map.getCanvasContainer().appendChild(cv);
    ref.current.wind = startWind(map, cv, () => ref.current.vs, { count: 2600, tones: HERO_TONES });
    }
    const ro = new ResizeObserver(() => map.resize()); ro.observe(box.current);
    map.on("load", () => {
      const { band, ti } = latest.current, prov = getProvider(), fade = { "raster-fade-duration": 0 };
      map.addSource("region", { type: "image", ...prov.region(band) }); ref.current.band = band;
      map.addLayer({ id: "region", type: "raster", source: "region", paint: fade });
      SYSTEM_LIST.forEach((s, i) => { map.addSource("sys" + i, { type: "image", ...prov.system(band, s) }); map.addLayer({ id: "sys" + i, type: "raster", source: "sys" + i, paint: fade }); });
      map.addSource("wind", { type: "geojson", data: fc([]) });
      map.addLayer({ id: "wind", type: "line", source: "wind", paint: { "line-color": "#e8f2ff", "line-width": 0.8, "line-opacity": 0.3 } });
      { const { url, coordinates } = prov.cyclone(band, TIMELINE[ti]); map.addSource("cyclone", { type: "image", url, coordinates }); }
      map.addLayer({ id: "cyclone", type: "raster", source: "cyclone", paint: fade });
      if (hero) {
        map.addSource("radar", { type: "image", ...prov.radar(TIMELINE[ti]) }); map.addLayer({ id: "radar", type: "raster", source: "radar", paint: { ...fade, "raster-opacity": 0.9 } });
        SYSTEM_LIST.forEach((s, i) => { map.addSource("rad" + i, { type: "image", ...prov.radarSystem(s) }); map.addLayer({ id: "rad" + i, type: "raster", source: "rad" + i, paint: { ...fade, "raster-opacity": 0.9 } }); });
      }
      map.addSource("ref", REF_SRC); map.addLayer({ id: "ref", type: "raster", source: "ref" });
      for (const k of ["cone", "fc", "hist", "histpts", "fcpts", "risk", "rings"]) map.addSource(k, { type: "geojson", data: fc([]) });
      map.addLayer({ id: "risk-fill", type: "fill", source: "risk", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.07 } });
      map.addLayer({ id: "risk-line", type: "line", source: "risk", paint: { "line-color": ["get", "color"], "line-width": 1, "line-opacity": 0.6, "line-dasharray": [4, 3] } });
      map.addLayer({ id: "cone-fill", type: "fill", source: "cone", paint: { "fill-color": "#ffffff", "fill-opacity": 0.08 } });
      map.addLayer({ id: "cone-line", type: "line", source: "cone", paint: { "line-color": "#ffffff", "line-width": 0.8, "line-opacity": 0.35 } });
      map.addLayer({ id: "rings-fill", type: "fill", source: "rings", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.03 } });
      map.addLayer({ id: "rings-line", type: "line", source: "rings", paint: { "line-color": ["get", "color"], "line-width": 1, "line-opacity": 0.75 } });
      map.addLayer({ id: "hist", type: "line", source: "hist", paint: { "line-color": "#a9bbe8", "line-width": 1, "line-opacity": 0.75 } });
      map.addLayer({ id: "histpts", type: "circle", source: "histpts", paint: { "circle-radius": 2, "circle-color": "#a9bbe8" } });
      map.addLayer({ id: "fc", type: "line", source: "fc", paint: { "line-color": "#ffffff", "line-width": 1.3, "line-dasharray": [3, 2] } });
      map.addLayer({ id: "fcpts", type: "circle", source: "fcpts", paint: { "circle-radius": 3.5, "circle-color": ["get", "color"], "circle-stroke-color": "#040a26", "circle-stroke-width": 1 } });
      ref.current.ready = true; safe();
    });
    return () => { ref.current.wind.destroy(); ro.disconnect(); map.remove(); };
  }, []);
  useEffect(() => { if (ref.current.ready) safe(); }, [band, ti, sid, show.cloud, show.wind, show.track, show.cone, show.rings, show.risk, show.labels]);
  useEffect(() => { if (view && ref.current.ready) ref.current.map.flyTo({ center: view.center, zoom: view.zoom, duration: 1400 }); }, [view]);

  const go = (k) => { const m = ref.current.map; if (!m) return; const p = TIMELINE[latest.current.ti]; m.flyTo(k === "Storm" ? { center: [p.lon, p.lat], zoom: 5.6, duration: 1400 } : { ...VIEWS[k], duration: 1400 }); };
  const p = TIMELINE[ti], [lo, hi, grad] = SCALE[band];
  return (
    <div className="absolute inset-0">
      <div ref={box} className="absolute inset-0" role="img" aria-label="Satellite map of the world with the selected cyclone, its forecast track, risk zones and other cyclones monitored worldwide" />
      {!hero && <>
        <div className="pointer-events-none absolute left-3 top-3 border border-line bg-ink-950/85 px-2.5 py-1.5 text-xs">
          <div className="font-semibold tabular-nums text-white">{getProvider().time(p)}</div>
          <div className="text-slate-400">{BANDS[band].label} {BANDS[band].wl}, {p.exists === false ? "before formation" : p.t <= 0 ? "observed" : "forecast projection"}</div>
        </div>
        <div className="absolute right-3 top-[84px] flex flex-col overflow-hidden border border-line bg-panel text-[11px]" role="group" aria-label="Map view">
          {["Global", "Region", "Storm"].map((k) => <button key={k} onClick={() => go(k)} className="border-b border-line px-3 py-1.5 text-left text-slate-200 last:border-b-0 hover:bg-panel-hi focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">{k}</button>)}
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 w-52 border border-line bg-ink-950/85 px-2.5 py-2 text-[11px] text-slate-300">
          <div className="h-1.5" style={{ background: grad }} /><div className="mt-1 flex justify-between text-slate-400"><span>{lo}</span><span>{hi}</span></div>
        </div>
      </>}
    </div>
  );
}
