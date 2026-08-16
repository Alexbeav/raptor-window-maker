// A set of FILE000n.GLB archives with engine-style item lookup:
// GLB_GetItemID searches files in number order; an item handle is
// (filenum << 16) | index (glbapi.cpp).

import { parseGlb, buildGlb } from "./glb.mjs";

export class GlbSet {
  constructor() {
    this.files = new Map(); // num -> { items }
  }

  add(num, bytes) {
    this.files.set(num, parseGlb(bytes));
  }

  nums() {
    return [...this.files.keys()].sort((a, b) => a - b);
  }

  itemId(name) {
    // GLB_GetItemID refuses empty and space-led names (glbapi.cpp:707)
    if (!name || name[0] === " " || name[0] === "\0") return -1;
    for (const num of this.nums()) {
      const idx = this.files.get(num).items.findIndex(it => it.name === name);
      if (idx >= 0) return (num << 16) | idx;
    }
    return -1;
  }

  byId(id) {
    if (id < 0) return null;
    return this.files.get(id >> 16)?.items[id & 0xffff] ?? null;
  }

  byName(name) {
    return this.byId(this.itemId(name));
  }

  *itemsMatching(re) {
    for (const num of this.nums()) {
      const { items } = this.files.get(num);
      for (let i = 0; i < items.length; i++)
        if (re.test(items[i].name) && items[i].data.length)
          yield { num, index: i, id: (num << 16) | i, item: items[i] };
    }
  }

  build(num) {
    return buildGlb(this.files.get(num).items);
  }
}
