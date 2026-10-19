import pg from 'pg';
import { createApp } from './app.mjs';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
pool.on('error', error => console.error('Idle database connection failed', { code: error.code }));
const app = createApp({ pool, token: process.env.LAB_API_TOKEN });
app.requestTimeout = 10000;
app.listen(Number(process.env.PORT ?? 3100), process.env.HOST ?? '127.0.0.1', () => console.log('Reservation lab listening'));
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  app.close(async () => { await pool.end(); clearTimeout(deadline); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
