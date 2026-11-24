// Generates raster image assets from the editable brand SVG.
// No external image service is required; sharp is already a dependency.
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const markSource = (await readFile('public/brand/azimara-mesh-mark.svg')).toString()
const mark = markSource.replace(/<\?xml[^>]*\?>|<svg[^>]*>|<\/svg>/g, '')

// Apple touch icon: brand mark on the midnight canvas.
await sharp({
  create: { width: 180, height: 180, channels: 4, background: '#0B1020' },
})
  .composite([{
    input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><g transform="translate(30,30) scale(1.875)">${mark}</g></svg>`),
    gravity: 'center',
  }])
  .png()
  .toFile('public/apple-touch-icon.png')

// Open Graph card: dark canvas, restrained mesh grid, brand mark and wordmark.
const grid = Array.from({ length: 24 }, (_, i) => `<line x1="${i * 52}" y1="0" x2="${i * 52}" y2="630" stroke="#1B2942" stroke-width="1"/>`).join('')
  + Array.from({ length: 13 }, (_, i) => `<line x1="0" y1="${i * 52}" x2="1200" y2="${i * 52}" stroke="#1B2942" stroke-width="1"/>`).join('')
const nodes = Array.from({ length: 26 }, (_, i) => {
  const x = 760 + ((i * 137) % 380)
  const y = 80 + ((i * 197) % 470)
  const color = ['#8B7CFF', '#42D9E8', '#39C7B2'][i % 3]
  return `<circle cx="${x}" cy="${y}" r="${i % 5 === 0 ? 6 : 3}" fill="${color}" opacity="0.85"/>`
}).join('')

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0B1020"/>
  ${grid}
  ${nodes}
  <g transform="translate(90,150) scale(2.34375)">${mark}</g>
  <text x="90" y="400" fill="#F4F7FC" font-family="DejaVu Sans, sans-serif" font-size="68" font-weight="700" letter-spacing="-2">AZIMARA MESH</text>
  <text x="92" y="460" fill="#B4C0D4" font-family="DejaVu Sans, sans-serif" font-size="30">Every agent. One governed system.</text>
  <rect x="90" y="510" width="260" height="4" fill="#8B7CFF"/>
  <rect x="350" y="510" width="260" height="4" fill="#42D9E8"/>
</svg>`
await writeFile('public/og-image.svg', ogSvg)
await sharp(Buffer.from(ogSvg)).png().toFile('public/og-image.png')

// Text-free ambient topology used as a static fallback behind the live canvas.
const patternSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0E1526"/>
  ${grid}
  ${nodes}
</svg>`
await writeFile('public/brand/mesh-hero-pattern.svg', patternSvg)
console.log('image assets generated: apple-touch-icon.png, og-image.png, og-image.svg, mesh-hero-pattern.svg')
