const fs = require('fs');
const zlib = require('zlib');

// Crée un PNG RGBA non compressé/déflate valide
function createPng(width, height, drawFn) {
  const bytesPerPixel = 4;
  const rowSize = 1 + width * bytesPerPixel;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * bytesPerPixel;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      let byte = buf[i];
      crc = crc ^ byte;
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    header,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflated),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// Dessin de l'icône EFootLigue avec gamepad et couleurs
function drawIcon(x, y, w, h) {
  const nx = x / w;
  const ny = y / h;
  const cx = 0.5;
  const cy = 0.45;
  const dx = nx - cx;
  const dy = ny - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Background sombre avec dégradé subtil
  let r = 14 + Math.floor(nx * 10);
  let g = 23 + Math.floor(ny * 12);
  let b = 18 + Math.floor((1 - ny) * 15);
  let a = 255;

  // Bordure arrondie
  const cornerDist = Math.max(Math.abs(nx - 0.5), Math.abs(ny - 0.5));
  if (cornerDist > 0.48) {
    // bord extérieur
    return [43, 63, 53, 255];
  }

  // Halo central vert lime (#B6FF3C -> rgb(182, 255, 60))
  if (dist < 0.35) {
    const intensity = (1 - dist / 0.35);
    r = Math.min(255, Math.floor(r + 30 * intensity));
    g = Math.min(255, Math.floor(g + 60 * intensity));
    b = Math.min(255, Math.floor(b + 20 * intensity));
  }

  // Manette / Forme de gamepad stylisée
  const inGamepad = (Math.abs(dx) < 0.28 && Math.abs(dy) < 0.16) ||
                    (Math.sqrt(Math.pow(Math.abs(dx) - 0.22, 2) + Math.pow(dy, 2)) < 0.14);

  if (inGamepad) {
    r = 23;
    g = 38;
    b = 33;

    // Contour manette en vert lime
    if (dist > 0.22 && dist < 0.26) {
      r = 182; g = 255; b = 60;
    }
  }

  // D-PAD à gauche
  if (dx > -0.22 && dx < -0.12 && Math.abs(dy) < 0.05) { r = 182; g = 255; b = 60; }
  if (Math.abs(dx - (-0.17)) < 0.025 && dy > -0.09 && dy < 0.01) { r = 182; g = 255; b = 60; }

  // Boutons à droite (Gold, Lime, Blue, Red)
  const b1 = Math.sqrt(Math.pow(dx - 0.17, 2) + Math.pow(dy - (-0.05), 2));
  const b2 = Math.sqrt(Math.pow(dx - 0.22, 2) + Math.pow(dy, 2));
  const b3 = Math.sqrt(Math.pow(dx - 0.17, 2) + Math.pow(dy - 0.05, 2));
  const b4 = Math.sqrt(Math.pow(dx - 0.12, 2) + Math.pow(dy, 2));
  if (b1 < 0.022) { r = 242; g = 168; b = 60; }
  if (b2 < 0.022) { r = 182; g = 255; b = 60; }
  if (b3 < 0.022) { r = 59; g = 130; b = 246; }
  if (b4 < 0.022) { r = 255; g = 91; b = 77; }

  // Centre étoile/trophée
  if (Math.abs(dx) < 0.03 && Math.abs(dy - (-0.04)) < 0.03) {
    r = 242; g = 168; b = 60;
  }

  // Bandeau texte / typographie en bas
  if (ny > 0.72 && ny < 0.82 && Math.abs(dx) < 0.38) {
    r = (nx < 0.5) ? 243 : 182;
    g = (nx < 0.5) ? 241 : 255;
    b = (nx < 0.5) ? 231 : 60;
  }

  return [r, g, b, a];
}

fs.mkdirSync('public/icons', { recursive: true });

const png192 = createPng(192, 192, drawIcon);
fs.writeFileSync('public/icons/icon-192.png', png192);

const png512 = createPng(512, 512, drawIcon);
fs.writeFileSync('public/icons/icon-512.png', png512);
fs.writeFileSync('public/icons/icon-maskable-512.png', png512);
fs.writeFileSync('public/apple-touch-icon.png', png192);
fs.writeFileSync('public/favicon.ico', png192);

console.log('PNG Icons successfully generated in public/icons/');
