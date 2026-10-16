/* Dinau Treck: the whole screen. Plain JavaScript, no libraries.
   Every change is shown immediately and can be undone for a few seconds. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const API = 'api/dinaus.php';
  const CSRF = document.querySelector('meta[name="csrf-token"]').content;
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Pure helpers (grouping, money, dates) live in assets/js/logic.js for tests.
  const { MONTHS, keyOf, parseCents, dayDiff, dayLabel, midSentence, hueOf, groupsFor } = window.Logic;

  const state = {
    dinaus: [],
    today: new Date().toISOString().slice(0, 10),
    tab: 'owing',
    q: '',
    open: new Set(),   // customer keys that are expanded
    highlight: null,   // customer key to flash after a change
    animate: true,     // play the entrance animation on the next render
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
    undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/>',
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
  const money = (cents) => 'K' + fmt(cents);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /* ------------------------------------------------------------------- API */

  class ApiError extends Error {
    constructor(message, field) { super(message); this.field = field || null; }
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
    if (!res.ok) throw new ApiError((data && data.error) || 'Something went wrong. Please try again.', data && data.field);
    return data;
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

  /* ------------------------------------------------------------ data views */

  /** Customers (grouped by name, ignoring capital letters) for one tab. */
  function groupsForTab(tab, applySearch) {
    return groupsFor(state.dinaus, tab, state.q, applySearch);
  }

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
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(from + (cents - from) * eased));
      if (p < 1) heroFrame = requestAnimationFrame(step);
    };
    heroFrame = requestAnimationFrame(step);
  }

  function renderHero() {
    const owing = groupsForTab('owing', false);
    const total = owing.reduce((s, g) => s + g.cents, 0);
    const count = owing.reduce((s, g) => s + g.items.length, 0);
    setHero(total);
    $('heroSub').textContent = count === 0
      ? (state.dinaus.length ? 'All paid up. Nobody owes you anything.' : 'No dinaus yet.')
      : `${plural(owing.length, 'person owes', 'people owe')} you · ${plural(count, 'dinau', 'dinaus')}`;
  }

  /* ------------------------------------------------------------ rendering */

  function renderNames() {
    const names = new Map();
    for (const d of state.dinaus) if (!names.has(keyOf(d.name))) names.set(keyOf(d.name), d.name);
    const dl = $('nameList');
    dl.replaceChildren(...[...names.values()].sort((a, b) => a.localeCompare(b)).map((n) => h('option', { value: n })));
  }

  function itemRow(d, paidTab) {
    const meta = [h('span', { text: paidTab ? 'Paid ' + dayLabel(d.paid_at, state.today) : dayLabel(d.created_at, state.today) })];
    if (!paidTab && d.due_date) {
      const left = dayDiff(state.today, d.due_date);
      if (left < 0) meta.push(h('span', { class: 'pill pill-overdue', text: `Overdue ${plural(-left, 'day', 'days')}` }));
      else if (left === 0) meta.push(h('span', { class: 'pill pill-due', text: 'Due today' }));
      else meta.push(h('span', { class: 'pill pill-due', text: 'Due ' + dayLabel(d.due_date, state.today) }));
    }
    const label = `${money(d.cents)} for ${d.name}`;
    return h('li', { class: 'item', 'data-id': d.id },
      h('div', { class: 'item-main' },
        h('div', { class: 'item-note' + (d.note ? '' : ' is-empty'), text: d.note || 'No note' }),
        h('div', { class: 'item-meta' }, meta)),
      h('span', { class: 'item-amount', text: money(d.cents) }),
      paidTab
        ? h('button', { type: 'button', class: 'item-btn undo', 'data-act': 'unpay', 'aria-label': 'Mark unpaid: ' + label }, icon('undo'), ' Unpay')
        : h('button', { type: 'button', class: 'item-btn pay', 'data-act': 'pay', 'aria-label': 'Mark paid: ' + label, title: 'Mark paid' }, icon('check')),
      h('button', { type: 'button', class: 'item-btn del', 'data-act': 'remove', 'aria-label': 'Remove: ' + label, title: 'Remove' }, icon('trash')));
  }

  function personCard(g, index, paidTab) {
    const open = state.open.has(g.key);
    const bodyId = 'body-' + index;
    let meta;
    if (paidTab) {
      meta = [h('span', { text: `${plural(g.items.length, 'dinau', 'dinaus')} paid · last ${midSentence(dayLabel(g.latest, state.today))}` })];
    } else {
      const oldest = g.items.reduce((m, i) => (i.created_at < m ? i.created_at : m), g.items[0].created_at);
      const overdue = g.items.some((i) => i.due_date && i.due_date < state.today);
      meta = [h('span', { text: g.items.length === 1 ? dayLabel(oldest, state.today) : `${g.items.length} dinaus · since ${midSentence(dayLabel(oldest, state.today))}` })];
      if (overdue) meta.push(' ', h('span', { class: 'pill pill-overdue', text: 'Overdue' }));
    }

    const body = h('div', { class: 'person-body', id: bodyId },
      h('div', {}, h('ul', { class: 'items' }, g.items.map((d) => itemRow(d, paidTab)))));
    if (!open) body.inert = true;

    const head = h('div', { class: 'person-head' },
      h('button', { type: 'button', class: 'person-toggle', 'data-act': 'toggle', 'aria-expanded': String(open), 'aria-controls': bodyId },
        h('span', { class: 'avatar', 'aria-hidden': 'true', text: [...g.name][0].toUpperCase() }),
        h('span', { class: 'person-main' },
          h('span', { class: 'person-name', text: g.name }),
          h('div', { class: 'person-meta' }, meta)),
        h('span', { class: 'person-amount' + (paidTab ? ' is-paid' : ''), text: money(g.cents) }),
        icon('chev', 'chev')),
      paidTab ? null : h('button', {
        type: 'button', class: 'pay-all', 'data-act': 'payall',
        'aria-label': g.items.length === 1 ? `Mark paid: ${money(g.cents)} for ${g.name}` : `Mark all ${g.items.length} dinaus paid for ${g.name}`,
      }, icon('check'), h('span', { class: 'pay-text', text: g.items.length === 1 ? 'Paid' : 'All paid' })));

    const card = h('article', {
      class: 'person' + (open ? ' is-open' : '') + (state.highlight === g.key ? ' is-new' : ''),
      'data-key': g.key,
    }, head, body);
    card.style.setProperty('--hue', hueOf(g.name));
    card.style.setProperty('--i', Math.min(index, 10));
    return card;
  }

  function emptyState(title, text, withTick) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 72 72');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<circle cx="36" cy="36" r="30" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="3"/>'
      + (withTick ? '<path class="tick" d="M24 37l8 8 16-17" fill="none" stroke="#17895a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' : '<path d="M24 36h24M36 24v24" stroke="currentColor" stroke-opacity=".4" stroke-width="4" stroke-linecap="round"/>');
    return h('div', { class: 'empty' }, svg, h('strong', { text: title }), h('span', { text: text }));
  }

  function renderList() {
    const list = $('list');
    const paidTab = state.tab === 'paid';
    const groups = groupsForTab(state.tab, true);
    list.classList.toggle('no-anim', !state.animate);
    state.animate = false;
    list.setAttribute('aria-busy', 'false');
    list.setAttribute('aria-labelledby', paidTab ? 'tabPaid' : 'tabOwing');

    if (groups.length) {
      list.replaceChildren(...groups.map((g, i) => personCard(g, i, paidTab)));
    } else if (state.q.trim()) {
      list.replaceChildren(emptyState('No match', `Nobody called “${state.q.trim()}” here.`, false));
    } else if (!state.dinaus.length) {
      list.replaceChildren(emptyState('No dinaus yet', 'Type a name and an amount above to record your first one.', false));
    } else if (paidTab) {
      list.replaceChildren(emptyState('Nothing paid yet', 'When someone pays, tap the green tick next to their dinau.', false));
    } else {
      list.replaceChildren(emptyState('Nobody owes you anything', 'Every dinau is paid. Nice work!', true));
    }
  }

  function renderTabs() {
    const owing = groupsForTab('owing', false).length, paid = groupsForTab('paid', false).length;
    $('countOwing').textContent = owing;
    $('countPaid').textContent = paid;
    for (const t of document.querySelectorAll('.tab')) {
      const on = t.dataset.tab === state.tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    }
  }

  function render() {
    renderHero();
    renderTabs();
    renderNames();
    renderList();
    updateNameHint();
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

  function showSkeleton() {
    $('list').replaceChildren(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
    $('list').setAttribute('aria-busy', 'true');
  }

  async function load(initial) {
    if (initial) showSkeleton();
    try {
      const data = await api('GET');
      state.dinaus = data.dinaus;
      state.today = data.today;
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

  /* --------------------------------------------------------------- actions */

  /** Slide the affected rows out before the list is redrawn. */
  function leave(ids) {
    const wanted = new Set(ids);
    const keys = new Set(state.dinaus.filter((d) => wanted.has(d.id)).map((d) => keyOf(d.name)));
    const list = $('list');
    for (const key of keys) {
      const g = groupsForTab(state.tab, false).find((x) => x.key === key);
      const card = list.querySelector(`[data-key="${CSS.escape(key)}"]`);
      if (!g || !card) continue;
      if (g.items.every((i) => wanted.has(i.id))) card.classList.add('is-leaving');
      else for (const i of g.items) if (wanted.has(i.id)) {
        const li = card.querySelector(`[data-id="${i.id}"]`);
        if (li) li.classList.add('is-leaving');
      }
    }
    return new Promise((r) => setTimeout(r, REDUCED ? 0 : 300));
  }

  const nowStamp = () => state.today + ' 12:00:00';

  /**
   * Shared optimistic update: mutate local state first, show the toast (with
   * optional undo), then send the change; if the API call fails, roll back.
   * opts: ids, select(ids), animate, apply(targets), rollback(targets),
   *       action, extra (api body fields), message, offerUndo, undo.
   */
  async function optimisticUpdate(ids, opts) {
    const targets = opts.select(ids);
    if (!targets.length) return;
    if (opts.animate) await leave(ids);
    opts.apply(targets);
    render();
    toast(opts.message, opts.offerUndo ? { undo: opts.undo } : {});
    try {
      await api('POST', { action: opts.action, ids, ...opts.extra });
    } catch (err) {
      await opts.rollback(targets);
      render();
      toast('Not saved. ' + err.message, { error: true });
    }
  }

  async function setPaid(ids, paid, message, offerUndo, animate = true) {
    let before = [];
    await optimisticUpdate(ids, {
      select: (idList) => {
        const targets = state.dinaus.filter((d) => idList.includes(d.id));
        before = targets.map((d) => ({ d, paid_at: d.paid_at }));
        return targets;
      },
      animate,
      apply: (targets) => {
        for (const t of targets) t.paid_at = paid ? nowStamp() : null;
        if (!paid) { state.highlight = keyOf(targets[0].name); state.open.add(state.highlight); }
      },
      rollback: () => { for (const b of before) b.d.paid_at = b.paid_at; },
      action: 'set_paid',
      extra: { paid },
      message,
      offerUndo,
      undo: () => setPaid(ids, !paid, paid ? 'Back in Owing.' : 'Marked paid again.', false, false),
    });
  }

  async function removeIds(ids, removed, message, offerUndo, animate = true) {
    await optimisticUpdate(ids, {
      select: (idList) => removed
        ? state.dinaus.filter((d) => idList.includes(d.id))
        : removedCache.filter((d) => idList.includes(d.id)),
      animate: removed && animate,
      apply: (targets) => {
        if (removed) {
          state.dinaus = state.dinaus.filter((d) => !ids.includes(d.id));
          removedCache = targets;
        } else {
          state.dinaus.push(...targets);
          state.dinaus.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id));
          if (targets[0]) { state.highlight = keyOf(targets[0].name); state.open.add(state.highlight); }
        }
      },
      rollback: async () => { removedCache = []; await load(false); },
      action: 'remove',
      extra: { removed },
      message,
      offerUndo,
      undo: () => removeIds(ids, !removed, removed ? 'Brought back.' : 'Removed.', false, false),
    });
  }
  let removedCache = [];

  function findGroup(card) {
    return groupsForTab(state.tab, false).find((g) => g.key === card.dataset.key);
  }

  $('list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('.person');
    if (!card) return;
    const act = btn.dataset.act;

    if (act === 'toggle') {            // no re-render, so the open/close animation plays
      const open = !card.classList.contains('is-open');
      card.classList.toggle('is-open', open);
      card.querySelector('.person-body').inert = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) state.open.add(card.dataset.key); else state.open.delete(card.dataset.key);
      return;
    }

    const g = findGroup(card);
    if (!g) return;
    const li = btn.closest('.item');
    const id = li ? +li.dataset.id : 0;
    const item = g.items.find((i) => i.id === id);

    if (act === 'payall') {
      const ids = g.items.map((i) => i.id);
      setPaid(ids, true, ids.length === 1 ? `${g.name} paid ${money(g.cents)}.` : `${g.name} paid all ${money(g.cents)}.`, true);
    } else if (act === 'pay' && item) {
      setPaid([id], true, `${g.name} paid ${money(item.cents)}.`, true);
    } else if (act === 'unpay' && item) {
      setPaid([id], false, `${money(item.cents)} moved back to Owing.`, false);
    } else if (act === 'remove' && item) {
      removeIds([id], true, `Removed ${money(item.cents)} for ${g.name}.`, true);
    }
  });

  /* ------------------------------------------------------------ add a dinau */

  const form = $('addForm'), nameEl = $('name'), amountEl = $('amount'), noteEl = $('note'), dueEl = $('due');
  const formError = $('formError'), saveBtn = $('saveBtn');
  let saving = false;

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

  function updateNameHint() {
    const hint = $('nameHint');
    const name = nameEl.value.trim().replace(/\s+/g, ' ');
    hint.classList.remove('is-known');
    if (!name) { hint.textContent = 'Type any name. New customers are added for you.'; return; }
    const key = keyOf(name);
    const known = state.dinaus.filter((d) => keyOf(d.name) === key);
    if (!known.length) { hint.textContent = 'New customer. They will be added when you record this dinau.'; return; }
    const owed = known.filter((d) => !d.paid_at);
    const cents = owed.reduce((s, d) => s + d.cents, 0);
    hint.classList.add('is-known');
    hint.replaceChildren(owed.length
      ? h('span', {}, h('strong', { text: known[0].name }), ` already owes ${money(cents)}. This adds to it.`)
      : h('span', {}, h('strong', { text: known[0].name }), ' is all paid up. This starts a new dinau.'));
  }

  nameEl.addEventListener('input', () => { updateNameHint(); nameEl.classList.remove('is-invalid'); formError.hidden = true; });
  amountEl.addEventListener('input', () => {
    const cleaned = amountEl.value.replace(/[^\d.,]/g, '');
    if (cleaned !== amountEl.value) amountEl.value = cleaned;
    amountEl.classList.remove('is-invalid');
    formError.hidden = true;
  });

  $('dueToggle').addEventListener('click', (e) => {
    const panel = $('duePanel');
    const show = panel.hidden;
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

    saving = true;
    saveBtn.disabled = true;
    saveBtn.classList.add('is-saving');
    try {
      const d = await api('POST', {
        action: 'add', name, amount: amountEl.value.trim(),
        note: noteEl.value.trim(), due_date: $('duePanel').hidden ? '' : dueEl.value,
      });
      state.dinaus.unshift(d);
      state.tab = 'owing';
      state.q = '';
      $('search').value = '';
      state.highlight = keyOf(d.name);
      state.open.add(state.highlight);

      nameEl.value = ''; amountEl.value = ''; noteEl.value = ''; dueEl.value = '';
      if (!$('duePanel').hidden) $('dueToggle').click();
      render();
      toast(`Recorded ${money(d.cents)} for ${d.name}.`, { undo: () => removeIds([d.id], true, `Removed ${money(d.cents)} for ${d.name}.`, false) });
      nameEl.focus();
      const card = document.querySelector('.person.is-new');
      if (card) card.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
    } catch (err) {
      fail(err.field, err.message);
    } finally {
      saving = false;
      saveBtn.disabled = false;
      saveBtn.classList.remove('is-saving');
    }
  });

  /* ------------------------------------------------------- tabs and search */

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

  // Coming back to the app after a while? Quietly refresh in case another device changed something.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - state.loadedAt > 30000 && !saving) load(false);
  });

  updateNameHint();
  load(true);
})();
