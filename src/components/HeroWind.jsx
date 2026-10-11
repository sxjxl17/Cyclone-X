import React, { useEffect, useRef } from "react";
import { fieldAt } from "../lib/wind";
import { RAD } from "../lib/geo";

/* Animated wind particles drawn over the homepage map photo.
   The photo is 1424x748 and shown with object-cover, anchored right. We work in image pixels so the flow
   stays locked to the picture at any screen size. Pixels map to approximate lon/lat so the same wind field
   used elsewhere in the app (trades, westerlies, monsoon, cyclone vortices) drives the particles. */
const IW = 1424, IH = 748;
const LON = (x) => 77 + 0.14 * (x - 780), LAT = (y) => 8 + 0.1217 * (490 - y);
/* the three cyclones visible in the photo (image px), strength k and hemisphere h */
const STORMS = [
  { x: 685, y: 445, k: 1.0, h: 1 },
  { x: 1197, y: 420, k: 1.4, h: 1 },
  { x: 770, y: 680, k: 1.0, h: -1 },
];
const VS = STORMS.map((s) => ({ lon: LON(s.x), lat: LAT(s.y), k: s.k, h: s.h }));
const TONES = ["rgba(90,170,255,0.55)", "rgba(80,225,170,0.7)", "rgba(255,226,90,0.85)", "rgba(255,120,90,0.95)"];
const COUNT = 1300, STEP = 0.04;

export default function HeroWind() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current, ctx = cv.getContext("2d");
    const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, frames = 0, run = true, w = 0, h = 0, sc = 1, ox = 0, oy = 0;
    const layout = () => {
      const d = window.devicePixelRatio || 1;
      w = cv.clientWidth; h = cv.clientHeight;
      if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
      ctx.setTransform(d, 0, 0, d, 0, 0);
      sc = Math.max(w / IW, h / IH); ox = w - IW * sc; oy = (h - IH * sc) / 2; /* object-cover, object-right */
    };
    const seed = (p) => {
      const x0 = Math.max(0, -ox / sc), x1 = Math.min(IW, (w - ox) / sc), y0 = Math.max(0, -oy / sc), y1 = Math.min(IH, (h - oy) / sc);
      p.x = x0 + Math.random() * (x1 - x0); p.y = y0 + Math.random() * (y1 - y0);
      p.age = 0; p.life = 60 + ((Math.random() * 70) | 0); return p;
    };
    layout();
    const parts = Array.from({ length: COUNT }, () => { const p = seed({}); p.age = (Math.random() * p.life) | 0; return p; });
    const onResize = () => { layout(); ctx.clearRect(0, 0, w, h); };
    window.addEventListener("resize", onResize);
    const step = () => {
      if (!run) return;
      layout();
      ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "rgba(0,0,0,0.075)"; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over"; ctx.lineWidth = 1.2; ctx.lineCap = "round";
      const buckets = [[], [], [], []];
      for (const p of parts) {
        if (p.age++ > p.life) { seed(p); continue; }
        const lon = LON(p.x), lat = LAT(p.y), [u, v] = fieldAt(lon, lat, VS), sp = Math.hypot(u, v);
        const nx = p.x + (u * STEP) / Math.max(0.2, Math.cos(lat * RAD)) / 0.14, ny = p.y - (v * STEP) / 0.1217;
        if (nx < 0 || nx > IW || ny < 0 || ny > IH) { seed(p); continue; }
        buckets[Math.min(3, (sp / 3.5) | 0)].push(p.x * sc + ox, p.y * sc + oy, nx * sc + ox, ny * sc + oy);
        p.x = nx; p.y = ny;
      }
      buckets.forEach((seg, i) => { if (!seg.length) return; ctx.strokeStyle = TONES[i]; ctx.beginPath(); for (let j = 0; j < seg.length; j += 4) { ctx.moveTo(seg[j], seg[j + 1]); ctx.lineTo(seg[j + 2], seg[j + 3]); } ctx.stroke(); });
      if (reduced && ++frames > 150) { run = false; return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { run = false; cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, []);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
