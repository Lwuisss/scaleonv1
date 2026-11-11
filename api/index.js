'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../lib/db');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize DB on boot
db.init().catch(err => {
  console.error('[DB] Initialization error:', err);
});

// Helper: Get Client IP
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim().replace('::ffff:', '');
  }
  return (req.socket?.remoteAddress || req.ip || '127.0.0.1').replace('::ffff:', '');
}

// Helper: Get Gemini API Key
function getGeminiApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const keyFiles = [
    path.join(__dirname, '..', '.gemini_api_key'),
    path.join('C:', 'Users', 'PC', 'Documents', 'antigravity', 'magical-hypatia', '.gemini_api_key')
  ];
  for (const f of keyFiles) {
    try {
      if (fs.existsSync(f)) {
        const k = fs.readFileSync(f, 'utf8').trim();
        if (k) return k;
      }
    } catch (_) {}
  }
  return '';
}

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
  res.json({ ok: true, brand: 'Tobim', ip: getClientIp(req), time: Date.now() });
});

// 2. Register with Platforms & IP
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, platforms, platformAccounts } = req.body || {};
    const normName = (name || '').trim();
    const normEmail = (email || '').trim().toLowerCase();
    const clientIp = getClientIp(req);

    if (!normName || normName.length < 2) {
      return res.status(400).json({ ok: false, error: 'Lütfen adınızı ve soyadınızı yazınız.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normEmail)) {
      return res.status(400).json({ ok: false, error: 'Geçerli bir e-posta adresi giriniz.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Şifre en az 6 karakter olmalıdır.' });
    }

    const existing = await db.getUser(normEmail);
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Bu e-posta ile kayıtlı bir hesap var. Soldaki kutudan giriş yapabilirsiniz.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.createUser({
      name: normName,
      email: normEmail,
      passwordHash,
      platforms: Array.isArray(platforms) && platforms.length > 0 ? platforms : ['etsy'],
      platformAccounts: platformAccounts || {},
      ip: clientIp
    });

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
        platforms: user.platforms,
        platformAccounts: user.platformAccounts,
        registrationIp: user.registrationIp,
        lastLoginIp: user.lastLoginIp
      }
    });
  } catch (err) {
    console.error('[Register Error]', err);
    res.status(500).json({ ok: false, error: 'Kayıt sırasında bir hata oluştu.' });
  }
});

// 3. Login with IP tracking
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normEmail = (email || '').trim().toLowerCase();
    const clientIp = getClientIp(req);

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

    // IP adresini kaydet
    await db.recordUserLoginIp(normEmail, clientIp);

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
        platforms: user.platforms || ['etsy'],
        platformAccounts: user.platformAccounts || {},
        lastLoginIp: clientIp
      }
    });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ ok: false, error: 'Giriş sırasında sunucu hatası oluştu.' });
  }
});

// 4. Me (Session check)
app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({
    ok: true,
    user: {
      name: req.user.name,
      email: req.user.email,
      verified: true,
      platforms: req.user.platforms || ['etsy'],
      platformAccounts: req.user.platformAccounts || {},
      lastLoginIp: req.user.lastLoginIp
    }
  });
});

// 5. Update User Platforms
app.post('/api/user/platforms', authenticate, async (req, res) => {
  try {
    const { platforms, platformAccounts } = req.body || {};
    const updatedUser = await db.updateUserPlatforms(req.user.email, platforms, platformAccounts);
    res.json({
      ok: true,
      user: {
        name: updatedUser.name,
        email: updatedUser.email,
        platforms: updatedUser.platforms,
        platformAccounts: updatedUser.platformAccounts
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Platformlar güncellenemedi.' });
  }
});

// 6. Logout
app.post('/api/auth/logout', authenticate, async (req, res) => {
  try {
    await db.deleteSession(req.token);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Çıkış yapılırken bir hata oluştu.' });
  }
});

// 7. Etsy Gemini SEO Optimizer
app.post('/api/etsy/optimize', async (req, res) => {
  try {
    const { title, description, userApiKey } = req.body || {};
    const apiKey = (userApiKey || '').trim() || getGeminiApiKey();

    if (!apiKey) {
      return res.status(400).json({
        ok: false,
        error: 'Gemini API anahtarı bulunamadı. Lütfen sistem ayarlarından bir Gemini API Key giriniz.'
      });
    }

    const cleanTitle = (title || '').trim();
    const cleanDesc = (description || '').trim();

    if (!cleanTitle && !cleanDesc) {
      return res.status(400).json({ ok: false, error: 'Optimize etmek için ürün başlığı veya açıklaması gereklidir.' });
    }

    const systemPrompt = `You are a premier, elite Etsy SEO Algorithm and Copywriting Specialist.
Analyze this product and craft the highest-converting, search-dominating Etsy listing in English.

STRICT ETSY REQUIREMENTS:
1. TITLE:
   - Maximum 140 characters total.
   - First 40 characters MUST contain the highest-volume primary search phrase.
   - Clean, professional, readable title separated by commas or pipes. No keyword stuffing spam.

2. TAGS:
   - Exactly 13 tags.
   - Each tag MUST be 20 characters or fewer.
   - Multi-word long-tail keywords matching buyer intent (e.g. "linen summer dress", "minimalist gold ring").
   - NO single generic words (e.g. do NOT use just "dress", "gift", "quality").

3. DESCRIPTION:
   - Compelling buyer-facing structure with bullet points.
   - Sections: Highlights, Material & Quality, Sizing/Fit, Care Instructions, Dispatch & Shipping.

Product Input:
Title: ${cleanTitle}
Description: ${cleanDesc}

Respond with strictly valid JSON only:
{
  "optimized_title": "string (<= 140 chars)",
  "optimized_tags": ["tag 1", "tag 2", ... exactly 13 tags, each <= 20 chars],
  "optimized_description": "formatted markdown string"
}`;

    const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-flash-latest'];
    let lastError = null;
    let resultJson = null;

    for (const m of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: {
              temperature: 0.3,
              responseMimeType: 'application/json'
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          raw = raw.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
          resultJson = JSON.parse(raw);
          break;
        } else {
          const errData = await response.json().catch(() => ({}));
          lastError = errData?.error?.message || `HTTP ${response.status}`;
        }
      } catch (e) {
        lastError = e.message;
      }
    }

    if (!resultJson) {
      return res.status(502).json({
        ok: false,
        error: `Yapay zeka optimizasyon yanıtı alınamadı: ${lastError || 'Bilinmeyen hata'}`
      });
    }

    let tags = (resultJson.optimized_tags || []).map(t => String(t).trim().slice(0, 20)).filter(Boolean);
    while (tags.length < 13) {
      tags.push(`handmade ${tags.length + 1}`.slice(0, 20));
    }
    tags = tags.slice(0, 13);

    let optTitle = String(resultJson.optimized_title || cleanTitle).trim();
    if (optTitle.length > 140) {
      optTitle = optTitle.slice(0, 140).trim();
    }

    res.json({
      ok: true,
      optimized_title: optTitle,
      optimized_tags: tags,
      optimized_description: resultJson.optimized_description || cleanDesc
    });

  } catch (err) {
    console.error('[Etsy Optimize Error]', err);
    res.status(500).json({ ok: false, error: 'Optimizasyon işlemi sırasında bir hata oluştu.' });
  }
});

module.exports = app;
