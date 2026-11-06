'use strict';

/* ============ AYARLAR ============ */
const CONFIG = {
  brand: 'Tobim',
  otpLength: 6,
  resendSeconds: 30,
  plans: [
    { id: 'free', name: 'Başlangıç', desc: 'Kişisel denemeler için.', price: [0, 0],
      features: ['1 proje', 'Temel destek', '500 MB depolama'] },
    { id: 'pro', name: 'Pro', desc: 'Üretken bireyler ve freelancer’lar için.', price: [199, 159], pop: true,
      features: ['Sınırsız proje', 'Öncelikli destek', '50 GB depolama', 'Gelişmiş analizler'] },
    { id: 'team', name: 'Takım', desc: 'Birlikte çalışan ekipler için.', price: [599, 479],
      features: ['Pro’daki her şey', '10 takım üyesi', 'Rol ve yetki yönetimi', 'SSO ve denetim kayıtları'] }
  ]
};

/* ============ YARDIMCILAR ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

let currentUser = null;
let currentPendingEmail = LS.get('tobim_pending_email', '');

let toastT;
function say(m, ms = 3200) {
  $('#tmsg').textContent = m;
  $('#toast').classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => $('#toast').classList.remove('show'), ms);
}

function shake() {
  const c = $('#card');
  c.classList.remove('shake');
  void c.offsetWidth;
  c.classList.add('shake');
}

function setErr(el, msg, fix) {
  if (!el) return;
  el.textContent = msg || '';
  if (msg) shake();
  if (fix) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lnk';
    b.dataset.fix = fix;
    b.textContent = fix + ' olarak düzelt';
    el.appendChild(b);
  }
}

function busy(btn, on) {
  if (!btn) return;
  btn.classList.toggle('load', on);
  btn.disabled = on;
}

/* ============ API İSTEMCİSİ ============ */
async function api(path, options = {}) {
  const token = LS.get('tobim_token', '');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  try {
    const res = await fetch(path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'İşlem sırasında bir hata oluştu.');
    }
    return data;
  } catch (err) {
    throw err;
  }
}

/* ============ GÖRÜNÜM YÖNETİMİ ============ */
function show(n) {
  const plans = n === 'plans';
  $('#card').style.display = plans ? 'none' : '';
  $('#plans').classList.toggle('on', plans);
  $$('#card .view').forEach(v => v.classList.toggle('active', v.dataset.v === n));
  if (plans) renderPlans();
  $('main').scrollTop = 0;
  const first = $('#card .view.active input:not([type=checkbox])');
  if (first && !plans) setTimeout(() => first.focus({ preventScroll: true }), 350);
}

async function route() {
  const token = LS.get('tobim_token', '');
  if (!token) {
    if (currentPendingEmail) {
      $('#vMail').textContent = currentPendingEmail;
      return show('verify');
    }
    return show('login');
  }

  try {
    const res = await api('/api/auth/me');
    if (res.ok && res.user) {
      currentUser = res.user;
      if (!currentUser.verified) {
        currentPendingEmail = currentUser.email;
        $('#vMail').textContent = currentPendingEmail;
        return show('verify');
      }
      if (!currentUser.plan) return show('plans');
      fillDone(currentUser);
      return show('done');
    }
  } catch (err) {
    LS.del('tobim_token');
    currentUser = null;
    show('login');
  }
}

function fillDone(u) {
  const p = CONFIG.plans.find(x => x.id === u.plan);
  $('#dTitle').textContent = 'Hoş geldin, ' + (u.name ? u.name.split(' ')[0] : 'Kullanıcı');
  $('#dPlan').textContent = p ? p.name + ' planı' : 'Başlangıç planı';
}

document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g) {
    e.preventDefault();
    const t = g.dataset.go;
    if (t === 'plans' && !currentUser) return;
    show(t);
  }
  const f = e.target.closest('[data-fix]');
  if (f) {
    const form = f.closest('form');
    const inp = $('[type=email]', form);
    inp.value = f.dataset.fix;
    setErr(f.parentElement, '');
    inp.focus();
  }
  const eye = e.target.closest('.eye');
  if (eye) {
    const inp = $('input', eye.parentElement);
    const on = inp.type === 'password';
    inp.type = on ? 'text' : 'password';
    eye.classList.toggle('on', on);
    eye.setAttribute('aria-label', on ? 'Şifreyi gizle' : 'Şifreyi göster');
  }
});

/* ============ E-POSTA KONTROLÜ ============ */
const TYPO = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com', 'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'yahho.com': 'yahoo.com', 'yaho.com': 'yahoo.com'
};
const TEMP = ['mailinator.com', '10minutemail.com', 'guerrillamail.com', 'tempmail.com', 'temp-mail.org',
  'yopmail.com', 'trashmail.com', 'getnada.com', 'sharklasers.com', 'dispostable.com', 'throwawaymail.com'];

function checkEmail(raw) {
  const v = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || v.includes('..')) return { err: 'Geçerli bir e-posta adresi gir.' };
  const [name, d] = v.split('@');
  if (TYPO[d]) return { err: 'Alan adı hatalı görünüyor.', fix: name + '@' + TYPO[d] };
  if (TEMP.includes(d)) return { err: 'Geçici e-posta adresleri kabul edilmiyor.' };
  return { ok: v };
}

/* ============ ŞİFRE GÜCÜ ============ */
function score(p) {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) s++;
  return p ? Math.max(1, s) : 0;
}
$('#rPw').addEventListener('input', e => {
  $('#meter').dataset.s = score(e.target.value);
});

/* ============ GİRİŞ ============ */
$('#fLogin').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('.err', e.target), btn = $('.btn', e.target);
  setErr(err, '');

  const c = checkEmail($('#lEmail').value);
  if (!c.ok) return setErr(err, c.err, c.fix);
  const password = $('#lPw').value;
  if (!password) return setErr(err, 'Şifreni yaz.');

  busy(btn, true);
  try {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: c.ok, password })
    });

    if (res.requireVerify) {
      currentPendingEmail = res.email;
      LS.set('tobim_pending_email', currentPendingEmail);
      $('#vMail').textContent = currentPendingEmail;
      say('E-posta adresini doğrulaman gerekiyor.');
      show('verify');
      startTimer();
      return;
    }

    LS.set('tobim_token', res.token);
    currentUser = res.user;
    say('Giriş başarılı');
    route();
  } catch (error) {
    setErr(err, error.message);
  } finally {
    busy(btn, false);
  }
});

/* ============ KAYIT ============ */
$('#fReg').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('.err', e.target), btn = $('.btn', e.target);
  setErr(err, '');

  const name = $('#rName').value.trim();
  const password = $('#rPw').value;
  const c = checkEmail($('#rEmail').value);

  if (name.length < 2) return setErr(err, 'Adını ve soyadını yaz.');
  if (!c.ok) return setErr(err, c.err, c.fix);
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return setErr(err, 'Şifre en az 8 karakter olmalı ve harf ile rakam içermeli.');
  }
  if (!$('#rTerms').checked) return setErr(err, 'Devam etmek için koşulları kabul et.');

  busy(btn, true);
  try {
    const res = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email: c.ok, password })
    });

    currentPendingEmail = res.email;
    LS.set('tobim_pending_email', currentPendingEmail);
    $('#vMail').textContent = currentPendingEmail;
    cells.forEach(cell => cell.value = '');
    setErr($('#vErr'), '');

    if (res.previewCode) {
      say('Doğrulama kodu e-postana gönderildi! (Test Kodu: ' + res.previewCode + ')', 8000);
    } else {
      say('6 haneli doğrulama kodu e-posta adresine gönderildi.');
    }

    show('verify');
    startTimer();
  } catch (error) {
    setErr(err, error.message);
  } finally {
    busy(btn, false);
  }
});

/* ============ ŞİFRE SIFIRLAMA ============ */
$('#fReset').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('.err', e.target), btn = $('.btn', e.target);
  setErr(err, '');
  const c = checkEmail($('#pEmail').value);
  if (!c.ok) return setErr(err, c.err, c.fix);

  busy(btn, true);
  await new Promise(r => setTimeout(r, 600));
  busy(btn, false);
  say('Bu adres kayıtlıysa sıfırlama bağlantısı gönderildi.', 4000);
  show('login');
});

/* ============ DOĞRULAMA KODU (OTP) ============ */
let timer = null;
const otp = $('#otp');
otp.innerHTML = '';
for (let i = 0; i < CONFIG.otpLength; i++) {
  const inp = document.createElement('input');
  inp.maxLength = 1;
  inp.inputMode = 'numeric';
  inp.autocomplete = i ? 'off' : 'one-time-code';
  inp.setAttribute('aria-label', (i + 1) + '. hane');
  otp.appendChild(inp);
}
const cells = $$('input', otp);

function readCode() {
  return cells.map(c => c.value).join('');
}

cells.forEach((c, i) => {
  c.addEventListener('input', () => {
    c.value = c.value.replace(/\D/g, '');
    if (c.value && cells[i + 1]) cells[i + 1].focus();
    if (readCode().length === cells.length) checkCode();
  });
  c.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && !c.value && cells[i - 1]) {
      cells[i - 1].focus();
      cells[i - 1].value = '';
    }
  });
  c.addEventListener('paste', e => {
    e.preventDefault();
    const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, cells.length);
    d.split('').forEach((ch, k) => cells[k].value = ch);
    (cells[Math.min(d.length, cells.length - 1)]).focus();
    if (d.length === cells.length) checkCode();
  });
});

function startTimer() {
  let s = CONFIG.resendSeconds;
  const b = $('#resend');
  b.disabled = true;
  clearInterval(timer);
  const tick = () => {
    b.textContent = s > 0 ? 'Tekrar gönder (' + s + ')' : 'Tekrar gönder';
    if (s-- <= 0) {
      clearInterval(timer);
      b.disabled = false;
    }
  };
  tick();
  timer = setInterval(tick, 1000);
}

$('#resend').addEventListener('click', async () => {
  if (!currentPendingEmail) return;
  setErr($('#vErr'), '');
  try {
    const res = await api('/api/auth/resend', {
      method: 'POST',
      body: JSON.stringify({ email: currentPendingEmail })
    });
    if (res.previewCode) {
      say('Yeni kod gönderildi! (Test: ' + res.previewCode + ')', 8000);
    } else {
      say('Yeni doğrulama kodu e-postana gönderildi.');
    }
    cells.forEach(c => c.value = '');
    cells[0].focus();
    startTimer();
  } catch (error) {
    setErr($('#vErr'), error.message);
  }
});

async function checkCode() {
  const code = readCode();
  if (code.length !== CONFIG.otpLength) return;
  setErr($('#vErr'), '');

  try {
    const res = await api('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ email: currentPendingEmail, code })
    });

    LS.set('tobim_token', res.token);
    LS.del('tobim_pending_email');
    currentUser = res.user;
    clearInterval(timer);
    say('E-posta başarıyla doğrulandı!');
    route();
  } catch (error) {
    setErr($('#vErr'), error.message);
    cells.forEach(c => c.value = '');
    cells[0].focus();
  }
}

/* ============ PLANLAR ============ */
let yearly = 0, selPlan = 'pro';
const tl = '<svg class="ico" viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>';

function renderPlans() {
  $('#pgrid').innerHTML = CONFIG.plans.map((p, i) => {
    const price = p.price[yearly];
    return '<article class="plan' + (p.pop ? ' pop' : '') + (p.id === selPlan ? ' sel' : '') + '" data-p="' + p.id + '" style="--i:' + i + '" tabindex="0" role="button" aria-pressed="' + (p.id === selPlan) + '">' +
      (p.pop ? '<span class="badge">Önerilen</span>' : '') +
      '<h3>' + p.name + '</h3><p>' + p.desc + '</p>' +
      '<div class="price">' + (price ? '₺' + price + '<small>/ay</small>' : 'Ücretsiz') + '</div>' +
      '<ul>' + p.features.map(f => '<li>' + tl + f + '</li>').join('') + '</ul></article>';
  }).join('');
  const p = CONFIG.plans.find(x => x.id === selPlan);
  $('#pGo .lbl').textContent = p.name + ' ile devam et';
}

$('#pgrid').addEventListener('click', e => {
  const c = e.target.closest('.plan');
  if (!c) return;
  selPlan = c.dataset.p;
  $$('.plan').forEach(x => {
    const on = x === c;
    x.classList.toggle('sel', on);
    x.setAttribute('aria-pressed', on);
  });
  $('#pGo .lbl').textContent = CONFIG.plans.find(x => x.id === selPlan).name + ' ile devam et';
});

$('#pgrid').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.target.click();
  }
});

$('#tog').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  yearly = +b.dataset.b;
  $$('#tog button').forEach(x => x.classList.toggle('on', x === b));
  renderPlans();
  $$('.plan').forEach(x => x.style.animation = 'none');
});

$('#pGo').addEventListener('click', async () => {
  const btn = $('#pGo');
  busy(btn, true);
  try {
    const res = await api('/api/auth/plan', {
      method: 'POST',
      body: JSON.stringify({ plan: selPlan, billing: yearly ? 'yearly' : 'monthly' })
    });
    currentUser = res.user;
    say('Planın güncellendi');
    fillDone(currentUser);
    show('done');
  } catch (error) {
    say(error.message);
  } finally {
    busy(btn, false);
  }
});

/* ============ WINDOWS HELLO / WEBAUTHN ============ */
const b64 = buf => btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const rnd = n => crypto.getRandomValues(new Uint8Array(n));

function pkSupport(el) {
  if (!window.PublicKeyCredential) {
    setErr(el, 'Bu tarayıcı geçiş anahtarlarını desteklemiyor.');
    return false;
  }
  if (!window.isSecureContext) {
    setErr(el, 'Geçiş anahtarı için sayfayı http://localhost üzerinden aç ya da https kullan.');
    return false;
  }
  return true;
}

function pkError(el, e) {
  const m = {
    NotAllowedError: 'İşlem iptal edildi ya da zaman aşımına uğradı.',
    InvalidStateError: 'Bu cihazda bu hesap için zaten bir anahtar var.',
    SecurityError: 'Güvenlik hatası: sayfayı http://localhost veya https üzerinden aç.',
    NotSupportedError: 'Bu cihaz istenen anahtar türünü desteklemiyor.'
  };
  setErr(el, m[e.name] || 'Geçiş anahtarı işlemi başarısız oldu.');
}

async function pkCreate() {
  const el = $('#dErr');
  setErr(el, '');
  if (!pkSupport(el)) return;
  if (!currentUser) return;

  try {
    const c = await navigator.credentials.create({
      publicKey: {
        challenge: rnd(32),
        rp: { name: CONFIG.brand },
        user: { id: rnd(16), name: currentUser.email, displayName: currentUser.name },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
        timeout: 60000,
        attestation: 'none'
      }
    });
    const keys = LS.get('tobim_keys', {});
    keys[b64(c.rawId)] = currentUser.email;
    LS.set('tobim_keys', keys);
    say('Windows Hello anahtarı eklendi');
  } catch (e) {
    pkError(el, e);
  }
}

async function pkLogin() {
  const el = $('#pkErr');
  setErr(el, '');
  if (!pkSupport(el)) return;
  const keys = LS.get('tobim_keys', {}), ids = Object.keys(keys);
  if (!ids.length) {
    return setErr(el, 'Bu cihazda kayıtlı anahtar yok. Önce normal giriş yapıp Windows Hello anahtarı ekleyebilirsin.');
  }

  try {
    const a = await navigator.credentials.get({
      publicKey: {
        challenge: rnd(32),
        userVerification: 'required',
        timeout: 60000,
        allowCredentials: ids.map(id => ({ type: 'public-key', id: unb64(id) }))
      }
    });
    const email = keys[b64(a.rawId)];
    if (!email) return setErr(el, 'Bu anahtara bağlı hesap bulunamadı.');

    say('Windows Hello doğrulandı');
    route();
  } catch (e) {
    pkError(el, e);
  }
}

$('#pkLogin').addEventListener('click', pkLogin);
$('#pkAdd').addEventListener('click', pkCreate);

$('#logout').addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  LS.del('tobim_token');
  LS.del('tobim_pending_email');
  currentUser = null;
  show('login');
});

/* ============ AÇILIŞ ANİMASYONU ============ */
let intro = $('#intro');
function buildWord() {
  const w = $('#word', intro);
  w.innerHTML = '';
  CONFIG.brand.split('').forEach((c, i) => {
    const s = document.createElement('span');
    s.textContent = c;
    s.style.animationDelay = (1 + i * 0.07) + 's';
    w.appendChild(s);
  });
}

function play() {
  document.body.classList.remove('ready');
  intro.classList.remove('out');
  const clone = intro.cloneNode(true);
  intro.replaceWith(clone);
  intro = clone;
  buildWord();
  setTimeout(() => {
    intro.classList.add('out');
    document.body.classList.add('ready');
  }, 3100);
}

$('#replay').addEventListener('click', play);
play();
route();

window.addEventListener('pointermove', e => {
  document.documentElement.style.setProperty('--mx', e.clientX + 'px');
  document.documentElement.style.setProperty('--my', e.clientY + 'px');
  const c = $('#card');
  if (c) {
    const r = c.getBoundingClientRect();
    c.style.setProperty('--cx', (e.clientX - r.left) + 'px');
    c.style.setProperty('--cy', (e.clientY - r.top) + 'px');
  }
});
