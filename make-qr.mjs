import QRCode from 'qrcode'
import fs from 'node:fs'
import path from 'node:path'


const url = process.argv[2] || 'http://speisekarte.urixsoft/'; // ODER https://speisekarte.urixsoft.de/
const BRAND = process.argv[3] || 'Speisekarte Urixsoft';

// falls public-Ordner nicht existiert → anlegen
fs.mkdirSync(outDir, { recursive: true })

const pngPath = path.join(outDir, 'qr-speisekarte.png')
const svgPath = path.join(outDir, 'qr-speisekarte.svg')

try {
  await QRCode.toFile(pngPath, url, { width: 1024, margin: 2 })
  await QRCode.toFile(svgPath, url, { type: 'svg', margin: 1 })
  console.log('✅ QR-Code erfolgreich erstellt!')
  console.log('📁 Dateien gespeichert unter:')
  console.log('   ', pngPath)
  console.log('   ', svgPath)
} catch (err) {
  console.error('❌ Fehler beim Erstellen des QR-Codes:', err)
}