# CycloneX

Satellite cyclone intelligence prototype: React, Tailwind, MapLibre GL JS, Recharts.

## Run

    npm install
    npm run dev

Open http://localhost:5173. Optional: `cp .env.example .env` and set `VITE_MAPTILER_KEY` (free key from cloud.maptiler.com) to use MapTiler Satellite. Without a key the map uses Esri World Imagery.

## Pages

| Route | Page |
|---|---|
| `/` | Overview |
| `/imagery` | Satellite imagery: visible, infrared, water vapour |
| `/prediction` | Intensity trend, direction of movement, confidence |
| `/dashboard` | Interactive map with imagery, track, stage, risk zones, confidence |
| `/warnings` | Early warning and decision support |

## Map layer stack

    satellite basemap (MapTiler or Esri)
      global cloud / moisture overlay   (georeferenced image, whole world)
        wind flow lines                 (global streamlines, vortex around each cyclone)
        other monitored cyclones        (georeferenced images, every ocean basin)
        cyclone satellite overlay       (georeferenced image, moves with the storm lat/lon)
          boundaries and places
            risk zones, uncertainty cone, wind radii
              historical track, forecast track, forecast points, markers

## Replacing the demo imagery with real satellite data

All imagery goes through `src/lib/imagery.js`. The map only asks for:

- `region(band)` returns `{ url, coordinates }` for the global cloud / moisture field
- `system(band, system)` returns `{ url, coordinates }` for each other cyclone worldwide (`src/data/systems.json`)
- `cyclone(band, point)` returns `{ url, coordinates }` for the cyclone image at `point.lon / point.lat`

`coordinates` are four `[lon, lat]` corners: top-left, top-right, bottom-right, bottom-left. `band` is `visible`, `infrared` or `vapour`.

1. Write a provider with those two functions (plus `thumb`, `time`, `name`, `resolution`). For INSAT-3DR or HURSAT, return the URL of the processed PNG (transparent background) and the corner coordinates from the product metadata.
2. Call `setProvider(myProvider)` once, for example in `src/main.jsx`.

Or simply overwrite the PNGs in `public/imagery/cyclone/` and `public/imagery/world/` keeping the file names.

The demo PNGs are generated stand-ins (`python scripts/make_demo_imagery.py`, needs numpy, scipy, pillow). They are not real satellite pixels.

## Simulated data

`src/data/*.json` stands in for the output of a FastAPI service running PyTorch models.

## Selecting a cyclone

`src/lib/data.js` holds every monitored cyclone (the focus system ARB-02 plus five more worldwide). Each one has a 30-day timeline (history, now, 72 h forecast), landfall, peak intensity and confidence. `selectSystem(id)` switches the cyclone the Imagery, Prediction and Dashboard pages show. To use real model output, build each cyclone's record from your FastAPI responses instead of the generators in that file.

## Timeline

Dashboard and Imagery pages have 24 h, 7 day and 30 day ranges. Before the cyclone forms, the frames show regional cloud cover only.

## Time

All clocks and frame times use the viewer's own clock and time zone. UTC is shown alongside in the header.

## Map credits

The map attribution control is hidden on the map pages. Esri and MapTiler terms ask for the imagery credit to be shown somewhere in the product, so it appears in the home page footer.
