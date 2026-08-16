// Renders every shipped window through the ported engine drawing code.
// Framebuffer hashes are pinned for the known pristine v1.2 data so any
// unintended rendering change fails the suite; with a custom RAPTOR_DIR the
// hashes are only reported (different data, different pixels).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parseSwd } from "../src/swd.mjs";
import { RenderContext, drawWindow } from "../src/render.mjs";
import { pristineDir, pristineIsCustom, loadSet } from "./helpers.mjs";

// sha256(framebuffer)[0:12] per window, pristine v1.2 full-game data
const PINNED = {
  STORE_SWD: "09303549d89b",
  MAIN_SWD: "b4bbbd94194a",
  SHIPCOMP_SWD: "b101f3348103",
  HANGAR_SWD: "620744b12cae",
  ASK_SWD: "04cd117272cf",
  LOCKER_SWD: "4f7988030a00",
  REGISTER_SWD: "1271e5eb4bc4",
  HELP_SWD: "5d86a14fd6bb",
  LOAD_SWD: "bf2357916eb2",
  MSG_SWD: "d03a7cf5f5cd",
  ORDER_SWD: "680654fe88c6",
  CREDIT_SWD: "d6ef0ec5663e",
  ASKDIFF_SWD: "2ce77ece067e",
  WINGAME_SWD: "68b051f37164",
  OPTS_SWD: "5b3f01969a94",
  LOADCOMP_SWD: "2a7ff85c38c0",
};

const dir = pristineDir();

test("all shipped windows render, pinned to known framebuffer hashes", { skip: !dir && "no game data found (set RAPTOR_DIR)" }, () => {
  const glbs = loadSet(dir);
  const ctx = new RenderContext(glbs);
  const custom = pristineIsCustom();
  let count = 0;
  for (const { item } of glbs.itemsMatching(/_SWD$/)) {
    const swd = parseSwd(item.data);
    const r = drawWindow(ctx, swd);
    const colors = new Set(r.buf);
    // LOCKER_SWD legitimately renders blank: its background art is absent
    // from v1.2 data and its content is drawn by game code into viewareas.
    if (item.name !== "LOCKER_SWD")
      assert.ok(colors.size > 2, `${item.name}: only ${colors.size} distinct colors`);
    const hash = createHash("sha256").update(r.buf).digest("hex").slice(0, 12);
    console.log(`${item.name.padEnd(16)} ${swd.fields.length.toString().padStart(2)} fields  ${colors.size.toString().padStart(3)} colors  ${hash}`);
    if (!custom && PINNED[item.name])
      assert.equal(hash, PINNED[item.name], `${item.name}: rendering changed`);
    count++;
  }
  if (!custom) assert.equal(count, 16);
});
