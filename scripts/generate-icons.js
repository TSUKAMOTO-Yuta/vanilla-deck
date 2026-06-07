'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUTPUT_DIRECTORY = path.resolve('assets');
const PNG_PATH = path.join(OUTPUT_DIRECTORY, 'icon.png');
const ICO_PATH = path.join(OUTPUT_DIRECTORY, 'icon.ico');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function createCrcTable() {
  return Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    return crc >>> 0;
  });
}

const CRC_TABLE = createCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function paintPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }

  const offset = (y * size + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function fillRoundedRect(pixels, size, left, top, width, height, radius, color) {
  const right = left + width - 1;
  const bottom = top + height - 1;

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const nearestX = Math.max(left + radius, Math.min(x, right - radius));
      const nearestY = Math.max(top + radius, Math.min(y, bottom - radius));
      const dx = x - nearestX;
      const dy = y - nearestY;
      if (dx * dx + dy * dy <= radius * radius) {
        paintPixel(pixels, size, x, y, color);
      }
    }
  }
}

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / 512;
  const px = (value) => Math.max(1, Math.round(value * scale));

  fillRoundedRect(pixels, size, 0, 0, size, size, px(88), [38, 74, 118, 255]);
  fillRoundedRect(pixels, size, px(82), px(88), px(104), px(336), px(24), [240, 247, 255, 255]);
  fillRoundedRect(pixels, size, px(204), px(88), px(104), px(336), px(24), [196, 218, 243, 255]);
  fillRoundedRect(pixels, size, px(326), px(88), px(104), px(336), px(24), [118, 167, 222, 255]);

  return pixels;
}

function encodePng(size) {
  const pixels = renderIcon(size);
  const scanlines = Buffer.alloc((size * 4 + 1) * size);

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * size * 4, (y + 1) * size * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    createPngChunk('IHDR', header),
    createPngChunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    createPngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeIco(images) {
  const directorySize = 6 + images.length * 16;
  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = directorySize;
  images.forEach(({ size, data }, index) => {
    const entryOffset = 6 + index * 16;
    header[entryOffset] = size >= 256 ? 0 : size;
    header[entryOffset + 1] = size >= 256 ? 0 : size;
    header[entryOffset + 2] = 0;
    header[entryOffset + 3] = 0;
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(data.length, entryOffset + 8);
    header.writeUInt32LE(offset, entryOffset + 12);
    offset += data.length;
  });

  return Buffer.concat([header, ...images.map(({ data }) => data)]);
}

fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
fs.writeFileSync(PNG_PATH, encodePng(512));
fs.writeFileSync(ICO_PATH, encodeIco(ICO_SIZES.map((size) => ({ size, data: encodePng(size) }))));

console.log(`Generated ${PNG_PATH}`);
console.log(`Generated ${ICO_PATH}`);
