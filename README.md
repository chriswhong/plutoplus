# PLUTO+

A "clip & ship" download tool for NYC's [MapPLUTO](https://www.nyc.gov/content/planning/pages/resources/datasets/mappluto-pluto-change) tax lot data. Pick an area (the current map view, a neighborhood, or a shape you draw), choose the columns you need, and download GeoJSON, CSV or a Shapefile.

Live at [chriswhong.github.io/plutoplus](https://chriswhong.github.io/plutoplus).

## How it works (no database)

Earlier versions sent PostGIS queries to a hosted Carto table, which meant the data went stale whenever the table didn't get reloaded. This version has **no database or server**:

```
scripts/build-data.sh  (GitHub Action, monthly or on demand)
  └─ downloads the latest MapPLUTO release from DCP and writes:
       <version>/mappluto.parquet  GeoParquet, WGS84, Hilbert-sorted, bbox column, 4k-row row groups
       <version>/mappluto.pmtiles  vector tiles for the map (bbl + address only)
       <version>/fields.json       column names, types, descriptions
       nta.geojson                 2020 Neighborhood Tabulation Areas
       basemap.pmtiles             Protomaps basemap, NYC extract of the daily planet build
       latest.json                 pointer to the current version
  └─ uploads them to static object storage (Cloudflare R2)

Static site (Vite + React, GitHub Pages)
  ├─ MapLibre draws the Protomaps basemap (dark flavor) and the lots from PMTiles,
  │  with an address tooltip for wayfinding
  └─ on download, DuckDB-WASM runs in the browser:
       SELECT <columns> FROM read_parquet('…/mappluto.parquet')
       WHERE bbox.xmin <= … AND bbox.xmax >= … AND bbox.ymin <= … AND bbox.ymax >= …
         AND ST_Intersects(geom, ST_GeomFromGeoJSON('<your area>'))
```

Coordinates are stored, queried and exported at 6 decimal places (about 11 cm). The file is sorted along a Hilbert curve, so nearby lots sit together, and each row group's
bbox min/max stats let DuckDB skip everything outside your area. Parquet is columnar, so only
the columns you pick are fetched. A neighborhood extract reads a few MB of a ~110 MB file and
takes well under a second. The exact SQL is logged to the browser console and can also be shown
in the sidebar.

Areas with more than 150,000 lots (roughly a whole borough) are blocked in the UI; for those, download the full dataset from DCP.

## Download file names

Exports are named `pluto-<version>_<area>_<YYYYMMDD-HHMMSS>.<ext>` using local time, for example:

- `pluto-26v2_mapview_20261114-174233.csv`
- `pluto-26v2_polygon_20261114-174233.geojson`
- `pluto-26v2_rectangle_20261114-174233_shp.zip`
- `pluto-26v2_nta-bk0101-greenpoint_20261114-174233.geojson`

## Shareable links

The current selections are kept in the URL query string, so copying the address bar shares them:

```
?map=15.2/40.70312/-73.98871&area=nta&nta=BK0101&cols=bbl,address,yearbuilt
```

| Param | Meaning |
| --- | --- |
| `map` | `zoom/lat/lng` of the map view |
| `area` | `view` (default), `nta` or `draw` |
| `nta` | selected 2020 NTA id, e.g. `BK0101` |
| `shape` | drawn polygon as `lng,lat;lng,lat;…` |
| `cols` | comma-separated columns, `all`, or empty for none (omitted means the default set) |

## Discoverability (SEO, accessibility)

`npm run build` also runs `scripts/build-pages.ts`, which writes static, crawlable pages next to the app using the stats the data pipeline produces (`nta-stats.json`, `borough-stats.json`):

- `/neighborhoods/`: index of boroughs and all 262 2020 Neighborhood Tabulation Areas
- `/neighborhoods/<borough>/`: borough summary (lots, units, land use, zoning) with links to its neighborhoods
- `/neighborhoods/<borough>/<nta-id>-<name>/`: neighborhood summary text and tables, plus the downloader embedded in an iframe (`?embed=1`) preset to that neighborhood
- `sitemap.xml`, `robots.txt`, `llms.txt` and `404.html`

Every page has a unique title and description, a canonical URL, Open Graph and Twitter tags, and JSON-LD (`WebSite`/`WebApplication` on the app; `BreadcrumbList`, `WebPage`/`CollectionPage` and `Dataset` on the generated pages). Absolute URLs come from `VITE_SITE_URL` (`.env`, or the `SITE_URL` repo variable in CI). Icons and the social card are rendered from SVG by `npm run make-images`.

GitHub Pages serves this project under `/plutoplus/`, so `robots.txt` isn't at the domain root and crawlers won't read it there. Submit `sitemap.xml` in Google Search Console and Bing Webmaster Tools instead (or move to a custom domain).

The app and page templates check clean with axe-core (WCAG 2.1 A/AA + best practices). Everything can be used by keyboard, including choosing a neighborhood (there's a list as well as the map) and the address search (an ARIA combobox).

## Local development

Requires Node 22+, plus [DuckDB CLI](https://duckdb.org/docs/installation/) (≥ 1.4), [tippecanoe](https://github.com/felt/tippecanoe) and the [pmtiles CLI](https://github.com/protomaps/go-pmtiles) to build the data. Set `SKIP_BASEMAP=1` to reuse an existing basemap extract.

```sh
npm install
npm run build-data          # latest MapPLUTO → public/data (or: scripts/build-data.sh 26v2)
npm run dev
```

During development the data is served from `public/data` (gitignored). The Vite dev server supports HTTP range requests, which both DuckDB and PMTiles rely on.

## Configuration

| Variable | Purpose |
| --- | --- |
| `VITE_DATA_BASE_URL` | Base URL of the data files. Defaults to `./data`. |

### Hosting the data (Cloudflare R2)

1. Create an R2 bucket and enable public access, either through an `r2.dev` URL or a custom domain.
2. Add a CORS policy so the site can make range requests:
   ```json
   [{ "AllowedOrigins": ["https://chriswhong.github.io", "http://localhost:5173"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["Range", "If-Match", "If-None-Match"],
      "ExposeHeaders": ["Content-Length", "Content-Range", "ETag", "Accept-Ranges"],
      "MaxAgeSeconds": 86400 }]
   ```
3. In the GitHub repo settings, add these:
   - Variables: `DATA_BASE_URL` (the bucket's public URL) and `R2_BUCKET`.
   - Secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
4. Run the **Build data** workflow once. After that it runs monthly and does nothing unless DCP has published a new version.

The data is about 230 MB per version, plus a ~110 MB basemap. That fits within R2's free tier, and R2 doesn't charge for egress.

### Deploying the site

The **Deploy site** workflow builds with `VITE_DATA_BASE_URL` and publishes `dist/` to GitHub Pages. In repo settings, set **Pages → Source** to "GitHub Actions".

## Project layout

- `src/App.tsx`: app shell and state (area, columns, count, downloads)
- `src/components/MapView.tsx`: MapLibre map (Protomaps basemap), PMTiles lots + address tooltip, NTA picker, terra-draw drawing
- `src/components/Sidebar.tsx`: area and column selection (Radix UI + Font Awesome)
- `src/components/DownloadPanel.tsx`: floating selection summary with download buttons and size estimates
- `src/components/ColumnPicker.tsx`: column list with "By topic" and "A–Z" views
- `src/components/GeoSearch.tsx` / `src/lib/geosearch.ts`: address and place search ([NYC GeoSearch](https://geosearch.planninglabs.nyc/))
- `scripts/build-pages.ts`: static borough/neighborhood pages, sitemap, robots.txt, llms.txt
- `src/lib/precision.ts` / `src/lib/filename.ts`: 6-decimal coordinate rounding and export naming
- `src/lib/urlState.ts`: reads and writes the shareable URL state
- `src/lib/fieldGroups.ts`: column themes for the topic view (unlisted columns fall into "Other")
- `src/lib/duckdb.ts`: DuckDB-WASM setup
- `src/lib/extract.ts`: SQL builder, lot counting, download-size estimates, CSV/GeoJSON export
- `src/lib/shapefile.ts`: small polygon Shapefile writer (zipped .shp/.shx/.dbf/.prj/.cpg)
- `scripts/build-data.sh`: data pipeline
- `scripts/field-descriptions.json`: column descriptions (add new columns here when DCP adds them)
