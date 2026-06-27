import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, subject, message, website } = req.body;

  // Honeypot
  if (website) {
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

  const linkCount = (message.match(/https?:\/\//gi) || []).length;
  if (linkCount > 2 || /<[^>]+>/.test(message)) {
    return res.status(400).json({ error: 'Too many links or HTML detected' });
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

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Email error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
}
