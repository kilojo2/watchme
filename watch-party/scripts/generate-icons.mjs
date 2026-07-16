import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { deflateSync } from "zlib";

const ICONS_DIR = resolve("src-tauri", "icons");

// Create a minimal valid PNG with a solid color
function createPNG(width, height, r, g, b) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);   // width
  ihdrData.writeUInt32BE(height, 4);  // height
  ihdrData.writeUInt8(8, 8);          // bit depth (8 bits per channel)
  ihdrData.writeUInt8(2, 9);          // color type (RGB)
  ihdrData.writeUInt8(0, 10);         // compression
  ihdrData.writeUInt8(0, 11);         // filter
  ihdrData.writeUInt8(0, 12);         // interlace
  const ihdr = createChunk("IHDR", ihdrData);

  // IDAT chunk - raw pixel data (filter byte + RGB bytes per row)
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter byte (none)
    for (let x = 0; x < width; x++) {
      rawData.push(r, g, b);
    }
  }
  const compressed = deflateSync(Buffer.from(rawData));
  const idat = createChunk("IDAT", compressed);

  // IEND chunk
  const iend = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation
function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Create ICO file from PNG data
function createICO(pngBuffer) {
  const numImages = 1;
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);     // reserved
  icoHeader.writeUInt16LE(1, 2);     // ICO type
  icoHeader.writeUInt16LE(numImages, 4); // count

  // Directory entry - we need to know the PNG dimensions
  // For simplicity, assume 32x32
  const entry = Buffer.alloc(16);
  entry.writeUInt8(32, 0);           // width
  entry.writeUInt8(32, 1);           // height
  entry.writeUInt8(0, 2);            // colors
  entry.writeUInt8(0, 3);            // reserved
  entry.writeUInt16LE(1, 4);         // planes
  entry.writeUInt16LE(32, 6);        // bpp
  const offset = 6 + 16; // header + entry
  entry.writeUInt32LE(pngBuffer.length, 8);  // size
  entry.writeUInt32LE(offset, 12);           // offset

  return Buffer.concat([icoHeader, entry, pngBuffer]);
}

// Main
mkdirSync(ICONS_DIR, { recursive: true });

// Generate icons at different sizes
const sizes = [
  { name: "32x32.png", w: 32, h: 32 },
  { name: "128x128.png", w: 128, h: 128 },
  { name: "128x128@2x.png", w: 256, h: 256 },
  { name: "icon.png", w: 512, h: 512 },  // Source for .icns
];

// Use a nice blue-purple gradient-ish color
const color = { r: 88, g: 101, b: 242 }; // Indigo

for (const { name, w, h } of sizes) {
  const png = createPNG(w, h, color.r, color.g, color.b);
  const outPath = resolve(ICONS_DIR, name);
  writeFileSync(outPath, png);
  console.log(`Created ${outPath} (${png.length} bytes, ${w}x${h})`);
}

// Create .icns (Apple icon format) - simplified, just use 128x128 PNG
// macOS .icns is just an archive of PNG images at various sizes
// For a minimal build, we can use a simplified .icns with just one entry
const icon128 = createPNG(128, 128, color.r, color.g, color.b);
const icnsPath = resolve(ICONS_DIR, "icon.icns");
writeFileSync(icnsPath, icon128);
console.log(`Created ${icnsPath} (${icon128.length} bytes, fallback)`);

// Create .ico (Windows icon)
const icon32 = createPNG(32, 32, color.r, color.g, color.b);
const ico = createICO(icon32);
const icoPath = resolve(ICONS_DIR, "icon.ico");
writeFileSync(icoPath, ico);
console.log(`Created ${icoPath} (${ico.length} bytes)`);

console.log("\nAll icons generated successfully!");
