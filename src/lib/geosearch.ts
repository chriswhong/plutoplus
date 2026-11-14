// NYC GeoSearch (NYC Planning Labs): address / place autocomplete for the five boroughs.
// https://geosearch.planninglabs.nyc/docs/

const ENDPOINT = 'https://geosearch.planninglabs.nyc/v2/autocomplete'

export interface GeoSearchResult {
  id: string
  /** e.g. "120 BROADWAY, New York, NY" */
  label: string
  /** short name for the map marker, e.g. "120 BROADWAY" */
  name: string
  borough?: string
  center: [number, number]
}

interface Feature {
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { id?: string; gid?: string; label: string; name?: string; borough?: string }
}

export async function geosearch(text: string, signal?: AbortSignal): Promise<GeoSearchResult[]> {
  const res = await fetch(`${ENDPOINT}?text=${encodeURIComponent(text)}`, { signal })
  if (!res.ok) throw new Error(`GeoSearch ${res.status}`)
  const data = (await res.json()) as { features: Feature[] }
  const seen = new Set<string>()
  return data.features
    .filter((f) => f.geometry?.type === 'Point')
    .map((f) => ({
      id: f.properties.gid ?? f.properties.id ?? f.properties.label,
      label: f.properties.label.replace(/, USA$/, ''),
      name: f.properties.name ?? f.properties.label.split(',')[0],
      borough: f.properties.borough,
      center: f.geometry.coordinates,
    }))
    .filter((r) => (seen.has(r.label) ? false : (seen.add(r.label), true)))
}
