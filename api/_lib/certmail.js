// api/_lib/certmail.js
// Felicitatiemail met certificaat-/pasnummer en een link naar het certificaat.
import { Resend } from 'resend';
import { COMPANY_FOOTER_HTML, PACKAGE_NAMES, escapeHtml, isValidEmail, normalizeEmail } from './accounts.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SKB BHV <onboarding@resend.dev>';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'info@skbbhv.nl';

export function certRecipients(record) {
  return [...new Set([record.buyerEmail, record.email].map(normalizeEmail))].filter(isValidEmail);
}

// Geeft { sent, reason } terug.
export async function sendCertificateMail(record, token) {
  const recipients = certRecipients(record);
  if (!recipients.length) return { sent: false, reason: 'Geen e-mailadres bekend.' };
  if (!resend) return { sent: false, reason: 'E-mail is niet geconfigureerd.' };
  const siteUrl = (process.env.SITE_URL || 'https://www.skbbhv.nl').replace(/\/$/, '');
  const ond = (record.theorie != null || record.praktijk != null)
    ? [record.theorie && 'theorie', record.praktijk && 'praktijk'].filter(Boolean).join(' en ')
    : null;
  const pkgName = ond ? `BHV ${ond}${record.pkg === 'herhaling' ? ', herhaling' : ''}` : (PACKAGE_NAMES[record.pkg] || 'BHV-examen');
  const pasNumber = record.pasNumber || null;
  const certLink = `${siteUrl}/?p=${encodeURIComponent(token)}`;
  const scoreTxt = record.pct != null && record.total
    ? ` met een score van <b>${escapeHtml(record.pct)}%</b> (${escapeHtml(record.correct)} van de ${escapeHtml(record.total)} vragen goed)`
    : '';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#12161B;">
      <div style="background:#0B0D10;padding:22px 28px;border-bottom:6px solid #E0101F;">
        <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:1px;">SKB BHV</span>
        <span style="color:#FF5A66;font-size:12px;letter-spacing:3px;margin-left:10px;text-transform:uppercase;">Bedrijfshulpverlening</span>
      </div>
      <div style="border:1px solid #E1E4E9;border-top:none;padding:28px;">
        <h2 style="margin-top:0;color:#0B0D10;">Gefeliciteerd, ${escapeHtml(record.first)}!</h2>
        <p>Je bent geslaagd voor je BHV-opleiding (${escapeHtml(pkgName)})${scoreTxt}.</p>
        <table style="width:100%;margin:20px 0;font-size:14px;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#4B535C;border-bottom:1px solid #eee;">Certificaatnummer</td><td style="padding:8px 0;text-align:right;font-weight:bold;border-bottom:1px solid #eee;">${escapeHtml(record.certNumber)}</td></tr>
          ${pasNumber ? `<tr><td style="padding:8px 0;color:#4B535C;">Pasnummer</td><td style="padding:8px 0;text-align:right;font-weight:bold;color:#E0101F;">${escapeHtml(pasNumber)}</td></tr>` : ''}
        </table>
        ${pasNumber ? '<p>Je fysieke <b>BHV-pasje</b> wordt per post naar je verstuurd. Een digitale versie kun je alvast downloaden.</p>' : ''}
        <p>Download je certificaat${pasNumber ? ' en digitale BHV-pasje' : ''} via de knop hieronder:</p>
        <p style="text-align:center;margin:26px 0;">
          <a href="${certLink}" style="background:#E0101F;color:#fff;text-decoration:none;padding:13px 28px;border-radius:4px;font-weight:bold;display:inline-block;letter-spacing:.5px;">NAAR MIJN CERTIFICAAT</a>
        </p>
        ${record.verifyCode ? `<p style="text-align:center;margin:-8px 0 22px;"><a href="${siteUrl}/pas/${encodeURIComponent(record.verifyCode)}" style="background:#0B0D10;color:#fff;text-decoration:none;padding:12px 24px;border-radius:4px;font-weight:bold;display:inline-block;letter-spacing:.5px;">📱 DIGITALE BHV-PAS OP JE TELEFOON</a></p>
        <p style="font-size:13px;color:#666;text-align:center;margin-top:-10px;">Met QR-code waarmee iedereen kan controleren dat je certificaat echt is.</p>` : ''}
        <hr style="border:none;border-top:1px solid #E1E4E9;margin:24px 0;">
        <p style="font-size:12px;color:#8b939b;">${COMPANY_FOOTER_HTML}</p>
      </div>
    </div>`;
  await resend.emails.send({
    from: FROM_EMAIL, to: recipients, bcc: NOTIFY_EMAIL,
    subject: 'Gefeliciteerd — je bent geslaagd voor je BHV-opleiding!', html,
  });
  return { sent: true };
}
