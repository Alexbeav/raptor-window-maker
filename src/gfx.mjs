// Pixel-faithful port of the engine's drawing primitives (gfxapi.cpp) to a
// 320x200 indexed framebuffer. Browser-portable: no Node APIs.

export const SCREEN_W = 320;
export const SCREEN_H = 200;

// PALETTE_DAT: 256 x 3 bytes of 6-bit VGA values.
export function parsePalette(raw) {
  if (raw.length < 768) throw new Error(`palette too small (${raw.length} bytes, need 768)`);
  const pal = new Array(256);
  for (let i = 0; i < 256; i++) pal[i] = [raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]];
  return pal; // 6-bit components (0-63)
}

export function paletteToRgb(pal6) {
  return pal6.map(([r, g, b]) => [r << 2, g << 2, b << 2]);
}

// GFX_Remap: nearest palette entry by abs-sum distance; ties keep the LAST
// (highest) index, because the original scans 0..255 with `num <= low`.
function remap(pal6, r, g, b) {
  let low = 0x7fffffff, pos = 0;
  for (let i = 0; i < 256; i++) {
    const [pr, pg, pb] = pal6[i];
    const num = Math.abs(pr - r) + Math.abs(pg - g) + Math.abs(pb - b);
    if (num <= low) { low = num; pos = i; }
  }
  return pos;
}

// GFX_MakeLightTable: level is -63..+63 in 6-bit space.
export function makeLightTable(pal6, level) {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let [r, g, b] = pal6[i];
    r += level; g += level; b += level;
    if (level >= 0) { r = Math.min(r, 63); g = Math.min(g, 63); b = Math.min(b, 63); }
    else { r = Math.max(r, 0); g = Math.max(g, 0); b = Math.max(b, 0); }
    t[i] = remap(pal6, r, g, b);
  }
  return t;
}

export function makeGreyTable(pal6) {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = pal6[i];
    const c = Math.floor((r + g + b) / 3);
    t[i] = remap(pal6, c, c, c);
  }
  return t;
}

// GFX_PIC items: GPIC raw 8bpp, GSPRITE opaque segment runs.
export const GTYPE_SPRITE = 0;
export const GTYPE_PIC = 1;

export function parsePic(data) {
  if (data.length < 20) throw new Error(`pic too small (${data.length} bytes)`);
  const dv = new DataView(data.buffer, data.byteOffset);
  const type = dv.getInt32(0, true);
  const w = dv.getInt32(12, true);
  const h = dv.getInt32(16, true);
  if (w < 0 || h < 0 || w > 2048 || h > 2048)
    throw new Error(`implausible pic dimensions ${w}x${h}`);
  if (type === GTYPE_PIC) {
    if (data.length < 20 + w * h)
      throw new Error(`GPIC truncated: ${data.length} bytes for ${w}x${h}`);
    return { type, w, h, pixels: data.slice(20, 20 + w * h), mask: null };
  }
  if (type === GTYPE_SPRITE) {
    const pixels = new Uint8Array(w * h);
    const mask = new Uint8Array(w * h);
    let pos = 20;
    while (pos + 16 <= data.length) {
      const x = dv.getInt32(pos, true);
      const y = dv.getInt32(pos + 4, true);
      const offset = dv.getInt32(pos + 8, true);
      const length = dv.getInt32(pos + 12, true);
      if (offset === -1) break;
      pos += 16;
      if (length < 0 || pos + length > data.length)
        throw new Error(`GSPRITE run truncated at byte ${pos}`);
      for (let j = 0; j < length; j++) {
        if (y >= 0 && y < h && x + j >= 0 && x + j < w) {
          pixels[y * w + x + j] = data[pos + j];
          mask[y * w + x + j] = 1;
        }
      }
      pos += length;
    }
    return { type, w, h, pixels, mask };
  }
  throw new Error(`unknown GFX_TYPE ${type}`);
}

// FONT: int height + short charofs[256] + char width[256], glyph rows follow.
export const FONT_HEADER = 4 + 512 + 256;

export function parseFont(data) {
  if (data.length <= FONT_HEADER) throw new Error(`font too small (${data.length} bytes)`);
  const dv = new DataView(data.buffer, data.byteOffset);
  const height = dv.getInt32(0, true);
  if (height < 1 || height > 64) throw new Error(`implausible font height ${height}`);
  const charofs = new Int16Array(256);
  const width = new Uint8Array(256);
  for (let i = 0; i < 256; i++) charofs[i] = dv.getInt16(4 + i * 2, true);
  width.set(data.subarray(516, 772));
  const glyphs = data.subarray(FONT_HEADER);
  for (let i = 0; i < 256; i++)
    if (charofs[i] !== -1 && charofs[i] + width[i] * height > glyphs.length)
      throw new Error(`font glyph ${i} extends past end of data`);
  return { height, charofs, width, glyphs };
}

export const FONT_SPACING = 1; // gfxapi.cpp fontspacing

export function strPixelLen(font, str) {
  let len = 0;
  for (let i = 0; i < str.length; i++)
    len += font.width[str.charCodeAt(i) & 0xff] + FONT_SPACING;
  return len;
}

// Light-source corners (gfxapi.h) and shade options.
export const UPPER_LEFT = 0, UPPER_RIGHT = 1, LOWER_LEFT = 2, LOWER_RIGHT = 3;
export const DARK = 0, LIGHT = 1, GREY = 2;

export class Raster {
  constructor(tables) {
    this.buf = new Uint8Array(SCREEN_W * SCREEN_H);
    this.tables = tables; // [dark, light, grey]
  }

  inX(x) { return x >= 0 && x < SCREEN_W; }
  inY(y) { return y >= 0 && y < SCREEN_H; }

  colorBox(x, y, lx, ly, color) {
    if (lx < 1 || ly < 1) return;
    for (let j = 0; j < ly; j++) {
      const py = y + j;
      if (!this.inY(py)) continue;
      for (let i = 0; i < lx; i++) {
        const px = x + i;
        if (this.inX(px)) this.buf[py * SCREEN_W + px] = color & 0xff;
      }
    }
  }

  shadePixel(x, y, table) {
    if (!this.inX(x) || !this.inY(y)) return;
    const p = y * SCREEN_W + x;
    this.buf[p] = table[this.buf[p]];
  }

  hShadeLine(opt, x, y, lx) {
    if (lx < 1) return;
    const t = this.tables[opt];
    for (let i = 0; i < lx; i++) this.shadePixel(x + i, y, t);
  }

  vShadeLine(opt, x, y, ly) {
    if (ly < 1) return;
    const t = this.tables[opt];
    for (let j = 0; j < ly; j++) this.shadePixel(x, y + j, t);
  }

  shadeArea(opt, x, y, lx, ly) {
    const t = this.tables[opt];
    for (let j = 0; j < ly; j++)
      for (let i = 0; i < lx; i++) this.shadePixel(x + i, y + j, t);
  }

  // GFX_ShadeShape: shade only where the pic has opaque/nonzero pixels
  shadeShape(opt, pic, x, y) {
    const t = this.tables[opt];
    for (let j = 0; j < pic.h; j++)
      for (let i = 0; i < pic.w; i++) {
        const opaque = pic.mask ? pic.mask[j * pic.w + i] : pic.pixels[j * pic.w + i];
        if (opaque) this.shadePixel(x + i, y + j, t);
      }
  }

  // GFX_LightBox: rectangle border lit from a corner
  lightBox(opt, x, y, lx, ly) {
    if (lx < 1 || ly < 1) return;
    switch (opt) {
      case UPPER_LEFT:
        this.hShadeLine(LIGHT, x, y, lx - 1);
        this.vShadeLine(LIGHT, x, y + 1, ly - 2);
        this.hShadeLine(DARK, x, y + ly - 1, lx);
        this.vShadeLine(DARK, x + lx - 1, y + 1, ly - 2);
        break;
      case LOWER_LEFT:
        this.hShadeLine(LIGHT, x, y + ly - 1, lx - 1);
        this.vShadeLine(LIGHT, x, y + 1, ly - 2);
        this.hShadeLine(DARK, x, y, lx);
        this.vShadeLine(DARK, x + lx - 1, y + 1, ly - 1);
        break;
      case LOWER_RIGHT:
        this.hShadeLine(LIGHT, x + 1, y, lx - 1);
        this.vShadeLine(LIGHT, x + lx - 1, y + 1, ly - 2);
        this.hShadeLine(DARK, x, y, lx);
        this.vShadeLine(DARK, x, y + 1, ly - 2);
        break;
      case UPPER_RIGHT:
      default:
        this.hShadeLine(LIGHT, x + 1, y, lx - 1);
        this.vShadeLine(LIGHT, x + lx - 1, y + 1, ly - 2);
        this.hShadeLine(DARK, x, y + ly - 1, lx);
        this.vShadeLine(DARK, x, y, ly - 1);
        break;
    }
  }

  vLine(x, y, ly, color) {
    for (let j = 0; j < ly; j++)
      if (this.inX(x) && this.inY(y + j)) this.buf[(y + j) * SCREEN_W + x] = color & 0xff;
  }

  // GFX_PutImage: GPIC block copy (seeThru skips index 0); GSPRITE segments
  putImage(pic, x, y, seeThru) {
    for (let j = 0; j < pic.h; j++)
      for (let i = 0; i < pic.w; i++) {
        const px = x + i, py = y + j;
        if (!this.inX(px) || !this.inY(py)) continue;
        const v = pic.pixels[j * pic.w + i];
        if (pic.mask) { // GSPRITE: only opaque pixels
          if (pic.mask[j * pic.w + i]) this.buf[py * SCREEN_W + px] = v;
        } else if (!seeThru || v) {
          this.buf[py * SCREEN_W + px] = v;
        }
      }
  }

  // GFX_PutTexture: tile the pic across the area
  putTexture(pic, x, y, lx, ly) {
    for (let j = 0; j < ly; j++)
      for (let i = 0; i < lx; i++) {
        const px = x + i, py = y + j;
        if (!this.inX(px) || !this.inY(py)) continue;
        this.buf[py * SCREEN_W + px] = pic.pixels[(j % pic.h) * pic.w + (i % pic.w)];
      }
  }

  // GFX_ScalePic: nearest-neighbour scale into new_lx x new_ly
  scalePic(pic, x, y, newLx, newLy, seeThru) {
    for (let j = 0; j < newLy; j++)
      for (let i = 0; i < newLx; i++) {
        const sx = Math.floor(i * pic.w / newLx);
        const sy = Math.floor(j * pic.h / newLy);
        const px = x + i, py = y + j;
        if (!this.inX(px) || !this.inY(py)) continue;
        const s = sy * pic.w + sx;
        if (pic.mask && !pic.mask[s]) continue;
        const v = pic.pixels[s];
        if (seeThru && !v) continue;
        this.buf[py * SCREEN_W + px] = v;
      }
  }

  // GFX_Print: basecolor is decremented once, glyph bytes are added to it;
  // chars with charofs == -1 are skipped entirely (no advance).
  print(x, y, str, font, basecolor) {
    const color = basecolor - 1;
    for (let k = 0; k < str.length; k++) {
      const ch = str.charCodeAt(k) & 0xff;
      if (font.charofs[ch] === -1) continue;
      const w = font.width[ch];
      const ofs = font.charofs[ch];
      for (let j = 0; j < font.height; j++)
        for (let i = 0; i < w; i++) {
          const v = font.glyphs[ofs + j * w + i];
          if (!v) continue;
          const px = x + i, py = y + j;
          if (this.inX(px) && this.inY(py))
            this.buf[py * SCREEN_W + px] = (color + v) & 0xff;
        }
      x += w + FONT_SPACING;
    }
  }

  toRGBA(rgbPal) {
    const out = new Uint8ClampedArray(SCREEN_W * SCREEN_H * 4);
    for (let i = 0; i < this.buf.length; i++) {
      const [r, g, b] = rgbPal[this.buf[i]];
      out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
    }
    return out;
  }
}
