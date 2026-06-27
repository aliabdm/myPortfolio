import nodemailer from 'nodemailer';

// In-memory rate limiter (resets on Vercel cold start)
const rateMap = new Map();

function isRateLimited(ip) {
  const key = ip;
  const now = Date.now();
  const window = 3600000; // 1 hour
  const maxReqs = 3;

  if (!rateMap.has(key)) {
    rateMap.set(key, []);
  }

  const times = rateMap.get(key).filter(t => now - t < window);
  times.push(now);
  rateMap.set(key, times);

  return times.length > maxReqs;
}

export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS / origin check (optional but recommended)
  const origin = req.headers['origin'] || req.headers['referer'] || '';
  const allowedDomains = [
    'senior-mohammad-ali.vercel.app',
    'localhost',
    '127.0.0.1',
  ];
  const isAllowed = allowedDomains.some(d => origin.includes(d));
  if (!isAllowed) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
          || req.headers['x-real-ip']
          || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const { name, email, subject, message, website, _gotcha } = req.body;

  // Honeypot — if either hidden field is filled, ignore silently
  if (website || _gotcha) {
    return res.status(200).json({ ok: true });
  }

  // Validation
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (name.length > 80 || subject.length > 120 || message.length > 1800) {
    return res.status(400).json({ error: 'One or more fields exceed max length' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  // Malicious content check
  if ((message.match(/https?:\/\//gi) || []).length > 2 || /<[^>]+>/.test(message)) {
    return res.status(400).json({ error: 'Too many links or HTML detected' });
  }

  // Block common spam patterns
  const spamPatterns = [/\[url=/i, /crypto/i, /bitcoin/i, /click here/i, /act now/i, /congratulations/i];
  for (const pattern of spamPatterns) {
    if (pattern.test(message) || pattern.test(name) || pattern.test(subject)) {
      return res.status(400).json({ error: 'Message flagged as spam' });
    }
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Portfolio Contact" <${process.env.SMTP_USER}>`,
      to: 'aliabdm@gmail.com',
      replyTo: email,
      subject: `[Portfolio] ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
      html: `<p><strong>Name:</strong> ${name}</p>
             <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
             <hr>
             <p>${message.replace(/\n/g, '<br>')}</p>`,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Email error:', err);
    return res.status(500).json({ error: 'Failed to send message' });
  }
}
