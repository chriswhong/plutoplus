// Minimal polygon Shapefile writer (.shp/.shx/.dbf/.prj/.cpg, zipped).
// Written in-house so we control ring orientation, DBF types and nulls.
import { zipSync, strToU8 } from 'fflate'
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson'
import type { Field } from './data'

const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'

type Props = Record<string, string | number | null>
type LotFeature = Feature<Polygon | MultiPolygon | null, Props>

const signedArea = (ring: Position[]) => {
  let a = 0
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return a / 2
}

/** Shapefile wants outer rings clockwise and holes counter-clockwise. */
function shpRings(geom: Polygon | MultiPolygon): Position[][] {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  const rings: Position[][] = []
  for (const poly of polys) {
    poly.forEach((ring, i) => {
      const clockwise = signedArea(ring) < 0
      const wantClockwise = i === 0
      rings.push(clockwise === wantClockwise ? ring : [...ring].reverse())
    })
  }
  return rings
}

interface DbfField {
  key: string
  name: string
  type: 'C' | 'N'
  width: number
  decimals: number
}

const NUMERIC = /INT|DOUBLE|FLOAT|DECIMAL|REAL/

/** Unique, ≤10 character DBF column names. */
function dbfNames(keys: string[]): string[] {
  const used = new Set<string>()
  return keys.map((key) => {
    let name = key.slice(0, 10)
    for (let i = 1; used.has(name); i++) name = key.slice(0, 10 - String(i).length) + i
    used.add(name)
    return name
  })
}

const encoder = new TextEncoder()

function truncateUtf8(s: string, max: number): Uint8Array {
  let bytes = encoder.encode(s)
  if (bytes.length <= max) return bytes
  // back off to a character boundary
  let end = max
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--
  bytes = bytes.slice(0, end)
  return bytes
}

function formatNumber(v: number, decimals: number) {
  return decimals ? v.toFixed(decimals) : String(Math.round(v))
}

function planDbf(features: LotFeature[], keys: string[], fields: Field[]): DbfField[] {
  const typeOf = new Map(fields.map((f) => [f.name, f.type]))
  const names = dbfNames(keys)
  return keys.map((key, i) => {
    const numeric = NUMERIC.test(typeOf.get(key) ?? '')
    if (!numeric) {
      let width = 1
      for (const f of features) {
        const v = f.properties[key]
        if (v != null) width = Math.max(width, encoder.encode(String(v)).length)
      }
      return { key, name: names[i], type: 'C', width: Math.min(width, 254), decimals: 0 }
    }
    let decimals = 0
    for (const f of features) {
      const v = f.properties[key]
      if (typeof v === 'number' && !Number.isInteger(v)) {
        const s = String(v)
        const d = s.includes('e') ? 6 : s.length - s.indexOf('.') - 1
        decimals = Math.max(decimals, Math.min(d, 6))
      }
    }
    let width = 1
    for (const f of features) {
      const v = f.properties[key]
      if (typeof v === 'number') width = Math.max(width, formatNumber(v, decimals).length)
    }
    return { key, name: names[i], type: 'N', width: Math.min(width, 20), decimals }
  })
}

function writeDbf(features: LotFeature[], dbf: DbfField[]): Uint8Array {
  const headerLen = 32 + dbf.length * 32 + 1
  const recordLen = 1 + dbf.reduce((a, f) => a + f.width, 0)
  const buf = new Uint8Array(headerLen + recordLen * features.length + 1)
  const view = new DataView(buf.buffer)
  const now = new Date()
  buf[0] = 0x03
  buf[1] = now.getFullYear() - 1900
  buf[2] = now.getMonth() + 1
  buf[3] = now.getDate()
  view.setUint32(4, features.length, true)
  view.setUint16(8, headerLen, true)
  view.setUint16(10, recordLen, true)
  dbf.forEach((f, i) => {
    const o = 32 + i * 32
    buf.set(encoder.encode(f.name), o)
    buf[o + 11] = f.type.charCodeAt(0)
    buf[o + 16] = f.width
    buf[o + 17] = f.decimals
  })
  buf[headerLen - 1] = 0x0d

  const space = 0x20
  let o = headerLen
  for (const feat of features) {
    buf.fill(space, o, o + recordLen) // deletion flag + blank (null) values
    let p = o + 1
    for (const f of dbf) {
      const v = feat.properties[f.key]
      if (v != null) {
        if (f.type === 'C') {
          buf.set(truncateUtf8(String(v), f.width), p)
        } else if (typeof v === 'number' && Number.isFinite(v)) {
          const s = formatNumber(v, f.decimals).slice(0, f.width)
          buf.set(encoder.encode(s), p + f.width - s.length) // right-justify
        }
      }
      p += f.width
    }
    o += recordLen
  }
  buf[o] = 0x1a
  return buf
}

function writeShpShx(features: LotFeature[]) {
  const records = features.map((f) => {
    if (!f.geometry) return null
    const rings = shpRings(f.geometry)
    const points = rings.reduce((a, r) => a + r.length, 0)
    return { rings, points, bytes: 44 + 4 * rings.length + 16 * points }
  })
  const shpLen = 100 + records.reduce((a, r) => a + 8 + (r ? r.bytes : 4), 0)
  const shxLen = 100 + 8 * records.length
  const shp = new DataView(new ArrayBuffer(shpLen))
  const shx = new DataView(new ArrayBuffer(shxLen))

  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity
  for (const r of records) {
    if (!r) continue
    for (const ring of r.rings) {
      for (const [x, y] of ring) {
        if (x < xmin) xmin = x
        if (x > xmax) xmax = x
        if (y < ymin) ymin = y
        if (y > ymax) ymax = y
      }
    }
  }
  if (!Number.isFinite(xmin)) xmin = ymin = xmax = ymax = 0

  for (const [view, len] of [[shp, shpLen], [shx, shxLen]] as const) {
    view.setInt32(0, 9994)
    view.setInt32(24, len / 2)
    view.setInt32(28, 1000, true)
    view.setInt32(32, 5, true) // Polygon
    view.setFloat64(36, xmin, true)
    view.setFloat64(44, ymin, true)
    view.setFloat64(52, xmax, true)
    view.setFloat64(60, ymax, true)
  }

  let o = 100
  records.forEach((r, i) => {
    const contentBytes = r ? r.bytes : 4
    shx.setInt32(100 + i * 8, o / 2)
    shx.setInt32(104 + i * 8, contentBytes / 2)
    shp.setInt32(o, i + 1)
    shp.setInt32(o + 4, contentBytes / 2)
    o += 8
    if (!r) {
      shp.setInt32(o, 0, true) // Null shape
      o += 4
      return
    }
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity
    for (const ring of r.rings) for (const [x, y] of ring) {
      if (x < bx0) bx0 = x
      if (x > bx1) bx1 = x
      if (y < by0) by0 = y
      if (y > by1) by1 = y
    }
    shp.setInt32(o, 5, true)
    shp.setFloat64(o + 4, bx0, true)
    shp.setFloat64(o + 12, by0, true)
    shp.setFloat64(o + 20, bx1, true)
    shp.setFloat64(o + 28, by1, true)
    shp.setInt32(o + 36, r.rings.length, true)
    shp.setInt32(o + 40, r.points, true)
    let partStart = 0
    r.rings.forEach((ring, j) => {
      shp.setInt32(o + 44 + j * 4, partStart, true)
      partStart += ring.length
    })
    let p = o + 44 + r.rings.length * 4
    for (const ring of r.rings) for (const [x, y] of ring) {
      shp.setFloat64(p, x, true)
      shp.setFloat64(p + 8, y, true)
      p += 16
    }
    o += r.bytes
  })

  return { shp: new Uint8Array(shp.buffer), shx: new Uint8Array(shx.buffer) }
}

/** Build a zipped polygon Shapefile from lot features. */
export function toShapefileZip(
  features: LotFeature[],
  keys: string[],
  fields: Field[],
  basename = 'pluto',
): Blob {
  const dbfFields = planDbf(features, keys, fields)
  const { shp, shx } = writeShpShx(features)
  const files: Record<string, Uint8Array> = {
    [`${basename}.shp`]: shp,
    [`${basename}.shx`]: shx,
    [`${basename}.dbf`]: writeDbf(features, dbfFields),
    [`${basename}.prj`]: strToU8(WGS84_PRJ),
    [`${basename}.cpg`]: strToU8('UTF-8'),
  }
  const renamed = dbfFields.filter((f) => f.name !== f.key)
  if (renamed.length) {
    files['field_names.txt'] = strToU8(
      'Shapefile column names are limited to 10 characters. Renamed columns:\n' +
        renamed.map((f) => `${f.name}\t${f.key}`).join('\n') + '\n',
    )
  }
  const zipped = zipSync(files, { level: 6 })
  return new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
}
