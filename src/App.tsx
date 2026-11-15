import { useCallback, useEffect, useRef, useState } from 'react'
import { Dialog } from 'radix-ui'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUpRightFromSquare, faCircleQuestion, faMapLocationDot, faScissors, faSpinner, faXmark } from '@fortawesome/free-solid-svg-icons'
import { faGithub } from '@fortawesome/free-brands-svg-icons'
import { DEFAULT_FIELDS, dataUrl, loadFields, loadManifest, type Field, type Manifest } from './lib/data'
import { countLots, extract, FULL_DOWNLOAD_URL, saveBlob, type Format } from './lib/extract'
import { MapView, type Clip, type DrawShape, type MapViewState, type Mode } from './components/MapView'
import { readUrlState, writeUrlState } from './lib/urlState'
import type { GeoSearchResult } from './lib/geosearch'
import { Sidebar, type NtaOption } from './components/Sidebar'
import { DownloadPanel, type CountState } from './components/DownloadPanel'

// Selections shared via URL (see lib/urlState.ts), read once at startup.
const URL_STATE = readUrlState()
/** Embedded in an iframe on a static neighborhood page: compact header, link out to the full app. */
const EMBED = !!URL_STATE.embed

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [fields, setFields] = useState<Field[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<Mode>(URL_STATE.area ?? 'view')
  const [view, setView] = useState<MapViewState | undefined>(URL_STATE.view)
  const [drawShape, setDrawShape] = useState<DrawShape>('polygon')
  const [clearDrawToken, setClearDrawToken] = useState(0)
  const [clip, setClip] = useState<Clip | null>(null)
  const [count, setCount] = useState<CountState>({ status: 'idle' })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastSql, setLastSql] = useState<string | null>(null)
  const [ntas, setNtas] = useState<NtaOption[]>([])
  const [searchResult, setSearchResult] = useState<GeoSearchResult | null>(null)
  const [ntaRequest, setNtaRequest] = useState<{ id: string; n: number } | undefined>()

  useEffect(() => {
    loadManifest()
      .then(async (m) => {
        const f = await loadFields(m)
        setManifest(m)
        setFields(f)
        const names = f.map((x) => x.name)
        const fromUrl = URL_STATE.cols
        const valid = Array.isArray(fromUrl) ? names.filter((n) => fromUrl.includes(n)) : []
        setSelected(new Set(
          fromUrl === 'all' ? names
            // explicit "cols=" (none) is honored; a list with no known columns falls back to defaults
            : Array.isArray(fromUrl) && (valid.length || fromUrl.length === 0) ? valid
              : names.filter((n) => DEFAULT_FIELDS.includes(n)),
        ))
      })
      .catch((e: Error) => setLoadError(e.message))
  }, [])

  // Neighborhood list for the keyboard-accessible picker (same file the map uses; served from cache).
  useEffect(() => {
    if (!manifest) return
    fetch(dataUrl(manifest.nta))
      .then((r) => r.json())
      .then((fc: { features: { properties: NtaOption }[] }) =>
        setNtas(fc.features.map((f) => ({ id: f.properties.id, name: f.properties.name, borough: f.properties.borough }))))
      .catch(() => { /* the map still works without the list */ })
  }, [manifest])

  // Keep the URL in sync with the current selections so it can be shared.
  useEffect(() => {
    if (!fields.length) return
    const names = fields.map((f) => f.name)
    const chosen = names.filter((n) => selected.has(n))
    const defaults = names.filter((n) => DEFAULT_FIELDS.includes(n))
    const cols = chosen.length === names.length ? 'all'
      : chosen.length === defaults.length && chosen.every((n) => DEFAULT_FIELDS.includes(n)) ? undefined
        : chosen
    writeUrlState({
      view,
      area: mode,
      nta: clip?.ntaId,
      shape: mode === 'draw' && clip?.geometry.type === 'Polygon' ? clip.geometry : undefined,
      cols,
      embed: EMBED,
    })
  }, [view, mode, clip, selected, fields])

  // Debounced lot count whenever the clip area changes.
  const countSeq = useRef(0)
  useEffect(() => {
    if (!manifest || !clip) {
      setCount({ status: 'idle' })
      return
    }
    const seq = ++countSeq.current
    setCount((c) => ({ ...c, status: 'loading' }))
    const t = setTimeout(() => {
      countLots(dataUrl(manifest.parquet), clip.geometry)
        .then((r) => seq === countSeq.current && setCount({ status: 'done', ...r }))
        .catch((e: Error) => seq === countSeq.current && setCount({ status: 'error', error: e.message }))
    }, 350)
    return () => clearTimeout(t)
  }, [clip, manifest])

  const handleDownload = useCallback(async (format: Format) => {
    if (!manifest || !clip) return
    setError(null)
    try {
      const columns = fields.map((f) => f.name).filter((n) => selected.has(n))
      const result = await extract({
        parquetUrl: dataUrl(manifest.parquet),
        version: manifest.version,
        clip: clip.geometry,
        columns,
        fields,
        format,
        onStatus: setBusy,
      })
      setLastSql(result.sql)
      saveBlob(result.blob, result.filename)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }, [manifest, clip, fields, selected])

  const toggleField = useCallback((name: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  return (
    <div className="flex h-dvh flex-col bg-slate-950 text-slate-200">
      <header className={`flex items-center gap-3 border-b border-white/5 bg-slate-900 ${EMBED ? 'px-3 py-1.5' : 'px-5 py-3'}`}>
        <FontAwesomeIcon icon={faScissors} className="text-emerald-400" aria-hidden="true" />
        <h1 className={`${EMBED ? 'text-sm' : 'text-base'} font-semibold text-white`}>
          PLUTO<span className="text-emerald-400">+</span>
          <span className="ml-2 hidden font-normal text-slate-400 sm:inline">NYC tax lot data downloader</span>
        </h1>
        {manifest && (
          <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-slate-300 ring-1 ring-white/10">
            MapPLUTO {manifest.version}
          </span>
        )}
        {EMBED ? (
          <a
            href={window.location.href.replace(/[?&]embed=1/, '').replace(/\?$/, '')}
            target="_blank"
            rel="noopener"
            className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-white/5 hover:text-white"
          >
            Open full app <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
        <nav className="ml-auto flex items-center gap-1" aria-label="Site">
          <a
            href="./neighborhoods/"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
          >
            <FontAwesomeIcon icon={faMapLocationDot} aria-hidden="true" />
            <span className="hidden sm:inline">Neighborhoods</span>
            <span className="sr-only sm:hidden">Neighborhoods</span>
          </a>
          <AboutDialog manifest={manifest} />
          <a
            href="https://github.com/chriswhong/plutoplus"
            target="_blank"
            rel="noreferrer"
            className="rounded-md p-2 text-slate-300 hover:bg-white/5 hover:text-white"
            aria-label="Source on GitHub"
          >
            <FontAwesomeIcon icon={faGithub} />
          </a>
        </nav>
        )}
      </header>

      {loadError ? (
        <div className="m-auto max-w-md p-6 text-center text-sm text-rose-300">
          Couldn’t load the data: {loadError}
        </div>
      ) : !manifest ? (
        <div className="m-auto text-sm text-slate-400"><FontAwesomeIcon icon={faSpinner} spin /> Loading…</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
          <div className="h-[55%] min-h-0 md:h-auto md:w-[380px] md:shrink-0 md:border-r md:border-white/5">
            <Sidebar
              fields={fields}
              selected={selected}
              onToggleField={toggleField}
              onSetMany={(names, on) => setSelected((cur) => {
                const next = new Set(cur)
                names.forEach((n) => (on ? next.add(n) : next.delete(n)))
                return next
              })}
              onSelectAll={() => setSelected(new Set(fields.map((f) => f.name)))}
              onSelectNone={() => setSelected(new Set())}
              mode={mode}
              onModeChange={setMode}
              drawShape={drawShape}
              onDrawShapeChange={setDrawShape}
              onClearDraw={() => setClearDrawToken((t) => t + 1)}
              clip={clip}
              ntas={ntas}
              onPickNta={(id) => setNtaRequest((r) => ({ id, n: (r?.n ?? 0) + 1 }))}
            />
          </div>
          <main className="relative min-h-0 flex-1">
            <MapView
              manifest={manifest}
              initialView={URL_STATE.view}
              initialNta={URL_STATE.nta}
              initialShape={URL_STATE.shape}
              onViewChange={setView}
              mode={mode}
              drawShape={drawShape}
              clearDrawToken={clearDrawToken}
              onClipChange={setClip}
              ntaRequest={ntaRequest}
              searchResult={searchResult}
              onSearchSelect={setSearchResult}
              onSearchClear={() => setSearchResult(null)}
            />
            <DownloadPanel
              fields={fields}
              selected={selected}
              mode={mode}
              clip={clip}
              count={count}
              busy={busy}
              error={error}
              onDismissError={() => setError(null)}
              lastSql={lastSql}
              onDownload={handleDownload}
            />
          </main>
        </div>
      )}
    </div>
  )
}

function AboutDialog({ manifest }: { manifest: Manifest | null }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
        <FontAwesomeIcon icon={faCircleQuestion} /> About
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-slate-900 p-6 text-sm leading-relaxed text-slate-300 shadow-2xl ring-1 ring-white/10">
          <div className="mb-3 flex items-center">
            <Dialog.Title className="text-lg font-semibold text-white">About PLUTO+</Dialog.Title>
            <Dialog.Close className="ml-auto rounded p-1 text-slate-400 hover:text-white" aria-label="Close">
              <FontAwesomeIcon icon={faXmark} />
            </Dialog.Close>
          </div>
          <Dialog.Description asChild>
            <div className="space-y-3">
              <p>
                <a className="text-emerald-300 underline" href={FULL_DOWNLOAD_URL} target="_blank" rel="noreferrer">MapPLUTO</a>{' '}
                is NYC Department of City Planning’s tax lot dataset: about {manifest ? manifest.count.toLocaleString() : '850,000'} lots,
                each with ~100 attributes covering zoning, land use, building area, units, assessments and more.
                It’s published citywide, so this tool lets you clip out just the area and columns you need.
              </p>
              <p>
                <strong className="text-slate-100">How it works.</strong> There’s no database or server. The data is a single
                GeoParquet file on static hosting, sorted so nearby lots sit together. When you download, DuckDB runs
                in your browser and fetches only the parts of the file that cover your area and columns, then runs
                an <code className="text-slate-100">ST_Intersects</code> query and writes the file locally.
                Open the browser console, or the <code className="text-slate-100">&lt;/&gt;</code> button after a download, to see the exact SQL.
              </p>
              <p>
                Neighborhoods are 2020 Neighborhood Tabulation Areas. A lot is included if it touches the selected area.
                Very large areas (more than 150,000 lots) are best downloaded directly from DCP.
              </p>
              <p>
                Prefer to browse? Every borough and neighborhood has a{' '}
                <a className="text-emerald-300 underline" href="./neighborhoods/">summary page</a> with key stats.
              </p>
              {manifest && (
                <p className="text-xs text-slate-400">
                  Data: MapPLUTO {manifest.version}, built {new Date(manifest.built).toLocaleDateString()}.
                  Built by Chris Whong.
                </p>
              )}
            </div>
          </Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
