// Bundles index.html + src modules into a single self-contained HTML file:
// dist/raptor-window-maker.html. No dependencies - the modules deliberately
// avoid name collisions, so bundling is import/export stripping plus
// concatenation in dependency order.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const ORDER = ["src/glb.mjs", "src/swd.mjs", "src/gfx.mjs", "src/glbset.mjs", "src/render.mjs", "src/edit.mjs"];

function strip(source) {
  return source
    .replace(/^import\s*\{[^}]*\}\s*from\s*"[^"]*";\s*$/gm, "")
    .replace(/^import\s+[\w$]+\s+from\s*"[^"]*";\s*$/gm, "")
    .replace(/^export\s+/gm, "");
}

const modules = ORDER.map(p => `// ==== ${p} ====\n${strip(readFileSync(p, "utf8"))}`).join("\n");
const html = readFileSync("index.html", "utf8");

const out = html.replace(
  /<script type="module">([\s\S]*?)<\/script>/,
  (_, app) => `<script type="module">\n${modules}\n${strip(app)}</script>`,
);
if (out === html) throw new Error("app <script type=\"module\"> block not found");

mkdirSync("dist", { recursive: true });
writeFileSync("dist/raptor-window-maker.html", out);
console.log(`dist/raptor-window-maker.html (${(out.length / 1024).toFixed(0)} KB)`);
