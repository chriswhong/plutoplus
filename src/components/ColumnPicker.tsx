import { useEffect, useMemo, useState } from 'react'
import { Accordion, Checkbox, ScrollArea, ToggleGroup, Tooltip } from 'radix-ui'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowDownAZ, faCheck, faChevronRight, faCircleInfo, faLayerGroup, faMagnifyingGlass, faMinus,
} from '@fortawesome/free-solid-svg-icons'
import type { Field } from '../lib/data'
import { groupFields } from '../lib/fieldGroups'

type View = 'az' | 'topic'
const VIEW_KEY = 'plutoplus.columnView'

interface Props {
  fields: Field[]
  selected: Set<string>
  onToggleField: (name: string) => void
  onSetMany: (names: string[], on: boolean) => void
}

const checkboxClass =
  'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-500 bg-slate-800 outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-emerald-400 ' +
  'data-[state=checked]:border-emerald-400 data-[state=checked]:bg-emerald-400 ' +
  'data-[state=indeterminate]:border-emerald-400 data-[state=indeterminate]:bg-emerald-400'

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'az' ? 'az' : 'topic'
  } catch {
    return 'topic'
  }
}

function FieldRow({ field, checked, onToggle }: { field: Field; checked: boolean; onToggle: () => void }) {
  return (
    <li className="flex items-center pr-2 hover:bg-white/5">
      <label className="flex flex-1 cursor-pointer items-center gap-2.5 py-1 pl-3">
        <Checkbox.Root checked={checked} onCheckedChange={onToggle} className={checkboxClass}>
          <Checkbox.Indicator>
            <FontAwesomeIcon icon={faCheck} className="text-[10px] text-slate-950" />
          </Checkbox.Indicator>
        </Checkbox.Root>
        <span className="font-mono text-[13px] text-slate-200">{field.name}</span>
      </label>
      {field.description && (
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                aria-label={`About ${field.name}: ${field.description}`}
                className="rounded p-1 text-slate-400 outline-none hover:text-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <FontAwesomeIcon icon={faCircleInfo} className="text-xs" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content side="right" sideOffset={8} className="z-50 max-w-xs rounded-md bg-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-900 shadow-xl">
                <span className="mb-1 block font-mono text-[11px] text-slate-600">{field.type.toLowerCase()}</span>
                {field.description}
                <Tooltip.Arrow className="fill-slate-100" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
      )}
    </li>
  )
}

export function ColumnPicker({ fields, selected, onToggleField, onSetMany }: Props) {
  const [view, setView] = useState<View>(readView)
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState<string[]>(['id'])

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view) } catch { /* private mode etc. */ }
  }, [view])

  const q = filter.trim().toLowerCase()
  const matches = useMemo(
    () => (q ? fields.filter((f) => f.name.includes(q) || f.description.toLowerCase().includes(q)) : fields),
    [fields, q],
  )
  const alphabetical = useMemo(() => [...matches].sort((a, b) => a.name.localeCompare(b.name)), [matches])
  const groups = useMemo(() => groupFields(matches), [matches])

  // While searching, show every group that has a match.
  const openGroups = q ? groups.map((g) => g.group.id) : open

  return (
    <>
      <div className="mb-2 flex gap-2">
        <label className="relative block flex-1">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500" />
          <input
            type="search"
            aria-label="Search columns"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Search ${fields.length} columns`}
            className="w-full rounded-md border border-white/5 bg-slate-800/60 py-1.5 pl-8 pr-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:border-emerald-400/60"
          />
        </label>
        <ToggleGroup.Root
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as View)}
          className="inline-flex shrink-0 rounded-md bg-slate-800 p-0.5"
          aria-label="Column list view"
        >
          {([['topic', faLayerGroup, 'By topic'], ['az', faArrowDownAZ, 'A–Z']] as const).map(([v, icon, label]) => (
            <ToggleGroup.Item
              key={v}
              value={v}
              title={label}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-300 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-400 data-[state=on]:bg-slate-600 data-[state=on]:text-white"
            >
              <FontAwesomeIcon icon={icon} />
              <span>{label}</span>
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>

      <ScrollArea.Root className="min-h-60 flex-1 overflow-hidden rounded-md border border-white/5 bg-slate-950/40">
        <ScrollArea.Viewport className="h-full w-full">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-400">No matching columns</p>
          ) : view === 'az' ? (
            <ul className="py-1">
              {alphabetical.map((f) => (
                <FieldRow key={f.name} field={f} checked={selected.has(f.name)} onToggle={() => onToggleField(f.name)} />
              ))}
            </ul>
          ) : (
            <Accordion.Root
              type="multiple"
              value={openGroups}
              onValueChange={(v) => !q && setOpen(v)}
              className="divide-y divide-white/5"
            >
              {groups.map(({ group, fields: groupFieldsList }) => {
                const names = groupFieldsList.map((f) => f.name)
                const n = names.filter((x) => selected.has(x)).length
                const state = n === 0 ? false : n === names.length ? true : 'indeterminate'
                return (
                  <Accordion.Item key={group.id} value={group.id}>
                    <Accordion.Header className="flex items-center gap-2.5 px-3 py-2">
                      <Checkbox.Root
                        checked={state}
                        onCheckedChange={() => onSetMany(names, state !== true)}
                        className={checkboxClass}
                        aria-label={`Select all ${group.label} columns`}
                      >
                        <Checkbox.Indicator>
                          <FontAwesomeIcon icon={state === 'indeterminate' ? faMinus : faCheck} className="text-[10px] text-slate-950" />
                        </Checkbox.Indicator>
                      </Checkbox.Root>
                      <Accordion.Trigger className="group flex flex-1 items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                        <span className="flex-1">
                          <span className="block text-sm font-medium text-slate-100">{group.label}</span>
                          <span className="block text-xs leading-snug text-slate-400">{group.hint}</span>
                        </span>
                        <span className="text-xs tabular-nums text-slate-400" aria-label={`${n} of ${names.length} selected`}>{n}/{names.length}</span>
                        <FontAwesomeIcon icon={faChevronRight} className="text-[10px] text-slate-500 transition-transform group-data-[state=open]:rotate-90" />
                      </Accordion.Trigger>
                    </Accordion.Header>
                    <Accordion.Content>
                      <ul className="pb-2 pl-4">
                        {groupFieldsList.map((f) => (
                          <FieldRow key={f.name} field={f} checked={selected.has(f.name)} onToggle={() => onToggleField(f.name)} />
                        ))}
                      </ul>
                    </Accordion.Content>
                  </Accordion.Item>
                )
              })}
            </Accordion.Root>
          )}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="flex w-2 touch-none select-none p-0.5">
          <ScrollArea.Thumb className="relative flex-1 rounded-full bg-slate-600" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </>
  )
}
