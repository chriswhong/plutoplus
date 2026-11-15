#!/usr/bin/env bash
# Builds the static data files that power PLUTO+ (no database required).
#
#   scripts/build-data.sh [VERSION] [OUT_DIR]
#
#   VERSION  MapPLUTO release, e.g. 26v2. Auto-detected (latest on DCP's site) if omitted.
#   OUT_DIR  Where to write output. Default: public/data
#
# Outputs (in OUT_DIR):
#   <version>/mappluto.parquet   GeoParquet, EPSG:4326, Hilbert-sorted, bbox struct column
#   <version>/mappluto.pmtiles   Vector tiles for display (bbl + address only)
#   <version>/fields.json        Column list with types + descriptions
#   <version>/nta-stats.json     Per-neighborhood summary stats (for static SEO pages)
#   <version>/borough-stats.json Per-borough summary stats
#   nta.geojson                  2020 Neighborhood Tabulation Areas
#   basemap.pmtiles              Protomaps basemap, NYC extract (refreshed each build)
#   latest.json                  Pointer to the current version, read by the app
#
# Requires: duckdb (CLI, >= 1.4), tippecanoe, pmtiles (CLI), curl, unzip, python3.
set -euo pipefail

DUCKDB="${DUCKDB:-duckdb}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DCP_BASE="https://s-media.nyc.gov/agencies/dcp/assets/files/zip/data-tools/bytes/mappluto"
NTA_URL="https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?\$limit=1000"
UA="Mozilla/5.0 (plutoplus data build)"

VERSION="${1:-}"
OUT_DIR="${2:-public/data}"
WORK_DIR="${WORK_DIR:-.data-build}"

url_for() { echo "$DCP_BASE/nyc_mappluto_$1_fgdb.zip"; }

exists() { [ "$(curl -s -o /dev/null -w '%{http_code}' -I -A "$UA" "$1")" = "200" ]; }

if [ -z "$VERSION" ]; then
  echo "Detecting latest MapPLUTO version..."
  year=$(( $(date +%y) + 1 ))
  while [ -z "$VERSION" ] && [ "$year" -ge 24 ]; do
    for n in 4 3 2 1; do
      if exists "$(url_for "${year}v${n}")"; then VERSION="${year}v${n}"; break; fi
    done
    year=$(( year - 1 ))
  done
  [ -n "$VERSION" ] || { echo "Could not find a MapPLUTO release" >&2; exit 1; }
fi
echo "MapPLUTO version: $VERSION"

if [ "${SKIP_IF_CURRENT:-0}" = "1" ] && [ -f "$OUT_DIR/latest.json" ] \
   && grep -q "\"version\": *\"$VERSION\"" "$OUT_DIR/latest.json"; then
  echo "$VERSION is already built; nothing to do."
  exit 0
fi

mkdir -p "$WORK_DIR" "$OUT_DIR/$VERSION"
WORK_DIR="$(cd "$WORK_DIR" && pwd)"
OUT="$(cd "$OUT_DIR/$VERSION" && pwd)"

# 1. Download + unzip ---------------------------------------------------------
ZIP="$WORK_DIR/mappluto_$VERSION.zip"
[ -f "$ZIP" ] || curl -fL -A "$UA" -o "$ZIP" "$(url_for "$VERSION")"
rm -rf "$WORK_DIR/src" && mkdir -p "$WORK_DIR/src"
unzip -q -o "$ZIP" -d "$WORK_DIR/src"
GDB="$(find "$WORK_DIR/src" -maxdepth 2 -type d -name '*.gdb' | head -1)"
[ -n "$GDB" ] || { echo "No .gdb found in $ZIP" >&2; exit 1; }
echo "Source: $GDB"

# 2. GeoParquet ---------------------------------------------------------------
# Lowercase every attribute, drop Esri housekeeping columns, cast BBLs to integers, and
# round lat/lng to 6 decimal places (~11 cm), the same precision as the geometry.
PRECISION=6
COLS=$("$DUCKDB" -list -noheader -c "LOAD spatial;
  SELECT string_agg(
    CASE WHEN column_name IN ('BBL','APPBBL') THEN format('CAST({} AS BIGINT) AS {}', column_name, lower(column_name))
         WHEN column_name IN ('Latitude','Longitude') THEN format('round(\"{}\", $PRECISION) AS {}', column_name, lower(column_name))
         ELSE format('\"{}\" AS {}', column_name, lower(column_name)) END, ', ')
  FROM (DESCRIBE SELECT * FROM ST_Read('$GDB'))
  WHERE column_type <> 'GEOMETRY' AND column_name NOT IN ('Shape_Leng','Shape_Length','Shape_Area');")

echo "Writing GeoParquet..."
"$DUCKDB" <<SQL
INSTALL spatial; LOAD spatial;
SET preserve_insertion_order = true;

CREATE TABLE raw AS
SELECT $COLS,
       ST_Transform(Shape, 'EPSG:2263', 'EPSG:4326', always_xy := true) AS geom
FROM ST_Read('$GDB');

UPDATE raw SET geom = ST_MakeValid(geom) WHERE NOT ST_IsValid(geom);

-- Snap coordinates to a 1e-6 degree grid (6 decimal places, ~11 cm). The precision reducer
-- keeps polygons valid; a lot so small it would collapse to empty keeps its original shape.
UPDATE raw SET geom = CASE WHEN ST_IsEmpty(ST_ReducePrecision(geom, 1e-$PRECISION)) THEN geom
                           ELSE ST_ReducePrecision(geom, 1e-$PRECISION) END;
SELECT count(*) FILTER (WHERE ST_IsEmpty(ST_ReducePrecision(geom, 1e-$PRECISION))) AS kept_full_precision FROM raw;

CREATE TABLE lots AS
SELECT *,
       struct_pack(xmin := ST_XMin(geom), ymin := ST_YMin(geom),
                   xmax := ST_XMax(geom), ymax := ST_YMax(geom)) AS bbox
FROM raw
WHERE geom IS NOT NULL
ORDER BY ST_Hilbert(geom, (SELECT ST_Extent(ST_Extent_Agg(geom)) FROM raw));

COPY lots TO '$OUT/mappluto.parquet'
  (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 4096);

-- Display-only copy for tippecanoe
COPY (SELECT bbl, address, geom FROM lots)
  TO '$WORK_DIR/lots.geojsonseq' WITH (FORMAT GDAL, DRIVER 'GeoJSONSeq');

COPY (SELECT column_name AS name, column_type AS type
      FROM (DESCRIBE lots) WHERE column_name NOT IN ('geom','bbox'))
  TO '$WORK_DIR/schema.json' (FORMAT json, ARRAY true);

COPY (SELECT count(*) AS count FROM lots) TO '$WORK_DIR/count.json' (FORMAT json);

-- Average text length of each column (as written to CSV, nulls = 0).
-- The app uses these to estimate download sizes before running an extract.
COPY (SELECT avg(coalesce(length(CAST(COLUMNS(* EXCLUDE (geom, bbox)) AS VARCHAR)), 0)) FROM lots)
  TO '$WORK_DIR/avg_length.json' (FORMAT json);
SQL

# 3. PMTiles (display only) ---------------------------------------------------
echo "Building PMTiles..."
tippecanoe --quiet -o "$OUT/mappluto.pmtiles" --force -l lots \
  -Z 11 -z 16 \
  --coalesce-densest-as-needed --extend-zooms-if-still-dropping \
  --simplification=4 --no-tile-size-limit \
  "$WORK_DIR/lots.geojsonseq"

# 4. Neighborhoods ------------------------------------------------------------
echo "Fetching NTA boundaries..."
curl -fsL -A "$UA" "$NTA_URL" -o "$WORK_DIR/nta_raw.geojson"
"$DUCKDB" <<SQL
LOAD spatial;
COPY (
  SELECT nta2020 AS id, ntaname AS name, boroname AS borough,
         ST_SimplifyPreserveTopology(geom, 0.00002) AS geom
  FROM ST_Read('$WORK_DIR/nta_raw.geojson')
) TO '$OUT_DIR/nta.geojson'
  WITH (FORMAT GDAL, DRIVER 'GeoJSON', LAYER_CREATION_OPTIONS 'COORDINATE_PRECISION=6');
SQL

# 4b. Neighborhood + borough stats (for the static SEO pages) -------------------
# Each lot is assigned to the NTA containing a point on its surface, so lots on a boundary
# are counted once (downloads use ST_Intersects, so their counts can be slightly higher).
echo "Computing neighborhood and borough stats..."
"$DUCKDB" <<SQL
LOAD spatial;
CREATE TABLE nta AS
  SELECT nta2020 AS id, ntaname AS name, boroname AS borough, cdtaname AS cdta,
         TRY_CAST(ntatype AS INT) AS ntatype, geom
  FROM ST_Read('$WORK_DIR/nta_raw.geojson');
CREATE TABLE lots AS
  SELECT borough AS boro, landuse, zonedist1, unitsres, unitstotal, bldgarea, lotarea, numbldgs,
         yearbuilt, numfloors, landmark, histdist, pfirm15_flag, ST_PointOnSurface(geom) AS pt
  FROM '$OUT/mappluto.parquet';
CREATE TABLE lot_nta AS
  SELECT n.id AS nta, l.* FROM lots l JOIN nta n ON ST_Within(l.pt, n.geom);

CREATE MACRO summary(t, key) AS TABLE
  SELECT key AS k,
         count(*) AS lots,
         coalesce(sum(unitsres), 0)::BIGINT AS units_res,
         coalesce(sum(unitstotal), 0)::BIGINT AS units_total,
         coalesce(sum(bldgarea), 0)::BIGINT AS bldg_area,
         coalesce(sum(lotarea), 0)::BIGINT AS lot_area,
         coalesce(sum(numbldgs), 0)::BIGINT AS buildings,
         median(yearbuilt) FILTER (WHERE yearbuilt > 1700)::INT AS median_year_built,
         min(yearbuilt) FILTER (WHERE yearbuilt > 1700)::INT AS oldest_year_built,
         round(avg(numfloors) FILTER (WHERE numfloors > 0), 1) AS avg_floors,
         count(*) FILTER (WHERE pfirm15_flag = '1') AS lots_floodplain,
         count(landmark) AS landmark_lots
  FROM query_table(t) GROUP BY ALL;

-- top-N helper output as lists of {value, lots}
CREATE TABLE nta_landuse AS
  SELECT nta AS k, list({'code': landuse, 'lots': n} ORDER BY n DESC) AS landuse
  FROM (SELECT nta, landuse, count(*) n FROM lot_nta WHERE landuse IS NOT NULL GROUP BY ALL) GROUP BY 1;
CREATE TABLE nta_zoning AS
  SELECT nta AS k, list({'district': zonedist1, 'lots': n} ORDER BY n DESC)[1:6] AS zoning
  FROM (SELECT nta, zonedist1, count(*) n FROM lot_nta WHERE zonedist1 IS NOT NULL GROUP BY ALL) GROUP BY 1;
CREATE TABLE nta_hist AS
  SELECT nta AS k, list(histdist ORDER BY n DESC)[1:5] AS historic_districts
  FROM (SELECT nta, histdist, count(*) n FROM lot_nta WHERE histdist IS NOT NULL GROUP BY ALL) GROUP BY 1;

COPY (
  SELECT n.id, n.name, n.borough, n.cdta, n.ntatype,
         [round(ST_XMin(n.geom), 5), round(ST_YMin(n.geom), 5), round(ST_XMax(n.geom), 5), round(ST_YMax(n.geom), 5)] AS bbox,
         coalesce(s.lots, 0) AS lots, s.units_res, s.units_total, s.bldg_area, s.lot_area, s.buildings,
         s.median_year_built, s.oldest_year_built, s.avg_floors, s.lots_floodplain, s.landmark_lots,
         coalesce(lu.landuse, []) AS landuse, coalesce(z.zoning, []) AS zoning,
         coalesce(h.historic_districts, []) AS historic_districts
  FROM nta n
  LEFT JOIN summary('lot_nta', nta) s ON s.k = n.id
  LEFT JOIN nta_landuse lu ON lu.k = n.id
  LEFT JOIN nta_zoning z ON z.k = n.id
  LEFT JOIN nta_hist h ON h.k = n.id
  ORDER BY n.id
) TO '$OUT/nta-stats.json' (FORMAT json, ARRAY true);

CREATE TABLE boro_landuse AS
  SELECT boro AS k, list({'code': landuse, 'lots': n} ORDER BY n DESC) AS landuse
  FROM (SELECT boro, landuse, count(*) n FROM lots WHERE landuse IS NOT NULL GROUP BY ALL) GROUP BY 1;
CREATE TABLE boro_zoning AS
  SELECT boro AS k, list({'district': zonedist1, 'lots': n} ORDER BY n DESC)[1:8] AS zoning
  FROM (SELECT boro, zonedist1, count(*) n FROM lots WHERE zonedist1 IS NOT NULL GROUP BY ALL) GROUP BY 1;
COPY (
  SELECT s.k AS code, s.* EXCLUDE (k), lu.landuse, z.zoning
  FROM summary('lots', boro) s
  JOIN boro_landuse lu USING (k) JOIN boro_zoning z USING (k)
  ORDER BY code
) TO '$OUT/borough-stats.json' (FORMAT json, ARRAY true);
SQL

# 5. Basemap: extract NYC from the latest Protomaps daily planet build -----------
if [ "${SKIP_BASEMAP:-0}" != "1" ]; then
  echo "Extracting Protomaps basemap..."
  BUILD=$(curl -fsSL https://build-metadata.protomaps.dev/builds.json \
    | python3 -c "import json,sys; print(json.load(sys.stdin)[-1]['key'])")
  pmtiles extract "https://build.protomaps.com/$BUILD" "$OUT_DIR/basemap.pmtiles" \
    --bbox=-74.30,40.47,-73.65,40.95 --maxzoom=15
fi

# 6. fields.json + latest.json --------------------------------------------------
python3 - "$WORK_DIR" "$OUT" "$OUT_DIR" "$VERSION" "$SCRIPT_DIR/field-descriptions.json" <<'PY'
import json, sys, datetime, os
work, out, out_root, version, desc_path = sys.argv[1:]
schema = json.load(open(os.path.join(work, "schema.json")))
desc = json.load(open(desc_path))
avg = json.loads(open(os.path.join(work, "avg_length.json")).read().strip().splitlines()[0])
fields = [{"name": c["name"], "type": c["type"], "description": desc.get(c["name"], ""),
           "avgLength": round(avg.get(c["name"]) or 0, 2)} for c in schema]
json.dump(fields, open(os.path.join(out, "fields.json"), "w"), indent=2)
count = json.loads(open(os.path.join(work, "count.json")).read().strip().splitlines()[0])["count"]
latest = {
    "version": version,
    "count": count,
    "built": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "parquet": f"{version}/mappluto.parquet",
    "pmtiles": f"{version}/mappluto.pmtiles",
    "fields": f"{version}/fields.json",
    "ntaStats": f"{version}/nta-stats.json",
    "boroughStats": f"{version}/borough-stats.json",
    "nta": "nta.geojson",
    "basemap": "basemap.pmtiles",
}
json.dump(latest, open(os.path.join(out_root, "latest.json"), "w"), indent=2)
missing = [f["name"] for f in fields if not f["description"]]
if missing:
    print("Fields without descriptions (add to scripts/field-descriptions.json):", ", ".join(missing))
print(json.dumps(latest, indent=2))
PY

ls -lh "$OUT" "$OUT_DIR"
echo "Done."
