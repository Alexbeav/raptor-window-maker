# SWD window resource format

The menus and dialogs of Raptor: Call of the Shadows (1994) are data-driven:
each window is a `*_SWD` item inside the game's GLB archives, produced by
Scott Host's original "window maker" tool (source lost). This documents the
on-disk format, recovered from three independent sources that all agree:

1. `swdapi.h` in the open-source engine port — the `SWIN` and `SFIELD32`
   struct definitions (the disk layout, including the `PlaceHolder` member
   that pads the field record to its 32-bit size).
2. `swdapi.cpp` — the code that loads and draws these resources, which pins
   down the semantics (notably text offset resolution).
3. The Delta Sector installer's working binary patch of `SHIPCOMP_SWD`.

Validation: `tests/roundtrip.test.mjs` parses and re-serializes **every SWD
item in the shipped full game (16 windows, 148 fields) byte-identically**,
against both the 1994 v1.2 data and a Delta-patched copy. The 2015 Edition
uses byte-identical data files, so everything here applies to it unchanged.

## Layout

```
SWIN header        120 bytes
(gap)              optional unused bytes up to header.fldofs (none in shipped data)
SFIELD32 records   148 bytes x header.numflds, starting at header.fldofs
text area          everything after the last field record
```

All integers are little-endian signed 32-bit. Strings are NUL-terminated
ASCII in fixed 16-byte arrays (bytes after the NUL are preserved as-is by
this library, since shipped items carry residue there).

## SWIN header (120 bytes)

| offset | field      | notes                                          |
|-------:|------------|------------------------------------------------|
|      0 | version    | unused                                         |
|      4 | swdsize    | unused                                         |
|      8 | arrowflag  | arrow keys navigate fields (bool)              |
|     12 | display    | display flag                                   |
|     16 | opt3       | unused                                         |
|     20 | opt4       | unused                                         |
|     24 | id         | window id                                      |
|     28 | type       | window type                                    |
|     32 | name[16]   | window name (not displayed)                    |
|     48 | item_name[16] | background art item name                    |
|     64 | item       | background art item id                         |
|     68 | picflag    | 0 fill / 1 texture / 2 picture / 3 see-thru / 4 invisible |
|     72 | lock       | true = cannot switch to other windows          |
|     76 | fldofs     | byte offset of first field record              |
|     80 | txtofs     | byte offset of text area (unused by engine)    |
|     84 | firstfld   | field to focus first                           |
|     88 | opt        | window type option                             |
|     92 | color      | window color                                   |
|     96 | numflds    | number of field records                        |
|    100 | x, y       | screen position (320x200 space)                |
|    108 | lx, ly     | width, height in pixels                        |
|    116 | shadow     | drop shadow (bool)                             |

## SFIELD32 record (148 bytes)

| offset | field         | notes                                       |
|-------:|---------------|---------------------------------------------|
|      0 | opt           | field type (table below)                    |
|      4 | id            | field id (what the game code switches on)   |
|      8 | hotkey        | keyboard scan code                          |
|     12 | kbflag        | keyboard-active (bool)                      |
|     16 | opt3, opt4    | unused                                      |
|     24 | input_opt     | input fields: 0 normal / 1 toupper / 2 numeric |
|     28 | bstatus       | button state: 0 normal / 1 up / 2 down      |
|     32 | name[16]      | field name (not displayed; e.g. `GAME4`)    |
|     48 | item_name[16] | art item name                               |
|     64 | item          | art item id                                 |
|     68 | font_name[16] | font GLB item name                          |
|     84 | fontid        | font number                                 |
|     88 | fontbasecolor | font base color                             |
|     92 | maxchars      | max chars of field text                     |
|     96 | picflag       | picture (bool)                              |
|    100 | color         | field color                                 |
|    104 | lite          | highlight color                             |
|    108 | mark          | field mark (bool)                           |
|    112 | saveflag      | save background under field (bool)          |
|    116 | shadow        | shadow (bool)                               |
|    120 | selectable    | selectable (bool)                           |
|    124 | x, y          | position, relative to window origin         |
|    132 | lx, ly        | width, height in pixels                     |
|    140 | txtoff        | text offset, **relative to this record's own start** (`swdapi.cpp:329`) |
|    144 | placeholder   | pads record to in-memory struct size        |

## Field types

Counts are from the pristine 1994 v1.2 full game (16 windows, 148 fields).

| opt | type     | shipped count |
|----:|----------|--------------:|
|   0 | off      | 0 |
|   1 | text     | 30 |
|   2 | button   | 41 |
|   3 | input    | 2 |
|   4 | mark     | 0 |
|   5 | close    | 4 |
|   6 | dragbar  | 3 |
|   7 | bumpin   | 11 |
|   8 | bumpout  | 10 |
|   9 | icon     | 27 |
|  10 | objarea  | 0 |
|  11 | viewarea | 20 |

## Editing gotcha

Because `txtoff` is relative to each field's record start, inserting a field
record shifts the text area away from every existing record: all prior
fields' `txtoff` values must grow by 148 per inserted field (this is exactly
what the Delta Sector installer does when adding the GAME4 button).
