// Shareable app state in the URL query string, e.g.
//   ?map=15.2/40.70312/-73.98871&area=nta&nta=BK0101&cols=bbl,address,yearbuilt
//
//   map    zoom/lat/lng of the map view
//   area   view | nta | draw   (omitted = view)
//   nta    selected Neighborhood Tabulation Area id
//   shape  drawn polygon, "lng,lat;lng,lat;…" (ring closes automatically)
//   cols   comma-separated column names, "all", or empty for none (omitted = default set)
import type { Polygon } from 'geojson'

export type AreaMode = 'view' | 'nta' | 'draw'

export interface UrlState {
  view?: { center: [number, number]; zoom: number }
  area?: AreaMode
  nta?: string
  shape?: Polygon
  /** undefined = default set, 'all' = every column, otherwise explicit names */
  cols?: string[] | 'all'
  /** iframe embed mode (static neighborhood pages) */
  embed?: boolean
}

const num = (s: string) => {
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function readUrlState(search = window.location.search): UrlState {
  const p = new URLSearchParams(search)
  const state: UrlState = {}

  const map = p.get('map')?.split('/').map(num)
  if (map?.length === 3 && map.every((n) => n !== null)) {
    const [zoom, lat, lng] = map as number[]
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) state.view = { center: [lng, lat], zoom }
  }

  const area = p.get('area')
  if (area === 'view' || area === 'nta' || area === 'draw') state.area = area

  const nta = p.get('nta')
  if (nta && /^[A-Z]{2}\d{2,4}$/i.test(nta)) state.nta = nta.toUpperCase()

  const shape = p.get('shape')
  if (shape) {
    const pts = shape.split(';').map((pair) => pair.split(',').map(num))
    if (pts.length >= 3 && pts.every((pt) => pt.length === 2 && pt[0] !== null && pt[1] !== null)) {
      const ring = pts as [number, number][]
      const [first, last] = [ring[0], ring[ring.length - 1]]
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
      if (ring.length >= 4) state.shape = { type: 'Polygon', coordinates: [ring] }
    }
  }

  if (p.has('cols')) {
    const cols = p.get('cols')!.trim()
    state.cols = cols === 'all' ? 'all' : cols.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
  }

  if (p.get('embed') === '1') state.embed = true

  return state
}

export function writeUrlState(state: {
  view?: { center: [number, number]; zoom: number }
  area: AreaMode
  nta?: string
  shape?: Polygon
  cols?: string[] | 'all'
  embed?: boolean
}) {
  // Built by hand so commas, slashes and semicolons stay unescaped and readable.
  const parts: string[] = []
  if (state.view) {
    const [lng, lat] = state.view.center
    parts.push(`map=${+state.view.zoom.toFixed(2)}/${lat.toFixed(5)}/${lng.toFixed(5)}`)
  }
  if (state.area !== 'view') parts.push(`area=${state.area}`)
  if (state.area === 'nta' && state.nta) parts.push(`nta=${encodeURIComponent(state.nta)}`)
  if (state.area === 'draw' && state.shape) {
    const ring = state.shape.coordinates[0].slice(0, -1) // drop the closing point
    parts.push(`shape=${ring.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).join(';')}`)
  }
  if (state.cols !== undefined) {
    parts.push(`cols=${state.cols === 'all' ? 'all' : state.cols.map(encodeURIComponent).join(',')}`)
  }
  if (state.embed) parts.push('embed=1')
  const search = parts.length ? `?${parts.join('&')}` : ''
  const url = `${window.location.pathname}${search}${window.location.hash}`
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, '', url)
  }
}
