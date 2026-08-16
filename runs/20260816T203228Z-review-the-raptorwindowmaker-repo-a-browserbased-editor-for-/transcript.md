---
date: 2026-08-16T20:32:28.752084+00:00
outcome: REVIEW_FAILED
turns: 0
tags: [handshake]
---

# Review the raptor-window-maker repo: a browser-based editor for SWD window resources in Raptor: Call of the Shadows (199

**Outcome:** REVIEW_FAILED (exit 1)

## Task

Review the raptor-window-maker repo: a browser-based editor for SWD window resources in Raptor: Call of the Shadows (1994). It rebuilds the author's lost 'window maker' tool. Constraints that matter: (1) parse/serialize must round-trip shipped windows byte-identically; (2) the renderer intentionally preserves engine quirks from swdapi.cpp (stale item ids re-resolved by name, UP-bevel switch fall-through, numflds==SEE_THRU comparison bug) - these are features, not bugs; (3) edit ops are append-style to byte-match the Delta Sector installer's patch behavior; (4) tests that need game data honor RAPTOR_DIR/RAPTOR_PATCHED_DIR/RAPTOR_DIRS and skip when absent; no game data may enter the repo. A previous review round's findings (undefined itemId in showAllFields, test skip behavior, unpinned render hashes, innerHTML injection, undo gaps, parser validation, bundler fragility) have been addressed. Review for remaining correctness bugs, API design, and robustness.

## Turn 1
### Review

**FAIL** (confidence 0.97)

**Blocking:**
- loadFiles() is not transactional. Each successfully parsed archive immediately mutates state.glbs; if a later file or RenderContext construction fails, the old window/dirty state remains attached to a partially replaced archive set. A subsequent export can write stale SWD records into unrelated item indexes and corrupt the output. Stage all replacements, context creation, and window parsing in a temporary GlbSet, then commit state only after the entire load succeeds.
- Pinned render hashes are disabled whenever RAPTOR_DIR is set. RAPTOR_DIR is documented as the pristine v1.2 source, so this disables regression assertions in the normal CI/user-configured path and reduces the test to a smoke test. Pin hashes and the 16-window count based on the dataset contract or a content fingerprint, not whether the directory came from an environment variable.
- Label editing uses UTF-8 while the documented/game format is single-byte ASCII. Unicode input serializes as multiple bytes, and parseSwd() decodes it differently; embedded NUL also makes textResolved disagree before and after serialization. Reject unsupported characters/NUL or implement an explicit supported single-byte encoding.
- The exported edit API does not validate field indexes before mutation. setLabel() appends text before discovering an invalid index; addField() shifts every existing txtoff before validating cloneFrom/name/overrides; deleteField(-1) silently deletes the last field and an oversized index can alter offsets without deleting anything. Validate all arguments before changing the SWD and make compound operations atomic.
- New-window validation does not enforce the promised *_SWD name. Names such as CUSTOM_swd or FOO are accepted but are omitted by the case-sensitive /_SWD$/ discovery after reload. It also permits duplicate archive item names, for which engine name lookup resolves the earlier item. Enforce the naming rule and reject duplicates before appending the item.

**Non-blocking:**
- parsePalette(), parsePic(), and parseFont() incompletely validate payload sizes and internal offsets. Truncated pictures, sprite runs, palettes, or glyph tables can be accepted and rendered with undefined/zero data instead of producing a clear parse error.
- The bundle test checks syntax only; it does not execute the concatenated module far enough to detect initialization-order or top-level runtime failures.
- The test run passed 12 of 13 tests, including shipped-data round trips and pinned hashes. The bundle test failed only because this review environment is read-only and build.mjs could not create dist/raptor-window-maker.html.

## Issue ledger

- `OPEN` (turns 1–1) loadFiles() is not transactional. Each successfully parsed archive immediately mutates state.glbs; if a later file or RenderContext construction fails, the old window/dirty state remains attached to a partially replaced archive set. A subsequent export can write stale SWD records into unrelated item indexes and corrupt the output. Stage all replacements, context creation, and window parsing in a temporary GlbSet, then commit state only after the entire load succeeds.
- `OPEN` (turns 1–1) Pinned render hashes are disabled whenever RAPTOR_DIR is set. RAPTOR_DIR is documented as the pristine v1.2 source, so this disables regression assertions in the normal CI/user-configured path and reduces the test to a smoke test. Pin hashes and the 16-window count based on the dataset contract or a content fingerprint, not whether the directory came from an environment variable.
- `OPEN` (turns 1–1) Label editing uses UTF-8 while the documented/game format is single-byte ASCII. Unicode input serializes as multiple bytes, and parseSwd() decodes it differently; embedded NUL also makes textResolved disagree before and after serialization. Reject unsupported characters/NUL or implement an explicit supported single-byte encoding.
- `OPEN` (turns 1–1) The exported edit API does not validate field indexes before mutation. setLabel() appends text before discovering an invalid index; addField() shifts every existing txtoff before validating cloneFrom/name/overrides; deleteField(-1) silently deletes the last field and an oversized index can alter offsets without deleting anything. Validate all arguments before changing the SWD and make compound operations atomic.
- `OPEN` (turns 1–1) New-window validation does not enforce the promised *_SWD name. Names such as CUSTOM_swd or FOO are accepted but are omitted by the case-sensitive /_SWD$/ discovery after reload. It also permits duplicate archive item names, for which engine name lookup resolves the earlier item. Enforce the naming rule and reject duplicates before appending the item.
