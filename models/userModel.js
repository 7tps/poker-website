const pool = require('../config/db');

async function createUser(username, hashedPassword) {
  await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hashedPassword]);
}

async function getUserByUsername(username) {
  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0];
}

module.exports = { createUser, getUserByUsername };