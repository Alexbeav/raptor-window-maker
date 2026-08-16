// Shared test helpers: locate game data (env-configurable, skip-friendly)
// and load GLB sets. No game data ships with the repo; suites that need it
// skip when none is found.
//
//   RAPTOR_DIR          pristine v1.2 full-game folder (FILE000n.GLB)
//   RAPTOR_PATCHED_DIR  a Delta-Sector-patched copy (installer parity test)
//   RAPTOR_DIRS         extra folders for the round-trip sweep (";"-separated)

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { GlbSet } from "../src/glbset.mjs";

const DEFAULT_PRISTINE =
  "F:\\SteamLibrary\\steamapps\\common\\Raptor Call of the Shadows\\Raptor - Call of the Shadows";
const DEFAULT_PATCHED = "I:\\Projects\\Raptor-Decomp\\playtest-s4";

function firstExisting(...candidates) {
  return candidates.find(d => d && existsSync(d)) ?? null;
}

export function pristineDir() {
  return firstExisting(process.env.RAPTOR_DIR, DEFAULT_PRISTINE);
}

export function patchedDir() {
  return firstExisting(process.env.RAPTOR_PATCHED_DIR, DEFAULT_PATCHED);
}

export function sweepDirs() {
  const extra = process.env.RAPTOR_DIRS?.split(";") ?? [];
  const all = [...extra, pristineDir(), patchedDir()].filter(Boolean);
  return [...new Set(all)].filter(d => existsSync(d));
}

export function glbNames(dir) {
  return readdirSync(dir).filter(n => /^file\d{4}\.glb$/i.test(n)).sort();
}

export function loadSet(dir) {
  const glbs = new GlbSet();
  for (const n of glbNames(dir)) {
    const m = n.match(/^file(\d{4})\.glb$/i);
    glbs.add(parseInt(m[1], 10), new Uint8Array(readFileSync(join(dir, n))));
  }
  return glbs;
}
