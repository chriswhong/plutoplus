// Where the static data lives, and the small JSON files that describe it.
// See scripts/build-data.sh for how these files are produced.

export interface Manifest {
  version: string
  count: number
  built: string
  parquet: string
  pmtiles: string
  fields: string
  nta: string
  /** Protomaps NYC extract */
  basemap: string
}

export interface Field {
  name: string
  type: string
  description: string
  /** citywide average text length of the column's values (for size estimates) */
  avgLength?: number
}

const configured = import.meta.env.VITE_DATA_BASE_URL as string | undefined

/** Absolute base URL for data files. DuckDB-WASM and PMTiles both need absolute URLs. */
export const DATA_BASE_URL = new URL(
  (configured ?? './data').replace(/\/?$/, '/'),
  window.location.href,
).href

export const dataUrl = (path: string) => new URL(path, DATA_BASE_URL).href

export async function loadManifest(): Promise<Manifest> {
  const res = await fetch(dataUrl('latest.json'), { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Could not load data manifest (${res.status})`)
  return { basemap: 'basemap.pmtiles', ...(await res.json()) }
}

export async function loadFields(manifest: Manifest): Promise<Field[]> {
  const res = await fetch(dataUrl(manifest.fields))
  if (!res.ok) throw new Error(`Could not load field list (${res.status})`)
  return res.json()
}

/** Columns pre-checked on first load: the ones most people want. */
export const DEFAULT_FIELDS = [
  'bbl', 'borough', 'block', 'lot', 'address', 'zonedist1', 'bldgclass',
  'landuse', 'ownername', 'lotarea', 'bldgarea', 'numfloors', 'unitsres',
  'unitstotal', 'yearbuilt',
]
