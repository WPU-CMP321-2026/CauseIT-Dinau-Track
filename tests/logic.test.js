// Unit tests for assets/js/logic.js (no browser needed): node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../assets/js/logic.js');

test('parseCents accepts normal amounts and rejects junk', () => {
  assert.equal(L.parseCents('5'), 500);
  assert.equal(L.parseCents('12.50'), 1250);
  assert.equal(L.parseCents('3,5'), 350);
  assert.equal(L.parseCents('K2.50'), 250);
  for (const bad of ['', 'abc', '-5', '0', '5.123', '1e3']) assert.equal(L.parseCents(bad), null, bad);
});

test('limitCheck: limit K10, customer owes K6, a K5 dinau is blocked', () => {
  const r = L.limitCheck(600, 500, 1000);
  assert.equal(r.blocked, true);
  assert.equal(r.available, 400);
  assert.equal(r.newBalance, 1100);
});

test('limitCheck: going exactly up to the limit is allowed, one toea more is not', () => {
  assert.equal(L.limitCheck(600, 400, 1000).blocked, false);
  assert.equal(L.limitCheck(600, 401, 1000).blocked, true);
});

test('limitCheck: no limit means nothing is ever blocked', () => {
  assert.equal(L.limitCheck(999999, 999999, null).blocked, false);
});

test('limitCheck: reducing the balance makes room again', () => {
  assert.equal(L.limitCheck(600, 500, 1000).blocked, true);
  assert.equal(L.limitCheck(600 - 300, 500, 1000).blocked, false);   // after a K3 part payment
});

test('limitMessage matches the wording the server uses', () => {
  assert.equal(L.limitMessage('Mary', 600, 1000),
    'Mary already owes K6.00 and the limit is K10.00, so only K4.00 more can be recorded. Record a payment or raise the limit first.');
  assert.match(L.limitMessage('Mary', 1000, 1000), /nothing more can be recorded/);
  assert.match(L.limitMessage('Tom', 0, 1000), /most that can be recorded for Tom is K10\.00/);
});

const data = (over = {}) => ({
  today: '2026-10-16', default_limit_cents: 1000, customer_limits: [],
  dinaus: [
    { id: 1, name: 'Mary', cents: 600, remaining_cents: 300, note: 'pies', created_at: '2026-10-14 10:00:00' },
    { id: 2, name: 'mary', cents: 400, remaining_cents: 400, note: null, created_at: '2026-10-15 10:00:00' },
    { id: 3, name: 'Tom', cents: 200, remaining_cents: 0, note: 'drink', created_at: '2026-10-15 11:00:00' },
  ],
  repayments: [
    { id: 1, name: 'Mary', cents: 300, created_at: '2026-10-16 09:00:00' },
    { id: 2, name: 'Tom', cents: 200, created_at: '2026-10-16 10:00:00' },
  ],
  ...over,
});

test('buildCustomers: balance is what is left after part payments, names merge ignoring case', () => {
  const cs = L.buildCustomers(data());
  const mary = cs.find((c) => c.key === 'mary');
  assert.equal(mary.dinaus.length, 2);
  assert.equal(mary.total, 1000);
  assert.equal(mary.paid, 300);
  assert.equal(mary.balance, 700);
  assert.equal(mary.limit, 1000);
  assert.equal(mary.payments.length, 1);
});

test('buildCustomers: a customer-specific limit beats the default', () => {
  const cs = L.buildCustomers(data({ customer_limits: [{ name: 'Mary', cents: 2500 }] }));
  const mary = cs.find((c) => c.key === 'mary');
  assert.equal(mary.limit, 2500);
  assert.equal(mary.ownLimit, 2500);
  assert.equal(cs.find((c) => c.key === 'tom').limit, 1000);
});

test('buildCustomers: no default limit and no own limit = null (no limit)', () => {
  const cs = L.buildCustomers(data({ default_limit_cents: null }));
  assert.equal(cs[0].limit, null);
});

test('groupsFor: owing = balance above zero, paid = settled; search by name or note', () => {
  const cs = L.buildCustomers(data());
  assert.deepEqual(L.groupsFor(cs, 'owing', '', false).map((c) => c.name), ['Mary']);
  assert.deepEqual(L.groupsFor(cs, 'paid', '', false).map((c) => c.name), ['Tom']);
  assert.deepEqual(L.groupsFor(cs, 'owing', 'pie', true).map((c) => c.name), ['Mary']);
  assert.deepEqual(L.groupsFor(cs, 'owing', 'zzz', true), []);
});

test('dayLabel and midSentence', () => {
  assert.equal(L.dayLabel('2026-10-16 08:00:00', '2026-10-16'), 'Today');
  assert.equal(L.dayLabel('2026-10-15 08:00:00', '2026-10-16'), 'Yesterday');
  assert.equal(L.dayLabel('2026-10-14 08:00:00', '2026-10-16'), '14 Oct');
  assert.equal(L.midSentence('Today'), 'today');
  assert.equal(L.midSentence('14 Oct'), '14 Oct');
});
