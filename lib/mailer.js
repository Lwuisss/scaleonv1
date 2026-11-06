'use strict';

const nodemailer = require('nodemailer');

let transporter = null;
let testAccount = null;

async function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    const port = Number(process.env.SMTP_PORT) || 587;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    });
    console.log('[Mailer] Using custom SMTP service for:', user);
    return transporter;
  }

  // Fallback to Ethereal / Test SMTP
  try {
    testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    console.log('[Mailer] SMTP not configured. Using Ethereal test account:', testAccount.user);
    return transporter;
  } catch (err) {
    console.warn('[Mailer] Could not create test SMTP account:', err.message);
    return null;
  }
}

function generateEmailHtml({ name, code }) {
  return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>Tobim Doğrulama Kodu</title>
</head>
<body style="margin:0;padding:40px 16px;background-color:#141415;font-family:'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ece9e4;">
  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;background-color:#1c1c1e;border:1px solid #323235;border-radius:20px;padding:36px;box-shadow:0 12px 40px rgba(0,0,0,0.5);">
    <tr>
      <td align="center" style="padding-bottom:24px;">
        <div style="display:inline-block;width:48px;height:48px;border-radius:50%;background:#261d19;border:1px solid rgba(217,119,87,0.3);text-align:center;line-height:48px;">
          <span style="color:#d97757;font-size:24px;font-weight:bold;">✦</span>
        </div>
        <h2 style="margin:14px 0 0;font-size:24px;font-weight:700;color:#ece9e4;letter-spacing:-0.02em;">Tobim</h2>
      </td>
    </tr>
    <tr>
      <td style="font-size:16px;line-height:1.6;color:#ece9e4;">
        <p style="margin:0 0 16px;">Merhaba <strong style="color:#fff;">${name || 'Kullanıcı'}</strong>,</p>
        <p style="margin:0 0 24px;color:#8e8e93;">Tobim hesabını oluşturduğun için teşekkürler. E-posta adresini doğrulamak için aşağıdaki 6 haneli güvenlik kodunu kullan:</p>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:16px 0 28px;">
        <div style="display:inline-block;background:#141415;border:1px solid #d97757;border-radius:14px;padding:16px 36px;letter-spacing:10px;font-size:32px;font-weight:700;color:#f0976f;box-shadow:0 0 24px rgba(217,119,87,0.25);">
          ${code}
        </div>
      </td>
    </tr>
    <tr>
      <td style="font-size:13px;line-height:1.6;color:#8e8e93;border-top:1px solid #323235;padding-top:20px;">
        <p style="margin:0 0 8px;">⏳ Bu kod <strong>10 dakika</strong> süreyle geçerlidir.</p>
        <p style="margin:0;">Bu işlemi siz talep etmediyseniz, lütfen bu e-postayı dikkate almayınız. Hesabınız güvendedir.</p>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

async function sendVerificationCode(email, name, code) {
  const mailTransporter = await getTransporter();
  const from = process.env.SMTP_FROM || '"Tobim" <noreply@tobim.app>';

  const mailOptions = {
    from,
    to: email,
    subject: `Tobim Doğrulama Kodun: ${code}`,
    text: `Merhaba ${name},\n\nTobim e-posta doğrulama kodun: ${code}\nBu kod 10 dakika geçerlidir.\n\nTobim Ekibi`,
    html: generateEmailHtml({ name, code })
  };

  if (!mailTransporter) {
    console.log(`[Dev Mailer] Email: ${email} | Kod: ${code}`);
    return { ok: true, devMode: true, code };
  }

  try {
    const info = await mailTransporter.sendMail(mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`[Dev Mailer] Test mail gönderildi! Önizleme: ${previewUrl}`);
      return { ok: true, devMode: true, previewUrl, code };
    }
    return { ok: true, devMode: false, messageId: info.messageId };
  } catch (err) {
    console.error('[Mailer] Mail gönderme hatası:', err.message);
    return { ok: false, error: err.message, code };
  }
}

module.exports = {
  sendVerificationCode
};
