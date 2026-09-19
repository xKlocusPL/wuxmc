import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const app = express();
const PORT = process.env.PORT || 3000;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || 'RivMC <onboarding@resend.dev>';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN.split(',').map(x => x.trim()) }));
app.use(express.json({ limit: '20kb' }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
app.use('/api/send-code', limiter);

app.get('/health', (req, res) => res.json({ ok: true, service: 'RivMC email backend' }));

app.post('/api/send-code', async (req, res) => {
  try {
    if (!RESEND_API_KEY) return res.status(500).json({ ok: false, error: 'Brak RESEND_API_KEY na backendzie.' });
    const { email, code, name, mode } = req.body || {};
    if (!email || !code) return res.status(400).json({ ok: false, error: 'Brak adresu e-mail lub kodu.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Nieprawidłowy adres e-mail.' });
    if (!/^[A-Z0-9]{6}$/i.test(String(code))) return res.status(400).json({ ok: false, error: 'Nieprawidłowy kod.' });

    const subject = mode === 'register' ? 'Potwierdź adres e-mail — RivMC' : 'Kod logowania — RivMC';
    const intro = mode === 'register'
      ? `Cześć ${String(name || email).slice(0, 80)},\n\nWitamy na RivMC! Chcemy mieć pewność, że otrzymaliśmy prawidłowy adres e-mail.`
      : 'Witamy na RivMC! Chcemy mieć pewność, że otrzymaliśmy prawidłowy adres e-mail.';
    const text = `${intro}\n\nTwój kod: ${String(code).toUpperCase()}\n\nKod jest ważny przez 15 minut.`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, to: [email], subject, text })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Resend error:', response.status, data);
      return res.status(502).json({ ok: false, error: data?.message || 'Resend odrzucił wiadomość.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Backend error:', error);
    return res.status(500).json({ ok: false, error: 'Błąd backendu.' });
  }
});

app.listen(PORT, () => console.log(`RivMC email backend listening on ${PORT}`));
