# Nova – giriş, kayıt ve plan seçimi

Klasör yapısı
- index.html        sayfa iskeleti (tüm ekranlar burada)
- css/style.css     tüm stiller (renkler en üstteki :root içinde)
- js/app.js         mantık; ayarlar dosyanın başındaki CONFIG içinde (marka adı, planlar, fiyatlar)
- assets/logo.svg   logo, favicon.svg aynı logonun favicon hali

Çalıştırma
1. start.bat dosyasına çift tıkla (Python gerekir) ya da klasörde: python -m http.server 8000
2. Tarayıcıda http://localhost:8000 adresini aç.
Windows Hello / geçiş anahtarı yalnızca http://localhost veya https üzerinde çalışır, dosyaya çift tıklayarak açınca çalışmaz.

Akış: Giriş ⇄ Kayıt → E-posta doğrulama kodu → Plan seçimi → Hazır ekranı (Windows Hello anahtarı ekle)

Önemli: Bu bir ön yüz demosudur. Kullanıcılar tarayıcının localStorage alanında tutulur,
doğrulama kodu sunucu olmadığı için ekranda gösterilir. Gerçek kullanımda:
- kodu ve e-postayı sunucuda üret/gönder (js/app.js içinde sendCode),
- şifreleri sunucuda hashle,
- Windows Hello challenge ve imzasını sunucuda doğrula (js/app.js içinde pkCreate / pkLogin).
# tobimv1
# scaleonv1
