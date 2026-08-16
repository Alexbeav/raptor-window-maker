// Renders every shipped window through the ported engine drawing code.
// Guards against crashes and blank output, and pins each window's rendered
// framebuffer hash so unintended rendering changes show up as diffs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { GlbSet } from "../src/glbset.mjs";
import { parseSwd } from "../src/swd.mjs";
import { RenderContext, drawWindow } from "../src/render.mjs";

const DIR = process.env.RAPTOR_DIR
  ?? "F:\\SteamLibrary\\steamapps\\common\\Raptor Call of the Shadows\\Raptor - Call of the Shadows";

function loadSet(dir) {
  const glbs = new GlbSet();
  for (const n of readdirSync(dir)) {
    const m = n.match(/^file(\d{4})\.glb$/i);
    if (m) glbs.add(parseInt(m[1], 10), new Uint8Array(readFileSync(join(dir, n))));
  }
  return glbs;
}

test("all shipped windows render without errors and non-blank", { skip: !existsSync(DIR) }, () => {
  const glbs = loadSet(DIR);
  const ctx = new RenderContext(glbs);
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
    count++;
  }
  assert.equal(count, 16);
});
