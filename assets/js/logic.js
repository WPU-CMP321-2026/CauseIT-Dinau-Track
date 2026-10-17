/* Dinau Treck: pure logic. No DOM, no state — safe to unit-test.
   Loaded as a plain script before app.js and exposed as window.Logic
   (and as module.exports under Node, for tests/logic.test.js). */
(() => {
  'use strict';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const keyOf = (name) => name.toLowerCase();

  /** "5", "5.50", "5,50", "K5" -> whole toea (cents). Returns null for anything else. */
  function parseCents(raw) {
    const s = String(raw).trim().replace(/^(pgk|k)\s*/i, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    const c = Math.round(parseFloat(s) * 100);
    return c > 0 ? c : null;
  }

  const kina = (cents) => 'K' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

  /**
   * THE CREDIT LIMIT RULE (the server enforces the same rule; this lets the screen
   * warn before Iven even presses the button).
   *   balance: what the customer owes now, after repayments (cents)
   *   amount:  the new dinau (cents)
   *   limit:   cents, or null for "no limit"
   * A dinau that brings the balance exactly up to the limit is allowed.
   */
  function limitCheck(balance, amount, limit) {
    if (limit === null || limit === undefined) return { blocked: false, available: null, newBalance: balance + amount };
    return { blocked: balance + amount > limit, available: Math.max(0, limit - balance), newBalance: balance + amount };
  }

  /** The message shown when a dinau is refused. Same wording as the server's. */
  function limitMessage(name, balance, limit) {
    const available = Math.max(0, limit - balance);
    if (balance <= 0) return `The limit is ${kina(limit)}, so the most that can be recorded for ${name} is ${kina(limit)}. Raise the limit first.`;
    if (available === 0) return `${name} already owes ${kina(balance)} and the limit is ${kina(limit)}, so nothing more can be recorded. Record a payment or raise the limit first.`;
    return `${name} already owes ${kina(balance)} and the limit is ${kina(limit)}, so only ${kina(available)} more can be recorded. Record a payment or raise the limit first.`;
  }

  /**
   * One object per customer, built from the server's lists (grouped by name,
   * ignoring capital letters).
   *   balance = still owed (sum of what is left on each dinau)
   *   total   = everything ever put on credit, paid = total - balance
   *   limit   = their own limit if set, else the default (null = no limit)
   */
  function buildCustomers(data) {
    const map = new Map();
    const ownLimits = new Map((data.customer_limits || []).map((l) => [keyOf(l.name), l.cents]));
    const get = (name) => {
      const key = keyOf(name);
      let c = map.get(key);
      if (!c) {
        const own = ownLimits.has(key) ? ownLimits.get(key) : null;
        c = {
          key, name, dinaus: [], payments: [], balance: 0, total: 0, paid: 0, last: '',
          ownLimit: own, limit: own !== null ? own : (data.default_limit_cents === undefined ? null : data.default_limit_cents),
        };
        map.set(key, c);
      }
      return c;
    };
    for (const d of data.dinaus) {
      const c = get(d.name);
      c.dinaus.push(d);
      c.balance += d.remaining_cents;
      c.total += d.cents;
      if (d.created_at > c.last) c.last = d.created_at;
    }
    for (const r of data.repayments) {
      const c = map.get(keyOf(r.name));
      if (!c) continue;
      c.payments.push(r);
      if (r.created_at > c.last) c.last = r.created_at;
    }
    for (const c of map.values()) c.paid = c.total - c.balance;
    return [...map.values()];
  }

  /** Customers for one tab: 'owing' (balance above zero) or 'paid' (settled), optionally filtered by a search. */
  function groupsFor(customers, tab, q, applySearch) {
    const wantOwing = tab === 'owing';
    let list = customers.filter((c) => (c.balance > 0) === wantOwing);
    const query = (q || '').trim().toLowerCase();
    if (applySearch && query) {
      list = list.filter((c) => c.key.includes(query) || c.dinaus.some((i) => (i.note || '').toLowerCase().includes(query)));
    }
    list.sort(wantOwing
      ? (a, b) => b.balance - a.balance || a.name.localeCompare(b.name)
      : (a, b) => (a.last < b.last ? 1 : -1));
    return list;
  }

  const api = { MONTHS, keyOf, parseCents, kina, dayDiff, dayLabel, midSentence, hueOf, limitCheck, limitMessage, buildCustomers, groupsFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.Logic = api;
})();
