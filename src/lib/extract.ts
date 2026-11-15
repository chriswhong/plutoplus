import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { Field } from './data'
import { getDb } from './duckdb'
import { toShapefileZip } from './shapefile'
import { roundCoord, roundGeometry } from './precision'

export type ClipGeometry = Polygon | MultiPolygon
export type Format = 'geojson' | 'csv' | 'shp'

/** Above this many lots we stop and point people to DCP's full download. */
export const MAX_LOTS = 150_000

export const FULL_DOWNLOAD_URL =
  'https://www.nyc.gov/content/planning/pages/resources/datasets/mappluto-pluto-change'


function bboxOf(geom: ClipGeometry): [number, number, number, number] {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity
  for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) {
    minx = Math.min(minx, x); maxx = Math.max(maxx, x)
    miny = Math.min(miny, y); maxy = Math.max(maxy, y)
  }
  return [minx, miny, maxx, maxy]
}


/**
 * The bbox predicates let DuckDB skip whole Parquet row groups using their min/max stats
 * (the file is Hilbert-sorted), so only the nearby part of the file is downloaded.
 * ST_Intersects then does the exact test, just like the old PostGIS query.
 */
function bboxWhere(clip: ClipGeometry) {
  const [minx, miny, maxx, maxy] = bboxOf(clip).map(roundCoord)
  return `bbox.xmin <= ${maxx} AND bbox.xmax >= ${minx} AND bbox.ymin <= ${maxy} AND bbox.ymax >= ${miny}`
}

function where(clip: ClipGeometry) {
  const json = JSON.stringify(roundGeometry(clip)).replace(/'/g, "''")
  return `${bboxWhere(clip)}\n  AND ST_Intersects(geom, ST_GeomFromGeoJSON('${json}'))`
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`

export interface CountResult {
  count: number
  /** total vertex count of the matching lots (drives geometry size); absent when over the limit */
  points?: number
  /** true when the bbox pre-count was already over MAX_LOTS, so the exact count was skipped */
  overLimit: boolean
}

export async function countLots(parquetUrl: string, clip: ClipGeometry): Promise<CountResult> {
  const { conn } = await getDb(parquetUrl)
  const rough = await conn.query(`SELECT count(*)::INT AS n FROM lots WHERE ${bboxWhere(clip)}`)
  const roughCount = Number(rough.getChildAt(0)?.get(0) ?? 0)
  if (roughCount > MAX_LOTS) return { count: roughCount, overLimit: true }
  const exact = await conn.query(
    `SELECT count(*)::INT AS n, coalesce(sum(ST_NPoints(geom)), 0)::DOUBLE AS pts FROM lots WHERE ${where(clip)}`,
  )
  return {
    count: Number(exact.getChildAt(0)?.get(0) ?? 0),
    points: Number(exact.getChildAt(1)?.get(0) ?? 0),
    overLimit: false,
  }
}

/**
 * Rough output size, without running the extract. Uses the lot count and vertex count from
 * countLots plus each column's citywide average text length (fields.json `avgLength`).
 * Constants were calibrated against real exports (within ~5% on a typical neighborhood).
 */
export function estimateBytes(format: Format, count: number, points: number, columns: Field[]): number {
  if (count === 0) return 0
  const isString = (f: Field) => !/INT|DOUBLE|FLOAT|DECIMAL|REAL/.test(f.type)
  const sumAvg = columns.reduce((a, f) => a + (f.avgLength ?? 4), 0)

  if (format === 'csv') {
    const header = columns.reduce((a, f) => a + f.name.length + 1, 0)
    return header + count * (sumAvg + columns.length)
  }
  if (format === 'geojson') {
    // "key": + value (+ quotes for strings) + comma, plus the Feature wrapper (~47 bytes)
    const props = columns.reduce((a, f) => a + f.name.length + 4 + (f.avgLength ?? 4) + (isString(f) ? 2 : 0), 0)
    // ~30 bytes per vertex at 6 decimal places, e.g. "[-73.947179,40.72816],"
    return 40 + count * (47 + props) + points * 30
  }
  // Shapefile (zipped): .shp is 56 bytes/lot + 16 bytes/vertex and deflates to ~31%,
  // .shx is 8 bytes/lot (~39%), the space-padded .dbf deflates to roughly a third of its text.
  const shp = 100 + count * 56 + points * 16
  return Math.round(shp * 0.31 + count * 8 * 0.39 + count * (sumAvg * 0.32 + 2) + 1500)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

export interface ExtractResult {
  blob: Blob
  filename: string
  count: number
  sql: string
}

type Props = Record<string, string | number | null>

function toPlain(v: unknown): string | number | null {
  if (v == null) return null
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'number' || typeof v === 'string') return v
  return String(v)
}

export async function extract(opts: {
  parquetUrl: string
  /** file name without extension, see lib/filename.ts */
  basename: string
  clip: ClipGeometry
  columns: string[]
  fields: Field[]
  format: Format
  onStatus?: (status: string) => void
}): Promise<ExtractResult> {
  const { parquetUrl, basename, clip, columns, fields, format, onStatus } = opts
  onStatus?.('Starting query engine…')
  const { db, conn } = await getDb(parquetUrl)
  const base = basename
  const cols = columns.map(quote)

  if (format === 'csv') {
    const sql = `SELECT ${cols.join(', ')}\nFROM lots\nWHERE ${where(clip)}`
    console.log(`PLUTO+ query:\n${sql}`) // eslint-disable-line no-console
    onStatus?.('Fetching lots…')
    const file = `${base}.csv`
    await conn.query(`COPY (${sql}) TO '${file}' (FORMAT csv, HEADER true)`)
    const buf = await db.copyFileToBuffer(file)
    await db.dropFile(file)
    const lines = new TextDecoder().decode(buf).split('\n').filter(Boolean).length - 1
    return {
      blob: new Blob([buf as Uint8Array<ArrayBuffer>], { type: 'text/csv' }),
      filename: file,
      count: lines,
      sql,
    }
  }

  const sql = `SELECT ${[...cols, 'ST_AsGeoJSON(geom) AS __geom'].join(', ')}\nFROM lots\nWHERE ${where(clip)}`
  console.log(`PLUTO+ query:\n${sql}`) // eslint-disable-line no-console
  onStatus?.('Fetching lots…')
  const table = await conn.query(sql)

  onStatus?.('Writing file…')
  const vectors = columns.map((c) => table.getChild(c))
  const geomVec = table.getChild('__geom')
  const features: Feature<Polygon | MultiPolygon | null, Props>[] = new Array(table.numRows)
  for (let i = 0; i < table.numRows; i++) {
    const properties: Props = {}
    columns.forEach((c, j) => { properties[c] = toPlain(vectors[j]?.get(i)) })
    const g = geomVec?.get(i) as string | null
    // Coordinates are stored at 6 decimals; rounding here guarantees it for exports.
    features[i] = { type: 'Feature', properties, geometry: g ? roundGeometry(JSON.parse(g)) : null }
  }

  if (format === 'geojson') {
    const fc: FeatureCollection<Polygon | MultiPolygon | null, Props> = { type: 'FeatureCollection', features }
    return {
      blob: new Blob([JSON.stringify(fc)], { type: 'application/geo+json' }),
      filename: `${base}.geojson`,
      count: features.length,
      sql,
    }
  }

  return {
    blob: toShapefileZip(features, columns, fields, base),
    filename: `${base}_shp.zip`,
    count: features.length,
    sql,
  }
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
