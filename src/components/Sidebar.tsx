import { RadioGroup, ToggleGroup, Tooltip } from 'radix-ui'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCheck, faDrawPolygon, faEraser, faMap, faMapLocationDot, faSquare,
} from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import type { Field } from '../lib/data'
import type { Clip, DrawShape, Mode } from './MapView'
import { ColumnPicker } from './ColumnPicker'

interface Props {
  fields: Field[]
  selected: Set<string>
  onToggleField: (name: string) => void
  onSetMany: (names: string[], on: boolean) => void
  onSelectAll: () => void
  onSelectNone: () => void
  mode: Mode
  onModeChange: (m: Mode) => void
  drawShape: DrawShape
  onDrawShapeChange: (s: DrawShape) => void
  onClearDraw: () => void
  clip: Clip | null
  ntas: NtaOption[]
  onPickNta: (id: string) => void
}

export interface NtaOption {
  id: string
  name: string
  borough: string
}

function Step({ n, title, right, children, className = '' }: {
  n: number; title: string; right?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <section className={`border-b border-white/5 px-5 py-4 ${className}`}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400 text-xs font-bold text-slate-950">{n}</span>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-200">{title}</h2>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  )
}

const AREA_OPTIONS: { value: Mode; label: string; hint: string; icon: IconDefinition }[] = [
  { value: 'view', label: 'Current map view', hint: 'Everything visible on the map', icon: faMap },
  { value: 'nta', label: 'Neighborhood', hint: '2020 Neighborhood Tabulation Areas', icon: faMapLocationDot },
  { value: 'draw', label: 'Draw a shape', hint: 'Polygon or rectangle', icon: faDrawPolygon },
]

export function Sidebar(props: Props) {
  const {
    fields, selected, onToggleField, onSetMany, onSelectAll, onSelectNone, mode, onModeChange,
    drawShape, onDrawShapeChange, onClearDraw, clip, ntas, onPickNta,
  } = props
  return (
    <Tooltip.Provider delayDuration={200}>
      <aside className="flex h-full min-h-0 flex-col overflow-y-auto bg-slate-900 text-slate-300">
        <Step n={1} title="Choose area">
          <RadioGroup.Root value={mode} onValueChange={(v) => onModeChange(v as Mode)} className="grid gap-1.5" aria-label="Area">
            {AREA_OPTIONS.map((o) => (
              <RadioGroup.Item
                key={o.value}
                value={o.value}
                className="group flex items-center gap-3 rounded-lg border border-white/5 bg-slate-800/40 px-3 py-2 text-left outline-none transition hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-emerald-400 data-[state=checked]:border-emerald-400/60 data-[state=checked]:bg-emerald-400/10"
              >
                <FontAwesomeIcon icon={o.icon} className="w-4 text-slate-400 group-data-[state=checked]:text-emerald-300" />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-slate-100">{o.label}</span>
                  <span className="block text-xs text-slate-400">{o.hint}</span>
                </span>
                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-500 group-data-[state=checked]:border-emerald-400">
                  <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-emerald-400" />
                </span>
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>

          {mode === 'nta' && ntas.length > 0 && (
            <div className="mt-3">
              <label htmlFor="nta-picker" className="mb-1 block text-xs text-slate-400">
                Click the map, or choose from the list
              </label>
              <select
                id="nta-picker"
                value={clip?.ntaId ?? ''}
                onChange={(e) => e.target.value && onPickNta(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <option value="">Select a neighborhood…</option>
                {[...new Set(ntas.map((n) => n.borough))].sort().map((b) => (
                  <optgroup key={b} label={b}>
                    {ntas.filter((n) => n.borough === b).sort((x, y) => x.name.localeCompare(y.name)).map((n) => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}
          {mode === 'draw' && (
            <div className="mt-3 flex items-center gap-2">
              <ToggleGroup.Root
                type="single"
                value={drawShape}
                onValueChange={(v) => v && onDrawShapeChange(v as DrawShape)}
                className="inline-flex rounded-md bg-slate-800 p-0.5"
                aria-label="Shape"
              >
                {([['polygon', faDrawPolygon, 'Polygon'], ['rectangle', faSquare, 'Rectangle']] as const).map(([v, icon, label]) => (
                  <ToggleGroup.Item
                    key={v}
                    value={v}
                    className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-slate-300 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-400 data-[state=on]:bg-slate-600 data-[state=on]:text-white"
                  >
                    <FontAwesomeIcon icon={icon} /> {label}
                  </ToggleGroup.Item>
                ))}
              </ToggleGroup.Root>
              <button
                onClick={onClearDraw}
                className="ml-auto flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <FontAwesomeIcon icon={faEraser} /> Clear
              </button>
            </div>
          )}
          {clip && mode !== 'view' && (
            <p className="mt-3 truncate text-xs text-emerald-300" title={clip.label}>
              <FontAwesomeIcon icon={faCheck} /> {clip.label}
            </p>
          )}
        </Step>

        <Step
          n={2}
          title="Choose columns"
          className="flex min-h-0 flex-1 flex-col border-b-0"
          right={
            <span className="text-xs text-slate-400">
              <button className="hover:text-white" onClick={onSelectAll}>All</button>
              <span className="mx-1.5 text-slate-600">|</span>
              <button className="hover:text-white" onClick={onSelectNone}>None</button>
            </span>
          }
        >
          <ColumnPicker fields={fields} selected={selected} onToggleField={onToggleField} onSetMany={onSetMany} />
        </Step>

      </aside>
    </Tooltip.Provider>
  )
}
