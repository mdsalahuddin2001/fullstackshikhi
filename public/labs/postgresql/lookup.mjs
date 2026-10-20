import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
try {
 const email = process.argv[2] ?? 'amina@example.test';
 const result = await pool.query(
  'SELECT id,name FROM app.customers WHERE email=$1', [email]
 );
 console.table(result.rows);
} finally {
 await pool.end();
}
