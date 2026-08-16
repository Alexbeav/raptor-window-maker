// Editing operations on parsed SWD windows (see swd.mjs for the model).
//
// Ops are append-style, matching how the Delta Sector installer patches
// windows: label edits append a new string to the text area and repoint the
// field's txtoff, leaving all other bytes untouched (dead bytes are legal -
// the engine only ever follows txtoff). compactText() garbage-collects.
//
// txtoff bookkeeping: each field's txtoff is relative to its own 148-byte
// record, so inserting/removing a record shifts the text area relative to
// records that DON'T move (the earlier ones) and not relative to ones that
// do. header.txtofs always tracks the text area's absolute offset.

import { SWIN_SIZE, SFIELD32_SIZE, FIELD_TYPES } from "./swd.mjs";

const enc = new TextEncoder();

function fldofs(swd) {
  return SWIN_SIZE + swd.headerGap.length;
}

function textStart(swd) {
  return fldofs(swd) + swd.fields.length * SFIELD32_SIZE;
}

function name16(str) {
  // the format stores NUL-terminated ASCII in 16 bytes (15 usable)
  if (!/^[\x20-\x7e]*$/.test(str)) throw new Error(`name must be ASCII: ${JSON.stringify(str)}`);
  if (str.length > 15) throw new Error(`name too long (max 15 chars): ${str}`);
  const raw = new Uint8Array(16);
  raw.set(enc.encode(str));
  return raw;
}

// Labels are stored as NUL-terminated single-byte ASCII; reject anything
// that would serialize to different bytes than it parses back to.
function checkLabel(str) {
  if (!/^[\x20-\x7e]*$/.test(str))
    throw new Error(`label must be printable ASCII: ${JSON.stringify(str)}`);
}

function checkIndex(swd, index) {
  if (!Number.isInteger(index) || index < 0 || index >= swd.fields.length)
    throw new Error(`no field ${index} (window has ${swd.fields.length})`);
}

function appendText(swd, str) {
  const bytes = enc.encode(str + "\0");
  const pos = swd.text.length;
  const next = new Uint8Array(pos + bytes.length);
  next.set(swd.text);
  next.set(bytes, pos);
  swd.text = next;
  return pos; // offset of the new string within the text area
}

const NAME_KEYS = new Set(["name", "item_name", "font_name"]);

// Assign plain int members and/or the 16-byte name strings on a field or on
// swd.header. Name strings also refresh the decoded convenience value.
export function setProps(rec, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (NAME_KEYS.has(k)) {
      rec[`${k}Raw`] = name16(v);
      rec[k] = v;
    } else {
      rec[k] = v | 0;
      if (k === "opt" && "typeName" in rec)
        rec.typeName = FIELD_TYPES[rec.opt] ?? `unknown(${rec.opt})`;
    }
  }
}

export function setLabel(swd, index, label) {
  checkIndex(swd, index);
  checkLabel(label);
  const fld = swd.fields[index];
  const pos = appendText(swd, label);
  fld.txtoff = (textStart(swd) + pos) - (fldofs(swd) + index * SFIELD32_SIZE);
  fld.textResolved = label;
}

// Clone an existing field (or pass a full record) and append it.
// Returns the new field's index.
export function addField(swd, { cloneFrom = null, name, label = "", ...overrides }) {
  // validate everything BEFORE mutating, so a bad argument can't leave the
  // window half-edited (txtoffs shifted, no field appended)
  if (cloneFrom !== null) checkIndex(swd, cloneFrom);
  checkLabel(label);
  if (name !== undefined) name16(name);
  for (const k of Object.keys(overrides)) if (NAME_KEYS.has(k)) name16(overrides[k]);

  for (const f of swd.fields) f.txtoff += SFIELD32_SIZE; // text moves away
  const src = cloneFrom !== null ? swd.fields[cloneFrom] : defaultButton();
  const fld = { ...src, nameRaw: src.nameRaw.slice(), item_nameRaw: src.item_nameRaw.slice(), font_nameRaw: src.font_nameRaw.slice() };
  if (name !== undefined) setProps(fld, { name });
  swd.fields.push(fld);
  const index = swd.fields.length - 1;
  const pos = appendText(swd, label);
  fld.txtoff = (textStart(swd) + pos) - (fldofs(swd) + index * SFIELD32_SIZE);
  fld.textResolved = label;
  setProps(fld, overrides);
  swd.header.numflds = swd.fields.length;
  swd.header.txtofs = textStart(swd);
  return index;
}

export function deleteField(swd, index) {
  checkIndex(swd, index);
  swd.fields.splice(index, 1);
  // records at < index keep their position while the text area moves closer;
  // records after index shift down with the text area, staying relative
  for (let i = 0; i < index; i++) swd.fields[i].txtoff -= SFIELD32_SIZE;
  swd.header.numflds = swd.fields.length;
  swd.header.txtofs = textStart(swd);
}

// Rebuild the text area from the fields' current labels, dropping dead bytes.
export function compactText(swd) {
  const chunks = [];
  let pos = 0;
  const base = textStart(swd);
  swd.fields.forEach((fld, i) => {
    const label = fld.textResolved ?? "";
    fld.txtoff = (base + pos) - (fldofs(swd) + i * SFIELD32_SIZE);
    const bytes = enc.encode(label + "\0");
    chunks.push(bytes);
    pos += bytes.length;
  });
  const next = new Uint8Array(pos);
  let o = 0;
  for (const c of chunks) { next.set(c, o); o += c.length; }
  swd.text = next;
  swd.header.txtofs = base;
}

function defaultButton() {
  return {
    opt: FIELD_TYPES.indexOf("button"), id: 0, hotkey: 0, kbflag: 0,
    opt3: 0, opt4: 0, input_opt: 0, bstatus: 0,
    name: "NEWFIELD", nameRaw: name16("NEWFIELD"),
    item_name: "", item_nameRaw: new Uint8Array(16),
    item: -1,
    font_name: "SYSTEM_FNT", font_nameRaw: name16("SYSTEM_FNT"),
    fontid: -1, fontbasecolor: 16, maxchars: 32, picflag: 0,
    color: 24, lite: 28, mark: 0, saveflag: 0, shadow: 0, selectable: 1,
    x: 8, y: 8, lx: 80, ly: 14, txtoff: 0, placeholder: 0,
    typeName: "button", textResolved: "",
  };
}

// A minimal new fill-style window, ready for addField().
export function newWindow({ name, x = 60, y = 40, lx = 200, ly = 120, color = 24 }) {
  return {
    header: {
      version: 0, swdsize: 0, arrowflag: 1, display: 1, opt3: 0, opt4: 0,
      id: 0, type: 0,
      name, nameRaw: name16(name),
      item_name: "", item_nameRaw: new Uint8Array(16),
      item: -1, picflag: 0, lock: 0, fldofs: SWIN_SIZE, txtofs: SWIN_SIZE,
      firstfld: 0, opt: 0, color, numflds: 0,
      x, y, lx, ly, shadow: 1,
    },
    headerGap: new Uint8Array(0),
    fields: [],
    text: new Uint8Array(0),
  };
}
