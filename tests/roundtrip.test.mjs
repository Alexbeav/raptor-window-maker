// Byte-exact round-trip of every SWD window resource in the shipped game.
// Game-data location and skip behavior: see helpers.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGlb } from "../src/glb.mjs";
import { parseSwd, serializeSwd } from "../src/swd.mjs";
import { sweepDirs, glbNames } from "./helpers.mjs";

const dirs = sweepDirs();

function* swdItems(dir) {
  for (const glbName of glbNames(dir)) {
    const { items } = parseGlb(new Uint8Array(readFileSync(join(dir, glbName))));
    for (const item of items)
      if (item.name.endsWith("_SWD") && item.data.length) yield { glbName, item };
  }
}

test("every shipped SWD item round-trips byte-identically", { skip: dirs.length === 0 && "no game data found (set RAPTOR_DIR)" }, () => {
  let total = 0;
  const typeCounts = {};
  for (const dir of dirs) {
    let found = 0;
    for (const { glbName, item } of swdItems(dir)) {
      const swd = parseSwd(item.data);
      const rebuilt = serializeSwd(swd);
      assert.deepEqual(
        Buffer.from(rebuilt), Buffer.from(item.data),
        `${dir} ${glbName} ${item.name}: round-trip differs`,
      );
      assert.equal(swd.header.numflds, swd.fields.length);
      for (const f of swd.fields) {
        typeCounts[f.typeName] = (typeCounts[f.typeName] ?? 0) + 1;
        assert.ok(f.typeName !== undefined && !f.typeName.startsWith("unknown"),
          `${item.name}: unknown field type ${f.opt}`);
        assert.ok(f.textResolved !== null, `${item.name}: field ${f.id} text out of bounds`);
      }
      found++;
    }
    assert.ok(found > 0, `no SWD items under ${dir}`);
    console.log(`${dir}: ${found} SWD windows OK`);
    total += found;
  }
  console.log("field types:", JSON.stringify(typeCounts));
  // the full game ships 16 windows per copy
  assert.ok(total >= 16, `suspiciously few SWD items (${total})`);
});

test("SHIPCOMP_SWD parses with known field counts", { skip: dirs.length === 0 && "no game data found (set RAPTOR_DIR)" }, () => {
  for (const dir of dirs) {
    for (const { item } of swdItems(dir)) {
      if (item.name !== "SHIPCOMP_SWD") continue;
      const swd = parseSwd(item.data);
      // 12 fields as shipped; 13 once the Delta Sector installer added GAME4
      assert.ok([12, 13].includes(swd.fields.length), `${dir}: ${swd.fields.length} fields`);
      const labels = swd.fields.map(f => f.textResolved);
      assert.ok(labels.includes("BRAVO SECTOR") && labels.includes("TANGO SECTOR"),
        `${dir}: sector labels missing in ${JSON.stringify(labels)}`);
      if (swd.fields.length === 13)
        assert.ok(swd.fields.some(f => f.name === "GAME4" && f.textResolved === "DELTA SECTOR"),
          `${dir}: patched window lacks GAME4/DELTA SECTOR`);
    }
  }
});

test("synthetic window survives parse/serialize without game data", () => {
  const enc = new TextEncoder();
  const text = enc.encode("HELLO\0");
  const bytes = new Uint8Array(120 + 148 + text.length);
  const dv = new DataView(bytes.buffer);
  dv.setInt32(76, 120, true);            // fldofs
  dv.setInt32(96, 1, true);              // numflds
  dv.setInt32(108, 320, true);           // lx
  dv.setInt32(112, 200, true);           // ly
  bytes.set(enc.encode("TESTWIN"), 32);
  dv.setInt32(120 + 0, 2, true);         // field opt = button
  dv.setInt32(120 + 4, 7, true);         // field id
  bytes.set(enc.encode("BTN"), 120 + 32);
  dv.setInt32(120 + 140, 148, true);     // txtoff -> text right after this record
  bytes.set(text, 268);
  const swd = parseSwd(bytes);
  assert.equal(swd.header.name, "TESTWIN");
  assert.equal(swd.fields.length, 1);
  assert.equal(swd.fields[0].typeName, "button");
  assert.equal(swd.fields[0].textResolved, "HELLO");
  assert.deepEqual(Buffer.from(serializeSwd(swd)), Buffer.from(bytes));
});

test("malformed inputs are rejected, not crashed on", () => {
  assert.throws(() => parseGlb(new Uint8Array(4)), /not a GLB/);
  assert.throws(() => parseGlb(new Uint8Array(64)), /not a GLB|past end/);
  assert.throws(() => parseSwd(new Uint8Array(10)), /too small/);
  const neg = new Uint8Array(300);
  const dv = new DataView(neg.buffer);
  dv.setInt32(76, 120, true);
  dv.setInt32(96, -5, true); // negative numflds
  assert.throws(() => parseSwd(neg), /bad field table/);
});
