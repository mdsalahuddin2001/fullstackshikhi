import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

async function transfer(from, to, amount) {
 if (![from,to,amount].every(Number.isSafeInteger) || amount <= 0 || from === to) {
  throw new Error('Invalid transfer');
 }
 const client = await pool.connect();
 try {
  await client.query('BEGIN');
  const locked = await client.query(
   'SELECT id FROM handbook.accounts WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',
   [[from,to]]
  );
  if (locked.rowCount !== 2) throw new Error('Account not found');
  const debit = await client.query(
   'UPDATE handbook.accounts SET balance=balance-$1 WHERE id=$2 AND balance >= $1 RETURNING id',
   [amount,from]
  );
  if (debit.rowCount !== 1) throw new Error('Insufficient balance');
  const credit = await client.query(
   'UPDATE handbook.accounts SET balance=balance+$1 WHERE id=$2 RETURNING id',
   [amount,to]
  );
  if (credit.rowCount !== 1) throw new Error('Account not found');
  await client.query('COMMIT');
 } catch (error) {
  await client.query('ROLLBACK');
  throw error;
 } finally {
  client.release();
 }
}

try {
 await transfer(1,2,100);
 console.table((await pool.query('SELECT * FROM handbook.accounts ORDER BY id')).rows);
} finally {
 await pool.end();
}
