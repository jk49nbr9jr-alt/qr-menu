// make-qr.mjs
import fs from "fs";
import path from "path";
import QRCode from "qrcode";

const args = process.argv.slice(2);
const url = args[0] || "https://speisekarte.urixsoft.de/";
const label = args[1] || "Speisekarte Urixsoft";

// Ausgabeverzeichnis festlegen
const outDir = path.resolve("public");

// Sicherstellen, dass es existiert
fs.mkdirSync(outDir, { recursive: true });

// Dateien definieren
const pngFile = path.join(outDir, "qr-speisekarte.png");
const svgFile = path.join(outDir, "qr-speisekarte.svg");

console.log(`🔗 Erstelle QR-Code für: ${url}`);

// SVG erzeugen
const svg = await QRCode.toString(url, {
  type: "svg",
  color: { dark: "#000000", light: "#FFFFFF" },
  margin: 1,
});
fs.writeFileSync(svgFile, svg, "utf8");

// PNG erzeugen
await QRCode.toFile(pngFile, url, {
  color: { dark: "#000000", light: "#FFFFFF" },
  width: 512,
  margin: 1,
});

console.log("✅ QR-Code erfolgreich erstellt!");
console.log("📁 Dateien gespeichert unter:");
console.log("   ", pngFile);
console.log("   ", svgFile);
console.log(`🏷️  Label: ${label}`);