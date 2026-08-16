// SWD window resources - the file format of Scott Host's original window
// maker tool, as consumed by the engine's swdapi.cpp.
//
// On-disk layout (all ints little-endian signed 32-bit):
//   SWIN header        120 bytes
//   (optional gap)     bytes between 120 and header.fldofs, unused
//   SFIELD32 records   148 bytes x header.numflds, at header.fldofs
//   text area          everything after the last field record
//
// Each field's txtoff is relative to ITS OWN record start
// (swdapi.cpp:329  fld_text = (char*)curfld + curfld->txtoff).
//
// Parsing keeps every byte (raw name arrays, header gap, full text blob), so
// serializeSwd(parseSwd(b)) is byte-identical - the round-trip suite enforces
// this over every *_SWD item in the shipped game.

export const SWIN_SIZE = 120;
export const SFIELD32_SIZE = 148;

export const FIELD_TYPES = [
  "off", "text", "button", "input", "mark", "close",
  "dragbar", "bumpin", "bumpout", "icon", "objarea", "viewarea",
];

export const DRAW_STYLES = ["fill", "texture", "picture", "see_thru", "invisible"];

const SWIN_INTS = [
  ["version", 0], ["swdsize", 4], ["arrowflag", 8], ["display", 12],
  ["opt3", 16], ["opt4", 20], ["id", 24], ["type", 28],
  // name[16] @32, item_name[16] @48
  ["item", 64], ["picflag", 68], ["lock", 72], ["fldofs", 76],
  ["txtofs", 80], ["firstfld", 84], ["opt", 88], ["color", 92],
  ["numflds", 96], ["x", 100], ["y", 104], ["lx", 108],
  ["ly", 112], ["shadow", 116],
];

const SFIELD_INTS = [
  ["opt", 0], ["id", 4], ["hotkey", 8], ["kbflag", 12],
  ["opt3", 16], ["opt4", 20], ["input_opt", 24], ["bstatus", 28],
  // name[16] @32, item_name[16] @48
  ["item", 64],
  // font_name[16] @68
  ["fontid", 84], ["fontbasecolor", 88], ["maxchars", 92], ["picflag", 96],
  ["color", 100], ["lite", 104], ["mark", 108], ["saveflag", 112],
  ["shadow", 116], ["selectable", 120], ["x", 124], ["y", 128],
  ["lx", 132], ["ly", 136], ["txtoff", 140], ["placeholder", 144],
];

function asciiz(bytes) {
  const end = bytes.indexOf(0);
  return new TextDecoder("ascii").decode(end < 0 ? bytes : bytes.subarray(0, end));
}

function readStruct(bytes, base, ints, names) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset + base);
  const out = {};
  for (const [key, off] of ints) out[key] = dv.getInt32(off, true);
  for (const [key, off] of names) {
    out[`${key}Raw`] = bytes.slice(base + off, base + off + 16);
    out[key] = asciiz(out[`${key}Raw`]);
  }
  return out;
}

function writeStruct(bytes, base, obj, ints, names) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset + base);
  for (const [key, off] of ints) dv.setInt32(off, obj[key], true);
  for (const [key, off] of names) bytes.set(obj[`${key}Raw`], base + off);
}

const SWIN_NAMES = [["name", 32], ["item_name", 48]];
const SFIELD_NAMES = [["name", 32], ["item_name", 48], ["font_name", 68]];

// -> { header, headerGap, fields, text }
// fields[i].textResolved is the NUL-terminated string its txtoff points at
// (informational; serialization uses the raw text blob).
export function parseSwd(bytes) {
  if (bytes.length < SWIN_SIZE) throw new Error(`SWD too small: ${bytes.length}`);
  const header = readStruct(bytes, 0, SWIN_INTS, SWIN_NAMES);
  const { fldofs, numflds } = header;
  if (fldofs < SWIN_SIZE || fldofs + numflds * SFIELD32_SIZE > bytes.length)
    throw new Error(`bad field table: fldofs=${fldofs} numflds=${numflds} len=${bytes.length}`);
  const headerGap = bytes.slice(SWIN_SIZE, fldofs);
  const fields = [];
  for (let i = 0; i < numflds; i++) {
    const base = fldofs + i * SFIELD32_SIZE;
    const f = readStruct(bytes, base, SFIELD_INTS, SFIELD_NAMES);
    f.typeName = FIELD_TYPES[f.opt] ?? `unknown(${f.opt})`;
    const tp = base + f.txtoff;
    f.textResolved = tp >= 0 && tp < bytes.length ? asciiz(bytes.subarray(tp)) : null;
    fields.push(f);
  }
  const text = bytes.slice(fldofs + numflds * SFIELD32_SIZE);
  return { header, headerGap, fields, text };
}

export function serializeSwd(swd) {
  const { header, headerGap, fields, text } = swd;
  const fldofs = SWIN_SIZE + headerGap.length;
  const out = new Uint8Array(fldofs + fields.length * SFIELD32_SIZE + text.length);
  writeStruct(out, 0, { ...header, fldofs, numflds: fields.length }, SWIN_INTS, SWIN_NAMES);
  out.set(headerGap, SWIN_SIZE);
  fields.forEach((f, i) => writeStruct(out, fldofs + i * SFIELD32_SIZE, f, SFIELD_INTS, SFIELD_NAMES));
  out.set(text, fldofs + fields.length * SFIELD32_SIZE);
  return out;
}
