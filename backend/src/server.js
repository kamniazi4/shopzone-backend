// Entry point - starts the HTTP server
const app = require('./app');
const env = require('./config/env');
const { pool } = require('./config/db');

async function startServer() {
  try {
    // Verify DB connection before starting server
    await pool.query('SELECT NOW()');
    console.log('Database connected successfully');

    app.listen(env.port, () => {
      console.log(`Server running in ${env.nodeEnv} mode on port ${env.port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing pool...');
  await pool.end();
  process.exit(0);
});