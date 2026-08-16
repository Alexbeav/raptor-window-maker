// Bundles index.html + src modules into a single self-contained HTML file:
// dist/raptor-window-maker.html. No dependencies - the modules deliberately
// avoid name collisions, so bundling is import/export stripping plus
// concatenation in dependency order.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const ORDER = ["src/glb.mjs", "src/swd.mjs", "src/gfx.mjs", "src/glbset.mjs", "src/render.mjs", "src/edit.mjs"];

function strip(source) {
  return source
    .replace(/^import\s*\{[^}]*\}\s*from\s*"[^"]*";\s*$/gm, "")
    .replace(/^import\s+[\w$]+\s+from\s*"[^"]*";\s*$/gm, "")
    .replace(/^export\s+/gm, "");
}

const modules = ORDER.map(p => `// ==== ${p} ====\n${strip(readFileSync(join(ROOT, p), "utf8"))}`).join("\n");
const html = readFileSync(join(ROOT, "index.html"), "utf8");

// import-stripping sanity: no import statements may survive into the bundle
const leftover = modules.match(/^\s*import\b.*$/m);
if (leftover) throw new Error(`unstripped import in bundle: ${leftover[0].trim()}`);

const out = html.replace(
  /<script type="module">([\s\S]*?)<\/script>/,
  (_, app) => `<script type="module">\n${modules}\n// ==== app ====\n${strip(app)}</script>`,
);
if (out === html) throw new Error("app <script type=\"module\"> block not found");

// WM_DIST_DIR lets tests build into a writable temp dir
const distDir = process.env.WM_DIST_DIR ?? join(ROOT, "dist");
mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, "raptor-window-maker.html"), out);
console.log(`${join(distDir, "raptor-window-maker.html")} (${(out.length / 1024).toFixed(0)} KB)`);
