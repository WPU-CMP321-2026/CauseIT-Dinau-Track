/* Dinau Treck: the whole screen. Plain JavaScript, no libraries.
   Every change is shown immediately and can be undone for a few seconds.
   The server is the authority on balances and the credit limit; this file
   shows what it says and warns early using the same rule (see logic.js). */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const API = 'api/dinaus.php';
  const CSRF = document.querySelector('meta[name="csrf-token"]').content;
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Pure helpers (money, dates, grouping, the limit rule) live in assets/js/logic.js for tests.
  const { keyOf, parseCents, kina: money, hueOf, midSentence, limitCheck, limitMessage, buildCustomers, groupsFor } = window.Logic;

  const state = {
    data: null,         // the latest data from the server
    tab: 'owing',       // 'owing' | 'paid'
    q: '',
    open: new Set(),    // expanded customers (by lower-case name)
    highlight: null,    // customer to flash after a change
    animate: true,      // play the entrance animation on the next render
    loadedAt: 0,
  };

  /* ---------------------------------------------------------------- helpers */

  /** Build a DOM element. Text is always set as text, never as HTML. */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined) el.append(kid);
    return el;
  }

  const ICONS = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
  };
  function icon(name, cls) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2.4');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    s.innerHTML = ICONS[name];
    return s;
  }

  const fmt = (cents) => (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const today = () => (state.data ? state.data.today : new Date().toISOString().slice(0, 10));
  const dayDiff = Logic.dayDiff;
  const dayLabel = (stamp) => Logic.dayLabel(stamp, today());
  const sleep = (ms) => new Promise((r) => setTimeout(r, REDUCED ? 0 : ms));
  const plain = (cents) => fmt(cents).replace(/,/g, '');   // "1,250.50" -> "1250.50" for input boxes

  let custCache = { data: null, list: [] };
  /** All customers, worked out from the latest data (cached until the data changes). */
  function customers() {
    if (custCache.data !== state.data) custCache = { data: state.data, list: buildCustomers(state.data) };
    return custCache.list;
  }
  const customerByKey = (key) => customers().find((c) => c.key === key);

  /* ------------------------------------------------------------------- API */

  class ApiError extends Error {
    constructor(message, field, limit) { super(message); this.field = field || null; this.limit = limit || null; }
  }

  async function api(method, body) {
    let res;
    try {
      res = await fetch(API, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new ApiError('No connection. Check your internet and try again.');
    }
    if (res.status === 401) { location.href = 'login.php'; throw new ApiError('Please sign in again.'); }
    let data = null;
    try { data = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok) throw new ApiError((data && data.error) || 'Something went wrong. Please try again.', data && data.field, data && data.limit);
    return data;
  }

  /** Send a change. The reply is the fresh data plus "result"; the screen always shows the server's numbers. */
  async function call(body) {
    const data = await api('POST', body);
    const { result, ...fresh } = data;
    state.data = fresh;
    state.loadedAt = Date.now();
    return result;
  }

  /* ---------------------------------------------------------------- toasts */

  const toastEl = $('toast'), toastText = $('toastText'), toastUndo = $('toastUndo'), toastBar = $('toastBar');
  let toastTimer = null, toastAction = null;

  function hideToast() {
    clearTimeout(toastTimer);
    if (toastEl.hidden) return;
    toastEl.classList.add('is-leaving');
    setTimeout(() => { toastEl.hidden = true; toastEl.classList.remove('is-leaving'); }, REDUCED ? 0 : 250);
  }
  function toast(text, opts = {}) {
    clearTimeout(toastTimer);
    const ms = opts.ms || (opts.undo ? 7000 : 4500);
    toastAction = opts.undo || null;
    toastText.textContent = text;
    toastUndo.hidden = !opts.undo;
    toastEl.className = 'toast' + (opts.error ? ' is-error' : '');
    toastEl.style.setProperty('--dur', ms + 'ms');
    toastEl.hidden = true;          // restart the entrance animation
    void toastEl.offsetWidth;
    toastEl.hidden = false;
    toastBar.style.animation = 'none';
    void toastBar.offsetWidth;
    toastBar.style.animation = '';
    toastTimer = setTimeout(hideToast, ms);
  }
  toastUndo.addEventListener('click', () => {
    const fn = toastAction;
    toastAction = null;
    hideToast();
    if (fn) fn();
  });

  /* ----------------------------------------------------------------- hero */

  let shownCents = 0, heroFrame = 0;
  function setHero(cents) {
    const el = $('heroAmount');
    cancelAnimationFrame(heroFrame);
    const from = shownCents;
    shownCents = cents;
    if (REDUCED || from === cents) { el.textContent = fmt(cents); return; }
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 650);
      el.textContent = fmt(Math.round(from + (cents - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) heroFrame = requestAnimationFrame(step);
    };
    heroFrame = requestAnimationFrame(step);
  }

  function renderHero() {
    const owing = customers().filter((c) => c.balance > 0);
    const total = owing.reduce((s, c) => s + c.balance, 0);
    const open = state.data.dinaus.filter((d) => d.remaining_cents > 0).length;
    setHero(total);
    $('heroSub').textContent = open === 0
      ? (state.data.dinaus.length ? 'All paid up. Nobody owes you anything.' : 'No dinaus yet.')
      : `${plural(owing.length, 'person owes', 'people owe')} you · ${plural(open, 'dinau', 'dinaus')}`;
  }

  /* ------------------------------------------------------------ rendering */

  function renderNames() {
    const names = customers().map((c) => c.name).sort((a, b) => a.localeCompare(b));
    $('nameList').replaceChildren(...names.map((n) => h('option', { value: n })));
  }

  function dinauRow(c, d) {
    const meta = [h('span', { text: dayLabel(d.created_at) })];
    if (d.remaining_cents === 0) meta.push(h('span', { class: 'pill pill-paid', text: 'Paid' }));
    else {
      if (d.remaining_cents < d.cents) meta.push(h('span', { class: 'pill pill-due', text: `${money(d.remaining_cents)} left` }));
      if (d.due_date) {
        const left = dayDiff(today(), d.due_date);
        if (left < 0) meta.push(h('span', { class: 'pill pill-overdue', text: `Overdue ${plural(-left, 'day', 'days')}` }));
        else if (left === 0) meta.push(h('span', { class: 'pill pill-due', text: 'Due today' }));
        else meta.push(h('span', { class: 'pill pill-due', text: 'Due ' + dayLabel(d.due_date) }));
      }
    }
    const label = `${money(d.cents)} for ${c.name}`;
    return h('li', { class: 'item', 'data-type': 'dinau', 'data-id': d.id },
      h('div', { class: 'item-main' },
        h('div', { class: 'item-note' + (d.note ? '' : ' is-empty'), text: d.note || 'No note' }),
        h('div', { class: 'item-meta' }, meta)),
      h('span', { class: 'item-amount', text: '+' + money(d.cents) }),
      d.remaining_cents > 0
        ? h('button', { type: 'button', class: 'item-btn pay', 'data-act': 'pay', 'aria-label': `Mark paid: ${money(d.remaining_cents)} still owed of ${label}`, title: 'Mark paid' }, icon('check'))
        : h('span', { class: 'item-btn-gap', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'item-btn del', 'data-act': 'delentry', 'aria-label': 'Remove: ' + label, title: 'Remove' }, icon('trash')));
  }

  function paymentRow(c, r) {
    return h('li', { class: 'item is-payment', 'data-type': 'repayment', 'data-id': r.id },
      h('div', { class: 'item-main' },
        h('div', { class: 'item-note', text: 'Payment received' }),
        h('div', { class: 'item-meta' }, h('span', { text: dayLabel(r.created_at) }))),
      h('span', { class: 'item-amount is-paid', text: '−' + money(r.cents) }),
      h('span', { class: 'item-btn-gap', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'item-btn del', 'data-act': 'delentry', 'aria-label': `Undo payment of ${money(r.cents)} by ${c.name}`, title: 'Undo this payment' }, icon('trash')));
  }

  /** Total taken, total paid, still owed: what both Iven and the customer want to see. */
  function summary(c) {
    const cell = (label, value, cls) => h('div', { class: 'sum-cell' + (cls ? ' ' + cls : '') }, h('dt', { text: label }), h('dd', { text: value }));
    return h('dl', { class: 'summary' },
      cell('Total taken', money(c.total)),
      cell('Paid so far', money(c.paid), 'is-paid'),
      cell('Still owed', money(c.balance), 'is-owed'));
  }

  function limitBlock(c) {
    const over = c.limit !== null && c.balance > c.limit;
    const used = Math.max(0, c.balance);
    const text = c.limit === null
      ? 'No credit limit'
      : `Limit ${money(c.limit)}${c.ownLimit === null ? ' (everyone)' : ' (own)'} · ${money(Math.max(0, c.limit - used))} available`;
    const bar = c.limit === null ? null : h('div', { class: 'limit-bar' + (over ? ' is-over' : ''), 'aria-hidden': 'true' }, h('span', { class: 'limit-fill' }));
    if (bar) bar.firstChild.style.setProperty('--pct', Math.min(100, c.limit ? (used / c.limit) * 100 : 100));

    const form = h('form', { class: 'inline-form', 'data-form': 'limit', hidden: true, novalidate: true },
      h('label', { class: 'sr-only', for: 'lim-' + c.key, text: `Credit limit for ${c.name} in kina` }),
      h('div', { class: 'money' }, h('span', { class: 'money-k', 'aria-hidden': 'true', text: 'K' }),
        h('input', { type: 'text', id: 'lim-' + c.key, inputmode: 'decimal', placeholder: 'Limit', autocomplete: 'off', value: c.ownLimit === null ? '' : plain(c.ownLimit) })),
      h('button', { type: 'submit', class: 'btn btn-primary btn-sm', text: 'Save limit' }),
      c.ownLimit !== null ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-act': 'limit-default', text: 'Use the everyone limit' }) : null,
      h('p', { class: 'error', role: 'alert', hidden: true }));

    return h('div', { class: 'limitrow' },
      h('div', { class: 'limit-top' },
        h('span', { class: 'limit-text' + (over ? ' is-over' : ''), text }),
        over ? h('span', { class: 'pill pill-overdue', text: 'Over limit' }) : null,
        h('button', { type: 'button', class: 'link-btn link-sm', 'data-act': 'limit-toggle', text: 'Change limit' })),
      bar, form);
  }

  function partPayForm(c) {
    return h('form', { class: 'inline-form', 'data-form': 'partpay', hidden: true, novalidate: true },
      h('label', { class: 'sr-only', for: 'pp-' + c.key, text: `Part payment by ${c.name} in kina` }),
      h('div', { class: 'money' }, h('span', { class: 'money-k', 'aria-hidden': 'true', text: 'K' }),
        h('input', { type: 'text', id: 'pp-' + c.key, inputmode: 'decimal', placeholder: 'Amount paid', autocomplete: 'off' })),
      h('button', { type: 'submit', class: 'btn btn-primary btn-sm', text: 'Record payment' }),
      h('p', { class: 'preview', 'aria-live': 'polite', text: `Still owed now: ${money(c.balance)}` }),
      h('p', { class: 'error', role: 'alert', hidden: true }));
  }

  function personCard(c, index, paidTab) {
    const open = state.open.has(c.key), bodyId = 'body-' + index;
    const unpaid = c.dinaus.filter((d) => d.remaining_cents > 0);
    let meta;
    if (paidTab) {
      meta = [h('span', { text: `${plural(c.dinaus.length, 'dinau', 'dinaus')} · last ${midSentence(dayLabel(c.last))}` })];
    } else {
      const oldest = unpaid.reduce((m, d) => (d.created_at < m ? d.created_at : m), unpaid[0].created_at);
      let base = unpaid.length === 1 ? dayLabel(oldest) : `${unpaid.length} dinaus · since ${midSentence(dayLabel(oldest))}`;
      if (c.paid > 0) base += ` · ${money(c.paid)} paid`;
      meta = [h('span', { text: base })];
      if (unpaid.some((d) => d.due_date && d.due_date < today())) meta.push(' ', h('span', { class: 'pill pill-overdue', text: 'Overdue' }));
      if (c.limit !== null && c.balance > c.limit) meta.push(' ', h('span', { class: 'pill pill-overdue', text: 'Over limit' }));
    }

    const entries = [...c.dinaus.map((d) => ({ t: 'd', at: d.created_at, id: d.id, x: d })),
                     ...c.payments.map((r) => ({ t: 'r', at: r.created_at, id: r.id, x: r }))]
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id));

    const body = h('div', { class: 'person-body', id: bodyId }, h('div', {},
      summary(c),
      limitBlock(c),
      h('div', { class: 'card-actions' },
        paidTab ? null : h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-act': 'partpay-toggle', text: 'Part payment' }),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-act': 'statement', text: 'Statement' })),
      paidTab ? null : partPayForm(c),
      h('ul', { class: 'items' }, entries.map((e) => (e.t === 'd' ? dinauRow(c, e.x) : paymentRow(c, e.x))))));
    if (!open) body.inert = true;

    const head = h('div', { class: 'person-head' },
      h('button', { type: 'button', class: 'person-toggle', 'data-act': 'toggle', 'aria-expanded': String(open), 'aria-controls': bodyId },
        h('span', { class: 'avatar', 'aria-hidden': 'true', text: [...c.name][0].toUpperCase() }),
        h('span', { class: 'person-main' },
          h('span', { class: 'person-name', text: c.name }),
          h('div', { class: 'person-meta' }, meta)),
        h('span', { class: 'person-amount' + (paidTab ? ' is-paid' : ''), text: paidTab ? 'Paid up' : money(c.balance) }),
        icon('chev', 'chev')),
      paidTab ? null : h('button', {
        type: 'button', class: 'pay-all', 'data-act': 'payall',
        'aria-label': unpaid.length === 1 ? `Mark paid: ${money(c.balance)} for ${c.name}` : `Mark everything paid: ${money(c.balance)} for ${c.name}`,
      }, icon('check'), h('span', { class: 'pay-text', text: unpaid.length === 1 ? 'Paid' : 'All paid' })));

    const card = h('article', { class: 'person' + (open ? ' is-open' : '') + (state.highlight === c.key ? ' is-new' : ''), 'data-key': c.key }, head, body);
    card.style.setProperty('--hue', hueOf(c.name));
    card.style.setProperty('--i', Math.min(index, 10));
    return card;
  }

  function emptyState(title, text, withTick) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 72 72');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<circle cx="36" cy="36" r="30" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="3"/>'
      + (withTick ? '<path class="tick" d="M24 37l8 8 16-17" fill="none" stroke="#17895a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
                  : '<path d="M24 36h24M36 24v24" stroke="currentColor" stroke-opacity=".4" stroke-width="4" stroke-linecap="round"/>');
    return h('div', { class: 'empty' }, svg, h('strong', { text: title }), h('span', { text }));
  }

  function renderList() {
    const list = $('list');
    const paidTab = state.tab === 'paid';
    const groups = groupsFor(customers(), state.tab, state.q, true);
    list.classList.toggle('no-anim', !state.animate);
    state.animate = false;
    list.setAttribute('aria-busy', 'false');
    list.setAttribute('aria-labelledby', paidTab ? 'tabPaid' : 'tabOwing');

    if (groups.length) list.replaceChildren(...groups.map((c, i) => personCard(c, i, paidTab)));
    else if (state.q.trim()) list.replaceChildren(emptyState('No match', `Nobody called “${state.q.trim()}” here.`, false));
    else if (!state.data.dinaus.length) list.replaceChildren(emptyState('No dinaus yet', 'Type a name and an amount above to record your first one.', false));
    else if (paidTab) list.replaceChildren(emptyState('Nobody has paid up yet', 'Customers move here once they owe K0.00.', false));
    else list.replaceChildren(emptyState('Nobody owes you anything', 'Every dinau is paid. Nice work!', true));
  }

  function renderTabs() {
    $('countOwing').textContent = groupsFor(customers(), 'owing', '', false).length;
    $('countPaid').textContent = groupsFor(customers(), 'paid', '', false).length;
    for (const t of document.querySelectorAll('.tab')) {
      const on = t.dataset.tab === state.tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    }
  }

  function renderSettings() {
    const limit = state.data.default_limit_cents;
    if (document.activeElement !== $('defaultLimit')) $('defaultLimit').value = limit === null ? '' : plain(limit);
    $('settingsBox').querySelector('summary').textContent = limit === null ? 'Credit limit: none' : `Credit limit: ${money(limit)}`;
  }

  function render() {
    renderHero();
    renderTabs();
    renderNames();
    renderList();
    renderSettings();
    updateFormHints();
    if (state.highlight) {
      const k = state.highlight;
      setTimeout(() => {
        if (state.highlight === k) state.highlight = null;
        const el = document.querySelector('.person.is-new');
        if (el) el.classList.remove('is-new');
      }, 3500);
    }
  }

  /* --------------------------------------------------------------- loading */

  async function load(initial) {
    if (initial) {
      $('list').replaceChildren(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
      $('list').setAttribute('aria-busy', 'true');
    }
    try {
      state.data = await api('GET');
      state.loadedAt = Date.now();
      if (initial) state.animate = true;
      render();
    } catch (err) {
      if (!initial) { toast(err.message, { error: true }); return; }
      $('heroSub').textContent = 'Could not load.';
      const retry = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Try again' });
      retry.addEventListener('click', () => load(true));
      $('list').replaceChildren(h('div', { class: 'load-error', role: 'alert' }, h('span', { text: err.message }), retry));
      $('list').setAttribute('aria-busy', 'false');
    }
  }

  /* ----------------------------------------------------- customer statement */

  const sheet = $('sheet');
  let sheetText = '';
  $('sheetDone').addEventListener('click', () => sheet.close());
  $('sheetPrint').addEventListener('click', () => window.print());
  $('sheetCopy').addEventListener('click', async () => {
    const btn = $('sheetCopy');
    try { await navigator.clipboard.writeText(sheetText); btn.textContent = 'Copied ✓'; }
    catch (e) { btn.textContent = 'Use Print instead'; }
  });
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });   // tap outside to close
  sheet.addEventListener('close', () => $('name').focus());

  /** What they took, what they paid, and what is still owed, with dates. */
  function showStatement(c) {
    const events = [...c.dinaus.map((d) => ({ at: d.created_at, id: d.id, k: 0, cents: d.cents, label: d.note || 'Dinau' })),
                    ...c.payments.map((r) => ({ at: r.created_at, id: r.id, k: 1, cents: -r.cents, label: 'Payment received' }))]
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.k - b.k || a.id - b.id));
    let run = 0;
    const lines = ['Dinau Treck statement', c.name, ''];
    const rows = events.map((e) => {
      run += e.cents;
      lines.push(`${dayLabel(e.at)}  ${e.label}  ${e.cents < 0 ? '-' : '+'}${money(Math.abs(e.cents))}  (owed ${money(run)})`);
      return h('li', { class: 'stmt-row' },
        h('span', { class: 'stmt-date', text: dayLabel(e.at) }),
        h('span', { class: 'stmt-label', text: e.label }),
        h('span', { class: 'stmt-amt' + (e.cents < 0 ? ' is-paid' : ''), text: (e.cents < 0 ? '−' : '+') + money(Math.abs(e.cents)) }),
        h('span', { class: 'stmt-bal', text: money(run) }));
    });
    lines.push('', `Total taken: ${money(c.total)}`, `Paid so far: ${money(c.paid)}`, `STILL OWED: ${money(c.balance)}`);
    sheetText = lines.join('\n');
    $('sheetTitle').textContent = 'Statement · ' + c.name;
    $('sheetBody').replaceChildren(h('div', { class: 'receipt' },
      h('div', { class: 'stmt-head' }, h('span', { text: 'Date' }), h('span', { text: 'What' }), h('span', { text: 'Amount' }), h('span', { text: 'Owed' })),
      h('ul', { class: 'stmt' }, rows),
      summary(c)));
    $('sheetCopy').textContent = 'Copy text';
    sheet.showModal();
  }

  /* --------------------------------------------------------------- actions */

  /** Slide the affected row (or the whole card) away while the server answers. */
  function leaveFx(key, itemEl, whole) {
    const card = $('list').querySelector(`.person[data-key="${CSS.escape(key)}"]`);
    if (card) {
      if (whole) card.classList.add('is-leaving');
      else if (itemEl) itemEl.classList.add('is-leaving');
    }
    return sleep(300);
  }

  /** Record a repayment: "part" (some), "dinau" (one dinau) or "all". The balance updates from the server's answer. */
  async function repay(c, kind, extra, itemEl, whole) {
    try {
      const [res] = await Promise.all([call({ action: 'repay', name: c.name, kind, ...extra }), leaveFx(c.key, itemEl, whole)]);
      state.highlight = res.balance_cents > 0 ? c.key : null;
      render();
      toast(`${res.name} paid ${money(res.cents)}. ${res.balance_cents > 0 ? 'Still owed: ' + money(res.balance_cents) + '.' : 'All paid up.'}`, {
        undo: async () => {
          try {
            await call({ action: 'remove', type: 'repayment', ids: [res.repayment_id], removed: true });
            state.highlight = c.key; state.open.add(c.key); state.tab = 'owing'; state.animate = true;
            render();
            toast('Payment undone.');
          } catch (err) { toast(err.message, { error: true }); }
        },
      });
      return true;
    } catch (err) {
      render();
      toast(err.message, { error: true });
      return false;
    }
  }

  /** Remove a dinau or a payment, with Undo. */
  async function removeEntry(type, id, label, key, itemEl) {
    try {
      await Promise.all([call({ action: 'remove', type, ids: [id], removed: true }), leaveFx(key, itemEl, false)]);
    } catch (err) { render(); toast(err.message, { error: true }); return; }
    render();
    toast(`Removed ${label}.`, {
      undo: async () => {
        try {
          await call({ action: 'remove', type, ids: [id], removed: false });
          state.highlight = key; state.open.add(key); state.tab = 'owing'; state.animate = true;
          render();
          toast('Brought back.');
        } catch (err) { toast(err.message, { error: true }); }
      },
    });
  }

  async function saveLimit(c, raw, errEl) {
    if (raw !== '' && parseCents(raw) === null) { errEl.textContent = 'Enter a limit like 20 or 12.50.'; errEl.hidden = false; return; }
    try {
      await call({ action: 'set_limit', name: c.name, limit: raw });
      state.open.add(c.key);
      render();
      toast(raw === '' ? `${c.name} now uses the everyone limit.` : `${c.name}'s limit is ${money(parseCents(raw))}.`);
    } catch (err) { errEl.textContent = err.message; errEl.hidden = false; }
  }

  $('list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('.person');
    const c = card && customerByKey(card.dataset.key);
    if (!c) return;
    const li = btn.closest('.item');
    const act = btn.dataset.act;

    if (act === 'toggle') {            // no re-render, so the open/close animation plays
      const open = !card.classList.contains('is-open');
      card.classList.toggle('is-open', open);
      card.querySelector('.person-body').inert = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) state.open.add(c.key); else state.open.delete(c.key);
    } else if (act === 'payall') {
      repay(c, 'all', {}, null, true);
    } else if (act === 'pay' && li) {
      const d = c.dinaus.find((x) => x.id === +li.dataset.id);
      if (d) repay(c, 'dinau', { dinau_id: d.id }, li, d.remaining_cents === c.balance);
    } else if (act === 'delentry' && li) {
      if (li.dataset.type === 'dinau') {
        const d = c.dinaus.find((x) => x.id === +li.dataset.id);
        if (d) removeEntry('dinau', d.id, `${money(d.cents)} for ${c.name}`, c.key, li);
      } else {
        const r = c.payments.find((x) => x.id === +li.dataset.id);
        if (r) removeEntry('repayment', r.id, `payment of ${money(r.cents)}`, c.key, li);
      }
    } else if (act === 'statement') {
      showStatement(c);
    } else if (act === 'partpay-toggle' || act === 'limit-toggle') {
      const f = card.querySelector(`[data-form="${act === 'limit-toggle' ? 'limit' : 'partpay'}"]`);
      f.hidden = !f.hidden;
      if (!f.hidden) f.querySelector('input').focus();
    } else if (act === 'limit-default') {
      saveLimit(c, '', btn.closest('form').querySelector('.error'));
    }
  });

  // While typing a part payment, show what will still be owed afterwards.
  $('list').addEventListener('input', (e) => {
    const form = e.target.closest('form[data-form="partpay"]');
    if (!form) return;
    const c = customerByKey(form.closest('.person').dataset.key);
    const cents = parseCents(e.target.value);
    form.querySelector('.error').hidden = true;
    form.querySelector('.preview').textContent = cents === null
      ? `Still owed now: ${money(c.balance)}`
      : cents > c.balance ? `${c.name} only owes ${money(c.balance)}.` : `Still owed after this payment: ${money(c.balance - cents)}`;
  });

  $('list').addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const card = form.closest('.person');
    const c = customerByKey(card.dataset.key);
    const input = form.querySelector('input');
    const err = form.querySelector('.error');
    err.hidden = true;

    if (form.dataset.form === 'limit') { saveLimit(c, input.value.trim(), err); return; }

    // Part payment: the balance is reduced by exactly this amount.
    const cents = parseCents(input.value);
    if (cents === null) { err.textContent = 'Enter an amount like 3 or 2.50.'; err.hidden = false; input.focus(); return; }
    if (cents > c.balance) { err.textContent = `${c.name} only owes ${money(c.balance)}.`; err.hidden = false; input.focus(); return; }
    state.open.add(c.key);
    await repay(c, 'part', { amount: input.value.trim() }, null, cents === c.balance);
  });

  /* --------------------------------------------------------------- the form */

  const form = $('addForm'), nameEl = $('name'), amountEl = $('amount'), noteEl = $('note'), dueEl = $('due');
  const formError = $('formError'), saveBtn = $('saveBtn');
  let saving = false, blocked = false;

  function clearErrors() {
    formError.hidden = true;
    for (const el of [nameEl, amountEl, noteEl, dueEl]) { el.classList.remove('is-invalid'); el.removeAttribute('aria-invalid'); }
  }
  function fail(field, message) {
    const el = { name: nameEl, amount: amountEl, note: noteEl, due_date: dueEl }[field] || null;
    formError.textContent = message;
    formError.hidden = false;
    if (el) {
      el.classList.remove('is-invalid'); void el.offsetWidth;
      el.classList.add('is-invalid');
      el.setAttribute('aria-invalid', 'true');
      el.focus();
    }
  }

  /** Live help while typing. Shows who they are, and STOPS a dinau that would go over the limit. */
  function updateFormHints() {
    if (!state.data) return;
    const hint = $('nameHint');
    const name = nameEl.value.trim().replace(/\s+/g, ' ');
    const c = name ? customerByKey(keyOf(name)) : null;
    hint.classList.remove('is-known');
    if (!name) hint.textContent = 'Type any name. New customers are added for you.';
    else if (!c) hint.textContent = 'New customer. They will be added when you record this dinau.';
    else {
      hint.classList.add('is-known');
      hint.replaceChildren(c.balance > 0
        ? h('span', {}, h('strong', { text: c.name }), ` still owes ${money(c.balance)}` + (c.paid > 0 ? ` (paid ${money(c.paid)} so far).` : '.'))
        : h('span', {}, h('strong', { text: c.name }), ' is all paid up.'));
    }

    // The credit limit rule: refuse before the button is even pressed.
    const cents = parseCents(amountEl.value);
    const balance = c ? c.balance : 0;
    const limit = c ? c.limit : state.data.default_limit_cents;
    const check = cents !== null && limit !== null ? limitCheck(balance, cents, limit) : { blocked: false };
    blocked = check.blocked;
    $('limitBlock').hidden = !blocked;
    if (blocked) {
      $('limitMsg').textContent = limitMessage(c ? c.name : (name || 'this customer'), balance, limit);
      $('blockPay').hidden = !(c && c.balance > 0);
    }
    saveBtn.disabled = saving || blocked;
    saveBtn.classList.toggle('is-blocked', blocked);
    $('saveLabel').textContent = blocked ? 'Over the limit' : 'Record dinau';
  }

  nameEl.addEventListener('input', () => { updateFormHints(); nameEl.classList.remove('is-invalid'); formError.hidden = true; });
  amountEl.addEventListener('input', () => {
    const cleaned = amountEl.value.replace(/[^\d.,]/g, '');
    if (cleaned !== amountEl.value) amountEl.value = cleaned;
    amountEl.classList.remove('is-invalid');
    formError.hidden = true;
    updateFormHints();
  });

  /** Jump to a customer's card with one of its forms open (used by the limit notice). */
  function revealCard(key, formName) {
    state.tab = 'owing'; state.q = ''; $('search').value = ''; state.open.add(key); state.animate = false;
    render();
    const card = $('list').querySelector(`.person[data-key="${CSS.escape(key)}"]`);
    const f = card && card.querySelector(`[data-form="${formName}"]`);
    if (!f) return;
    f.hidden = false;
    card.scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' });
    f.querySelector('input').focus({ preventScroll: true });
  }
  $('blockPay').addEventListener('click', () => {
    const c = customerByKey(keyOf(nameEl.value.trim().replace(/\s+/g, ' ')));
    if (c) revealCard(c.key, 'partpay');
  });
  $('blockLimit').addEventListener('click', () => {
    const c = customerByKey(keyOf(nameEl.value.trim().replace(/\s+/g, ' ')));
    if (c) { revealCard(c.key, 'limit'); return; }
    $('settingsBox').open = true;                       // a brand-new customer: only the everyone limit applies
    $('settingsBox').scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' });
    $('defaultLimit').focus({ preventScroll: true });
  });

  $('dueToggle').addEventListener('click', (e) => {
    const panel = $('duePanel'), show = panel.hidden;
    panel.hidden = !show;
    e.currentTarget.setAttribute('aria-expanded', String(show));
    e.currentTarget.textContent = show ? '− Remove due date' : '+ Add a due date';
    if (show) dueEl.focus(); else dueEl.value = '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    clearErrors();
    const name = nameEl.value.trim().replace(/\s+/g, ' ');
    if (!name) return fail('name', 'Type the customer’s name.');
    if (parseCents(amountEl.value) === null) return fail('amount', 'Enter an amount like 5 or 12.50.');
    updateFormHints();
    if (blocked) { amountEl.focus(); return; }          // over the limit: nothing is sent

    saving = true;
    saveBtn.disabled = true;
    saveBtn.classList.add('is-saving');
    try {
      const res = await call({
        action: 'add', name, amount: amountEl.value.trim(), note: noteEl.value.trim(),
        due_date: $('duePanel').hidden ? '' : dueEl.value,
      });
      const key = keyOf(res.name);
      state.tab = 'owing'; state.q = ''; $('search').value = '';
      state.highlight = key; state.open.add(key); state.animate = true;

      nameEl.value = ''; amountEl.value = ''; noteEl.value = ''; dueEl.value = '';
      if (!$('duePanel').hidden) $('dueToggle').click();
      render();
      toast(`Recorded ${money(res.cents)} for ${res.name}. Now owes ${money(res.balance_cents)}.`, {
        undo: () => removeEntry('dinau', res.dinau_id, `${money(res.cents)} for ${res.name}`, key, null),
      });
      nameEl.focus();
      const card = document.querySelector('.person.is-new');
      if (card) card.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
    } catch (err) {
      fail(err.field, err.message);
      if (err.limit) await load(false);                  // the server refused: the screen's numbers were out of date
    } finally {
      saving = false;
      saveBtn.classList.remove('is-saving');
      updateFormHints();
    }
  });

  /* --------------------------------------------- tabs, search, credit limit */

  for (const t of document.querySelectorAll('.tab')) {
    t.addEventListener('click', () => {
      if (state.tab === t.dataset.tab) return;
      state.tab = t.dataset.tab;
      state.animate = true;
      render();
    });
  }
  $('search').addEventListener('input', (e) => { state.q = e.target.value; render(); });
  $('search').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.q) { state.q = ''; e.target.value = ''; render(); }
  });

  // Iven can set the credit limit to any amount (or empty = no limit).
  $('limitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = $('defaultLimit').value.trim(), err = $('limitError');
    err.hidden = true;
    if (raw !== '' && parseCents(raw) === null) { err.textContent = 'Enter a limit like 20 or 12.50.'; err.hidden = false; $('defaultLimit').focus(); return; }
    try {
      await call({ action: 'set_default_limit', limit: raw });
      render();
      toast(raw === '' ? 'No credit limit now.' : `Credit limit is now ${money(parseCents(raw))}.`);
    } catch (e2) { err.textContent = e2.message; err.hidden = false; }
  });

  // Coming back to the app after a while? Quietly refresh in case another device changed something.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - state.loadedAt > 30000 && !saving) load(false);
  });

  updateFormHints();
  load(true);
})();
