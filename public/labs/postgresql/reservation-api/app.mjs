import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const reject = (status, code) => { throw new HttpError(status, code); };
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
async function json(req) {
  if (!(req.headers['content-type']?.split(';')[0].trim().toLowerCase() === 'application/json')) reject(415, 'json_required');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 4096) chunks.push(chunk);
  }
  if (size > 4096) reject(413, 'body_too_large');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { reject(400, 'invalid_json'); }
}

export function createApp({ pool, token, actor = 'learner', logger = console }) {
  if (!token) throw new Error('LAB_API_TOKEN is required');
  return createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/health') {
        await pool.query('SELECT 1');
        return send(res, 200, { status: 'ready' });
      }
      if (req.headers.authorization !== `Bearer ${token}`) reject(401, 'unauthorized');
      if (req.method !== 'POST' || path !== '/reservations') reject(404, 'not_found');
      const key = req.headers['idempotency-key'];
      if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(key)) reject(400, 'invalid_idempotency_key');
      const body = await json(req);
      if (!body || Array.isArray(body) || typeof body !== 'object' ||
          Object.keys(body).some(k => !['productId','quantity'].includes(k)) ||
          !Number.isInteger(body.productId) || body.productId < 1 || body.productId > 2147483647 ||
          !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 1000) reject(400, 'invalid_input');
      const payload = { productId: body.productId, quantity: body.quantity };
      const client = await pool.connect();
      let discard = false;
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout='2s'");
        await client.query("SET LOCAL statement_timeout='5s'");
        // A conflicting INSERT waits for the first transaction to commit or roll back.
        const claimed = await client.query(
          'INSERT INTO reservation_lab.requests(actor_id,request_key,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING request_key',
          [actor,key,payload]
        );
        if (!claimed.rowCount) {
          const prior = (await client.query(
            'SELECT payload=$3::jsonb AS matches,response FROM reservation_lab.requests WHERE actor_id=$1 AND request_key=$2',
            [actor,key,payload]
          )).rows[0];
          if (!prior?.matches) reject(409, 'idempotency_conflict');
          if (!prior.response) throw new Error('Committed request is missing its response');
          await client.query('COMMIT');
          return send(res, 200, prior.response, { 'idempotency-replayed': 'true' });
        }
        const product = (await client.query(
          'SELECT stock FROM reservation_lab.products WHERE id=$1 FOR UPDATE', [payload.productId]
        )).rows[0];
        if (!product) reject(404, 'product_not_found');
        if (product.stock < payload.quantity) reject(409, 'insufficient_stock');
        await client.query('UPDATE reservation_lab.products SET stock=stock-$1 WHERE id=$2', [payload.quantity,payload.productId]);
        const response = { id: randomUUID(), ...payload };
        await client.query('INSERT INTO reservation_lab.reservations(id,actor_id,product_id,quantity) VALUES($1,$2,$3,$4)',
          [response.id,actor,payload.productId,payload.quantity]);
        await client.query('INSERT INTO reservation_lab.outbox(id,reservation_id,payload) VALUES($1,$2,$3)',
          [randomUUID(),response.id,{ type: 'reservation.created', ...response }]);
        await client.query('UPDATE reservation_lab.requests SET response=$3 WHERE actor_id=$1 AND request_key=$2', [actor,key,response]);
        await client.query('COMMIT');
        return send(res, 201, response);
      } catch (error) {
        // If COMMIT's response was lost, a retry with the SAME key resolves the outcome.
        try { await client.query('ROLLBACK'); }
        catch { discard = true; }
        throw error;
      } finally {
        client.release(discard);
      }
    } catch (error) {
      if (error instanceof HttpError) return send(res, error.status, { error: error.code }, error.status === 401 ? { 'www-authenticate': 'Bearer' } : {});
      if (['55P03','57014','40001','40P01'].includes(error.code)) {
        return send(res, 503, { error: 'retry_later' }, { 'retry-after': '1' });
      }
      logger.error('Reservation request failed', { code: error.code ?? 'unknown' });
      return send(res, 500, { error: 'internal_error' });
    }
  });
}
