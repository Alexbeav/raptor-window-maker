// GLB rebuild / export integrity. buildGlb() re-packs the archive (fresh
// offsets, zeroed header padding), so byte-identity with the original file
// is not the contract - LOGICAL identity is: every item keeps its name,
// flags, order and exact decrypted payload, and a rebuilt archive re-parses
// to the same thing. Patching one SWD must leave every other item intact.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGlb, buildGlb } from "../src/glb.mjs";
import { parseSwd, serializeSwd } from "../src/swd.mjs";
import { setLabel } from "../src/edit.mjs";
import { pristineDir, glbNames } from "./helpers.mjs";

const dir = pristineDir();

function logicalEqual(a, b, label) {
  assert.equal(a.items.length, b.items.length, `${label}: item count`);
  for (let i = 0; i < a.items.length; i++) {
    assert.equal(a.items[i].name, b.items[i].name, `${label}: item ${i} name`);
    assert.equal(a.items[i].flags, b.items[i].flags, `${label}: item ${i} flags`);
    assert.deepEqual(Buffer.from(a.items[i].data), Buffer.from(b.items[i].data),
      `${label}: item ${i} (${a.items[i].name}) payload`);
  }
}

test("untouched archives rebuild to logically identical archives", { skip: !dir && "no game data found (set RAPTOR_DIR)" }, () => {
  for (const name of glbNames(dir)) {
    const original = parseGlb(new Uint8Array(readFileSync(join(dir, name))));
    const rebuilt = parseGlb(buildGlb(original.items));
    logicalEqual(original, rebuilt, name);
  }
});

test("patching one SWD leaves every other item byte-identical", { skip: !dir && "no game data found (set RAPTOR_DIR)" }, () => {
  const name = glbNames(dir).find(n => /0001/.test(n));
  const original = parseGlb(new Uint8Array(readFileSync(join(dir, name))));
  const edited = parseGlb(new Uint8Array(readFileSync(join(dir, name))));
  const idx = edited.items.findIndex(it => it.name === "SHIPCOMP_SWD");
  const swd = parseSwd(edited.items[idx].data);
  setLabel(swd, 4, "PARITY TEST");
  edited.items[idx].data = serializeSwd(swd);

  const rebuilt = parseGlb(buildGlb(edited.items));
  assert.equal(rebuilt.items.length, original.items.length);
  for (let i = 0; i < rebuilt.items.length; i++) {
    if (i === idx) {
      const re = parseSwd(rebuilt.items[i].data);
      assert.equal(re.fields[4].textResolved, "PARITY TEST");
    } else {
      assert.deepEqual(Buffer.from(rebuilt.items[i].data), Buffer.from(original.items[i].data),
        `item ${i} (${original.items[i].name}) changed`);
    }
  }
});
