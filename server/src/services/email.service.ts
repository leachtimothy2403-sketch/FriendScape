import nodemailer from 'nodemailer';

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT) || 587;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

console.log('[email] SMTP config at module load:');
console.log(`[email]   SMTP_HOST = ${smtpHost ?? '⚠️  undefined'}`);
console.log(`[email]   SMTP_PORT = ${smtpPort}`);
console.log(`[email]   SMTP_USER = ${smtpUser ?? '⚠️  undefined'}`);
console.log(`[email]   SMTP_PASS = ${smtpPass ? '****** (set)' : '⚠️  undefined'}`);

if (!smtpHost || !smtpUser || !smtpPass) {
  console.warn('[email] ⚠️  One or more SMTP env vars are missing — emails will fail until these are set.');
}

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: false,
  auth: { user: smtpUser, pass: smtpPass },
  tls: { rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false' },
});

// Verify SMTP connection on startup so problems surface immediately.
transporter.verify((err) => {
  if (err) {
    console.error('[email] ❌ SMTP connection failed:', err.message);
    if ((err as NodeJS.ErrnoException).code === 'EAUTH') {
      console.error('[email]    → Authentication rejected. For Gmail, you must use an App Password');
      console.error('[email]      (Google Account → Security → 2-Step Verification → App Passwords).');
      console.error('[email]      Regular Gmail passwords are blocked for SMTP since May 2022.');
    }
  } else {
    console.log('[email] ✅ SMTP connection verified — ready to send');
  }
});

const FROM = `"Migo" <hello@mymigo.fr>`;

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Verify your Migo account',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h1 style="color:#7F77DD">Welcome to Migo! 🌈</h1>
        <p>You're one step away from setting up a safe, joyful world for your child.</p>
        <p>Your verification code is:</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#7F77DD;padding:16px;background:#F8F7FF;border-radius:8px;text-align:center">${code}</div>
        <p style="color:#9E9E9E;font-size:14px">This code expires in 10 minutes.</p>
      </div>
    `,
  });
}

export async function sendLoginOtpEmail(to: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Your Migo login code',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h1 style="color:#7F77DD">Confirm it's you</h1>
        <p>Enter this code to finish logging in to Migo:</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#7F77DD;padding:16px;background:#F8F7FF;border-radius:8px;text-align:center">${code}</div>
        <p style="color:#9E9E9E;font-size:14px">This code expires in 10 minutes. If you didn't try to log in, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Reset your Migo password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h1 style="color:#7F77DD">Password Reset</h1>
        <p>We received a request to reset your Migo password.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#7F77DD;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Reset My Password</a>
        <p style="color:#9E9E9E;font-size:14px">This link expires in 1 hour. If you didn't request this, you can safely ignore it.</p>
      </div>
    `,
  });
}

export async function sendWeeklyReport(to: string, childName: string, reportHtml: string): Promise<void> {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `${childName}'s weekly Migo report`,
    html: reportHtml,
  });
}

export interface FeedbackEmailData {
  to: string;
  childName: string;
  childAge: number;
  childLanguage: string;
  parentEmail: string;
  childId: string;
  message: string;
  summary?: string;
  timestamp: string;
}

export async function sendFeedbackEmail(data: FeedbackEmailData): Promise<void> {
  await transporter.sendMail({
    from: FROM,
    to: data.to,
    subject: `Migo Feedback — ${data.childName} (age ${data.childAge})`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#7F77DD">Migo Feedback</h2>
        <p><strong>Child:</strong> ${data.childName}, age ${data.childAge}, language: ${data.childLanguage}</p>
        <p><strong>Parent email:</strong> ${data.parentEmail || '(unknown)'}</p>
        <p><strong>Child ID:</strong> <code>${data.childId}</code></p>
        <p><strong>Time:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
        ${data.summary ? `<p><strong>Summary:</strong></p><div style="background:#EEEDFE;border-radius:8px;padding:16px;color:#2C2C2A;margin-bottom:12px">${data.summary}</div>` : ''}
        <p><strong>Full transcript:</strong></p>
        <div style="background:#F8F7FF;border-radius:8px;padding:16px;color:#2C2C2A;white-space:pre-wrap">${data.message}</div>
      </div>
    `,
  });
}

export async function sendApprovalEmail(
  parentEmail: string,
  approvalToken: string,
  _childDeviceId?: string,
  language?: string,
): Promise<void> {
  const apiBase = process.env.BASE_URL || 'http://localhost:3001';
  const approveUrl = `${apiBase}/auth/approve?token=${approvalToken}`;
  const declineUrl = `${apiBase}/auth/decline?token=${approvalToken}`;
  const fr = language === 'fr';

  console.log(`[email] sendApprovalEmail called → to: ${parentEmail}, lang: ${language ?? 'en'}`);
  console.log(`[email]   approve URL: ${approveUrl}`);

  const subject = fr ? 'Votre enfant veut rejoindre Migo 🌟' : 'Your child wants to join Migo 🌟';
  const heading = fr ? 'Votre enfant veut rejoindre Migo !' : 'Your child wants to join Migo!';
  const intro   = fr
    ? 'Un monde social sûr et amusant pour les enfants de 5 à 12 ans. Des amis IA, aucun étranger réel, contrôle parental total.'
    : 'A safe, AI-powered social world for children aged 5–12. AI friends, no real strangers, full parent control.';
  const safetyPoints = fr
    ? [
        ['🚫', 'Aucun étranger réel',   'Votre enfant parle uniquement à des amis IA créés par nous — jamais à de vrais utilisateurs.'],
        ['👨‍👩‍👧', 'Tableau de bord parent', 'Consultez toutes les conversations et mettez l\'application en pause à tout moment.'],
        ['🏛️', 'Conforme RGPD',         'Conçu dès le départ pour respecter les lois sur la vie privée des enfants.'],
        ['🚨', 'Alertes d\'urgence',     'Notification immédiate si une conversation soulève une préoccupation.'],
      ]
    : [
        ['🚫', 'No real strangers',  'Your child only talks to AI friends we create — never real users.'],
        ['👨‍👩‍👧', 'Parent dashboard', 'You see every conversation and can pause the app any time.'],
        ['🏛️', 'COPPA compliant',    'Built from the ground up to meet children\'s privacy laws.'],
        ['🚨', 'Crisis alerts',      'Instant notification if any conversation raises a concern.'],
      ];
  const approveLabel = fr ? '✅ Oui, approuver Migo !' : '✅ Yes, approve Migo!';
  const declineLabel = fr ? 'Non merci — refuser cette demande' : 'No thanks — decline this request';
  const footerNote   = fr
    ? '🔒 Nous utilisons votre e-mail uniquement pour cette demande. Nous ne vous enverrons jamais de publicité et ne partagerons pas votre adresse.<br>Ce lien expire dans 48 heures.'
    : '🔒 We only use your email to ask for this permission. We will never send you marketing email or share your address.<br>This link expires in 48 hours.';

  try {
    const info = await transporter.sendMail({
    from: FROM,
    to: parentEmail,
    subject,
    html: `<!DOCTYPE html>
<html lang="${fr ? 'fr' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Migo Approval</title>
</head>
<body style="margin:0;padding:0;background:#F8F7FF;font-family:sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F7FF;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#7F77DD,#9B95E8);border-radius:20px 20px 0 0;padding:36px 40px;text-align:center">
          <span style="font-size:40px">🌈</span>
          <h1 style="margin:12px 0 0;color:#fff;font-size:28px;font-weight:800;letter-spacing:-0.5px">Migo</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#fff;padding:40px;border-radius:0 0 20px 20px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

          <h2 style="margin:0 0 16px;color:#2C2C2A;font-size:22px">${heading}</h2>
          <p style="margin:0 0 24px;color:#888780;font-size:15px;line-height:1.6">
            ${intro}
          </p>

          <!-- Safety points -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px">
            ${safetyPoints.map(([emoji, title, desc]) => `
            <tr><td style="padding:12px 16px;background:#F8F7FF;border-radius:12px;margin-bottom:8px;display:block">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td width="36" style="font-size:22px;vertical-align:top">${emoji}</td>
                <td style="vertical-align:top;padding-left:12px">
                  <strong style="color:#2C2C2A;font-size:14px">${title}</strong><br>
                  <span style="color:#888780;font-size:13px">${desc}</span>
                </td>
              </tr></table>
            </td></tr>
            <tr><td height="8"></td></tr>
            `).join('')}
          </table>

          <!-- Approve button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
            <tr><td align="center">
              <a href="${approveUrl}"
                style="display:inline-block;background:#5DCAA5;color:#fff;text-decoration:none;font-size:17px;font-weight:700;padding:18px 48px;border-radius:9999px;letter-spacing:0.2px">
                ${approveLabel}
              </a>
            </td></tr>
          </table>

          <!-- Decline link -->
          <p style="text-align:center;margin:0 0 32px">
            <a href="${declineUrl}" style="color:#BDBDBD;font-size:13px">${declineLabel}</a>
          </p>

          <!-- Footer -->
          <hr style="border:none;border-top:1px solid #EEEEEE;margin:0 0 24px">
          <p style="margin:0;color:#BDBDBD;font-size:12px;text-align:center;line-height:1.6">
            ${footerNote}
          </p>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
    console.log(`[email] ✅ Approval email sent → messageId: ${info.messageId}`);
  } catch (err) {
    const e = err as Error & { code?: string; responseCode?: number; response?: string };
    console.error('[email] ❌ sendMail failed:');
    console.error(`[email]   message:      ${e.message}`);
    console.error(`[email]   code:         ${e.code ?? 'none'}`);
    console.error(`[email]   responseCode: ${e.responseCode ?? 'none'}`);
    console.error(`[email]   response:     ${e.response ?? 'none'}`);
    throw err;
  }
}
