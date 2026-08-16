---
date: 2026-08-16T20:37:19.523195+00:00
outcome: REVIEW_FAILED
turns: 0
tags: [handshake]
---

# Review the raptor-window-maker repo: a browser-based editor for SWD window resources in Raptor: Call of the Shadows (199

**Outcome:** REVIEW_FAILED (exit 1)

## Task

Review the raptor-window-maker repo: a browser-based editor for SWD window resources in Raptor: Call of the Shadows (1994), rebuilding the author's lost 'window maker' tool. Constraints: (1) parse/serialize must round-trip shipped windows byte-identically; (2) the renderer intentionally preserves engine quirks from swdapi.cpp (stale item ids re-resolved by name, UP-bevel switch fall-through, numflds==SEE_THRU comparison bug) - features, not bugs; (3) edit ops are append-style to byte-match the Delta Sector installer's patch; (4) game-data tests honor RAPTOR_DIR/RAPTOR_PATCHED_DIR/RAPTOR_DIRS, skip when absent, and cannot run in this review sandbox - the bundle test builds into a temp dir via WM_DIST_DIR; (5) no game data in the repo. Two previous review rounds are fully addressed: transactional loadFiles, fingerprint-gated render-hash pinning, ASCII label validation, validate-before-mutate edit ops, UPPERCASE-unique *_SWD naming, parser bounds checks, executed-bundle smoke test. Review for remaining correctness bugs and robustness; do not fail for findings that require game data to verify.

## Turn 1
### Review

**FAIL** (confidence 0.96)

**Blocking:**
- New-window edits are not actually discardable. The New window handler immediately appends the new item to state.glbs, while loadFiles() stages a reload by copying state.glbs. If the user creates a window, edits it, then loads another GLB and confirms that unsaved edits should be discarded, the new archive item survives but only with its creation-time payload; later field edits disappear. A subsequent export can therefore contain an unexpected, partially edited window.

**Non-blocking:**
- setProps() is not atomic for compound patches. For example, { x: 1, name: "invalid\n" } changes x before name16() throws. It also silently accepts misspelled or unsupported property names. Validate and prepare the complete patch before assigning anything, preferably against explicit header/field property sets.
- compactText() bypasses the ASCII label validator and mutates txtoff values while rebuilding. A parsed extended-byte label is decoded through the platform ASCII alias and then re-encoded as UTF-8, changing its bytes. Validate all labels and construct the replacement text and offsets before committing.
- Malformed-resource validation still has small gaps: zero-sized pictures are accepted even though texture operations require nonzero dimensions; a GSPRITE without its -1 terminator is accepted; parseFont() permits negative glyph offsets other than -1; and GLB item offsets may point into the FAT. These do not affect the verified shipped data but should produce explicit parse errors.
- Concurrent loadFiles() calls can commit out of order, and edits made while file.arrayBuffer() operations are pending can be discarded without a second confirmation. A monotonically increasing load token or temporarily disabled editing would make loading race-safe.

## Issue ledger

- `OPEN` (turns 1–1) New-window edits are not actually discardable. The New window handler immediately appends the new item to state.glbs, while loadFiles() stages a reload by copying state.glbs. If the user creates a window, edits it, then loads another GLB and confirms that unsaved edits should be discarded, the new archive item survives but only with its creation-time payload; later field edits disappear. A subsequent export can therefore contain an unexpected, partially edited window.
