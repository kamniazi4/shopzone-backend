// PostgreSQL connection pool (raw pg, no ORM)
const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
  idle_in_transaction_session_timeout: 15000,
});

pool.on('connect', () => {
  console.log('PostgreSQL pool: new client connected');
});

pool.on('error', (err) => {
  // Sirf log karein - process.exit() na karein, warna ek idle client ka
  // error poore server ko crash kar dega. Pool khud us client ko discard
  // kar ke naya banayega jab zaroorat hogi.
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

// Helper to run a query
const query = (text, params) => pool.query(text, params);

// Helper to get a client for transactions
const getClient = () => pool.connect();

module.exports = { pool, query, getClient };