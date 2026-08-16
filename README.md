# Raptor Window Maker

A rebuild of the lost window-maker tool for **Raptor: Call of the Shadows**
(1994). The game's menus and dialogs are data-driven `*_SWD` resources inside
its GLB archives, authored with an in-house tool whose source no longer
exists. This project re-derives the format (see [FORMAT.md](FORMAT.md)) and
grows it into a browser-based visual window editor.

Works identically on the 1994 v1.2 data and the 2015 Edition, whose
`file0000`–`file0004.glb` are byte-identical to the classic files.

Companion projects: [raptor-map-editor](https://github.com/Alexbeav/raptor-map-editor)
(levels, enemies, artwork, music) and
[raptor-enhanced](https://github.com/Alexbeav/raptor-enhanced) (engine port
with Delta Sector support).

## Status

- [x] **Phase 1 — format**: GLB container + SWD parser/serializer
  (`src/glb.mjs`, `src/swd.mjs`), validated by byte-exact round-trip of all
  16 shipped windows (148 fields) in two independent game copies.
- [x] **Phase 2 — viewer**: pixel-faithful canvas rendering
  (`src/gfx.mjs`, `src/render.mjs`) ported from the engine's `swdapi.cpp` /
  `gfxapi.cpp`: backgrounds (fill/texture/picture/see-thru), button bevels
  and shade tables, icons, game fonts, drop shadows — including the
  original's quirks (stale baked item ids are re-resolved by name, exactly
  as the engine does at window init).
- [x] **Phase 3 — editor** (`index.html`): drag/resize fields on the
  canvas, edit labels, types, hotkeys, colors (palette picker), fonts and
  art references; add/clone/delete fields; create windows; undo (Ctrl+Z);
  export the patched `FILE000n.GLB`. Edit operations are validated by
  reproducing the Delta Sector installer's `SHIPCOMP_SWD` binary patch
  **byte-for-byte** from high-level ops (`tests/edit.test.mjs`).

## Using it

Serve the repo root (any static server, e.g. `python -m http.server`) and
open `index.html`, or build the dependency-free single file:

```
node build.mjs        # -> dist/raptor-window-maker.html (works from file://)
```

Drop your `FILE0000.GLB`–`FILE0004.GLB` into the page (FILE0000 supplies
the palette, FILE0001 the windows/fonts/art). Everything runs locally.

## Development

No dependencies. Run the tests with `npm test`. The suites that need game
data read a Raptor install from `RAPTOR_DIRS` / `RAPTOR_DIR` and skip if
absent. No game data is included in or distributed with this repository.

## License

GPL-2, matching the engine port the format knowledge derives from.
