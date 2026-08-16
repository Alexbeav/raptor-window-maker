---
date: 2026-08-16T20:47:13.540514+00:00
outcome: REVIEW_ONLY
turns: 0
tags: [handshake]
---

# Review the raptor-window-maker repo: a browser-based editor for SWD window resources in Raptor: Call of the Shadows (199

**Outcome:** REVIEW_ONLY (exit 0)

## Task

Review the raptor-window-maker repo: a browser-based editor for SWD window resources in Raptor: Call of the Shadows (1994), rebuilding the author's lost 'window maker' tool. Constraints: (1) parse/serialize must round-trip shipped windows byte-identically; (2) the renderer intentionally preserves engine quirks from swdapi.cpp (stale item ids re-resolved by name, UP-bevel fall-through, numflds==SEE_THRU bug) - features, not bugs; (3) edit ops are append-style to byte-match the Delta Sector installer's patch; (4) game-data tests honor RAPTOR_DIR/RAPTOR_PATCHED_DIR/RAPTOR_DIRS, skip when absent; the bundle test builds into a temp dir via WM_DIST_DIR but may be blocked by a read-only sandbox - do not fail for sandbox-caused test issues; (5) no game data in the repo. Four previous rounds are fully addressed; latest: addField builds and validates the new field fully detached (unknown override keys included) before any mutation, parseSwd rejects label pointers outside the text area, edits made during pending loads get their own discard confirm, and validation.test.mjs pins rejected-op-leaves-no-trace without game data. Review for remaining correctness bugs; do not fail for findings that require game data to verify, nor for intentionally simple architecture choices in a small local tool.

## Turn 1
### Review

**PASS** (confidence 0.98)

**Non-blocking:**
- The file input is never reset, so selecting the same GLB files again may not fire a change event. Clear fileInput.value before opening or after handling a selection.
- Dirty flags remain set after a successful download, leaving download buttons and unsaved-edit confirmations visible even though the in-memory archive now contains the exported snapshot.
- All game-data round trips, edit parity checks, render hashes, export tests, and validation tests passed. The sole test failure was the bundle test's sandbox-denied temporary-directory creation and is not a repository failure.
