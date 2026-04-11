/* eslint-disable no-param-reassign -- raster generation mutates RGBA buffers in place */
/* eslint-disable no-bitwise -- CRC32 computation relies on bitwise operations */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const SUPERSAMPLE = 4;
const BACKGROUND_COLOR = [248, 241, 232, 255];
const LEFT_PAGE_COLOR = [44, 93, 103, 255];
const RIGHT_PAGE_COLOR = [59, 116, 128, 255];
const SPINE_COLOR = [232, 220, 200, 255];
const BEAM_COLOR = [240, 148, 97, 255];

const PNG_TARGETS = [
  { filename: 'favicon-16x16.png', size: 16, variant: 'standard' },
  { filename: 'favicon-32x32.png', size: 32, variant: 'standard' },
  { filename: 'apple-touch-icon.png', size: 180, variant: 'standard' },
  { filename: 'pwa-192x192.png', size: 192, variant: 'standard' },
  { filename: 'pwa-512x512.png', size: 512, variant: 'standard' },
  { filename: 'pwa-maskable-192x192.png', size: 192, variant: 'maskable' },
  { filename: 'pwa-maskable-512x512.png', size: 512, variant: 'maskable' },
];

const SVG_TARGETS = ['brand-symbol.svg', 'favicon.svg'];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function transformPoint([x, y], scale, offsetX, offsetY) {
  return [offsetX + x * scale, offsetY + y * scale];
}

function createBuffer(size) {
  return new Uint8Array(size * size * 4);
}

function fillPixel(buffer, size, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }

  const index = (y * size + x) * 4;
  if (a >= 255) {
    buffer[index] = r;
    buffer[index + 1] = g;
    buffer[index + 2] = b;
    buffer[index + 3] = 255;
    return;
  }

  const existingAlpha = buffer[index + 3] / 255;
  const incomingAlpha = a / 255;
  const outAlpha = incomingAlpha + existingAlpha * (1 - incomingAlpha);

  if (outAlpha <= 0) {
    buffer[index] = 0;
    buffer[index + 1] = 0;
    buffer[index + 2] = 0;
    buffer[index + 3] = 0;
    return;
  }

  const existingRed = buffer[index] / 255;
  const existingGreen = buffer[index + 1] / 255;
  const existingBlue = buffer[index + 2] / 255;
  const incomingRed = r / 255;
  const incomingGreen = g / 255;
  const incomingBlue = b / 255;
  const retainedSourceAlpha = existingAlpha * (1 - incomingAlpha);

  const outRed = (incomingRed * incomingAlpha + existingRed * retainedSourceAlpha) / outAlpha;
  const outGreen =
    (incomingGreen * incomingAlpha + existingGreen * retainedSourceAlpha) / outAlpha;
  const outBlue = (incomingBlue * incomingAlpha + existingBlue * retainedSourceAlpha) / outAlpha;

  buffer[index] = Math.round(outRed * 255);
  buffer[index + 1] = Math.round(outGreen * 255);
  buffer[index + 2] = Math.round(outBlue * 255);
  buffer[index + 3] = Math.round(outAlpha * 255);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / lengthSquared);
  const projectedX = ax + t * dx;
  const projectedY = ay + t * dy;
  return Math.hypot(px - projectedX, py - projectedY);
}

function strokeLine(buffer, size, ax, ay, bx, by, width, color) {
  const padding = width * 0.7;
  const minX = Math.floor(Math.min(ax, bx) - padding);
  const maxX = Math.ceil(Math.max(ax, bx) + padding);
  const minY = Math.floor(Math.min(ay, by) - padding);
  const maxY = Math.ceil(Math.max(ay, by) + padding);
  const radius = width / 2;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (distanceToSegment(x + 0.5, y + 0.5, ax, ay, bx, by) <= radius) {
        fillPixel(buffer, size, x, y, color);
      }
    }
  }
}

function fillCircle(buffer, size, cx, cy, radius, color) {
  const minX = Math.floor(cx - radius);
  const maxX = Math.ceil(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.ceil(cy + radius);
  const radiusSquared = radius * radius;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= radiusSquared) {
        fillPixel(buffer, size, x, y, color);
      }
    }
  }
}

function fillRect(buffer, size, x, y, width, height, color) {
  const minX = Math.floor(x);
  const maxX = Math.ceil(x + width);
  const minY = Math.floor(y);
  const maxY = Math.ceil(y + height);

  for (let cursorY = minY; cursorY <= maxY; cursorY += 1) {
    for (let cursorX = minX; cursorX <= maxX; cursorX += 1) {
      fillPixel(buffer, size, cursorX, cursorY, color);
    }
  }
}

function downsample(buffer, highSize, scale) {
  const outputSize = highSize / scale;
  const output = new Uint8Array(outputSize * outputSize * 4);
  const samples = scale * scale;

  for (let y = 0; y < outputSize; y += 1) {
    for (let x = 0; x < outputSize; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;

      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const index = (((y * scale + sy) * highSize) + (x * scale + sx)) * 4;
          red += buffer[index];
          green += buffer[index + 1];
          blue += buffer[index + 2];
          alpha += buffer[index + 3];
        }
      }

      const outIndex = (y * outputSize + x) * 4;
      output[outIndex] = Math.round(red / samples);
      output[outIndex + 1] = Math.round(green / samples);
      output[outIndex + 2] = Math.round(blue / samples);
      output[outIndex + 3] = Math.round(alpha / samples);
    }
  }

  return output;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function encodePng(size, rgbaBuffer) {
  const stride = size * 4;
  const scanlines = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (stride + 1);
    scanlines[rowStart] = 0;
    const sourceOffset = y * stride;
    Buffer.from(rgbaBuffer.subarray(sourceOffset, sourceOffset + stride))
      .copy(scanlines, rowStart + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    createChunk('IHDR', ihdr),
    createChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  let offset = 6 + entries.length * 16;

  entries.forEach((entry, index) => {
    const cursor = index * 16;
    directory[cursor] = entry.size >= 256 ? 0 : entry.size;
    directory[cursor + 1] = entry.size >= 256 ? 0 : entry.size;
    directory[cursor + 2] = 0;
    directory[cursor + 3] = 0;
    directory.writeUInt16LE(1, cursor + 4);
    directory.writeUInt16LE(32, cursor + 6);
    directory.writeUInt32LE(entry.data.length, cursor + 8);
    directory.writeUInt32LE(offset, cursor + 12);
    offset += entry.data.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.data)]);
}

function createBrandGeometry(scale, offsetX, offsetY) {
  const leftPage = {
    topLeft: transformPoint([118, 114], scale, offsetX, offsetY),
    width: 206 * scale,
    height: 276 * scale,
  };
  const rightPage = {
    topLeft: transformPoint([188, 114], scale, offsetX, offsetY),
    width: 206 * scale,
    height: 276 * scale,
  };
  const spine = {
    start: transformPoint([256, 136], scale, offsetX, offsetY),
    end: transformPoint([256, 366], scale, offsetX, offsetY),
  };
  const beam = {
    start: transformPoint([162, 304], scale, offsetX, offsetY),
    end: transformPoint([340, 170], scale, offsetX, offsetY),
  };
  const node = transformPoint([340, 170], scale, offsetX, offsetY);

  return {
    leftPage,
    rightPage,
    spine,
    beam,
    node,
    strokeWidths: {
      spine: 18 * scale,
      beam: 22 * scale,
    },
    nodeRadius: 22 * scale,
  };
}

function resolveScaleFactor(variant, size) {
  if (variant === 'maskable') {
    return 0.9;
  }
  if (size <= 32) {
    return 1.02;
  }
  return 0.96;
}

function renderBrandIcon(size, variant) {
  const highSize = size * SUPERSAMPLE;
  const buffer = createBuffer(highSize);

  for (let y = 0; y < highSize; y += 1) {
    for (let x = 0; x < highSize; x += 1) {
      fillPixel(buffer, highSize, x, y, BACKGROUND_COLOR);
    }
  }

  const scaleFactor = resolveScaleFactor(variant, size);
  const scale = (highSize / 512) * scaleFactor;
  const offsetX = (highSize - 512 * scale) / 2;
  const offsetY = (highSize - 512 * scale) / 2 + (variant === 'maskable' ? highSize * 0.01 : highSize * 0.005);
  const geometry = createBrandGeometry(scale, offsetX, offsetY);

  fillRect(
    buffer,
    highSize,
    geometry.leftPage.topLeft[0],
    geometry.leftPage.topLeft[1],
    geometry.leftPage.width,
    geometry.leftPage.height,
    LEFT_PAGE_COLOR,
  );
  fillRect(
    buffer,
    highSize,
    geometry.rightPage.topLeft[0],
    geometry.rightPage.topLeft[1],
    geometry.rightPage.width,
    geometry.rightPage.height,
    RIGHT_PAGE_COLOR,
  );
  strokeLine(
    buffer,
    highSize,
    geometry.spine.start[0],
    geometry.spine.start[1],
    geometry.spine.end[0],
    geometry.spine.end[1],
    geometry.strokeWidths.spine,
    SPINE_COLOR,
  );
  strokeLine(
    buffer,
    highSize,
    geometry.beam.start[0],
    geometry.beam.start[1],
    geometry.beam.end[0],
    geometry.beam.end[1],
    geometry.strokeWidths.beam,
    BEAM_COLOR,
  );
  fillCircle(buffer, highSize, geometry.node[0], geometry.node[1], geometry.nodeRadius, BEAM_COLOR);

  return downsample(buffer, highSize, SUPERSAMPLE);
}

function createBrandSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <title>PlotMapAI Symbol</title>
  <desc>Minimal symbol for PlotMapAI built as a page beam with a single highlighted narrative point.</desc>
  <rect width="512" height="512" fill="#F8F1E8"/>
  <path fill="#2C5D67" d="M118 114h118c50 0 88 34 88 84v192H118V114Z"/>
  <path fill="#3B7480" d="M394 114H276c-50 0-88 34-88 84v192h206V114Z"/>
  <path stroke="#E8DCC8" stroke-width="18" stroke-linecap="round" d="M256 136v230"/>
  <path stroke="#F09461" stroke-width="22" stroke-linecap="round" d="M162 304 340 170"/>
  <circle cx="340" cy="170" r="22" fill="#F09461"/>
</svg>
`;
}

function writeAsset(pathname, content) {
  const targetPath = resolve(pathname);
  writeFileSync(targetPath, content);
  process.stdout.write(`Generated ${targetPath}\n`);
}

const pngOutputs = new Map();
for (const target of PNG_TARGETS) {
  const png = encodePng(target.size, renderBrandIcon(target.size, target.variant));
  pngOutputs.set(target.filename, png);
  writeAsset(`public/${target.filename}`, png);
}

for (const svgTarget of SVG_TARGETS) {
  writeAsset(`public/${svgTarget}`, createBrandSvg());
}

writeAsset(
  'public/favicon.ico',
  encodeIco([
    { size: 16, data: pngOutputs.get('favicon-16x16.png') },
    { size: 32, data: pngOutputs.get('favicon-32x32.png') },
  ]),
);
