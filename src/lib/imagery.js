/*
 * Imagery provider. The map only ever asks this module for georeferenced images:
 *   region(band)         -> global cloud / moisture field (whole world)
 *   cyclone(band, point) -> image of the cyclone, positioned at point.lon / point.lat
 *   system(band, s)      -> the other monitored cyclones, drawn at their current position
 *   radar(point) / radarSystem(s) -> rain-intensity colouring used on the home page map
 * Each returns { url, coordinates } where coordinates are [[lonTL,latTL],[lonTR,latTR],[lonBR,latBR],[lonBL,latBL]].
 * To use real INSAT-3DR / Himawari / HURSAT data, write a provider with the same shape and call setProvider().
 */
import { squareBox } from "./geo";
import { stamp } from "./data";

const abs = (p) => new URL(import.meta.env.BASE_URL + p, window.location.href).href;
export const WORLD_BOX = [[-180, 75], [180, 75], [180, -75], [-180, -75]];
const HALF = { developing: 4.2, mature: 5.8, decayed: 4.6 };
const stageOf = (p) => (p.post ? "decayed" : p.wind < 64 ? "developing" : "mature");
const mirror = (c, sh) => (sh ? [c[1], c[0], c[3], c[2]] : c);
/* very weak disturbances are drawn smaller and fainter; southern-hemisphere storms are mirrored */
const scaleOf = (w) => (w < 34 ? 0.6 + (0.4 * (Math.max(w, 15) - 15)) / 19 : 1);
const boxOf = (p) => mirror(squareBox(p.lon, p.lat, HALF[stageOf(p)] * scaleOf(p.wind || 0)), p.sh);
const sysBox = (s) => mirror(squareBox(s.lon, s.lat, HALF[s.wind < 64 ? "developing" : "mature"] * 0.85), s.sh);
const sysStage = (s) => (s.wind < 64 ? "developing" : "mature");

export const demoProvider = {
  name: "Demo imagery (generated stand-ins for INSAT-3DR)",
  resolution: "4 km (demo)",
  region: (band) => ({ url: abs(`imagery/world/${band}.webp`), coordinates: WORLD_BOX }),
  /* "opacity" is NOT part of a map image source, so it is returned separately and applied as a paint property */
  cyclone: (band, p) => ({ url: abs(`imagery/cyclone/${stageOf(p)}_${band}.png`), coordinates: boxOf(p), opacity: (p.wind || 0) < 34 ? Math.max(0.3, ((p.wind || 0) - 12) / 28) : 1 }),
  system: (band, s) => ({ url: abs(`imagery/cyclone/${sysStage(s)}_${band}.png`), coordinates: sysBox(s) }),
  radar: (p) => ({ url: abs(`imagery/cyclone/radar_${stageOf(p)}.png`), coordinates: boxOf(p) }),
  radarSystem: (s) => ({ url: abs(`imagery/cyclone/radar_${sysStage(s)}.png`), coordinates: sysBox(s) }),
  thumb: (band) => `${import.meta.env.BASE_URL}imagery/cyclone/mature_${band}.png`,
  time: (p) => stamp(p.t),
};
let provider = demoProvider;
export const getProvider = () => provider;
export const setProvider = (p) => { provider = p; };
