export default async function handler(req, res) {
  const articles = { Medium: [], 'Dev.to': [] };
  const fetchWithTimeout = (url, options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timeout));
  };

  const settledJson = async url => {
    try {
      const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error(`Article source failed (${url}):`, error.message);
      return null;
    }
  };

  const [devto, medium] = await Promise.all([
    settledJson('https://dev.to/api/articles?username=maliano63717738&per_page=6'),
    // The unofficial Medium JSON endpoint is retained for compatibility, but RSS is the supported fallback.
    settledJson('https://medium.com/@aliabdm/latest?format=json')
  ]);

  if (Array.isArray(devto)) {
    devto.slice(0, 6).forEach(a => articles['Dev.to'].push({
      title: a.title,
      link: a.url,
      image: a.cover_image || a.social_image || null,
      date: a.published_at,
      source: 'Dev.to',
      description: a.description
    }));
  }

  if (medium?.payload?.references?.Post) {
    try {
      const posts = medium.payload.references.Post;
      Object.values(posts).slice(0, 6).forEach(post => {
        const publishedAt = Number(post.firstPublishedAt);
        articles.Medium.push({
          title: post.title,
          link: post.uniqueSlug
            ? `https://medium.com/@aliabdm/${post.uniqueSlug}-${post.id}`
            : `https://medium.com/p/${post.id}`,
          image: post.virtuals?.previewImage?.imageId
            ? `https://miro.medium.com/v2/resize:fit:800/${post.virtuals.previewImage.imageId}`
            : null,
          date: Number.isFinite(publishedAt) ? new Date(publishedAt).toISOString() : null,
          source: 'Medium',
          description: post.virtuals?.subtitle || ''
        });
      });
    } catch (error) {
      console.error('Failed to normalize Medium articles:', error);
    }
  }

  // Medium documents profile RSS feeds for website integrations; do not depend on its private JSON endpoint.
  if (articles.Medium.length === 0) {
    try {
      const response = await fetchWithTimeout('https://medium.com/feed/@aliabdm', {
        headers: { Accept: 'application/rss+xml, application/xml, text/xml' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const xml = await response.text();
      // Avoid an XML package dependency: extract RSS item fields while handling CDATA and namespaces.
      const decode = value => value
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .trim();
      const field = (item, name) => decode(
        item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || ''
      );
      const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(match => match[1]);

      items.slice(0, 6).forEach(item => {
        const content = field(item, 'content:encoded');
        const description = field(item, 'description');
        const image = content.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ||
          description.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || null;
        const date = new Date(field(item, 'pubDate'));
        articles.Medium.push({
          title: field(item, 'title'),
          link: field(item, 'link'),
          image,
          date: Number.isNaN(date.getTime()) ? null : date.toISOString(),
          source: 'Medium',
          description: description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
        });
      });
    } catch (error) {
      console.error('Failed to fetch or parse Medium RSS feed:', error);
    }
  }

  articles.Medium.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  articles['Dev.to'].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  return res.status(200).json({
    Medium: articles.Medium.slice(0, 6),
    'Dev.to': articles['Dev.to'].slice(0, 6)
  });
}
