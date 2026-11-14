// Generates the static, crawlable pages that sit next to the app:
//   /neighborhoods/                          index of boroughs + all neighborhoods
//   /neighborhoods/<borough>/                one page per borough
//   /neighborhoods/<borough>/<id>-<name>/    one page per 2020 NTA, with the downloader embedded
// plus sitemap.xml, robots.txt, llms.txt and 404.html.
//
// Run after `vite build` (see package.json):  node --experimental-strip-types scripts/build-pages.ts [outDir]
//
// Data comes from the pipeline output (latest.json → nta-stats.json, borough-stats.json, fields.json):
// read from public/data when present (local dev), otherwise fetched from VITE_DATA_BASE_URL.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { FIELD_GROUPS } from '../src/lib/fieldGroups.ts'

// ---------------------------------------------------------------------------- config

function readDotEnv(): Record<string, string> {
  if (!existsSync('.env')) return {}
  return Object.fromEntries(
    readFileSync('.env', 'utf8').split('\n')
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
  )
}
const env = { ...readDotEnv(), ...process.env }
const SITE_URL = (env.VITE_SITE_URL ?? 'https://chriswhong.github.io/plutoplus/').replace(/\/?$/, '/')
const OUT = process.argv[2] ?? 'dist'
const DCP_URL = 'https://www.nyc.gov/content/planning/pages/resources/datasets/mappluto-pluto-change'
const NTA_INFO_URL = 'https://www.nyc.gov/content/planning/pages/resources/datasets/neighborhood-tabulation'
const REPO_URL = 'https://github.com/chriswhong/plutoplus'

async function loadJson<T>(path: string): Promise<T> {
  const local = join('public/data', path)
  if (existsSync(local)) return JSON.parse(readFileSync(local, 'utf8'))
  const base = env.VITE_DATA_BASE_URL
  if (!base) throw new Error(`No local ${local} and VITE_DATA_BASE_URL is not set`)
  const res = await fetch(new URL(path, base.replace(/\/?$/, '/')))
  if (!res.ok) throw new Error(`Fetching ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------- data types

interface Manifest { version: string; count: number; built: string; fields: string; ntaStats: string; boroughStats: string }
interface Field { name: string; type: string; description: string }
interface Summary {
  lots: number; units_res: number | null; units_total: number | null; bldg_area: number | null; lot_area: number | null
  buildings: number | null; median_year_built: number | null; oldest_year_built: number | null; avg_floors: number | null
  lots_floodplain: number | null; landmark_lots: number | null
  landuse: { code: string; lots: number }[]; zoning: { district: string; lots: number }[]
}
interface NtaStats extends Summary {
  id: string; name: string; borough: string; cdta: string; ntatype: number
  bbox: [number, number, number, number]; historic_districts: string[]
}
interface BoroughStats extends Summary { code: string }

// ---------------------------------------------------------------------------- vocab

const BOROUGHS: Record<string, { name: string; slug: string; code: string; county: string }> = {
  MN: { name: 'Manhattan', slug: 'manhattan', code: 'MN', county: 'New York County' },
  BX: { name: 'Bronx', slug: 'bronx', code: 'BX', county: 'Bronx County' },
  BK: { name: 'Brooklyn', slug: 'brooklyn', code: 'BK', county: 'Kings County' },
  QN: { name: 'Queens', slug: 'queens', code: 'QN', county: 'Queens County' },
  SI: { name: 'Staten Island', slug: 'staten-island', code: 'SI', county: 'Richmond County' },
}
const boroughByName = (name: string) => Object.values(BOROUGHS).find((b) => b.name === name)!
const theBorough = (name: string) => (name === 'Bronx' ? 'the Bronx' : name)

const LAND_USE: Record<string, string> = {
  '01': 'One & two family buildings',
  '02': 'Multi-family walk-up buildings',
  '03': 'Multi-family elevator buildings',
  '04': 'Mixed residential & commercial',
  '05': 'Commercial & office',
  '06': 'Industrial & manufacturing',
  '07': 'Transportation & utility',
  '08': 'Public facilities & institutions',
  '09': 'Open space & outdoor recreation',
  '10': 'Parking facilities',
  '11': 'Vacant land',
}

const NTA_TYPES: Record<number, { label: string; group: string }> = {
  0: { label: 'neighborhood', group: 'Residential neighborhoods' },
  5: { label: 'correctional facility area', group: 'Special areas' },
  6: { label: 'special area', group: 'Special areas' },
  7: { label: 'cemetery area', group: 'Cemeteries' },
  8: { label: 'airport', group: 'Airports' },
  9: { label: 'park area', group: 'Parks' },
}

// ---------------------------------------------------------------------------- helpers

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const nf = new Intl.NumberFormat('en-US')
const n = (v: number | null | undefined) => nf.format(v ?? 0)
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)
const sqft = (v: number | null | undefined) => {
  const x = v ?? 0
  if (x >= 1e9) return `${(x / 1e9).toFixed(1)} billion sq ft`
  if (x >= 1e6) return `${(x / 1e6).toFixed(1)} million sq ft`
  return `${nf.format(x)} sq ft`
}
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const ntaSlug = (t: NtaStats) => `${t.id.toLowerCase()}-${slugify(t.name)}`
const ntaPath = (t: NtaStats) => `neighborhoods/${boroughByName(t.borough).slug}/${ntaSlug(t)}/`
const boroughPath = (code: string) => `neighborhoods/${BOROUGHS[code].slug}/`
const abs = (path: string) => SITE_URL + path
const listJoin = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
const truncate = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…')

/** "BK01 Williamsburg-Greenpoint (CD 1 Equivalent)" → "BK01 Williamsburg-Greenpoint" */
const cdtaName = (cdta: string) => cdta.replace(/\s*\(.*\)\s*$/, '')

const unionBbox = (list: NtaStats[]): [number, number, number, number] => [
  Math.min(...list.map((x) => x.bbox[0])), Math.min(...list.map((x) => x.bbox[1])),
  Math.max(...list.map((x) => x.bbox[2])), Math.max(...list.map((x) => x.bbox[3])),
]

/** Map view for the embedded downloader: bbox center, zoom that roughly fits the ~420×480px map area of the embedded app. */
function embedView(bbox: [number, number, number, number]) {
  const [w, s, e, nn] = bbox
  const lng = (w + e) / 2
  const lat = (s + nn) / 2
  const dLng = Math.max(e - w, 0.002)
  const dLat = Math.max(nn - s, 0.002) / Math.cos((lat * Math.PI) / 180)
  const zoom = Math.min(Math.log2((420 * 360) / (256 * dLng)), Math.log2((480 * 360) / (256 * dLat)))
  return `${Math.max(10, Math.min(16.5, zoom)).toFixed(2)}/${lat.toFixed(5)}/${lng.toFixed(5)}`
}

function write(path: string, content: string) {
  const file = join(OUT, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

// ---------------------------------------------------------------------------- page shell

interface PageOpts {
  path: string // site-relative, e.g. "neighborhoods/brooklyn/"
  title: string
  description: string
  h1: string
  breadcrumbs: { name: string; path: string }[]
  body: string
  jsonld: object[]
  navCurrent?: 'neighborhoods'
}

function page(o: PageOpts, manifest: Manifest) {
  const depth = o.path.split('/').filter(Boolean).length
  const root = '../'.repeat(depth) || './'
  const url = abs(o.path)
  const crumbs = [{ name: 'PLUTO+', path: '' }, ...o.breadcrumbs]
  const breadcrumbLd = {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: abs(c.path) })),
  }
  const ld = { '@context': 'https://schema.org', '@graph': [breadcrumbLd, ...o.jsonld] }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#0f172a">
<meta name="color-scheme" content="dark">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${root}favicon.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="${root}apple-touch-icon.png">
<link rel="manifest" href="${root}site.webmanifest">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PLUTO+">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(abs('og-image.png'))}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="PLUTO+: NYC tax lot data, clipped to your area.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.title)}">
<meta name="twitter:description" content="${esc(o.description)}">
<meta name="twitter:image" content="${esc(abs('og-image.png'))}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${root}site.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="inner">
    <a class="brand" href="${root}">PLUTO<span>+</span><span class="sr-only"> home</span></a>
    <nav class="site-nav" aria-label="Site">
      <a href="${root}neighborhoods/"${o.navCurrent === 'neighborhoods' ? ' aria-current="page"' : ''}>Neighborhoods</a>
      <a href="${root}">Downloader</a>
    </nav>
  </div>
</header>
<main id="main">
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <ol>
${crumbs.map((c, i) => i === crumbs.length - 1
    ? `      <li><span aria-current="page">${esc(c.name)}</span></li>`
    : `      <li><a href="${root}${c.path}">${esc(c.name)}</a></li>`).join('\n')}
    </ol>
  </nav>
  <h1>${o.h1}</h1>
${o.body}
</main>
<footer class="site-footer">
  <div class="inner">
    <p>Data: <a href="${DCP_URL}">MapPLUTO ${esc(manifest.version)}</a> from the NYC Department of City Planning; neighborhood boundaries are DCP’s <a href="${NTA_INFO_URL}">2020 Neighborhood Tabulation Areas</a>. Stats count each lot once, in the neighborhood containing its center. Page built ${esc(manifest.built.slice(0, 10))}.</p>
    <p><a href="${root}">PLUTO+ downloader</a> · <a href="${root}neighborhoods/">All neighborhoods</a> · <a href="${REPO_URL}">Source on GitHub</a></p>
  </div>
</footer>
</body>
</html>
`
}

// ---------------------------------------------------------------------------- shared fragments

function statsList(s: Summary, extra: [string, string][] = []) {
  const rows: [string, string][] = [
    ['Tax lots', n(s.lots)],
    ['Residential units', n(s.units_res)],
    ['Buildings', n(s.buildings)],
    ['Building floor area', sqft(s.bldg_area)],
    ...(s.median_year_built ? [['Median year built', String(s.median_year_built)] as [string, string]] : []),
    ...(s.avg_floors ? [['Average floors', String(s.avg_floors)] as [string, string]] : []),
    ...extra,
  ]
  return `<dl class="stats">\n${rows.map(([k, v]) => `    <div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n')}\n  </dl>`
}

function landUseTable(s: Summary, caption: string) {
  if (!s.landuse.length) return ''
  const total = s.landuse.reduce((a, r) => a + r.lots, 0)
  const max = Math.max(...s.landuse.map((r) => r.lots))
  return `<table>
    <caption>${esc(caption)}</caption>
    <thead><tr><th scope="col">Land use</th><th scope="col" class="num">Lots</th><th scope="col" class="num">Share</th></tr></thead>
    <tbody>
${s.landuse.map((r) => `      <tr><th scope="row"><span class="bar" style="width:${Math.max(2, Math.round((r.lots / max) * 60))}px" aria-hidden="true"></span>${esc(LAND_USE[r.code] ?? `Code ${r.code}`)}</th><td class="num">${n(r.lots)}</td><td class="num">${pct(r.lots, total)}%</td></tr>`).join('\n')}
    </tbody>
  </table>`
}

function zoningTable(s: Summary, caption: string) {
  if (!s.zoning.length) return ''
  return `<table>
    <caption>${esc(caption)}</caption>
    <thead><tr><th scope="col">Zoning district</th><th scope="col" class="num">Lots</th><th scope="col" class="num">Share</th></tr></thead>
    <tbody>
${s.zoning.map((r) => `      <tr><th scope="row">${esc(r.district)}</th><td class="num">${n(r.lots)}</td><td class="num">${pct(r.lots, s.lots)}%</td></tr>`).join('\n')}
    </tbody>
  </table>`
}

const topicsList = () => `<ul class="topics">
${FIELD_GROUPS.map((g) => `    <li><strong>${esc(g.label)}</strong>${esc(g.hint)}<br><code>${esc(g.fields.slice(0, 6).join(', '))}${g.fields.length > 6 ? ', …' : ''}</code></li>`).join('\n')}
  </ul>`

function dataset(o: { url: string; name: string; description: string; place: object; manifest: Manifest; fields: Field[] }) {
  return {
    '@type': 'Dataset',
    '@id': `${o.url}#dataset`,
    name: o.name,
    description: o.description,
    url: o.url,
    isAccessibleForFree: true,
    version: o.manifest.version,
    dateModified: o.manifest.built.slice(0, 10),
    keywords: ['NYC', 'MapPLUTO', 'PLUTO', 'tax lots', 'zoning', 'land use', 'GIS', 'open data'],
    creator: { '@type': 'GovernmentOrganization', name: 'NYC Department of City Planning', url: 'https://www.nyc.gov/site/planning/index.page' },
    isBasedOn: DCP_URL,
    spatialCoverage: o.place,
    variableMeasured: o.fields.map((f) => f.name),
    // No `distribution`: files are generated in the browser on demand, so there is no static contentUrl.
  }
}

// ---------------------------------------------------------------------------- pages

function ntaPage(t: NtaStats, all: NtaStats[], manifest: Manifest, fields: Field[]) {
  const b = boroughByName(t.borough)
  const type = NTA_TYPES[t.ntatype] ?? NTA_TYPES[6]
  const path = ntaPath(t)
  const url = abs(path)
  const totalLu = t.landuse.reduce((a, r) => a + r.lots, 0)
  const lu = t.landuse.slice(0, 2).map((r) => `${esc((LAND_USE[r.code] ?? r.code).toLowerCase())} (${pct(r.lots, totalLu)}%)`)
  const topZone = t.zoning[0]
  const flood = t.lots_floodplain ?? 0

  const facts: string[] = []
  if (t.lots > 0) {
    facts.push(`MapPLUTO ${manifest.version} lists about <strong>${n(t.lots)} tax lots</strong> here${t.units_res ? `, with ${n(t.units_res)} residential units` : ''}${t.median_year_built ? ` and a median year built of ${t.median_year_built}` : ''}.`)
    if (lu.length) facts.push(`The most common land use is ${lu[0]}${lu[1] ? `, followed by ${lu[1]}` : ''}.`)
    if (topZone) facts.push(`The most common zoning district is ${esc(topZone.district)} (${pct(topZone.lots, t.lots)}% of lots).`)
    if (flood) facts.push(`${n(flood)} lots (${pct(flood, t.lots)}%) fall at least partly in FEMA’s 2015 preliminary 1% annual-chance floodplain.`)
    if (t.historic_districts.length) facts.push(`It includes parts of ${listJoin(t.historic_districts.map(esc))}.`)
  }

  const title = `${t.name}, ${t.borough} Tax Lot Data | PLUTO+`
  const description = t.lots > 0
    ? truncate(`Download MapPLUTO tax lots for ${t.name}, ${t.borough}: ~${n(t.lots)} lots with zoning, land use, building and ownership data as GeoJSON, CSV or Shapefile. Free.`, 160)
    : truncate(`${t.name}, ${t.borough} (${t.id}): a ${type.label} with no MapPLUTO tax lots. Browse nearby neighborhoods to download tax lot data.`, 160)

  const siblings = all.filter((x) => x.borough === t.borough && x.id !== t.id && x.ntatype === 0)
  const iframeSrc = `../../../?map=${embedView(t.bbox)}&area=nta&nta=${t.id}&embed=1`
  const appLink = `../../../?map=${embedView(t.bbox)}&area=nta&nta=${t.id}`

  const body = `  <p class="lede">${esc(t.name)} is a ${esc(type.label)} in ${esc(theBorough(t.borough))}, New York City (2020 NTA <strong>${esc(t.id)}</strong>, part of community district tabulation area ${esc(cdtaName(t.cdta))}). ${facts.join(' ')}</p>
${t.lots > 0 ? `
  <section aria-labelledby="download">
    <h2 id="download">Download ${esc(t.name)} tax lots</h2>
    <p>The downloader below is preset to ${esc(t.name)}. Choose the columns you need, then download GeoJSON, CSV or a zipped Shapefile. Everything runs in your browser; there’s no sign-up. You can also <a href="${esc(appLink)}">open it full screen</a>.</p>
    <div class="embed">
      <iframe src="${esc(iframeSrc)}" title="PLUTO+ downloader preset to ${esc(t.name)}, ${esc(t.borough)}" loading="lazy" allow="fullscreen"></iframe>
    </div>
    <p class="embed-caption">Downloads include every lot that touches the neighborhood boundary, so the count can be slightly higher than the figures on this page.</p>
  </section>

  <section aria-labelledby="glance">
    <h2 id="glance">${esc(t.name)} at a glance</h2>
    ${statsList(t, [
      ...(t.oldest_year_built ? [['Oldest year built', String(t.oldest_year_built)] as [string, string]] : []),
      ['Lots in 2015 floodplain', n(flood)],
      ['Landmark lots', n(t.landmark_lots)],
    ])}
    <div class="two-col">
      <div>
        <h3>Land use</h3>
        ${landUseTable(t, `Tax lots in ${t.name} by DCP land use category`)}
      </div>
      <div>
        <h3>Zoning</h3>
        ${zoningTable(t, `Most common primary zoning districts in ${t.name}`)}
      </div>
    </div>
  </section>` : `
  <p class="note">There are no MapPLUTO tax lots inside this ${esc(type.label)}. Try a nearby neighborhood below, or <a href="../../../">draw your own area</a> in the downloader.</p>`}

  <section aria-labelledby="columns">
    <h2 id="columns">What’s in the data</h2>
    <p>MapPLUTO has ${fields.length} columns per tax lot, grouped here by topic. Pick any combination in the downloader. Descriptions for each column are in the app.</p>
    ${topicsList()}
  </section>

  <section aria-labelledby="nearby">
    <h2 id="nearby">Other neighborhoods in ${esc(theBorough(t.borough))}</h2>
    <ul class="link-grid">
${siblings.map((x) => `      <li><a href="../${ntaSlug(x)}/">${esc(x.name)}</a><span class="count">${n(x.lots)} lots</span></li>`).join('\n')}
    </ul>
    <p><a href="../">All of ${esc(theBorough(t.borough))}</a> · <a href="../../">All boroughs</a></p>
  </section>`

  const place = {
    '@type': 'Place',
    name: `${t.name}, ${t.borough}, New York, NY`,
    containedInPlace: { '@type': 'AdministrativeArea', name: `${b.name}, New York City` },
    geo: { '@type': 'GeoShape', box: `${t.bbox[1]} ${t.bbox[0]} ${t.bbox[3]} ${t.bbox[2]}` },
  }
  const jsonld = [
    {
      '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title, description,
      inLanguage: 'en', dateModified: manifest.built.slice(0, 10),
      isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}#website`, name: 'PLUTO+', url: SITE_URL },
      about: place,
      primaryImageOfPage: abs('og-image.png'),
    },
    ...(t.lots > 0 ? [dataset({
      url,
      name: `MapPLUTO ${manifest.version} tax lots: ${t.name}, ${t.borough}`,
      description: `Tax lot (MapPLUTO) data for ${t.name}, ${t.borough} (NYC 2020 NTA ${t.id}): about ${n(t.lots)} lots with zoning, land use, building, ownership and assessment attributes, downloadable as GeoJSON, CSV or Shapefile.`,
      place, manifest, fields,
    })] : []),
  ]

  return {
    path,
    html: page({
      path, title, description,
      h1: `${esc(t.name)} tax lot data`,
      breadcrumbs: [{ name: 'Neighborhoods', path: 'neighborhoods/' }, { name: b.name, path: boroughPath(b.code) }, { name: t.name, path }],
      body, jsonld, navCurrent: 'neighborhoods',
    }, manifest),
  }
}

function boroughPage(code: string, s: BoroughStats, ntas: NtaStats[], manifest: Manifest, fields: Field[]) {
  const b = BOROUGHS[code]
  const path = boroughPath(code)
  const url = abs(path)
  const mine = ntas.filter((x) => x.borough === b.name)
  const groups = new Map<string, NtaStats[]>()
  for (const t of mine) {
    const g = (NTA_TYPES[t.ntatype] ?? NTA_TYPES[6]).group
    groups.set(g, [...(groups.get(g) ?? []), t])
  }
  const order = ['Residential neighborhoods', 'Parks', 'Cemeteries', 'Airports', 'Special areas']
  const totalLu = s.landuse.reduce((a, r) => a + r.lots, 0)
  const topLu = s.landuse[0]
  const title = `${b.name} Tax Lot Data by Neighborhood | PLUTO+`
  const description = truncate(`${b.name} has ${n(s.lots)} tax lots across ${mine.length} neighborhood areas. Browse stats and download MapPLUTO data for any ${b.name} neighborhood as GeoJSON, CSV or Shapefile.`, 160)

  const body = `  <p class="lede">${esc(theBorough(b.name)).replace(/^t/, 'T')} (${esc(b.county)}) has <strong>${n(s.lots)} tax lots</strong> in MapPLUTO ${esc(manifest.version)}, with ${n(s.units_res)} residential units and ${sqft(s.bldg_area)} of building floor area. ${topLu ? `The most common land use is ${esc((LAND_USE[topLu.code] ?? topLu.code).toLowerCase())} (${pct(topLu.lots, totalLu)}% of lots).` : ''} Pick a neighborhood below to see its stats and download its tax lots.</p>
  <p><a class="button" href="../../?map=${embedView(unionBbox(mine))}&amp;area=nta">Open the downloader in ${esc(theBorough(b.name))}</a></p>

  <section aria-labelledby="neighborhoods">
    <h2 id="neighborhoods">Neighborhoods in ${esc(theBorough(b.name))}</h2>
${order.filter((g) => groups.has(g)).map((g) => `    <h3>${esc(g)}</h3>
    <ul class="link-grid">
${groups.get(g)!.sort((x, y) => x.name.localeCompare(y.name)).map((x) => `      <li><a href="${ntaSlug(x)}/">${esc(x.name)}</a><span class="count">${n(x.lots)} lots</span></li>`).join('\n')}
    </ul>`).join('\n')}
  </section>

  <section aria-labelledby="glance">
    <h2 id="glance">${esc(b.name)} at a glance</h2>
    ${statsList(s, [['Lots in 2015 floodplain', n(s.lots_floodplain)], ['Landmark lots', n(s.landmark_lots)]])}
    <div class="two-col">
      <div>
        <h3>Land use</h3>
        ${landUseTable(s, `Tax lots in ${b.name} by DCP land use category`)}
      </div>
      <div>
        <h3>Zoning</h3>
        ${zoningTable(s, `Most common primary zoning districts in ${b.name}`)}
      </div>
    </div>
  </section>

  <section aria-labelledby="columns">
    <h2 id="columns">What’s in the data</h2>
    <p>Each tax lot has ${fields.length} MapPLUTO columns. Choose any combination in the downloader.</p>
    ${topicsList()}
  </section>`

  const place = { '@type': 'AdministrativeArea', name: `${b.name}, New York City`, alternateName: b.county }
  return {
    path,
    html: page({
      path, title, description,
      h1: `${esc(b.name)} tax lot data`,
      breadcrumbs: [{ name: 'Neighborhoods', path: 'neighborhoods/' }, { name: b.name, path }],
      body,
      jsonld: [
        {
          '@type': 'CollectionPage', '@id': `${url}#webpage`, url, name: title, description, inLanguage: 'en',
          isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}#website` }, about: place,
          mainEntity: {
            '@type': 'ItemList', numberOfItems: mine.length,
            itemListElement: mine.map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.name, url: abs(ntaPath(x)) })),
          },
        },
        dataset({
          url, name: `MapPLUTO ${manifest.version} tax lots: ${b.name}`,
          description: `Tax lot (MapPLUTO) data for ${b.name}, New York City: ${n(s.lots)} lots with zoning, land use, building, ownership and assessment attributes, downloadable by neighborhood.`,
          place, manifest, fields,
        }),
      ],
      navCurrent: 'neighborhoods',
    }, manifest),
  }
}

function indexPage(boroughs: BoroughStats[], ntas: NtaStats[], manifest: Manifest) {
  const path = 'neighborhoods/'
  const url = abs(path)
  const title = `NYC Tax Lot Data by Borough & Neighborhood | PLUTO+`
  const description = truncate(`Browse NYC’s ${n(manifest.count)} tax lots by borough and all ${ntas.length} 2020 neighborhood areas, then download MapPLUTO data as GeoJSON, CSV or Shapefile.`, 160)
  const order = ['MN', 'BX', 'BK', 'QN', 'SI']
  const byCode = new Map(boroughs.map((b) => [b.code, b]))
  const body = `  <p class="lede">MapPLUTO, the NYC Department of City Planning’s tax lot dataset, covers ${n(manifest.count)} lots citywide. Pick a borough or neighborhood to see summary stats and download just that area’s tax lots, with only the columns you need.</p>

  <section aria-labelledby="boroughs">
    <h2 id="boroughs">Boroughs</h2>
    <ul class="cards">
${order.filter((c) => byCode.has(c)).map((c) => {
    const s = byCode.get(c)!
    return `      <li><a href="${BOROUGHS[c].slug}/"><strong>${esc(BOROUGHS[c].name)}</strong>${n(s.lots)} tax lots · ${ntas.filter((x) => x.borough === BOROUGHS[c].name).length} neighborhoods</a></li>`
  }).join('\n')}
    </ul>
  </section>

  <section aria-labelledby="how">
    <h2 id="how">How to download tax lot data for a neighborhood</h2>
    <ol class="steps">
      <li>Open a neighborhood page below (or the <a href="../">full downloader</a>).</li>
      <li>Choose the columns you need: browse by topic (zoning, buildings, ownership…) or alphabetically.</li>
      <li>Download GeoJSON, CSV or a Shapefile. The file is built in your browser; no account needed.</li>
    </ol>
  </section>

  <section aria-labelledby="all">
    <h2 id="all">All neighborhoods</h2>
${order.map((c) => {
    const list = ntas.filter((x) => x.borough === BOROUGHS[c].name).sort((x, y) => x.name.localeCompare(y.name))
    return `    <h3><a href="${BOROUGHS[c].slug}/">${esc(BOROUGHS[c].name)}</a></h3>
    <ul class="link-grid">
${list.map((x) => `      <li><a href="${BOROUGHS[c].slug}/${ntaSlug(x)}/">${esc(x.name)}</a><span class="count">${n(x.lots)} lots</span></li>`).join('\n')}
    </ul>`
  }).join('\n')}
  </section>`

  return {
    path,
    html: page({
      path, title, description,
      h1: 'NYC tax lot data by neighborhood',
      breadcrumbs: [{ name: 'Neighborhoods', path }],
      body,
      jsonld: [{
        '@type': 'CollectionPage', '@id': `${url}#webpage`, url, name: title, description, inLanguage: 'en',
        isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}#website` },
        about: { '@type': 'Place', name: 'New York City' },
        mainEntity: {
          '@type': 'ItemList', numberOfItems: order.length,
          itemListElement: order.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: BOROUGHS[c].name, url: abs(boroughPath(c)) })),
        },
      }],
      navCurrent: 'neighborhoods',
    }, manifest),
  }
}

// ---------------------------------------------------------------------------- run

const manifest = await loadJson<Manifest>('latest.json')
if (!manifest.ntaStats || !manifest.boroughStats) {
  throw new Error('latest.json has no ntaStats/boroughStats; rebuild the data with scripts/build-data.sh')
}
const [ntas, boroughs, fields] = await Promise.all([
  loadJson<NtaStats[]>(manifest.ntaStats),
  loadJson<BoroughStats[]>(manifest.boroughStats),
  loadJson<Field[]>(manifest.fields),
])

const pages = [
  indexPage(boroughs, ntas, manifest),
  ...boroughs.map((s) => boroughPage(s.code, s, ntas, manifest, fields)),
  ...ntas.map((t) => ntaPage(t, ntas, manifest, fields)),
]
for (const p of pages) write(`${p.path}index.html`, p.html)

const lastmod = manifest.built.slice(0, 10)
const urls = ['', ...pages.map((p) => p.path)]
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((p) => `  <url><loc>${esc(abs(p))}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}
</urlset>
`)

write('robots.txt', `# PLUTO+ (${SITE_URL})
User-agent: *
Allow: /

Sitemap: ${abs('sitemap.xml')}
`)

const boroughOrder = ['MN', 'BX', 'BK', 'QN', 'SI']
write('llms.txt', `# PLUTO+

> PLUTO+ is a free, browser-based “clip and ship” tool for downloading NYC MapPLUTO tax lot data (NYC Department of City Planning) for just the area and columns you need, as GeoJSON, CSV or Shapefile. Current data: MapPLUTO ${manifest.version}, ${n(manifest.count)} tax lots, ${fields.length} columns.

Choose an area (the current map view, one of ${ntas.length} 2020 Neighborhood Tabulation Areas, or a drawn polygon), pick columns (grouped by topic: identifiers & address, ownership, buildings, floor area, lot dimensions, zoning, FAR, assessed value, districts, landmarks & flood risk), and download. There is no server or database: the data is a static GeoParquet file queried in the browser by DuckDB-WASM, which fetches only the parts it needs. Areas larger than 150,000 lots should be downloaded in full from DCP.

Downloader links can preselect an area and columns with URL query parameters: \`map=zoom/lat/lng\`, \`area=view|nta|draw\`, \`nta=<2020 NTA id, e.g. BK0101>\`, \`shape=lng,lat;lng,lat;…\`, \`cols=<comma-separated column names>|all\`. Example: ${SITE_URL}?area=nta&nta=BK0101&cols=bbl,address,zonedist1,yearbuilt

## Pages

- [PLUTO+ downloader](${SITE_URL}): interactive map and download tool
- [Neighborhood index](${abs('neighborhoods/')}): all boroughs and neighborhoods with tax lot counts
${boroughOrder.map((c) => `- [${BOROUGHS[c].name}](${abs(boroughPath(c))}): borough summary (lots, units, land use, zoning) and its neighborhoods`).join('\n')}

## Data sources

- [MapPLUTO (NYC Department of City Planning)](${DCP_URL}): source dataset, data dictionary and full citywide downloads
- [2020 Neighborhood Tabulation Areas](${NTA_INFO_URL}): neighborhood boundaries used for the neighborhood pages
- [Source code and documentation](${REPO_URL}): how the static data pipeline and in-browser queries work

## Neighborhoods

Each page has summary stats (tax lots, residential units, median year built, land use and zoning mix, floodplain exposure) and an embedded downloader preset to that neighborhood.

${boroughOrder.map((c) => ntas.filter((x) => x.borough === BOROUGHS[c].name).sort((x, y) => x.name.localeCompare(y.name))
    .map((x) => `- [${x.name}, ${x.borough} (${x.id})](${abs(ntaPath(x))}): ${n(x.lots)} tax lots`).join('\n')).join('\n')}
`)

write('404.html', `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found | PLUTO+</title><meta name="robots" content="noindex">
<link rel="icon" href="${new URL(SITE_URL).pathname}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${new URL(SITE_URL).pathname}site.css"></head>
<body><main id="main"><h1>Page not found</h1>
<p class="lede">That page doesn’t exist. Try the <a href="${new URL(SITE_URL).pathname}">PLUTO+ downloader</a> or <a href="${new URL(SITE_URL).pathname}neighborhoods/">browse neighborhoods</a>.</p></main></body></html>
`)

console.log(`Wrote ${pages.length} pages, sitemap.xml (${urls.length} URLs), robots.txt, llms.txt, 404.html to ${OUT}/ for ${SITE_URL}`)
