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
    console.warn('[DB] Could not write to local file:', err.message);
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
          password_hash VARCHAR(255) NOT NULL,
          verified BOOLEAN DEFAULT TRUE,
          platforms TEXT[] DEFAULT ARRAY['etsy'],
          platform_accounts JSONB DEFAULT '{}'::jsonb,
          registration_ip VARCHAR(100),
          last_login_ip VARCHAR(100),
          ip_history JSONB DEFAULT '[]'::jsonb,
          plan VARCHAR(50) DEFAULT 'pro',
          billing VARCHAR(50) DEFAULT 'monthly',
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

      console.log('[DB] Connected to PostgreSQL successfully.');
      return;
    } catch (err) {
      console.warn('[DB] PostgreSQL connection failed, falling back to local file JSON:', err.message);
      pgClient = null;
    }
  }

  loadLocal();
  console.log('[DB] Local file database initialized:', localDbFile);
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
      platforms: r.platforms || ['etsy'],
      platformAccounts: r.platform_accounts || {},
      registrationIp: r.registration_ip,
      lastLoginIp: r.last_login_ip,
      ipHistory: r.ip_history || [],
      plan: r.plan || 'pro',
      billing: r.billing || 'monthly',
      createdAt: Number(r.created_at)
    };
  }

  return memoryStore.users[normEmail] || null;
}

async function createUser({ name, email, passwordHash, platforms, platformAccounts, ip }) {
  const normEmail = (email || '').toLowerCase().trim();
  const createdAt = Date.now();
  const safePlatforms = Array.isArray(platforms) && platforms.length > 0 ? platforms : ['etsy'];
  const safeAccounts = platformAccounts && typeof platformAccounts === 'object' ? platformAccounts : {};
  const userIp = String(ip || '127.0.0.1').replace('::ffff:', '');
  const ipEntry = { ip: userIp, date: new Date().toISOString(), type: 'register' };

  if (pgClient) {
    await pgClient.query(
      `INSERT INTO users (name, email, password_hash, verified, platforms, platform_accounts, registration_ip, last_login_ip, ip_history, plan, billing, created_at)
       VALUES ($1, $2, $3, true, $4, $5, $6, $6, $7, 'pro', 'monthly', $8)
       ON CONFLICT (email) DO UPDATE SET name = $1, password_hash = $3, platforms = $4, platform_accounts = $5, last_login_ip = $6`,
      [name, normEmail, passwordHash, safePlatforms, JSON.stringify(safeAccounts), userIp, JSON.stringify([ipEntry]), createdAt]
    );
  } else {
    memoryStore.users[normEmail] = {
      name,
      email: normEmail,
      passwordHash,
      verified: true,
      platforms: safePlatforms,
      platformAccounts: safeAccounts,
      registrationIp: userIp,
      lastLoginIp: userIp,
      ipHistory: [ipEntry],
      plan: 'pro',
      billing: 'monthly',
      createdAt
    };
    saveLocal();
  }

  return getUser(normEmail);
}

async function recordUserLoginIp(email, ip) {
  const normEmail = (email || '').toLowerCase().trim();
  const userIp = String(ip || '127.0.0.1').replace('::ffff:', '');
  const ipEntry = { ip: userIp, date: new Date().toISOString(), type: 'login' };

  if (pgClient) {
    await pgClient.query(
      `UPDATE users 
       SET last_login_ip = $1, 
           ip_history = COALESCE(ip_history, '[]'::jsonb) || $2::jsonb 
       WHERE LOWER(email) = $3`,
      [userIp, JSON.stringify([ipEntry]), normEmail]
    );
  } else {
    if (memoryStore.users[normEmail]) {
      const u = memoryStore.users[normEmail];
      u.lastLoginIp = userIp;
      if (!Array.isArray(u.ipHistory)) u.ipHistory = [];
      u.ipHistory.push(ipEntry);
      // keep last 50 IPs
      if (u.ipHistory.length > 50) u.ipHistory = u.ipHistory.slice(-50);
      saveLocal();
    }
  }
}

async function updateUserPlatforms(email, platforms, platformAccounts) {
  const normEmail = (email || '').toLowerCase().trim();
  const safePlatforms = Array.isArray(platforms) ? platforms : ['etsy'];
  const safeAccounts = platformAccounts || {};

  if (pgClient) {
    await pgClient.query(
      'UPDATE users SET platforms = $1, platform_accounts = $2 WHERE LOWER(email) = $3',
      [safePlatforms, JSON.stringify(safeAccounts), normEmail]
    );
  } else {
    if (memoryStore.users[normEmail]) {
      memoryStore.users[normEmail].platforms = safePlatforms;
      memoryStore.users[normEmail].platformAccounts = safeAccounts;
      saveLocal();
    }
  }
  return getUser(normEmail);
}

async function createSession(token, email, expiresAt) {
  const normEmail = (email || '').toLowerCase().trim();
  const createdAt = Date.now();

  if (pgClient) {
    await pgClient.query(
      `INSERT INTO sessions (token, email, expires_at, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE SET expires_at = $3`,
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
    const r = res.rows[0];
    if (Date.now() > Number(r.expires_at)) {
      await deleteSession(token);
      return null;
    }
    return { email: r.email, expiresAt: Number(r.expires_at) };
  }

  const sess = memoryStore.sessions[token];
  if (!sess) return null;
  if (Date.now() > sess.expiresAt) {
    delete memoryStore.sessions[token];
    saveLocal();
    return null;
  }
  return sess;
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
  recordUserLoginIp,
  updateUserPlatforms,
  createSession,
  getSession,
  deleteSession
};
