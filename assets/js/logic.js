/* Dinau Treck: pure logic. No DOM, no state — safe to unit-test.
   Loaded as a plain script before app.js and exposed as window.Logic. */
(() => {
  'use strict';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const keyOf = (name) => name.toLowerCase();

  /** "5", "5.50", "5,50" -> whole toea (cents). Returns null for anything else. */
  function parseCents(raw) {
    const s = String(raw).trim().replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    const c = Math.round(parseFloat(s) * 100);
    return c > 0 ? c : null;
  }

  /** Whole days from a to b, both 'YYYY-MM-DD'. */
  function dayDiff(a, b) {
    const t = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
    return Math.round((t(b) - t(a)) / 86400000);
  }

  function dayLabel(stamp, today) {
    const d = stamp.slice(0, 10);
    const diff = dayDiff(d, today);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    const year = d.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + d.slice(0, 4);
    return `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}${year}`;
  }

  /** 'Today' -> 'today' mid-sentence, but leave dates like '14 Oct' alone. */
  const midSentence = (label) => (label === 'Today' || label === 'Yesterday' ? label.toLowerCase() : label);

  /** Deterministic colour for a customer name. */
  function hueOf(name) {
    let n = 0;
    for (const ch of name) n = (n * 31 + ch.codePointAt(0)) % 360;
    return n;
  }

  /** Group a dinau list by customer name (case-insensitive) for one tab.
      Pure: takes all inputs as arguments. */
  function groupsFor(dinaus, tab, q, applySearch) {
    const wantPaid = tab === 'paid';
    const map = new Map();
    for (const d of dinaus) {
      if (!!d.paid_at !== wantPaid) continue;
      const key = keyOf(d.name);
      let g = map.get(key);
      if (!g) { g = { key, name: d.name, items: [], cents: 0, latest: '' }; map.set(key, g); }
      g.items.push(d);
      g.cents += d.cents;
      const stamp = wantPaid ? d.paid_at : d.created_at;
      if (stamp > g.latest) g.latest = stamp;
    }
    let list = [...map.values()];
    const query = (q || '').trim().toLowerCase();
    if (applySearch && query) {
      list = list.filter((g) => g.key.includes(query) || g.items.some((i) => (i.note || '').toLowerCase().includes(query)));
    }
    list.sort(wantPaid
      ? (a, b) => (a.latest < b.latest ? 1 : -1)
      : (a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
    return list;
  }

  window.Logic = { MONTHS, keyOf, parseCents, dayDiff, dayLabel, midSentence, hueOf, groupsFor };
})();
