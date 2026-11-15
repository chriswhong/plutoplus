// Download file naming:  pluto-<version>_<area>_<YYYYMMDD-HHMMSS>
//
//   pluto-26v2_mapview_20261114-174233.csv
//   pluto-26v2_polygon_20261114-174233.geojson
//   pluto-26v2_rectangle_20261114-174233_shp.zip
//   pluto-26v2_nta-bk0101-greenpoint_20261114-174233.geojson
//
// The timestamp is local time, so repeated downloads of the same area never collide and
// sort chronologically.

export type AreaKind = 'view' | 'nta' | 'polygon' | 'rectangle'

export interface AreaRef {
  kind: AreaKind
  /** NTA id and name, for kind === 'nta' */
  ntaId?: string
  ntaName?: string
}

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const pad = (n: number) => String(n).padStart(2, '0')

export function timestamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function areaPart(area: AreaRef) {
  switch (area.kind) {
    case 'view': return 'mapview'
    case 'polygon': return 'polygon'
    case 'rectangle': return 'rectangle'
    case 'nta': {
      const name = area.ntaName ? slug(area.ntaName).slice(0, 40).replace(/-$/, '') : ''
      return ['nta', area.ntaId?.toLowerCase(), name].filter(Boolean).join('-')
    }
  }
}

export function exportBasename(version: string, area: AreaRef, when = new Date()) {
  return `pluto-${version}_${areaPart(area)}_${timestamp(when)}`
}
