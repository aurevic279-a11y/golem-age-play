'use strict';
// Инвентарь: словарь предмет -> количество.
// Два режима: по клеткам со стаками (герой, сундуки) и по общему числу предметов (машины).

const STACK = 50;
function stackOf(id) { return (ITEMS[id] && ITEMS[id].stack) || STACK; }

class Inv {
  constructor(cap, slots) { this.c = {}; this.cap = cap; this.n = 0; this.slots = !!slots; }
  count(id) { return this.c[id] || 0; }
  usedSlots() {
    let s = 0;
    for (const id in this.c) s += Math.ceil(this.c[id] / stackOf(id));
    return s;
  }
  // сколько ещё поместится этого предмета
  room(id) {
    if (!this.slots) return Math.max(0, this.cap - this.n);
    const st = stackOf(id), have = this.c[id] || 0;
    const partial = have % st ? st - have % st : 0;
    return Math.max(0, (this.cap - this.usedSlots()) * st + partial);
  }
  space(id) {
    if (id) return this.room(id);
    return this.slots ? Math.max(0, this.cap - this.usedSlots()) * STACK : Math.max(0, this.cap - this.n);
  }
  full() { return this.slots ? this.usedSlots() >= this.cap : this.n >= this.cap; }
  add(id, k) {
    k = Math.min(k, this.room(id));
    if (k <= 0) return 0;
    this.c[id] = (this.c[id] || 0) + k;
    this.n += k;
    return k;
  }
  remove(id, k) {
    const have = this.c[id] || 0;
    k = Math.min(k, have);
    if (k <= 0) return 0;
    if (have - k <= 0) delete this.c[id]; else this.c[id] = have - k;
    this.n -= k;
    return k;
  }
  has(cost, mult) {
    mult = mult || 1;
    for (const id in cost) if (this.count(id) < cost[id] * mult) return false;
    return true;
  }
  pay(cost, mult) {
    mult = mult || 1;
    if (!this.has(cost, mult)) return false;
    for (const id in cost) this.remove(id, cost[id] * mult);
    return true;
  }
  addAll(items) { for (const id in items) this.add(id, items[id]); }
  ids() { return Object.keys(this.c); }
  first() { for (const id in this.c) return id; return null; }
  toJSON() { return { c: this.c, cap: this.cap, slots: this.slots }; }
  // при загрузке кладём всё как было, даже если не влезает
  static from(o) {
    const v = new Inv(o.cap, o.slots);
    for (const id in o.c) { v.c[id] = o.c[id]; v.n += o.c[id]; }
    return v;
  }
}

function costHtml(cost, inv, mult) {
  mult = mult || 1;
  return Object.keys(cost).map(id => {
    const need = cost[id] * mult, ok = !inv || inv.count(id) >= need;
    return `<span class="${ok ? '' : 'bad'}">${iconHtml(id, need)}</span>`;
  }).join(' ');
}
