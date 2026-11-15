import { useEffect, useId, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass, faSpinner, faXmark } from '@fortawesome/free-solid-svg-icons'
import { geosearch, type GeoSearchResult } from '../lib/geosearch'

interface Props {
  result: GeoSearchResult | null
  onSelect: (r: GeoSearchResult) => void
  onClear: () => void
}

/** Address / place search (NYC GeoSearch), as an ARIA 1.2 combobox with a listbox popup. */
export function GeoSearch({ result, onSelect, onClear }: Props) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(result?.label ?? '')
  const [options, setOptions] = useState<GeoSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  // Show the selected result's address in the input.
  useEffect(() => { if (result) setText(result.label) }, [result])

  // Debounced autocomplete; aborts stale requests.
  useEffect(() => {
    const q = text.trim()
    if (result && text === result.label) return
    if (q.length < 2) {
      setOptions([])
      setLoading(false)
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setLoading(true)
      geosearch(q, ctrl.signal)
        .then((r) => { setOptions(r); setActive(-1); setOpen(true); setError(false) })
        .catch((e: Error) => { if (e.name !== 'AbortError') { setOptions([]); setError(true); setOpen(true) } })
        .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (r: GeoSearchResult) => {
    setOpen(false)
    setOptions([])
    setActive(-1)
    setText(r.label)
    onSelect(r)
  }

  const clear = () => {
    setText('')
    setOptions([])
    setOpen(false)
    onClear()
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open && options.length) setOpen(true)
      setActive((i) => (options.length ? (i + 1) % options.length : -1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (options.length ? (i <= 0 ? options.length - 1 : i - 1) : -1))
    } else if (e.key === 'Enter') {
      const pick = options[active >= 0 ? active : 0]
      if (open && pick) {
        e.preventDefault()
        choose(pick)
      }
    } else if (e.key === 'Escape') {
      if (open) setOpen(false)
      else if (result) clear()
    }
  }

  const showList = open && (options.length > 0 || error || (!loading && text.trim().length >= 2))
  const activeId = active >= 0 ? `${listId}-opt-${active}` : undefined

  return (
    <div className="relative w-[min(22rem,calc(100vw-5rem))]">
      <label htmlFor={`${listId}-input`} className="sr-only">Search for an address or place</label>
      <div className="flex items-center rounded-lg bg-slate-950/90 shadow-lg ring-1 ring-white/10 backdrop-blur focus-within:ring-2 focus-within:ring-emerald-400">
        <FontAwesomeIcon icon={loading ? faSpinner : faMagnifyingGlass} spin={loading} className="ml-3 text-sm text-slate-400" aria-hidden="true" />
        <input
          ref={inputRef}
          id={`${listId}-input`}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={`${listId}-list`}
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search an address or place"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            // Editing the text drops the active result (and its marker).
            if (result) onClear()
          }}
          onKeyDown={onKeyDown}
          onFocus={() => options.length && !result && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none"
        />
        {result && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search result"
            className="mr-1 rounded-md px-2 py-1 text-slate-400 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        )}
      </div>
      <ul
        id={`${listId}-list`}
        role="listbox"
        aria-label="Search results"
        hidden={!showList}
        className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg bg-slate-900 py-1 text-sm shadow-2xl ring-1 ring-white/10"
      >
        {error ? (
          <li role="option" aria-selected={false} aria-disabled="true" className="px-3 py-2 text-rose-300">Search is unavailable right now</li>
        ) : options.length === 0 ? (
          <li role="option" aria-selected={false} aria-disabled="true" className="px-3 py-2 text-slate-400">No matches in NYC</li>
        ) : options.map((o, i) => {
          const [head, ...rest] = o.label.split(', ')
          return (
            <li
              key={o.id}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? 'bg-emerald-400/15 text-white' : 'text-slate-200'}`}
            >
              <span className="block font-medium">{head}</span>
              <span className="block text-xs text-slate-400">{rest.join(', ')}</span>
            </li>
          )
        })}
      </ul>
      <p className="sr-only" aria-live="polite">
        {showList && !error && options.length ? `${options.length} results available` : ''}
      </p>
    </div>
  )
}
