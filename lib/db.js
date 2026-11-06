'use strict';

const fs = require('fs');
const path = require('path');

let pgClient = null;
const isPostgres = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);

// Local file storage path
const dataDir = path.join(__dirname, '..', 'data');
const localDbFile = path.join(dataDir, 'tobim.json');

// In-memory store for fallback / local
let memoryStore = {
  users: {},
  otps: {},
  sessions: {}
};

function loadLocal() {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (fs.existsSync(localDbFile)) {
      const raw = fs.readFileSync(localDbFile, 'utf8');
      memoryStore = JSON.parse(raw);
      if (!memoryStore.users) memoryStore.users = {};
      if (!memoryStore.otps) memoryStore.otps = {};
      if (!memoryStore.sessions) memoryStore.sessions = {};
    } else {
      saveLocal();
    }
  } catch (err) {
    console.warn('[DB] Local storage warning:', err.message);
  }
}

function saveLocal() {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(localDbFile, JSON.stringify(memoryStore, null, 2), 'utf8');
  } catch (err) {
    console.warn('[DB] Could not write to local file (read-only environment):', err.message);
  }
}

async function init() {
  if (isPostgres) {
    try {
      const { Pool } = require('pg');
      const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
      pgClient = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false }
      });

      await pgClient.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          verified BOOLEAN DEFAULT FALSE,
          plan VARCHAR(50),
          billing VARCHAR(50),
          created_at BIGINT NOT NULL
        );
      `);

      await pgClient.query(`
        CREATE TABLE IF NOT EXISTS otps (
          email VARCHAR(255) PRIMARY KEY,
          code VARCHAR(10) NOT NULL,
          expires_at BIGINT NOT NULL,
          created_at BIGINT NOT NULL
        );
      `);

      await pgClient.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          token VARCHAR(255) PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          expires_at BIGINT NOT NULL,
          created_at BIGINT NOT NULL
        );
      `);

      console.log('[DB] PostgreSQL connected successfully.');
      return;
    } catch (err) {
      console.warn('[DB] PostgreSQL connection failed, falling back to local storage:', err.message);
      pgClient = null;
    }
  }

  loadLocal();
  console.log('[DB] Local file database initialized.');
}

async function getUser(email) {
  const normEmail = (email || '').toLowerCase().trim();
  if (pgClient) {
    const res = await pgClient.query('SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1', [normEmail]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      name: r.name,
      email: r.email,
      passwordHash: r.password_hash,
      verified: Boolean(r.verified),
      plan: r.plan,
      billing: r.billing,
      createdAt: Number(r.created_at)
    };
  }

  return memoryStore.users[normEmail] || null;
}

async function createUser({ name, email, passwordHash }) {
  const normEmail = (email || '').toLowerCase().trim();
  const createdAt = Date.now();

  if (pgClient) {
    await pgClient.query(
      `INSERT INTO users (name, email, password_hash, verified, plan, billing, created_at)
       VALUES ($1, $2, $3, false, NULL, NULL, $4)
       ON CONFLICT (email) DO UPDATE SET name = $1, password_hash = $3`,
      [name, normEmail, passwordHash, createdAt]
    );
  } else {
    memoryStore.users[normEmail] = {
      name,
      email: normEmail,
      passwordHash,
      verified: false,
      plan: null,
      billing: null,
      createdAt
    };
    saveLocal();
  }

  return getUser(normEmail);
}

async function verifyUser(email) {
  const normEmail = (email || '').toLowerCase().trim();
  if (pgClient) {
    await pgClient.query('UPDATE users SET verified = true WHERE LOWER(email) = $1', [normEmail]);
  } else {
    if (memoryStore.users[normEmail]) {
      memoryStore.users[normEmail].verified = true;
      saveLocal();
    }
  }
}

async function updateUserPlan(email, plan, billing) {
  const normEmail = (email || '').toLowerCase().trim();
  if (pgClient) {
    await pgClient.query('UPDATE users SET plan = $1, billing = $2 WHERE LOWER(email) = $3', [plan, billing, normEmail]);
  } else {
    if (memoryStore.users[normEmail]) {
      memoryStore.users[normEmail].plan = plan;
      memoryStore.users[normEmail].billing = billing;
      saveLocal();
    }
  }
}

async function saveOtp(email, code, expiresAt) {
  const normEmail = (email || '').toLowerCase().trim();
  const createdAt = Date.now();

  if (pgClient) {
    await pgClient.query(
      `INSERT INTO otps (email, code, expires_at, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET code = $2, expires_at = $3, created_at = $4`,
      [normEmail, code, expiresAt, createdAt]
    );
  } else {
    memoryStore.otps[normEmail] = { code, expiresAt, createdAt };
    saveLocal();
  }
}

async function getOtp(email) {
  const normEmail = (email || '').toLowerCase().trim();
  if (pgClient) {
    const res = await pgClient.query('SELECT * FROM otps WHERE LOWER(email) = $1 LIMIT 1', [normEmail]);
    if (res.rows.length === 0) return null;
    return {
      code: res.rows[0].code,
      expiresAt: Number(res.rows[0].expires_at)
    };
  }

  return memoryStore.otps[normEmail] || null;
}

async function deleteOtp(email) {
  const normEmail = (email || '').toLowerCase().trim();
  if (pgClient) {
    await pgClient.query('DELETE FROM otps WHERE LOWER(email) = $1', [normEmail]);
  } else {
    delete memoryStore.otps[normEmail];
    saveLocal();
  }
}

async function createSession(token, email, expiresAt) {
  const normEmail = (email || '').toLowerCase().trim();
  const createdAt = Date.now();
  if (pgClient) {
    await pgClient.query(
      `INSERT INTO sessions (token, email, expires_at, created_at)
       VALUES ($1, $2, $3, $4)`,
      [token, normEmail, expiresAt, createdAt]
    );
  } else {
    memoryStore.sessions[token] = { email: normEmail, expiresAt, createdAt };
    saveLocal();
  }
}

async function getSession(token) {
  if (!token) return null;
  if (pgClient) {
    const res = await pgClient.query('SELECT * FROM sessions WHERE token = $1 LIMIT 1', [token]);
    if (res.rows.length === 0) return null;
    const s = res.rows[0];
    if (Date.now() > Number(s.expires_at)) {
      await deleteSession(token);
      return null;
    }
    return { email: s.email, expiresAt: Number(s.expires_at) };
  }

  const s = memoryStore.sessions[token];
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    deleteSession(token);
    return null;
  }
  return s;
}

async function deleteSession(token) {
  if (!token) return;
  if (pgClient) {
    await pgClient.query('DELETE FROM sessions WHERE token = $1', [token]);
  } else {
    delete memoryStore.sessions[token];
    saveLocal();
  }
}

module.exports = {
  init,
  getUser,
  createUser,
  verifyUser,
  updateUserPlan,
  saveOtp,
  getOtp,
  deleteOtp,
  createSession,
  getSession,
  deleteSession
};
