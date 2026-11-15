import type { MultiPolygon, Polygon, Position } from 'geojson'

/** Decimal places kept for coordinates everywhere (data, queries, exports, URLs): ~11 cm. */
export const COORD_DECIMALS = 6

const factor = 10 ** COORD_DECIMALS

export const roundCoord = (n: number) => Math.round(n * factor) / factor

const roundRing = (ring: Position[]) => ring.map(([x, y]) => [roundCoord(x), roundCoord(y)])

export function roundGeometry<G extends Polygon | MultiPolygon>(geom: G): G {
  return (geom.type === 'Polygon'
    ? { type: 'Polygon', coordinates: geom.coordinates.map(roundRing) }
    : { type: 'MultiPolygon', coordinates: geom.coordinates.map((p) => p.map(roundRing)) }) as G
}
