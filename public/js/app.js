'use strict';

/* ========================================================= */
/* TOBIM - ÇOKLU PAZARYERİ VE ENTEGRASYON YÖNETİMİ           */
/* ========================================================= */

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} }
};

let currentUser = null;
let currentPlatform = 'etsy';

// Ürün Listesi ve Eşleştirme Verileri
let parsedProducts = [];
let currentProductIndex = 0;
let currentImageIndex = 0;
let detectedColumns = {
  title: '',
  desc: '',
  price: '',
  stock: '',
  images: ''
};

// Platform Bilgileri
const PLATFORM_INFOS = {
  etsy: {
    title: 'Etsy Ürün Yönetimi & SEO Optimizatörü',
    sub: 'Etsy arama algoritmasına tam uyumlu 140 karakter başlık, 13 etiket ve SEO açıklamaları.',
    hasOptimizer: true
  },
  trendyol: {
    title: 'Trendyol Ürün Listeleme & Hızlı Aktarım Paneli',
    sub: 'Trendyol mağazanız için ürün bilgilerini, barkodları ve görselleri tek tıkla kopyalayın.',
    hasOptimizer: false
  },
  hepsiburada: {
    title: 'Hepsiburada Ürün & Katalog Paneli',
    sub: 'Hepsiburada satıcı portalına aktarmak için ürün ve fiyat detayları hazır.',
    hasOptimizer: false
  },
  idefix: {
    title: 'İdefix Mağaza Ürün Listeleme Paneli',
    sub: 'İdefix pazar yeri ürün bilgilerini, açıklamalarını ve görsellerini inceleyin ve aktarın.',
    hasOptimizer: false
  },
  pazarama: {
    title: 'Pazarama Ürün & Satış Paneli',
    sub: 'Pazarama satıcı panelinize hızlıca ürün yüklemek için temiz veri görünümü.',
    hasOptimizer: false
  }
};

/* ========================================================= */
/* 1. MOUSE GLOW & INTERAKTIF ANİMASYONLAR                   */
/* ========================================================= */
const mouseGlow = document.getElementById('mouseGlow');
window.addEventListener('mousemove', e => {
  if (mouseGlow) {
    mouseGlow.style.opacity = '1';
    mouseGlow.style.left = e.clientX + 'px';
    mouseGlow.style.top = e.clientY + 'px';
  }
});
window.addEventListener('mouseleave', () => {
  if (mouseGlow) mouseGlow.style.opacity = '0';
});

// Kopyalama Kıvılcım Patlaması
function createSparkles(x, y) {
  const count = 14;
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'sparkle';
    const angle = (i / count) * 2 * Math.PI;
    const dist = 30 + Math.random() * 45;
    const tx = Math.cos(angle) * dist + 'px';
    const ty = Math.sin(angle) * dist + 'px';
    s.style.setProperty('--tx', tx);
    s.style.setProperty('--ty', ty);
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }
}

/* ========================================================= */
/* 2. KAYAN OVAL PILL SWITCH & TIKLAYINCA AÇILAN KARTLAR     */
/* ========================================================= */
const pillWrap = document.getElementById('pillSwitchWrap');
const pillIndicator = document.getElementById('pillIndicator');
const pillBtnLogin = document.getElementById('pillBtnLogin');
const pillBtnRegister = document.getElementById('pillBtnRegister');
const cardLogin = document.getElementById('cardLogin');
const cardRegister = document.getElementById('cardRegister');
const btnCloseLogin = document.getElementById('btnCloseLogin');
const btnCloseRegister = document.getElementById('btnCloseRegister');

function updatePillPosition(activeBtn) {
  if (!activeBtn || !pillWrap || !pillIndicator) return;
  const wrapRect = pillWrap.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  const left = btnRect.left - wrapRect.left - 6; // padding compensation
  pillIndicator.style.width = btnRect.width + 'px';
  pillIndicator.style.transform = `translateX(${left}px)`;
  pillIndicator.classList.add('active');
}

function openCard(cardType) {
  if (cardType === 'login') {
    pillBtnLogin.classList.add('active');
    pillBtnRegister.classList.remove('active');
    updatePillPosition(pillBtnLogin);

    cardRegister.classList.remove('open');
    cardLogin.classList.add('open');
    const inp = document.getElementById('lEmail');
    if (inp) setTimeout(() => inp.focus(), 250);
  } else if (cardType === 'register') {
    pillBtnRegister.classList.add('active');
    pillBtnLogin.classList.remove('active');
    updatePillPosition(pillBtnRegister);

    cardLogin.classList.remove('open');
    cardRegister.classList.add('open');
    const inp = document.getElementById('rName');
    if (inp) setTimeout(() => inp.focus(), 250);
  }
}

function closeAllCards() {
  cardLogin.classList.remove('open');
  cardRegister.classList.remove('open');
  pillBtnLogin.classList.remove('active');
  pillBtnRegister.classList.remove('active');
  pillIndicator.classList.remove('active');
}

// Buton tıklamaları: Tıklayınca açılır, tekrar tıklanırsa kapanır
pillBtnLogin.addEventListener('click', () => {
  if (cardLogin.classList.contains('open')) {
    closeAllCards();
  } else {
    openCard('login');
  }
});

pillBtnRegister.addEventListener('click', () => {
  if (cardRegister.classList.contains('open')) {
    closeAllCards();
  } else {
    openCard('register');
  }
});

if (btnCloseLogin) btnCloseLogin.addEventListener('click', closeAllCards);
if (btnCloseRegister) btnCloseRegister.addEventListener('click', closeAllCards);

/* ========================================================= */
/* 3. TOAST & GOOGLE ŞİFRELERE KAYDETME YARDIMCILARI        */
/* ========================================================= */
let toastTimer = null;
function showToast(text, isSuccess = true) {
  const el = document.getElementById('toastMsg');
  const txt = document.getElementById('toastText');
  if (!el || !txt) return;
  txt.textContent = text;
  el.className = 'toast show ' + (isSuccess ? 'success' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = 'toast';
  }, 2200);
}

// Google Password Manager Entegrasyonu
async function saveToGooglePasswords(email, password, name = '') {
  try {
    if (window.PasswordCredential && navigator.credentials) {
      const cred = new PasswordCredential({
        id: email,
        password: password,
        name: name || email
      });
      await navigator.credentials.store(cred);
    }
  } catch (_) {}
}

function copyToClipboard(text, successMsg = 'Panoya Kopyalandı', triggerAutoAdvance = true, event = null) {
  if (!text || !text.trim()) {
    showToast('Kopyalanacak metin bulunamadı.', false);
    return;
  }
  const str = String(text).trim();

  if (event) {
    createSparkles(event.clientX, event.clientY);
  }

  const doSuccess = () => {
    showToast(successMsg, true);
    const autoAdv = document.getElementById('chkAutoAdvance');
    if (triggerAutoAdvance && autoAdv && autoAdv.checked) {
      setTimeout(() => {
        nextProduct();
      }, 350);
    }
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(str).then(doSuccess).catch(() => fallbackCopy(str, doSuccess));
  } else {
    fallbackCopy(str, doSuccess);
  }
}

function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    cb();
  } catch (e) {
    showToast('Kopyalama başarısız oldu.', false);
  }
  document.body.removeChild(ta);
}

/* ========================================================= */
/* 4. API İŞLEMLERİ & OTURUM YÖNETİMİ                        */
/* ========================================================= */
async function fetchApi(path, options = {}) {
  const token = LS.get('tobim_token', '');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'İşlem sırasında bir hata oluştu.');
  }
  return data;
}

// Şifre Göster / Gizle
document.querySelectorAll('.eye').forEach(btn => {
  btn.addEventListener('click', () => {
    const inp = btn.parentElement.querySelector('input');
    if (!inp) return;
    const isPw = inp.type === 'password';
    inp.type = isPw ? 'text' : 'password';
  });
});

// Şifre Güç Metresi
const rPw = document.getElementById('rPw');
const rMeter = document.getElementById('rMeter');
if (rPw && rMeter) {
  rPw.addEventListener('input', e => {
    const val = e.target.value;
    let s = 0;
    if (val.length >= 6) s++;
    if (/[A-Z]/.test(val) && /[a-z]/.test(val)) s++;
    if (/\d/.test(val)) s++;
    if (/[^A-Za-z0-9]/.test(val) || val.length >= 10) s++;
    rMeter.dataset.s = val ? Math.max(1, s) : 0;
  });
}

// Kayıt Platform Seçim Kartları
const regPlatformCards = document.querySelectorAll('#regPlatformGrid .plat-card');
regPlatformCards.forEach(card => {
  card.addEventListener('click', () => {
    card.classList.toggle('active');
  });
});

function getSelectedRegisterPlatforms() {
  const selected = [];
  document.querySelectorAll('#regPlatformGrid .plat-card.active').forEach(c => {
    selected.push(c.dataset.platform);
  });
  return selected.length > 0 ? selected : ['etsy'];
}

// 1. GİRİŞ YAP
const fLogin = document.getElementById('fLogin');
fLogin.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btnLogin');
  const errBox = document.getElementById('loginErr');
  errBox.classList.remove('show');
  errBox.textContent = '';

  const email = document.getElementById('lEmail').value.trim();
  const password = document.getElementById('lPw').value;

  if (!email || !password) {
    errBox.textContent = 'Lütfen e-posta ve şifrenizi giriniz.';
    errBox.classList.add('show');
    return;
  }

  btn.classList.add('load');
  try {
    const res = await fetchApi('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    LS.set('tobim_token', res.token);
    currentUser = res.user;

    await saveToGooglePasswords(email, password, currentUser.name);

    initAppView();
    showToast(`Tekrar hoş geldin, ${currentUser.name}!`);
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.add('show');
  } finally {
    btn.classList.remove('load');
  }
});

// 2. KAYIT OLUŞTUR
const fRegister = document.getElementById('fRegister');
fRegister.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btnReg');
  const errBox = document.getElementById('regErr');
  errBox.classList.remove('show');
  errBox.textContent = '';

  const name = document.getElementById('rName').value.trim();
  const email = document.getElementById('rEmail').value.trim();
  const password = document.getElementById('rPw').value;
  const platforms = getSelectedRegisterPlatforms();

  if (!name || !email || !password) {
    errBox.textContent = 'Lütfen tüm alanları eksiksiz doldurunuz.';
    errBox.classList.add('show');
    return;
  }

  btn.classList.add('load');
  try {
    const res = await fetchApi('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name,
        email,
        password,
        platforms,
        platformAccounts: {}
      })
    });

    LS.set('tobim_token', res.token);
    currentUser = res.user;

    await saveToGooglePasswords(email, password, name);

    initAppView();
    showToast(`Hesabınız oluşturuldu! Hoş geldiniz, ${currentUser.name}`);
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.add('show');
  } finally {
    btn.classList.remove('load');
  }
});

// 3. ÇIKIŞ YAP
document.getElementById('btnLogout').addEventListener('click', async () => {
  try {
    await fetchApi('/api/auth/logout', { method: 'POST' });
  } catch (_) {}
  LS.del('tobim_token');
  currentUser = null;
  document.getElementById('appScreen').style.display = 'none';
  document.getElementById('authScreen').style.display = 'flex';
  closeAllCards();
  showToast('Çıkış yapıldı.');
});

// Sayfa Açılış Kontrolü
async function checkExistingSession() {
  const token = LS.get('tobim_token', '');
  if (!token) {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
    closeAllCards();
    return;
  }

  try {
    const res = await fetchApi('/api/auth/me');
    if (res.ok && res.user) {
      currentUser = res.user;
      initAppView();
    } else {
      throw new Error();
    }
  } catch (_) {
    LS.del('tobim_token');
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
    closeAllCards();
  }
}

function initAppView() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'flex';
  document.getElementById('userNameDisp').textContent = currentUser.name || 'Kullanıcı';

  const userPlatforms = (currentUser.platforms && currentUser.platforms.length > 0)
    ? currentUser.platforms
    : ['etsy', 'trendyol', 'hepsiburada', 'idefix', 'pazarama'];

  if (userPlatforms.includes('etsy')) {
    currentPlatform = 'etsy';
  } else {
    currentPlatform = userPlatforms[0] || 'trendyol';
  }

  setupPlatformTabs(userPlatforms);
  switchPlatform(currentPlatform);
}

function setupPlatformTabs(allowedPlatforms) {
  const tabs = document.querySelectorAll('#platformTabs .plat-tab');
  tabs.forEach(tab => {
    const p = tab.dataset.p;
    tab.style.display = 'inline-flex';
    tab.classList.toggle('active', p === currentPlatform);
    
    tab.onclick = () => {
      switchPlatform(p);
    };
  });
}

function switchPlatform(p) {
  currentPlatform = p;
  document.querySelectorAll('#platformTabs .plat-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.p === p);
  });

  const info = PLATFORM_INFOS[p] || PLATFORM_INFOS['etsy'];
  document.getElementById('platTitle').textContent = info.title;
  document.getElementById('platSub').textContent = info.sub;

  const etsyOptSection = document.getElementById('etsyOptimizerSection');
  const etsyNotice = document.getElementById('etsyApiKeyNotice');

  if (p === 'etsy') {
    etsyOptSection.style.display = 'block';
    if (etsyNotice) etsyNotice.style.display = 'flex';
  } else {
    etsyOptSection.style.display = 'none';
    if (etsyNotice) etsyNotice.style.display = 'none';
  }

  if (parsedProducts.length > 0) {
    renderCurrentProduct();
  }
}

/* ========================================================= */
/* 5. EXCEL & CSV YÜKLEME VE SHEETJS ENTEGRASYONU           */
/* ========================================================= */
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');

dropArea.addEventListener('click', () => fileInput.click());

dropArea.addEventListener('dragover', e => {
  e.preventDefault();
  dropArea.classList.add('dragover');
});

dropArea.addEventListener('dragleave', () => {
  dropArea.classList.remove('dragover');
});

dropArea.addEventListener('drop', e => {
  e.preventDefault();
  dropArea.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleFile(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', e => {
  if (e.target.files && e.target.files[0]) {
    handleFile(e.target.files[0]);
  }
});

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!json || json.length === 0) {
        showToast('Dosya içeriğinde veri bulunamadı.', false);
        return;
      }

      parsedProducts = json;
      currentProductIndex = 0;
      currentImageIndex = 0;

      document.getElementById('uploadStatusText').textContent = `Yüklendi: ${file.name} (${json.length} Ürün)`;
      showToast(`${json.length} ürün başarıyla yüklendi!`);

      detectAndSetupColumns(Object.keys(json[0]));
      document.getElementById('colMapCard').style.display = 'block';
      document.getElementById('productSection').style.display = 'block';

      renderCurrentProduct();
    } catch (err) {
      console.error(err);
      showToast('Dosya okunurken hata oluştu: ' + err.message, false);
    }
  };
  reader.readAsArrayBuffer(file);
}

function detectAndSetupColumns(cols) {
  const findMatch = (keywords) => {
    for (const c of cols) {
      const lower = String(c).toLowerCase().trim();
      if (keywords.some(k => lower.includes(k))) return c;
    }
    return cols[0] || '';
  };

  detectedColumns.title = findMatch(['title', 'başlık', 'baslik', 'urun adi', 'ürün adı', 'name', 'ad']);
  detectedColumns.desc = findMatch(['description', 'açıklama', 'aciklama', 'detay', 'body', 'özellik']);
  detectedColumns.price = findMatch(['price', 'fiyat', 'satis', 'regular_price', 'tutar']);
  detectedColumns.stock = findMatch(['stock', 'stok', 'sku', 'barkod', 'barcode', 'adet', 'quantity']);
  detectedColumns.images = findMatch(['image', 'resim', 'foto', 'photo', 'görsel', 'gorsel', 'url', 'link']);

  populateSelect('selColTitle', cols, detectedColumns.title);
  populateSelect('selColDesc', cols, detectedColumns.desc);
  populateSelect('selColPrice', cols, detectedColumns.price);
  populateSelect('selColStock', cols, detectedColumns.stock);
  populateSelect('selColImages', cols, detectedColumns.images);
}

function populateSelect(id, cols, selected) {
  const sel = document.getElementById(id);
  sel.innerHTML = '';
  cols.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    if (c === selected) opt.selected = true;
    sel.appendChild(opt);
  });

  sel.onchange = () => {
    if (id === 'selColTitle') detectedColumns.title = sel.value;
    if (id === 'selColDesc') detectedColumns.desc = sel.value;
    if (id === 'selColPrice') detectedColumns.price = sel.value;
    if (id === 'selColStock') detectedColumns.stock = sel.value;
    if (id === 'selColImages') detectedColumns.images = sel.value;
    renderCurrentProduct();
  };
}

/* ========================================================= */
/* 6. ÜRÜN GÖRÜNTÜLEME & GÖRSEL GALERİSİ (İLERİ/GERİ SLAYT) */
/* ========================================================= */
function parseImages(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  const str = String(raw).trim();
  if (!str) return [];

  let parts = [];
  if (str.includes('\n')) {
    parts = str.split('\n');
  } else if (str.includes(',')) {
    parts = str.split(',');
  } else if (str.includes(';')) {
    parts = str.split(';');
  } else {
    parts = [str];
  }

  return parts
    .map(p => p.trim())
    .filter(p => p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:image'));
}

function renderCurrentProduct() {
  if (!parsedProducts || parsedProducts.length === 0) return;
  const p = parsedProducts[currentProductIndex];

  document.getElementById('navCounter').textContent = `Ürün ${currentProductIndex + 1} / ${parsedProducts.length}`;

  const titleVal = String(p[detectedColumns.title] || 'Başlık Belirtilmemiş').trim();
  const descVal = String(p[detectedColumns.desc] || 'Açıklama Belirtilmemiş').trim();
  const priceVal = String(p[detectedColumns.price] || '-').trim();
  const stockVal = String(p[detectedColumns.stock] || '-').trim();

  document.getElementById('prodTitle').textContent = titleVal;
  document.getElementById('prodDesc').textContent = descVal;
  document.getElementById('prodPrice').textContent = priceVal;
  document.getElementById('prodStock').textContent = stockVal;

  const rawImages = p[detectedColumns.images];
  const images = parseImages(rawImages);
  setupGallery(images);

  const existingOptTitle = p['ETSY_OPTIMIZED_TITLE'] || p['optimized_title'] || '';
  const existingOptDesc = p['ETSY_OPTIMIZED_DESCRIPTION'] || p['optimized_description'] || '';
  const existingOptTags = p['ETSY_OPTIMIZED_TAGS'] || p['optimized_tags'] || '';

  if (existingOptTitle) {
    document.getElementById('etsyOptTitle').textContent = existingOptTitle;
  } else {
    document.getElementById('etsyOptTitle').textContent = 'Henüz optimize edilmedi. "Gemini ile Optimize Et" butonuna basınız.';
  }

  if (existingOptDesc) {
    document.getElementById('etsyOptDesc').textContent = existingOptDesc;
  } else {
    document.getElementById('etsyOptDesc').textContent = 'Henüz optimize edilmedi.';
  }

  if (existingOptTags) {
    let tagList = Array.isArray(existingOptTags) ? existingOptTags : String(existingOptTags).split(',');
    renderEtsyTags(tagList);
  } else {
    document.getElementById('etsyTagsWrap').innerHTML = '<span style="font-size:13px;color:var(--mut)">Henüz etiket üretilmedi.</span>';
  }
}

let currentImagesList = [];

function setupGallery(imgs) {
  currentImagesList = imgs;
  currentImageIndex = 0;
  updateGalleryDisplay();
}

function updateGalleryDisplay() {
  const mainImg = document.getElementById('mainImage');
  const counter = document.getElementById('imgCounter');
  const thumbsRow = document.getElementById('thumbsRow');
  const fullLink = document.getElementById('imgFullLink');
  const btnPrev = document.getElementById('imgPrev');
  const btnNext = document.getElementById('imgNext');

  thumbsRow.innerHTML = '';

  if (!currentImagesList || currentImagesList.length === 0) {
    mainImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 24 24" fill="none" stroke="%23555" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
    counter.textContent = 'Görsel Yok';
    fullLink.style.display = 'none';
    btnPrev.style.display = 'none';
    btnNext.style.display = 'none';
    return;
  }

  if (currentImageIndex < 0) currentImageIndex = 0;
  if (currentImageIndex >= currentImagesList.length) currentImageIndex = currentImagesList.length - 1;

  const curSrc = currentImagesList[currentImageIndex];
  mainImg.src = curSrc;
  counter.textContent = `Görsel ${currentImageIndex + 1} / ${currentImagesList.length}`;
  fullLink.href = curSrc;
  fullLink.style.display = 'inline-block';

  btnPrev.style.display = currentImagesList.length > 1 ? 'grid' : 'none';
  btnNext.style.display = currentImagesList.length > 1 ? 'grid' : 'none';

  currentImagesList.forEach((src, idx) => {
    const t = document.createElement('img');
    t.className = 'thumb-img' + (idx === currentImageIndex ? ' active' : '');
    t.src = src;
    t.onclick = () => {
      currentImageIndex = idx;
      updateGalleryDisplay();
    };
    thumbsRow.appendChild(t);
  });
}

document.getElementById('imgPrev').addEventListener('click', () => {
  if (currentImagesList.length <= 1) return;
  currentImageIndex = (currentImageIndex - 1 + currentImagesList.length) % currentImagesList.length;
  updateGalleryDisplay();
});

document.getElementById('imgNext').addEventListener('click', () => {
  if (currentImagesList.length <= 1) return;
  currentImageIndex = (currentImageIndex + 1) % currentImagesList.length;
  updateGalleryDisplay();
});

function prevProduct() {
  if (parsedProducts.length === 0) return;
  currentProductIndex = (currentProductIndex - 1 + parsedProducts.length) % parsedProducts.length;
  renderCurrentProduct();
}

function nextProduct() {
  if (parsedProducts.length === 0) return;
  currentProductIndex = (currentProductIndex + 1) % parsedProducts.length;
  renderCurrentProduct();
}

document.getElementById('btnPrev').addEventListener('click', prevProduct);
document.getElementById('btnNext').addEventListener('click', nextProduct);

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.key === 'ArrowLeft') prevProduct();
  if (e.key === 'ArrowRight') nextProduct();
});

/* ========================================================= */
/* 7. KOPYALAMA BUTONLARI & OTOMATİK SONRAKİ ÜRÜNE ATLA      */
/* ========================================================= */
document.querySelectorAll('.copy-pill-btn[data-copy-target]').forEach(btn => {
  btn.addEventListener('click', e => {
    const targetId = btn.dataset.copyTarget;
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;
    const text = targetEl.textContent.trim();
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1200);
    copyToClipboard(text, `${targetEl.previousElementSibling?.textContent || 'Bilgi'} Kopyalandı`, true, e);
  });
});

/* ========================================================= */
/* 8. SADECE ETSY İÇİN: GEMINI İLE SEO OPTİMİZATÖRÜ          */
/* ========================================================= */
const btnOptEtsy = document.getElementById('btnOptimizeEtsy');
btnOptEtsy.addEventListener('click', async () => {
  if (parsedProducts.length === 0) {
    showToast('Lütfen önce bir liste yükleyiniz.', false);
    return;
  }

  const p = parsedProducts[currentProductIndex];
  const title = String(p[detectedColumns.title] || '').trim();
  const description = String(p[detectedColumns.desc] || '').trim();

  const lbl = document.getElementById('optBtnLabel');
  lbl.textContent = 'Optimize Ediliyor...';
  btnOptEtsy.disabled = true;

  try {
    const res = await fetchApi('/api/etsy/optimize', {
      method: 'POST',
      body: JSON.stringify({ title, description })
    });

    if (res.ok) {
      document.getElementById('etsyOptTitle').textContent = res.optimized_title;
      document.getElementById('etsyOptDesc').textContent = res.optimized_description;
      renderEtsyTags(res.optimized_tags);

      p['ETSY_OPTIMIZED_TITLE'] = res.optimized_title;
      p['ETSY_OPTIMIZED_TAGS'] = res.optimized_tags.join(', ');
      p['ETSY_OPTIMIZED_DESCRIPTION'] = res.optimized_description;

      showToast('Etsy SEO optimizasyonu tamamlandı!');
    }
  } catch (err) {
    showToast('Optimizasyon hatası: ' + err.message, false);
  } finally {
    lbl.textContent = 'Gemini ile Optimize Et';
    btnOptEtsy.disabled = false;
  }
});

function renderEtsyTags(tags) {
  const wrap = document.getElementById('etsyTagsWrap');
  wrap.innerHTML = '';
  if (!tags || tags.length === 0) {
    wrap.innerHTML = '<span style="font-size:13px;color:var(--mut)">Etiket bulunamadı.</span>';
    return;
  }

  tags.forEach((tag, idx) => {
    const cleanTag = String(tag).trim();
    if (!cleanTag) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'etsy-tag-btn';
    btn.innerHTML = `<span style="opacity:.6">${idx + 1}.</span> <b>${cleanTag}</b>`;
    btn.title = 'Tıkla ve kopyala';
    btn.onclick = e => {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1000);
      copyToClipboard(cleanTag, `Etiket kopyalandı: "${cleanTag}"`, false, e);
    };
    wrap.appendChild(btn);
  });
}

document.getElementById('btnCopyAllTags').addEventListener('click', e => {
  const tagBtns = document.querySelectorAll('#etsyTagsWrap .etsy-tag-btn b');
  if (tagBtns.length === 0) {
    showToast('Kopyalanacak etiket bulunamadı.', false);
    return;
  }
  const all = Array.from(tagBtns).map(b => b.textContent.trim()).join(', ');
  copyToClipboard(all, '13 Etiketin Tümü Virgülle Kopyalandı!', true, e);
});

// Başlat
checkExistingSession();
