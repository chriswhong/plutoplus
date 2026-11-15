import { useMemo } from 'react'
import { Popover } from 'radix-ui'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCode, faFileCode, faFileCsv, faFileZipper, faSpinner, faTriangleExclamation, faXmark,
} from '@fortawesome/free-solid-svg-icons'
import type { Field } from '../lib/data'
import { estimateBytes, formatBytes, FULL_DOWNLOAD_URL, MAX_LOTS, type Format } from '../lib/extract'
import type { Clip, Mode } from './MapView'

export interface CountState {
  status: 'idle' | 'loading' | 'done' | 'error'
  count?: number
  points?: number
  overLimit?: boolean
  error?: string
}

interface Props {
  fields: Field[]
  selected: Set<string>
  mode: Mode
  clip: Clip | null
  count: CountState
  busy: string | null
  error: string | null
  onDismissError: () => void
  lastSql: string | null
  onDownload: (f: Format) => void
}

const fmt = new Intl.NumberFormat('en-US')

const FORMATS = [
  ['geojson', 'GeoJSON', faFileCode],
  ['csv', 'CSV', faFileCsv],
  ['shp', 'Shapefile', faFileZipper],
] as const

/** Always-visible summary of the current selection, floating over the bottom of the map. */
export function DownloadPanel({
  fields, selected, mode, clip, count, busy, error, onDismissError, lastSql, onDownload,
}: Props) {
  const noColumns = selected.size === 0
  const ready = !!clip && !noColumns && count.status === 'done' && !count.overLimit && (count.count ?? 0) > 0

  const estimates = useMemo(() => {
    if (!ready || count.points == null) return null
    const cols = fields.filter((f) => selected.has(f.name))
    const est = (f: Format) => formatBytes(estimateBytes(f, count.count!, count.points!, cols))
    return { geojson: est('geojson'), csv: est('csv'), shp: est('shp') } as Record<Format, string>
  }, [ready, count, fields, selected])

  let status: React.ReactNode
  if (busy) status = <><FontAwesomeIcon icon={faSpinner} spin className="text-emerald-300" /> {busy}</>
  else if (!clip) status = mode === 'nta' ? 'Select a neighborhood on the map' : mode === 'draw' ? 'Draw a shape on the map' : 'Move the map to choose an area'
  else if (noColumns) status = 'Choose at least one column'
  else if (count.status === 'loading' || count.status === 'idle') status = <><FontAwesomeIcon icon={faSpinner} spin /> Counting lots…</>
  else if (count.status === 'error') status = <span className="text-rose-300">Couldn’t count lots: {count.error}</span>
  else if (count.overLimit) status = (
    <span className="text-amber-300">
      <FontAwesomeIcon icon={faTriangleExclamation} /> Over {fmt.format(MAX_LOTS)} lots. Zoom in, or get the{' '}
      <a className="underline" href={FULL_DOWNLOAD_URL} target="_blank" rel="noreferrer">full dataset</a>
    </span>
  )
  else if (count.count === 0) status = 'No lots in this area'
  else status = (
    <>
      <span className="font-semibold text-white">{fmt.format(count.count!)}</span> lots
      <span className="mx-1.5 text-slate-600">·</span>
      <span className="font-semibold text-white">{selected.size}</span> {selected.size === 1 ? 'column' : 'columns'}
      {clip && mode !== 'view' && (
        <>
          <span className="mx-1.5 text-slate-600">·</span>
          <span className="text-slate-400">{clip.label}</span>
        </>
      )}
    </>
  )

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center px-3">
      <div className="pointer-events-auto w-full max-w-md rounded-xl bg-slate-950/90 px-3 py-2.5 text-sm text-slate-300 shadow-2xl ring-1 ring-white/10 backdrop-blur">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate" aria-live="polite">{status}</p>
          {lastSql && (
            <Popover.Root>
              <Popover.Trigger
                className="-my-1 shrink-0 rounded-md px-1.5 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-slate-100"
                title="Show the query that ran"
                aria-label="Show the query that ran"
              >
                <FontAwesomeIcon icon={faCode} />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content side="top" align="end" sideOffset={10} className="z-50 w-[min(560px,calc(100vw-24px))] rounded-lg bg-slate-900 p-3 shadow-2xl ring-1 ring-white/10">
                  <p className="mb-2 text-xs text-slate-400">The query DuckDB ran in your browser for the last download:</p>
                  <pre className="max-h-60 overflow-auto rounded-md bg-slate-950 p-2 text-[11px] leading-snug text-slate-300">{lastSql}</pre>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {FORMATS.map(([f, label, icon]) => (
            <button
              key={f}
              disabled={!ready || !!busy}
              onClick={() => onDownload(f)}
              title={estimates ? `Download ${label} (estimated ${estimates[f]})` : `Download ${label}`}
              className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-400 px-2 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              <FontAwesomeIcon icon={icon} />
              {label}
              {estimates && <span className="font-normal opacity-70">≈{estimates[f]}</span>}
            </button>
          ))}
        </div>
        {error && (
          <p className="mt-2 flex items-start gap-2 text-xs text-rose-300">
            <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5" />
            <span className="flex-1">{error}</span>
            <button onClick={onDismissError} aria-label="Dismiss" className="text-rose-300/70 hover:text-rose-200">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
