// Bundler smoke test: build dist/raptor-window-maker.html and prove the
// bundled script block is syntactically valid JavaScript with no surviving
// import statements (the failure mode of regex-based import stripping).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("dist bundle builds and its script parses as a module", () => {
  execFileSync(process.execPath, [join(ROOT, "build.mjs")], { stdio: "pipe" });
  const html = readFileSync(join(ROOT, "dist", "raptor-window-maker.html"), "utf8");
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(m, "no module script block in dist html");
  const script = m[1];
  assert.ok(!/^\s*import\b/m.test(script), "import statement survived bundling");
  assert.ok(!/^\s*export\b/m.test(script), "export statement survived bundling");

  const tmp = join(tmpdir(), `wm-bundle-check-${process.pid}.mjs`);
  writeFileSync(tmp, script);
  try {
    execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
  } finally {
    rmSync(tmp, { force: true });
  }
});
