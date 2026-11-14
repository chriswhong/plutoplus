// Renders the site icons and the social share card from SVG (run manually; outputs are committed).
//   node scripts/make-images.mjs
import { writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const BLUES = ['#1c5682', '#2d77aa', '#143f61', '#24659a', '#4fa3db']
const NAVY = '#0b1220'
const GREEN = '#34d399'

// Deterministic pseudo-random so the card is stable between runs.
let seed = 7
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

function lotGrid(x0, y0, w, h) {
  const out = []
  for (let by = y0; by < y0 + h; by += 92) {
    for (let bx = x0; bx < x0 + w; bx += 150) {
      // a city block of lots separated by "streets"
      let x = bx
      while (x < bx + 132) {
        const lw = Math.min(10 + Math.floor(rand() * 26), bx + 132 - x)
        const split = rand() > 0.5
        const c1 = BLUES[Math.floor(rand() * 4)]
        const c2 = BLUES[Math.floor(rand() * 4)]
        if (split) {
          out.push(`<rect x="${x}" y="${by}" width="${lw - 1.5}" height="36" fill="${c1}"/>`)
          out.push(`<rect x="${x}" y="${by + 38}" width="${lw - 1.5}" height="36" fill="${c2}"/>`)
        } else {
          out.push(`<rect x="${x}" y="${by}" width="${lw - 1.5}" height="74" fill="${c1}"/>`)
        }
        x += lw
      }
    }
  }
  return out.join('')
}

const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="fade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${NAVY}" stop-opacity="1"/>
      <stop offset="0.48" stop-color="${NAVY}" stop-opacity="0.96"/>
      <stop offset="0.75" stop-color="${NAVY}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${NAVY}" stop-opacity="0.1"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#1f2937"/>
  <g transform="rotate(-12 900 315)">${lotGrid(380, -260, 1100, 1200)}</g>
  <rect width="1200" height="630" fill="url(#fade)"/>
  <rect x="840" y="150" width="280" height="230" rx="6" fill="${GREEN}" fill-opacity="0.12" stroke="${GREEN}" stroke-width="5"/>
  <text x="72" y="168" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="96" font-weight="700" fill="#ffffff">PLUTO<tspan fill="${GREEN}">+</tspan></text>
  <text x="74" y="252" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="44" font-weight="600" fill="#e6ebf2">NYC tax lot data,</text>
  <text x="74" y="306" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="44" font-weight="600" fill="#e6ebf2">clipped to your area</text>
  <text x="74" y="384" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="27" fill="#a5b1c2">Pick a neighborhood or draw a shape, choose columns,</text>
  <text x="74" y="420" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="27" fill="#a5b1c2">and download MapPLUTO as GeoJSON, CSV or Shapefile.</text>
  <text x="74" y="552" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="22" fill="#8ea3bd" letter-spacing="2">FREE · NO SIGN-UP · OPEN DATA FROM NYC DCP</text>
</svg>`

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${NAVY}"/>
  <rect x="10" y="10" width="20" height="20" rx="2" fill="#2d77aa"/>
  <rect x="34" y="10" width="20" height="20" rx="2" fill="#1c5682"/>
  <rect x="10" y="34" width="20" height="20" rx="2" fill="#24659a"/>
  <rect x="34" y="34" width="20" height="20" rx="2" fill="#2d77aa" fill-opacity="0.35"/>
  <path d="M44 37v14M37 44h14" stroke="${GREEN}" stroke-width="5" stroke-linecap="round"/>
</svg>`

const png = (svg, width) => new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true } }).render().asPng()

writeFileSync('public/og-image.png', png(card, 1200))
writeFileSync('public/favicon.svg', icon)
writeFileSync('public/favicon.png', png(icon, 32))
writeFileSync('public/apple-touch-icon.png', png(icon, 180))
writeFileSync('public/icon-192.png', png(icon, 192))
writeFileSync('public/icon-512.png', png(icon, 512))
console.log('wrote og-image.png, favicon.svg/png, apple-touch-icon.png, icon-192/512.png')
