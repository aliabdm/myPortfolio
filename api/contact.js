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

  // Malicious content check
  const linkCount = (message.match(/https?:\/\//gi) || []).length;
  if (linkCount > 2 || /<[^>]+>/.test(message)) {
    return res.status(400).json({ error: 'Too many links or HTML detected' });
  }

  try {
    const formData = new URLSearchParams({
      name,
      email,
      subject: `[Portfolio] ${subject}`,
      message,
    });

    const response = await fetch('https://formsubmit.co/ajax/aliabdm@gmail.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const result = await response.json();

    if (result.success === 'true' || result.success === true) {
      return res.status(200).json({ ok: true });
    }

    throw new Error(result.message || 'Formsubmit error');
  } catch (err) {
    console.error('Contact error:', err);
    return res.status(500).json({ error: 'Failed to send message. Please try again later.' });
  }
}
