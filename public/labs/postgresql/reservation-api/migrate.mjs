import pg from 'pg';
import { readFile } from 'node:fs/promises';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(5849201)');
  await client.query('CREATE TABLE IF NOT EXISTS public.reservation_lab_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = await client.query('SELECT version FROM public.reservation_lab_migrations WHERE version=1');
  if (!applied.rowCount) {
    await client.query(await readFile(new URL('./001-initial.sql', import.meta.url), 'utf8'));
    await client.query('INSERT INTO public.reservation_lab_migrations(version) VALUES (1)');
  }
  await client.query('COMMIT');
  console.log('Migration 1 applied or already recorded.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
