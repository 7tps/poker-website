const pool = require('../config/db');

async function createUser(username, hashedPassword) {
  await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hashedPassword]);
}

async function getUserByUsername(username) {
  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0];
}

async function getUserChips(username) {
  const result = await pool.query('SELECT chips FROM users WHERE username = $1', [username]);
  return result.rows[0]?.chips;
}

async function setUserChips(username, chips) {
  await pool.query('UPDATE users SET chips = $1 WHERE username = $2', [chips, username]);
}

module.exports = { createUser, getUserByUsername, getUserChips, setUserChips };