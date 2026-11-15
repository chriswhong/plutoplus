import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { ExpressionSpecification, MapGeoJSONFeature } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre v6 loads its worker relative to its own module; point it at the bundled copy.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Protocol } from 'pmtiles'
import { layers as basemapLayers, namedFlavor } from '@protomaps/basemaps'
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRectangleMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import type { Feature, FeatureCollection, Polygon } from 'geojson'
import { icon as faIcon } from '@fortawesome/fontawesome-svg-core'
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { dataUrl, type Manifest } from '../lib/data'
import type { GeoSearchResult } from '../lib/geosearch'
import type { AreaKind } from '../lib/filename'
import { GeoSearch } from './GeoSearch'
import type { ClipGeometry } from '../lib/extract'

export type Mode = 'view' | 'nta' | 'draw'
export type DrawShape = 'polygon' | 'rectangle'

export interface Clip {
  geometry: ClipGeometry
  label: string
  kind: AreaKind
  /** set when the clip is a neighborhood */
  ntaId?: string
  ntaName?: string
}

/** A restored URL shape counts as a rectangle if it's an axis-aligned 4-corner box. */
function shapeKind(p: Polygon): 'polygon' | 'rectangle' {
  const ring = p.coordinates[0]
  if (p.coordinates.length !== 1 || ring.length !== 5) return 'polygon'
  const xs = new Set(ring.map((c) => c[0]))
  const ys = new Set(ring.map((c) => c[1]))
  return xs.size === 2 && ys.size === 2 ? 'rectangle' : 'polygon'
}

export interface MapViewState {
  center: [number, number]
  zoom: number
}

interface Props {
  manifest: Manifest
  mode: Mode
  drawShape: DrawShape
  clearDrawToken: number
  onClipChange: (clip: Clip | null) => void
  onViewChange?: (view: MapViewState) => void
  /** restored from the URL on first load */
  initialView?: MapViewState
  initialNta?: string
  initialShape?: Polygon
  /** select a neighborhood from outside the map (keyboard-accessible picker); n makes repeats distinct */
  ntaRequest?: { id: string; n: number }
  /** active address search result: fly there and show a labeled marker */
  searchResult: GeoSearchResult | null
  onSearchSelect: (r: GeoSearchResult) => void
  onSearchClear: () => void
}

const BASEMAP_ASSETS = 'https://protomaps.github.io/basemaps-assets'

// Protomaps "dark", with brighter labels and darker halos so street and place names stay
// legible on top of the lot fills (the stock dark labels are #525252–#7a7a7a).
const LABEL_HALO = '#0b1220'
const LABEL_FLAVOR = {
  ...namedFlavor('dark'),
  roads_label_minor: '#a5b1c2',
  roads_label_minor_halo: LABEL_HALO,
  roads_label_major: '#d3dbe6',
  roads_label_major_halo: LABEL_HALO,
  subplace_label: '#b4c0d0',
  subplace_label_halo: LABEL_HALO,
  city_label: '#e6ebf2',
  city_label_halo: LABEL_HALO,
  address_label: '#a5b1c2',
  address_label_halo: LABEL_HALO,
  ocean_label: '#8ea3bd',
}

/** Protomaps "dark" style over a self-hosted NYC extract (see scripts/build-data.sh). */
function basemapStyle(manifest: Manifest): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: `${BASEMAP_ASSETS}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${BASEMAP_ASSETS}/sprites/v4/dark`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${dataUrl(manifest.basemap)}`,
        attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: basemapLayers('protomaps', LABEL_FLAVOR, { lang: 'en' }),
  }
}
const ACCENT = '#34d399'

let protocolAdded = false

// A deeper take on the original PLUTO+ "random blues" (#14adf2/#52C7FF/#2167AB/#429FCC), dark
// enough that light labels read on top. Lot numbers on a block are mostly sequential, so
// bbl % 4 rarely gives neighbors the same blue. Not a data layer.
const LOT_TINTS = ['#1c5682', '#2d77aa', '#143f61', '#24659a']
const LOT_HOVER = '#4fa3db'
const lotColor = [
  'match', ['%', ['to-number', ['get', 'bbl'], 0], 4],
  0, LOT_TINTS[0], 1, LOT_TINTS[1], 2, LOT_TINTS[2], LOT_TINTS[3],
] as unknown as ExpressionSpecification

function boundsPolygon(map: maplibregl.Map): Polygon {
  const b = map.getBounds()
  const [w, s, e, n] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
  return { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] }
}

const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }

export function MapView({
  manifest, mode, drawShape, clearDrawToken, onClipChange, onViewChange, initialView, initialNta, initialShape,
  ntaRequest, searchResult, onSearchSelect, onSearchClear,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const drawRef = useRef<TerraDraw | null>(null)
  const [ready, setReady] = useState(false)
  const [hoverName, setHoverName] = useState<string | null>(null)

  const modeRef = useRef(mode)
  modeRef.current = mode
  const onClipRef = useRef(onClipChange)
  onClipRef.current = onClipChange
  const onViewRef = useRef(onViewChange)
  onViewRef.current = onViewChange
  // The URL-provided neighborhood/shape is applied once, on the first mode setup.
  const restoreRef = useRef<{ nta?: string; shape?: Polygon }>({ nta: initialNta, shape: initialShape })

  // Create the map once.
  useEffect(() => {
    if (!protocolAdded) {
      maplibregl.setWorkerUrl(maplibreWorkerUrl)
      maplibregl.addProtocol('pmtiles', new Protocol().tile)
      protocolAdded = true
    }
    const map = new maplibregl.Map({
      container: container.current!,
      style: basemapStyle(manifest),
      center: initialView?.center ?? [-73.978, 40.7066],
      zoom: initialView?.zoom ?? 14,
      minZoom: 9,
      maxBounds: [[-74.6, 40.3], [-73.3, 41.1]],
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id

      map.addSource('lots', {
        type: 'vector',
        url: `pmtiles://${dataUrl(manifest.pmtiles)}`,
        promoteId: 'bbl',
        attribution: `<a href="https://www.nyc.gov/content/planning/pages/resources/datasets/mappluto-pluto-change">MapPLUTO ${manifest.version}</a> · NYC DCP`,
      })
      map.addLayer({
        id: 'lots-fill', type: 'fill', source: 'lots', 'source-layer': 'lots',
        paint: {
          'fill-color': ['case', ['boolean', ['feature-state', 'hover'], false], LOT_HOVER, lotColor],
          'fill-opacity': 0.9,
        },
      }, firstSymbol)

      map.addSource('nta', { type: 'geojson', data: dataUrl(manifest.nta), promoteId: 'id' })
      map.addLayer({
        id: 'nta-fill', type: 'fill', source: 'nta', layout: { visibility: 'none' },
        paint: {
          'fill-color': ACCENT,
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.25, 0.04],
        },
      })
      map.addLayer({
        id: 'nta-line', type: 'line', source: 'nta', layout: { visibility: 'none' },
        paint: { 'line-color': ACCENT, 'line-opacity': 0.6, 'line-width': 1 },
      })

      map.addSource('clip', { type: 'geojson', data: empty })
      map.addLayer({
        id: 'clip-fill', type: 'fill', source: 'clip',
        paint: { 'fill-color': ACCENT, 'fill-opacity': 0.15 },
      })
      map.addLayer({
        id: 'clip-line', type: 'line', source: 'clip',
        paint: { 'line-color': ACCENT, 'line-width': 2.5 },
      })

      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawPolygonMode({
            styles: {
              fillColor: ACCENT, fillOpacity: 0.15, outlineColor: ACCENT, outlineWidth: 2.5,
              closingPointColor: ACCENT, closingPointOutlineColor: '#ffffff',
            },
          }),
          new TerraDrawRectangleMode({
            styles: { fillColor: ACCENT, fillOpacity: 0.15, outlineColor: ACCENT, outlineWidth: 2.5 },
          }),
        ],
      })
      draw.start()
      draw.on('finish', (id) => {
        // Keep only the most recent shape.
        const others = draw.getSnapshot().filter((f) => f.id !== id).map((f) => f.id!)
        if (others.length) draw.removeFeatures(others)
        const feature = draw.getSnapshotFeature(id)
        if (feature?.geometry.type === 'Polygon') {
          // A shape restored from the URL lives in the clip layer; a new drawing replaces it.
          ;(map.getSource('clip') as maplibregl.GeoJSONSource).setData(empty)
          const kind = feature.properties?.mode === 'rectangle' ? 'rectangle' : 'polygon'
          onClipRef.current({ geometry: feature.geometry, label: kind === 'rectangle' ? 'Drawn rectangle' : 'Drawn polygon', kind })
        }
      })
      drawRef.current = draw
      setReady(true)
    })

    // Current view mode follows the map; the view itself goes into the URL.
    const reportView = () => {
      const c = map.getCenter()
      onViewRef.current?.({ center: [c.lng, c.lat], zoom: map.getZoom() })
    }
    map.on('load', reportView)
    map.on('moveend', () => {
      reportView()
      if (modeRef.current === 'view') onClipRef.current({ geometry: boundsPolygon(map), label: 'Current map view', kind: 'view' })
    })

    // Lot hover: address tooltip for wayfinding (not shown while picking neighborhoods/drawing).
    const lotPopup = new maplibregl.Popup({
      closeButton: false, closeOnClick: false, offset: 12, className: 'lot-popup', maxWidth: '280px',
    })
    let lotHoverId: string | number | undefined
    const clearLotHover = () => {
      if (lotHoverId !== undefined) map.setFeatureState({ source: 'lots', sourceLayer: 'lots', id: lotHoverId }, { hover: false })
      lotHoverId = undefined
      lotPopup.remove()
    }
    map.on('mousemove', 'lots-fill', (e) => {
      const f = e.features?.[0]
      if (!f || modeRef.current !== 'view') return clearLotHover()
      if (f.id !== lotHoverId) {
        clearLotHover()
        lotHoverId = f.id
        if (lotHoverId !== undefined) map.setFeatureState({ source: 'lots', sourceLayer: 'lots', id: lotHoverId }, { hover: true })
      }
      const el = document.createElement('div')
      const addr = document.createElement('div')
      addr.className = 'font-medium text-slate-100'
      addr.textContent = (f.properties.address as string) || 'No address'
      const bbl = document.createElement('div')
      bbl.className = 'font-mono text-[11px] text-slate-400'
      bbl.textContent = `BBL ${f.properties.bbl}`
      el.append(addr, bbl)
      lotPopup.setLngLat(e.lngLat).setDOMContent(el).addTo(map)
    })
    map.on('mouseleave', 'lots-fill', clearLotHover)

    // Neighborhood hover + click.
    let hoverId: string | number | undefined
    map.on('mousemove', 'nta-fill', (e) => {
      const f = e.features?.[0]
      if (!f) return
      if (hoverId !== undefined) map.setFeatureState({ source: 'nta', id: hoverId }, { hover: false })
      hoverId = f.id
      map.setFeatureState({ source: 'nta', id: hoverId! }, { hover: true })
      map.getCanvas().style.cursor = 'pointer'
      setHoverName(`${f.properties.name} · ${f.properties.borough}`)
    })
    map.on('mouseleave', 'nta-fill', () => {
      if (hoverId !== undefined) map.setFeatureState({ source: 'nta', id: hoverId }, { hover: false })
      hoverId = undefined
      map.getCanvas().style.cursor = ''
      setHoverName(null)
    })
    map.on('click', 'nta-fill', (e) => {
      const f = e.features?.[0] as MapGeoJSONFeature | undefined
      if (f?.id !== undefined) selectNta(map, String(f.id))
    })

    return () => {
      drawRef.current?.stop()
      map.remove()
      mapRef.current = null
    }
  }, [manifest])

  /** Select a neighborhood by id, using the full-precision feature from the source data. */
  function selectNta(map: maplibregl.Map, id: string, fit = false, always = false) {
    const src = map.getSource('nta') as maplibregl.GeoJSONSource
    src.getData().then((data) => {
      const full = (data as FeatureCollection).features.find((x) => x.properties?.id === id) as Feature | undefined
      const geom = full?.geometry
      if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') || modeRef.current !== 'nta') return
      ;(map.getSource('clip') as maplibregl.GeoJSONSource).setData(full)
      onClipRef.current({ geometry: geom, label: `${full.properties?.name} (${id})`, kind: 'nta', ntaId: id, ntaName: full.properties?.name })
      if (fit) {
        const b = new maplibregl.LngLatBounds()
        const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
        polys.forEach((p) => p[0].forEach((c) => b.extend(c as [number, number])))
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (always || !map.getBounds().contains(b.getCenter())) {
          map.fitBounds(b, { padding: 80, maxZoom: 16, animate: !reduceMotion })
        }
      }
    })
  }

  // React to mode changes.
  useEffect(() => {
    const map = mapRef.current
    const draw = drawRef.current
    if (!map || !ready || !draw) return
    const ntaVis = mode === 'nta' ? 'visible' : 'none'
    map.setLayoutProperty('nta-fill', 'visibility', ntaVis)
    map.setLayoutProperty('nta-line', 'visibility', ntaVis)
    ;(map.getSource('clip') as maplibregl.GeoJSONSource).setData(empty)
    draw.clear()

    const restore = restoreRef.current
    restoreRef.current = {}

    if (mode === 'draw') {
      draw.setMode(drawShape)
      if (restore.shape) {
        ;(map.getSource('clip') as maplibregl.GeoJSONSource).setData({ type: 'Feature', properties: {}, geometry: restore.shape })
        const kind = shapeKind(restore.shape)
        onClipRef.current({ geometry: restore.shape, label: kind === 'rectangle' ? 'Drawn rectangle' : 'Drawn polygon', kind })
      } else {
        onClipRef.current(null)
      }
    } else {
      draw.setMode('static')
      onClipRef.current(mode === 'view' ? { geometry: boundsPolygon(map), label: 'Current map view', kind: 'view' } : null)
      if (mode === 'nta' && restore.nta) selectNta(map, restore.nta, true)
    }
  }, [mode, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // Neighborhood chosen from the sidebar picker.
  useEffect(() => {
    if (ready && ntaRequest && mapRef.current && modeRef.current === 'nta') selectNta(mapRef.current, ntaRequest.id, true, true)
  }, [ntaRequest, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // Search result: fly to it and show a labeled marker until it's cleared.
  const markerRef = useRef<maplibregl.Marker | null>(null)
  useEffect(() => {
    const map = mapRef.current
    markerRef.current?.remove()
    markerRef.current = null
    if (!map || !searchResult) return
    const el = document.createElement('div')
    el.className = 'search-marker'
    el.setAttribute('role', 'img')
    el.setAttribute('aria-label', `Search result: ${searchResult.label}`)
    const pin = document.createElement('span')
    pin.className = 'search-marker-pin'
    pin.innerHTML = faIcon(faMagnifyingGlass).html.join('')
    const label = document.createElement('span')
    label.className = 'search-marker-label'
    label.textContent = searchResult.name
    el.append(pin, label)
    markerRef.current = new maplibregl.Marker({ element: el, anchor: 'left', offset: [-15, 0] })
      .setLngLat(searchResult.center)
      .addTo(map)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const target = { center: searchResult.center, zoom: Math.max(map.getZoom(), 17) }
    if (reduceMotion) map.jumpTo(target)
    else map.flyTo({ ...target, speed: 1.6 })
  }, [searchResult, ready])

  // Switch polygon/rectangle tool without clearing the current shape.
  useEffect(() => {
    if (ready && mode === 'draw') drawRef.current?.setMode(drawShape)
  }, [drawShape, ready, mode])

  // Clear button.
  useEffect(() => {
    if (!ready || clearDrawToken === 0) return
    drawRef.current?.clear()
    ;(mapRef.current?.getSource('clip') as maplibregl.GeoJSONSource | undefined)?.setData(empty)
    if (modeRef.current === 'draw') {
      drawRef.current?.setMode(drawShape)
      onClipRef.current(null)
    }
  }, [clearDrawToken]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" />
      </div>
      <div className="absolute left-3 top-3 z-10">
        <GeoSearch result={searchResult} onSelect={onSearchSelect} onClear={onSearchClear} />
      </div>
      {mode === 'nta' && (
        <div className="pointer-events-none absolute left-3 top-[3.75rem] rounded-md bg-slate-950/85 px-3 py-1.5 text-sm text-slate-100 shadow-lg ring-1 ring-white/10">
          {hoverName ?? 'Click a neighborhood to select it'}
        </div>
      )}
      {mode === 'draw' && (
        <div className="pointer-events-none absolute left-3 top-[3.75rem] rounded-md bg-slate-950/85 px-3 py-1.5 text-sm text-slate-100 shadow-lg ring-1 ring-white/10">
          {drawShape === 'polygon'
            ? 'Click to add points · click the first point to finish'
            : 'Click once to start, click again to finish'}
        </div>
      )}
    </div>
  )
}
