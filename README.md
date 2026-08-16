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
- [ ] **Phase 2 — viewer**: pixel-faithful canvas rendering of windows
  (backgrounds, button chrome, icons, game fonts from the GLBs), ported from
  the engine's `swdapi.cpp` drawing code.
- [ ] **Phase 3 — editor**: drag/resize fields, edit labels, hotkeys,
  colors, fonts and art references; add/clone/delete fields; create windows;
  export a patched GLB (same flow as the map editor).

## Development

No dependencies. Run the tests with:

```
node --test tests/roundtrip.test.mjs
```

The round-trip suite needs a Raptor install; point `RAPTOR_DIRS` at one or
more folders containing `FILE000n.GLB` (semicolon-separated). No game data
is included in or distributed with this repository.

## License

GPL-2, matching the engine port the format knowledge derives from.
