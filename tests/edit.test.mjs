// Edit-operation tests. The crown jewel is installer parity: applying our
// edit ops to the pristine SHIPCOMP_SWD must reproduce, byte for byte, the
// window that the Delta Sector installer produces with its hand-rolled
// binary patch. That pins the ops to a known-good real-world artifact.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseGlb } from "../src/glb.mjs";
import { parseSwd, serializeSwd } from "../src/swd.mjs";
import { setLabel, addField, deleteField, setProps, compactText, newWindow } from "../src/edit.mjs";

const PRISTINE = "F:\\SteamLibrary\\steamapps\\common\\Raptor Call of the Shadows\\Raptor - Call of the Shadows";
const PATCHED = "I:\\Projects\\Raptor-Decomp\\playtest-s4";

function shipcomp(dir) {
  const { items } = parseGlb(new Uint8Array(readFileSync(join(dir, existsSync(join(dir, "FILE0001.GLB")) ? "FILE0001.GLB" : "file0001.glb"))));
  return items.find(it => it.name === "SHIPCOMP_SWD").data;
}

const haveData = existsSync(PRISTINE) && existsSync(PATCHED);

test("edit ops reproduce the Delta installer's SHIPCOMP patch byte-for-byte", { skip: !haveData }, () => {
  const swd = parseSwd(shipcomp(PRISTINE));
  assert.equal(swd.fields.length, 12);

  // what install_delta_sector.py patch_shipcomp() does, expressed as ops
  addField(swd, { cloneFrom: 10, name: "GAME4", label: "DELTA SECTOR" });
  for (const [idx, y] of [[4, 39], [5, 61], [10, 83], [12, 105], [11, 127]])
    setProps(swd.fields[idx], { y });

  const expected = shipcomp(PATCHED);
  assert.deepEqual(Buffer.from(serializeSwd(swd)), Buffer.from(expected));
});

test("setLabel repoints text and survives round-trip", { skip: !haveData }, () => {
  const swd = parseSwd(shipcomp(PRISTINE));
  setLabel(swd, 4, "ALPHA SECTOR");
  const re = parseSwd(serializeSwd(swd));
  assert.equal(re.fields[4].textResolved, "ALPHA SECTOR");
  // every other label untouched
  const orig = parseSwd(shipcomp(PRISTINE));
  re.fields.forEach((f, i) => {
    if (i !== 4) assert.equal(f.textResolved, orig.fields[i].textResolved);
  });
});

test("deleteField keeps remaining labels resolvable", { skip: !haveData }, () => {
  const swd = parseSwd(shipcomp(PRISTINE));
  const labels = swd.fields.map(f => f.textResolved);
  deleteField(swd, 5);
  const re = parseSwd(serializeSwd(swd));
  assert.equal(re.fields.length, 11);
  const expect = [...labels.slice(0, 5), ...labels.slice(6)];
  assert.deepEqual(re.fields.map(f => f.textResolved), expect);
});

test("compactText drops dead bytes but keeps labels", { skip: !haveData }, () => {
  const swd = parseSwd(shipcomp(PRISTINE));
  const labels = swd.fields.map(f => f.textResolved);
  setLabel(swd, 0, "X"); // leaves the old label as dead bytes
  setLabel(swd, 0, labels[0]); // and another
  const before = serializeSwd(swd).length;
  compactText(swd);
  const after = serializeSwd(swd).length;
  assert.ok(after < before, `compact did not shrink (${before} -> ${after})`);
  const re = parseSwd(serializeSwd(swd));
  assert.deepEqual(re.fields.map(f => f.textResolved), labels);
});

test("newWindow + addField produces a parseable window from nothing", () => {
  const swd = newWindow({ name: "TEST_SWD", lx: 160, ly: 90 });
  addField(swd, { name: "OK", label: "OK", x: 20, y: 60, lx: 60, ly: 16 });
  addField(swd, { cloneFrom: 0, name: "CANCEL", label: "CANCEL", x: 90 });
  const re = parseSwd(serializeSwd(swd));
  assert.equal(re.header.name, "TEST_SWD");
  assert.deepEqual(re.fields.map(f => f.textResolved), ["OK", "CANCEL"]);
  assert.equal(re.fields[1].x, 90);
  assert.equal(re.fields[1].y, 60); // cloned from field 0
});
