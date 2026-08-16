// Focused regression tests for validation and atomicity guarantees - all
// runnable without game data. Every rejected operation must leave the
// window byte-identical to its pre-call state.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSwd, serializeSwd } from "../src/swd.mjs";
import { setLabel, addField, deleteField, setProps, newWindow } from "../src/edit.mjs";

function makeWindow() {
  const swd = newWindow({ name: "VALID_SWD" });
  addField(swd, { name: "ONE", label: "ONE" });
  addField(swd, { name: "TWO", label: "TWO" });
  return swd;
}

function unchangedBy(swd, fn) {
  const before = serializeSwd(swd);
  assert.throws(fn);
  assert.deepEqual(Buffer.from(serializeSwd(swd)), Buffer.from(before),
    "a rejected operation mutated the window");
}

test("rejected addField leaves the window untouched", () => {
  const swd = makeWindow();
  unchangedBy(swd, () => addField(swd, { name: "B", label: "B", typo: 7 }));       // unknown override
  unchangedBy(swd, () => addField(swd, { cloneFrom: 99, label: "X" }));            // bad clone index
  unchangedBy(swd, () => addField(swd, { name: "THIS NAME IS FAR TOO LONG" }));    // bad name
  unchangedBy(swd, () => addField(swd, { name: "OK", label: "café" }));       // non-ASCII label
  unchangedBy(swd, () => addField(swd, { name: "OK", item_name: "café" }));   // non-ASCII name override
  assert.equal(swd.fields.length, 2);
  assert.equal(swd.header.numflds, 2);
});

test("rejected setLabel / setProps / deleteField leave the window untouched", () => {
  const swd = makeWindow();
  unchangedBy(swd, () => setLabel(swd, 5, "X"));                 // bad index
  unchangedBy(swd, () => setLabel(swd, -1, "X"));
  unchangedBy(swd, () => setLabel(swd, 0, "nul\0inside"));       // embedded NUL
  unchangedBy(swd, () => setLabel(swd, 0, "ümlaut"));       // non-ASCII
  unchangedBy(swd, () => deleteField(swd, 2));                   // bad index
  unchangedBy(swd, () => deleteField(swd, -1));
  unchangedBy(swd, () => setProps(swd.fields[0], { nosuchkey: 1 }));
  unchangedBy(swd, () => setProps(swd.fields[0], { x: 5, name: "TOO LONG FOR A NAME FIELD" })); // atomic compound
  unchangedBy(swd, () => setProps(swd.header, { txtoff: 1 }));   // field-only key on header
  assert.equal(swd.fields[0].x, 8, "compound patch partially applied");
});

test("valid compound setProps applies completely", () => {
  const swd = makeWindow();
  setProps(swd.fields[0], { x: 30, y: 40, opt: 1, name: "RENAMED" });
  assert.equal(swd.fields[0].x, 30);
  assert.equal(swd.fields[0].typeName, "text");
  assert.equal(swd.fields[0].name, "RENAMED");
  const re = parseSwd(serializeSwd(swd));
  assert.equal(re.fields[0].name, "RENAMED");
});

test("parseSwd rejects label pointers outside the text area", () => {
  const swd = makeWindow();
  const bytes = serializeSwd(swd);
  const dv = new DataView(bytes.buffer);
  dv.setInt32(120 + 140, -100, true); // field 0 txtoff -> into the header
  assert.throws(() => parseSwd(bytes), /outside text area/);
});
