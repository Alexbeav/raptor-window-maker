// Pixel-faithful port of the engine's window renderer:
//   SWD_PutWin + SWD_ShowAllFields + SWD_PutField + SWD_ShadeButton
// (swdapi.cpp). Deliberate quirks of the original are preserved and marked.

import {
  Raster, parsePic, parseFont, parsePalette, paletteToRgb,
  makeLightTable, makeGreyTable, strPixelLen,
  DARK, LIGHT, GREY, UPPER_RIGHT, LOWER_LEFT, GTYPE_SPRITE, FONT_SPACING,
} from "./gfx.mjs";

// picflag draw styles (gfxapi.h DSTYLE)
const FILL = 0, TEXTURE = 1, PICTURE = 2, SEE_THRU = 3, INVISABLE = 4;
// field types
const FLD_OFF = 0, FLD_TEXT = 1, FLD_BUTTON = 2, FLD_INPUT = 3, FLD_MARK = 4,
  FLD_CLOSE = 5, FLD_DRAGBAR = 6, FLD_BUMPIN = 7, FLD_BUMPOUT = 8, FLD_ICON = 9;
// button status
const NORMAL = 0, UP = 1, DOWN = 2;

// Rendering context bound to a GlbSet: palette, shade tables, caches.
export class RenderContext {
  constructor(glbs) {
    this.glbs = glbs;
    const palItem = glbs.byName("PALETTE_DAT");
    if (!palItem) throw new Error("PALETTE_DAT not found in loaded GLB files");
    this.pal6 = parsePalette(palItem.data);
    this.rgb = paletteToRgb(this.pal6);
    // GFX_MakeLightTable(ltable, 9) / (dtable, -9) / grey (gfxapi.cpp:243)
    this.tables = [makeLightTable(this.pal6, -9), makeLightTable(this.pal6, 9), makeGreyTable(this.pal6)];
    this.picCache = new Map();
    this.fontCache = new Map();
  }

  // Baked item/fontid ints in SWD data are stale; the engine re-resolves
  // them BY NAME at window init (swdapi.cpp:1725,1766,1758) - so do we.
  itemIdFor(rec) {
    return rec.picflag ? this.glbs.itemId(rec.item_name) : -1;
  }

  pic(id) {
    if (id < 0) return null;
    if (!this.picCache.has(id)) {
      const item = this.glbs.byId(id);
      let pic = null;
      // an FLD_TEXT field's item is a text item, not a pic - tolerate anything
      try { if (item && item.data.length >= 20) pic = parsePic(item.data); } catch { /* not a pic */ }
      this.picCache.set(id, pic);
    }
    return this.picCache.get(id);
  }

  font(field) {
    const key = field.font_name;
    if (!this.fontCache.has(key)) {
      const item = this.glbs.byName(field.font_name);
      this.fontCache.set(key, item && item.data.length > 772 ? parseFont(item.data) : null);
    }
    return this.fontCache.get(key);
  }

  newRaster() {
    return new Raster(this.tables);
  }
}

// SWD_ShadeButton. NOTE: the original's UP case has no break and falls
// through into default - preserved here.
function shadeButton(r, opt, x, y, lx, ly) {
  switch (opt) {
    case DOWN:
      r.hShadeLine(DARK, x, y, lx);
      r.vShadeLine(DARK, x + lx - 1, y + 1, ly - 1);
      break;
    case UP:
      r.hShadeLine(LIGHT, x + 2, y, lx - 2);
      r.vShadeLine(LIGHT, x + lx - 1, y + 1, ly - 3);
      // fall through (original has no break)
    default:
      r.hShadeLine(LIGHT, x + 1, y, lx - 1);
      r.vShadeLine(LIGHT, x + lx - 1, y + 1, ly - 2);
      r.hShadeLine(DARK, x, y + ly - 1, lx);
      r.vShadeLine(DARK, x, y, ly - 1);
      break;
  }
}

// SWD_FillText, simplified: renders a GLB text item into the field area with
// line wrapping; TEXT_COLOR and TEXT_POS commands are honored, TEXT_IMAGE /
// TEXT_RIGHT / TEXT_DOWN are skipped (their lines are consumed).
function fillText(ctx, r, font, itemId, color, x, y, lx, ly) {
  const item = ctx.glbs.byId(itemId);
  if (!item || !font) return;
  const text = new TextDecoder("ascii").decode(item.data).replace(/\0.*$/s, "");
  let dx = x, dy = y, col = color;
  for (const rawLine of text.split(/\r\n|\n|\r/)) {
    const line = rawLine.trimEnd();
    const m = line.match(/^\s*(TEXT_IMAGE|TEXT_COLOR|TEXT_POS|TEXT_RIGHT|TEXT_DOWN)[\s,;]+(.*)$/);
    if (m) {
      const args = m[2].split(/[\s,;]+/);
      if (m[1] === "TEXT_COLOR") col = parseInt(args[0], 10) || col;
      else if (m[1] === "TEXT_POS") { dx = x + (parseInt(args[0], 10) || 0); dy = y + (parseInt(args[1], 10) || 0); }
      continue;
    }
    if (dy > y + ly - 1) break;
    r.print(dx, dy, line, font, col);
    dy += font.height + 3;
    dx = x;
  }
}

// SWD_PutField
function putField(ctx, r, win, fld) {
  const font = ctx.font(fld);
  const itemId = ctx.itemIdFor(fld);
  const text = fld.textResolved ?? "";
  const fontHeight = font ? font.height : 8;
  const fx = fld.x + win.x;
  const fy = fld.y + win.y;
  let drawText = false;
  let textX = fx + ((fld.lx - (font ? strPixelLen(font, text) : 0)) >> 1);
  let textY = fy + ((fld.ly - fontHeight) >> 1);

  if (fld.bstatus === DOWN && fld.opt !== FLD_DRAGBAR) {
    if (textX > 0) textX--;
    textY++;
  }

  const exitDrawText = () => {
    if (drawText && fld.maxchars > 1 && font) r.print(textX, textY, text, font, fld.fontbasecolor);
  };

  if (fld.picflag && fld.picflag !== INVISABLE) {
    if (itemId === -1) return exitDrawText();
    // Original bug preserved: compares the WINDOW's field count to SEE_THRU(3)
    const drawStyle = win.numflds === SEE_THRU ? 1 : 0;
    const pic = ctx.pic(itemId);

    switch (fld.opt) {
      case FLD_BUTTON:
        if (!pic) break;
        if (fld.picflag === TEXTURE) {
          r.putTexture(pic, fx, fy, fld.lx, fld.ly);
          shadeButton(r, fld.bstatus, fx, fy, fld.lx, fld.ly);
        } else {
          r.putImage(pic, fx, fy, drawStyle);
        }
        drawText = true;
        break;

      case FLD_DRAGBAR:
        if (!pic) break;
        if (fld.picflag === TEXTURE) {
          r.putTexture(pic, fx, fy, fld.lx, fld.ly);
          r.lightBox(UPPER_RIGHT, fx, fy, fld.lx, fld.ly);
        } else {
          r.putImage(pic, fx, fy, drawStyle);
        }
        // inactive-window greying skipped: the editor renders one window
        drawText = true;
        break;

      case FLD_ICON:
        if (!pic) break;
        if (fld.picflag === TEXTURE) {
          r.putTexture(pic, fx, fy, fld.lx, fld.ly);
          return;
        }
        if (fld.lx < pic.w || fld.ly < pic.h) r.scalePic(pic, fx, fy, fld.lx, fld.ly, 0);
        else r.putImage(pic, fx, fy, drawStyle);
        break;

      case FLD_MARK:
      case FLD_CLOSE:
        if (pic) r.putImage(pic, fx, fy, drawStyle);
        break;

      case FLD_TEXT:
        fillText(ctx, r, font, itemId, fld.fontbasecolor, fx, fy, fld.lx, fld.ly);
        break;
    }

    if (!fld.bstatus) return exitDrawText();
  } else {
    switch (fld.opt) {
      case FLD_TEXT:
        if (fld.maxchars && font) r.print(fx, fy, text, font, fld.fontbasecolor);
        break;

      case FLD_BUTTON:
        if (fld.picflag !== INVISABLE) {
          r.colorBox(fx, fy, fld.lx, fld.ly, fld.color);
          shadeButton(r, fld.bstatus, fx, fy, fld.lx, fld.ly);
          drawText = true;
        } else if (font) {
          r.print(textX, textY, text, font, fld.fontbasecolor);
        }
        break;

      case FLD_INPUT:
        r.colorBox(fx, fy, fld.lx, fld.ly, fld.bstatus === NORMAL ? fld.color : fld.lite);
        if (fld.maxchars && font) r.print(fx + 1, textY, text, font, fld.fontbasecolor);
        if (fld.bstatus && font) {
          const caretX = fx + 1 + strPixelLen(font, text);
          if (strPixelLen(font, text) + 2 < fld.lx)
            r.vLine(caretX, fy + 1, fontHeight - 1, fld.fontbasecolor);
        }
        break;

      case FLD_MARK:
        r.colorBox(fx, fy, fld.lx, fld.ly, fld.color);
        r.lightBox(UPPER_RIGHT, fx, fy, fld.lx, fld.ly);
        r.colorBox(fx + 2, fy + 2, fld.lx - 4, fld.ly - 4, 0);
        textX = fx + 3; textY = fy + 3;
        if (fld.mark) {
          r.colorBox(fx + 3, fy + 3, fld.lx - 6, fld.ly - 6, fld.lite);
          shadeButton(r, fld.bstatus, fx + 3, fy + 3, fld.lx - 6, fld.ly - 6);
        } else {
          r.colorBox(fx + 3, fy + 3, fld.lx - 6, fld.ly - 6, 0);
        }
        break;

      case FLD_CLOSE:
        if (fld.picflag === INVISABLE) return exitDrawText();
        r.colorBox(fx, fy, fld.lx, fld.ly, fld.lite);
        r.lightBox(UPPER_RIGHT, fx, fy, fld.lx, fld.ly);
        r.colorBox(fx + 2, fy + 2, fld.lx - 4, fld.ly - 4, fld.lite);
        r.colorBox(fx + 3, fy + 3, fld.lx - 6, fld.ly - 6, fld.lite);
        shadeButton(r, fld.bstatus, fx + 3, fy + 3, fld.lx - 6, fld.ly - 6);
        textX = fx + 3; textY = fy + 3;
        break;

      case FLD_DRAGBAR:
        if (fld.picflag !== INVISABLE) r.colorBox(fx, fy, fld.lx, fld.ly, fld.color);
        if (fld.maxchars > 1 && font) r.print(textX, textY, text, font, fld.fontbasecolor);
        // inactive-window greying skipped (single-window editor)
        break;

      case FLD_BUMPIN:
        if (fld.color) r.shadeArea(DARK, fx + 1, fy, fld.lx - 1, fld.ly - 1);
        r.lightBox(LOWER_LEFT, fx, fy, fld.lx, fld.ly);
        if (!fld.color) r.colorBox(fx + 1, fy + 1, fld.lx - 2, fld.ly - 2, 0);
        break;

      case FLD_BUMPOUT:
        r.shadeArea(LIGHT, fx + 1, fy, fld.lx - 1, fld.ly - 1);
        r.lightBox(UPPER_RIGHT, fx, fy, fld.lx, fld.ly);
        if (!fld.color) r.colorBox(fx + 1, fy + 1, fld.lx - 2, fld.ly - 2, 0);
        break;
    }
  }

  if (fld.bstatus && fld.opt !== FLD_INPUT) {
    const h = fld.picflag === PICTURE ? ctx.pic(itemId) : null;
    const opt = fld.bstatus === DOWN ? DARK : LIGHT;
    if (h && h.type === GTYPE_SPRITE) r.shadeShape(opt, h, fx, fy);
    else r.shadeArea(opt, fx, fy, fld.lx, fld.ly);
  }

  exitDrawText();
}

// SWD_ShowAllFields: field drop shadows, then each field
function showAllFields(ctx, r, swd) {
  const win = swd.header;
  for (const fld of swd.fields) {
    if (fld.opt === FLD_OFF) continue;
    const fx = win.x + fld.x;
    const fy = win.y + fld.y;
    if (fld.shadow) {
      if (fld.picflag !== SEE_THRU) {
        r.lightBox(UPPER_RIGHT, fx - 1, fy + 1, fld.lx, fld.ly);
      } else if (fld.item !== -1) {
        const pic = ctx.pic(itemId);
        if (pic) r.shadeShape(DARK, pic, fx - 1, fy + 1);
      }
    }
    putField(ctx, r, win, fld);
  }
}

// SWD_PutWin: window shadow, background, then fields.
// Returns the raster (fresh unless one is passed in).
export function drawWindow(ctx, swd, raster = null, clearColor = 0) {
  const r = raster ?? ctx.newRaster();
  if (!raster) r.buf.fill(clearColor);
  const w = swd.header;
  const wItem = ctx.itemIdFor(w);
  const x = w.x - 8;
  const y = w.y + 8;
  const y2 = w.y + w.ly;

  if (w.shadow) {
    if (w.picflag === SEE_THRU && wItem !== -1) {
      const pic = ctx.pic(wItem);
      if (pic) r.shadeShape(DARK, pic, x, y);
    } else {
      r.shadeArea(DARK, x, y, 8, w.ly - 8);
      r.shadeArea(DARK, x, y2, w.lx, 8);
    }
  }

  switch (w.picflag) {
    case FILL:
      r.colorBox(w.x, w.y, w.lx, w.ly, w.color);
      if (w.lx < 320 && w.ly < 200) r.lightBox(UPPER_RIGHT, w.x, w.y, w.lx, w.ly);
      break;
    case PICTURE:
      if (wItem !== -1) { const p = ctx.pic(wItem); if (p) r.putImage(p, w.x, w.y, 0); }
      break;
    case SEE_THRU:
      if (wItem !== -1) { const p = ctx.pic(wItem); if (p) r.putImage(p, w.x, w.y, 1); }
      break;
    case TEXTURE:
      if (wItem !== -1) {
        const p = ctx.pic(wItem);
        if (p) {
          r.putTexture(p, w.x, w.y, w.lx, w.ly);
          r.lightBox(UPPER_RIGHT, w.x, w.y, w.lx, w.ly);
        }
      }
      break;
    case INVISABLE:
      if (w.color === 0) {
        r.shadeArea(DARK, w.x, w.y, w.lx, w.ly);
        r.lightBox(UPPER_RIGHT, w.x, w.y, w.lx, w.ly);
      }
      break;
  }

  if (swd.fields.length) showAllFields(ctx, r, swd);
  return r;
}
