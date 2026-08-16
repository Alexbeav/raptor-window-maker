// GLB container archive (Raptor: Call of the Shadows data files).
// Format from the released game source and the engine port's glbapi.cpp;
// mirrors the Python reference in the Delta Sector installer (raptor_glb.py).
// Browser-portable: Uint8Array/DataView only, no Node APIs.

const KEY = new TextEncoder().encode("32768GLB");
const SEED = 0x19;

export const FAT_ENTRY = 28; // sizeof(KEYFILE)
export const FLAG_ENCODED = 0x1;

export function decrypt(buf) {
  let kidx = SEED % KEY.length;
  let prev = KEY[kidx];
  const out = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = (buf[i] - KEY[kidx] - prev) & 0xff;
    prev = buf[i];
    kidx = (kidx + 1) % KEY.length;
  }
  return out;
}

export function encrypt(buf) {
  let kidx = SEED % KEY.length;
  let prev = KEY[kidx];
  const out = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    prev = (buf[i] + KEY[kidx] + prev) & 0xff;
    out[i] = prev;
    kidx = (kidx + 1) % KEY.length;
  }
  return out;
}

function asciiz(bytes) {
  const end = bytes.indexOf(0);
  return new TextDecoder("ascii").decode(end < 0 ? bytes : bytes.subarray(0, end));
}

// -> { items: [{ flags, name, nameRaw, data }] }  (data always decrypted)
export function parseGlb(bytes) {
  const hdr = decrypt(bytes.subarray(0, FAT_ENTRY));
  const count = new DataView(hdr.buffer, hdr.byteOffset).getUint32(4, true);
  const items = [];
  for (let i = 0; i < count; i++) {
    const e = decrypt(bytes.subarray(FAT_ENTRY * (i + 1), FAT_ENTRY * (i + 2)));
    const dv = new DataView(e.buffer, e.byteOffset);
    const flags = dv.getUint32(0, true);
    const offset = dv.getUint32(4, true);
    const size = dv.getUint32(8, true);
    const nameRaw = e.slice(12, 28);
    let data = bytes.slice(offset, offset + size);
    if (flags & FLAG_ENCODED) data = decrypt(data);
    items.push({ flags, name: asciiz(nameRaw), nameRaw, data });
  }
  return { items };
}

export function buildGlb(items) {
  const count = items.length;
  let offset = FAT_ENTRY * (count + 1);
  const fat = new Uint8Array(FAT_ENTRY * (count + 1));
  const head = new Uint8Array(FAT_ENTRY);
  new DataView(head.buffer).setUint32(4, count, true);
  fat.set(encrypt(head), 0);
  const blobs = [];
  for (let i = 0; i < count; i++) {
    const it = items[i];
    const e = new Uint8Array(FAT_ENTRY);
    const dv = new DataView(e.buffer);
    dv.setUint32(0, it.flags, true);
    dv.setUint32(4, offset, true);
    dv.setUint32(8, it.data.length, true);
    const nameRaw = it.nameRaw ?? new TextEncoder().encode(it.name);
    if (nameRaw.length > 16) throw new Error(`item name too long: ${it.name}`);
    e.set(nameRaw.subarray(0, 16), 12);
    fat.set(encrypt(e), FAT_ENTRY * (i + 1));
    const blob = it.flags & FLAG_ENCODED ? encrypt(it.data) : it.data;
    blobs.push(blob);
    offset += blob.length;
  }
  const total = blobs.reduce((n, b) => n + b.length, fat.length);
  const out = new Uint8Array(total);
  out.set(fat, 0);
  let pos = fat.length;
  for (const b of blobs) {
    out.set(b, pos);
    pos += b.length;
  }
  return out;
}
