// Bundler smoke test: build the single-file dist into a temp dir, prove the
// bundled script parses as a module with no surviving import/export
// statements, and EXECUTE the library portion (everything before the app
// marker, which needs a DOM) to catch initialization-order failures.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("dist bundle builds, parses, and its library code executes", () => {
  const distDir = mkdtempSync(join(tmpdir(), "wm-dist-"));
  try {
    execFileSync(process.execPath, [join(ROOT, "build.mjs")], {
      stdio: "pipe", env: { ...process.env, WM_DIST_DIR: distDir },
    });
    const html = readFileSync(join(distDir, "raptor-window-maker.html"), "utf8");
    const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
    assert.ok(m, "no module script block in dist html");
    const script = m[1];
    assert.ok(!/^\s*import\b/m.test(script), "import statement survived bundling");
    assert.ok(!/^\s*export\b/m.test(script), "export statement survived bundling");

    // full-script syntax check
    const full = join(distDir, "bundle-full.mjs");
    writeFileSync(full, script);
    execFileSync(process.execPath, ["--check", full], { stdio: "pipe" });

    // execute the library portion + a real parse/serialize round-trip
    const marker = script.indexOf("// ==== app ====");
    assert.ok(marker > 0, "app marker missing from bundle");
    const lib = script.slice(0, marker) + `
      const w = newWindow({ name: "SMOKE_SWD" });
      addField(w, { name: "OK", label: "OK" });
      const re = parseSwd(serializeSwd(w));
      if (re.fields[0].textResolved !== "OK") throw new Error("bundle round-trip broken");
      console.log("bundle-lib-ok");
    `;
    const libFile = join(distDir, "bundle-lib.mjs");
    writeFileSync(libFile, lib);
    const out = execFileSync(process.execPath, [libFile], { stdio: "pipe" }).toString();
    assert.match(out, /bundle-lib-ok/);
  } finally {
    rmSync(distDir, { recursive: true, force: true });
  }
});
