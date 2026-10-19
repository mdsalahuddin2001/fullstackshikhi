import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createApp } from './app.mjs';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const token = 'integration-only-token';
const app = createApp({ pool, token, logger: { error() {} } });
let base;
before(async () => {
  const database = (await pool.query('SELECT current_database() AS name')).rows[0].name;
  if (!database.endsWith('_test')) throw new Error('Tests reset fixtures: database name must end in _test');
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${app.address().port}`;
});
beforeEach(async () => {
  await pool.query('TRUNCATE reservation_lab.outbox,reservation_lab.requests,reservation_lab.reservations');
  await pool.query('UPDATE reservation_lab.products SET stock=CASE id WHEN 1 THEN 10 ELSE 1 END');
});
after(async () => {
  if (app.listening) await new Promise(resolve => app.close(resolve));
  await pool.end();
});
async function reserve(key, body = { productId: 1, quantity: 2 }, auth = token) {
  const res = await fetch(`${base}/reservations`, { method: 'POST', headers: {
    authorization: `Bearer ${auth}`, 'content-type': 'application/json', 'idempotency-key': key,
  }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
async function state(id = 1) {
  return (await pool.query(`SELECT stock,
   (SELECT count(*)::int FROM reservation_lab.reservations) AS reservations,
   (SELECT count(*)::int FROM reservation_lab.outbox) AS events,
   (SELECT count(*)::int FROM reservation_lab.requests) AS requests
   FROM reservation_lab.products WHERE id=$1`, [id])).rows[0];
}
test('success commits stock, reservation, idempotency result, and event', async () => {
  assert.equal((await reserve('success')).status, 201);
  assert.deepEqual(await state(), { stock: 8, reservations: 1, events: 1, requests: 1 });
});
test('concurrent duplicate requests replay one committed result', async () => {
  const results = await Promise.all([reserve('same'),reserve('same')]);
  assert.deepEqual(results.map(r => r.status).sort(), [200,201]);
  assert.deepEqual(results[0].body,results[1].body);
  assert.deepEqual(await state(), { stock: 8, reservations: 1, events: 1, requests: 1 });
});
test('reusing a key with different input conflicts', async () => {
  await reserve('reuse');
  assert.equal((await reserve('reuse',{ productId: 1, quantity: 3 })).status,409);
  assert.equal((await state()).stock,8);
});
test('only one request can reserve the last unit', async () => {
  const results = await Promise.all(['last-a','last-b'].map(k => reserve(k,{ productId: 2, quantity: 1 })));
  assert.deepEqual(results.map(r => r.status).sort(),[201,409]);
  assert.deepEqual(await state(2), { stock: 0, reservations: 1, events: 1, requests: 1 });
});
test('authentication and input failures leave no writes', async () => {
  assert.equal((await reserve('auth',undefined,'wrong')).status,401);
  assert.equal((await reserve('bad',{ productId: 1, quantity: 0 })).status,400);
  assert.equal((await reserve('absent',{ productId: 999, quantity: 1 })).status,404);
  assert.deepEqual(await state(), { stock: 10, reservations: 0, events: 0, requests: 0 });
});
test('database failure after stock mutation rolls everything back', async () => {
  // A real database constraint injects an error at the outbox write.
  await pool.query('ALTER TABLE reservation_lab.outbox ADD CONSTRAINT test_reject CHECK (false) NOT VALID');
  try {
    assert.equal((await reserve('failure')).status,500);
    assert.deepEqual(await state(), { stock: 10, reservations: 0, events: 0, requests: 0 });
  } finally { await pool.query('ALTER TABLE reservation_lab.outbox DROP CONSTRAINT test_reject'); }
});
test('malformed JSON is rejected and readiness checks the database', async () => {
  const res = await fetch(`${base}/reservations`, { method: 'POST',headers: {
    authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':'malformed',
  },body:'{'});
  assert.equal(res.status,400);
  assert.equal((await fetch(`${base}/health`)).status,200);
  assert.equal((await state()).requests,0);
});

test('content type and oversized body errors have documented statuses', async () => {
  const headers = { authorization: `Bearer ${token}`, 'idempotency-key': 'limits' };
  const wrong = await fetch(`${base}/reservations`, { method:'POST', headers, body:'hello' });
  assert.equal(wrong.status,415);
  const large = await fetch(`${base}/reservations`, { method:'POST', headers:{...headers,'content-type':'application/json'}, body:JSON.stringify({data:'x'.repeat(5000)}) });
  assert.equal(large.status,413);
  assert.equal((await state()).requests,0);
});

test('lock timeout returns retryable status and retains no partial request', async () => {
  const blocker = await pool.connect();
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM reservation_lab.products WHERE id=1 FOR UPDATE');
    const result = await reserve('blocked');
    assert.equal(result.status,503);
    assert.equal(result.body.error,'retry_later');
    assert.deepEqual(await state(), { stock:10,reservations:0,events:0,requests:0 });
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
  }
  assert.equal((await reserve('blocked')).status,201);
});
