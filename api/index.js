'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../lib/db');
const mailer = require('../lib/mailer');

const app = express();

app.use(cors());
app.use(express.json());

// Initialize DB on boot
db.init().catch(err => {
  console.error('[DB] Initialization error:', err);
});

// Helper: Get token from header
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Oturum bulunamadı.' });
  }

  try {
    const session = await db.getSession(token);
    if (!session) {
      return res.status(401).json({ ok: false, error: 'Oturum süresi dolmuş veya geçersiz.' });
    }

    const user = await db.getUser(session.email);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Kullanıcı bulunamadı.' });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Oturum doğrulanırken bir hata oluştu.' });
  }
}

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, brand: 'Tobim', time: Date.now() });
});

// 2. Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    const normName = (name || '').trim();
    const normEmail = (email || '').trim().toLowerCase();

    if (!normName || normName.length < 2) {
      return res.status(400).json({ ok: false, error: 'Adını ve soyadını yaz.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normEmail)) {
      return res.status(400).json({ ok: false, error: 'Geçerli bir e-posta adresi gir.' });
    }
    if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return res.status(400).json({ ok: false, error: 'Şifre en az 8 karakter olmalı ve harf ile rakam içermeli.' });
    }

    const existing = await db.getUser(normEmail);
    if (existing && existing.verified) {
      return res.status(400).json({ ok: false, error: 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db.createUser({ name: normName, email: normEmail, passwordHash });

    // Generate 6 digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    await db.saveOtp(normEmail, code, expiresAt);

    // Send real email
    const mailRes = await mailer.sendVerificationCode(normEmail, normName, code);

    res.json({
      ok: true,
      email: normEmail,
      devMode: mailRes.devMode,
      previewUrl: mailRes.previewUrl,
      // Dev code for quick local testing if SMTP is unconfigured
      previewCode: mailRes.devMode ? code : undefined
    });
  } catch (err) {
    console.error('[Register Error]', err);
    res.status(500).json({ ok: false, error: 'Kayıt sırasında sunucu hatası oluştu.' });
  }
});

// 3. Verify OTP
app.post('/api/auth/verify', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const normEmail = (email || '').trim().toLowerCase();
    const normCode = (code || '').trim();

    if (!normEmail || !normCode) {
      return res.status(400).json({ ok: false, error: 'E-posta ve doğrulama kodu gereklidir.' });
    }

    const otpData = await db.getOtp(normEmail);
    if (!otpData) {
      return res.status(400).json({ ok: false, error: 'Doğrulama kodu bulunamadı veya süresi doldu. Yeni kod iste.' });
    }

    if (Date.now() > otpData.expiresAt) {
      await db.deleteOtp(normEmail);
      return res.status(400).json({ ok: false, error: 'Kodun süresi doldu. Yeni kod iste.' });
    }

    if (otpData.code !== normCode) {
      return res.status(400).json({ ok: false, error: 'Kod hatalı. Tekrar dene.' });
    }

    await db.verifyUser(normEmail);
    await db.deleteOtp(normEmail);

    const user = await db.getUser(normEmail);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
    await db.createSession(token, normEmail, expiresAt);

    res.json({
      ok: true,
      token,
      user: {
        name: user.name,
        email: user.email,
        verified: true,
        plan: user.plan,
        billing: user.billing
      }
    });
  } catch (err) {
    console.error('[Verify Error]', err);
    res.status(500).json({ ok: false, error: 'Doğrulama sırasında bir hata oluştu.' });
  }
});

// 4. Resend OTP
app.post('/api/auth/resend', async (req, res) => {
  try {
    const { email } = req.body || {};
    const normEmail = (email || '').trim().toLowerCase();

    const user = await db.getUser(normEmail);
    if (!user) {
      return res.status(400).json({ ok: false, error: 'Kullanıcı bulunamadı.' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await db.saveOtp(normEmail, code, expiresAt);

    const mailRes = await mailer.sendVerificationCode(normEmail, user.name, code);

    res.json({
      ok: true,
      devMode: mailRes.devMode,
      previewUrl: mailRes.previewUrl,
      previewCode: mailRes.devMode ? code : undefined
    });
  } catch (err) {
    console.error('[Resend Error]', err);
    res.status(500).json({ ok: false, error: 'Kod tekrar gönderilirken bir hata oluştu.' });
  }
});

// 5. Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normEmail = (email || '').trim().toLowerCase();

    if (!normEmail || !password) {
      return res.status(400).json({ ok: false, error: 'E-posta ve şifrenizi yazınız.' });
    }

    const user = await db.getUser(normEmail);
    if (!user) {
      return res.status(400).json({ ok: false, error: 'E-posta veya şifre hatalı.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ ok: false, error: 'E-posta veya şifre hatalı.' });
    }

    if (!user.verified) {
      // Send fresh OTP if needed
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await db.saveOtp(normEmail, code, Date.now() + 10 * 60 * 1000);
      mailer.sendVerificationCode(normEmail, user.name, code);

      return res.json({
        ok: true,
        requireVerify: true,
        email: user.email
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    await db.createSession(token, normEmail, expiresAt);

    res.json({
      ok: true,
      token,
      user: {
        name: user.name,
        email: user.email,
        verified: true,
        plan: user.plan,
        billing: user.billing
      }
    });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ ok: false, error: 'Giriş yapılırken sunucu hatası oluştu.' });
  }
});

// 6. Select Plan
app.post('/api/auth/plan', authenticate, async (req, res) => {
  try {
    const { plan, billing } = req.body || {};
    if (!plan) {
      return res.status(400).json({ ok: false, error: 'Lütfen bir plan seçiniz.' });
    }

    await db.updateUserPlan(req.user.email, plan, billing || 'monthly');
    const updated = await db.getUser(req.user.email);

    res.json({
      ok: true,
      user: {
        name: updated.name,
        email: updated.email,
        verified: true,
        plan: updated.plan,
        billing: updated.billing
      }
    });
  } catch (err) {
    console.error('[Plan Error]', err);
    res.status(500).json({ ok: false, error: 'Plan güncellenirken bir hata oluştu.' });
  }
});

// 7. Get Current User (Session check)
app.get('/api/auth/me', authenticate, async (req, res) => {
  res.json({
    ok: true,
    user: {
      name: req.user.name,
      email: req.user.email,
      verified: req.user.verified,
      plan: req.user.plan,
      billing: req.user.billing
    }
  });
});

// 8. Logout
app.post('/api/auth/logout', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token) {
    await db.deleteSession(token);
  }
  res.json({ ok: true });
});

module.exports = app;
