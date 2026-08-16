---
date: 2026-08-16T20:41:23.381014+00:00
outcome: REVIEW_FAILED
turns: 0
tags: [handshake]
---

# Review the raptor-window-maker repo: a browser-based editor for SWD window resources in Raptor: Call of the Shadows (199

**Outcome:** REVIEW_FAILED (exit 1)

## Task

Review the raptor-window-maker repo: a browser-based editor for SWD window resources in Raptor: Call of the Shadows (1994), rebuilding the author's lost 'window maker' tool. Constraints: (1) parse/serialize must round-trip shipped windows byte-identically; (2) the renderer intentionally preserves engine quirks from swdapi.cpp (stale item ids re-resolved by name, UP-bevel fall-through, numflds==SEE_THRU bug) - features, not bugs; (3) edit ops are append-style to byte-match the Delta Sector installer's patch; (4) game-data tests honor RAPTOR_DIR/RAPTOR_PATCHED_DIR/RAPTOR_DIRS, skip when absent, and cannot run in this review sandbox - the bundle test builds into a temp dir via WM_DIST_DIR; (5) no game data in the repo. Three previous review rounds are fully addressed, most recently: new windows stay out of the archive until export (index -1, appended on first download), setProps validates whole patches against explicit key sets before assigning, compactText validates/lays out before mutating, loads are token-guarded last-writer-wins, and parsers reject zero-dim pics, unterminated GSPRITE, negative glyph offsets, and FAT-overlapping item data. Review for remaining correctness bugs and robustness; do not fail for findings that require game data to verify, nor for intentionally simple architecture choices in a small local tool.

## Turn 1
### Review

**FAIL** (confidence 0.99)

**Blocking:**
- addField() still violates validate-before-mutate atomicity. Unknown overrides are not validated until setProps(fld, overrides), after existing txtoff values are shifted, the new field is pushed, and text is appended. Reproducing addField(w, { name: "B", label: "B", typo: 7 }) throws but leaves two fields while header.numflds remains 1, producing a corrupted 420-byte window.

**Non-blocking:**
- An edit made while loadFiles() awaits file.arrayBuffer() can still be silently discarded when that load commits. The load token prevents out-of-order loads but does not guard intervening edits; disabling editing during loading or checking an edit-generation token before commit would close this race.
- parseSwd() does not reject invalid text pointers: it returns textResolved=null when a pointer is out of bounds, and it accepts pointers into the header or field table if a NUL occurs there. Requiring every label pointer to resolve within the text area would prevent malformed windows from being loaded and later rewritten.
- The fixed validation and malformed-input cases lack focused regression tests. In this environment, all game-data round-trip, render-hash, edit, and GLB-export tests passed; only the bundle test was blocked by sandbox denial of temporary-directory creation.

## Issue ledger

- `OPEN` (turns 1–1) addField() still violates validate-before-mutate atomicity. Unknown overrides are not validated until setProps(fld, overrides), after existing txtoff values are shifted, the new field is pushed, and text is appended. Reproducing addField(w, { name: "B", label: "B", typo: 7 }) throws but leaves two fields while header.numflds remains 1, producing a corrupted 420-byte window.
