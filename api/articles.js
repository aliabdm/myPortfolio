export default async function handler(req, res) {
  try {
    const articles = [];

    // ===== Dev.to (API رسمي) =====
    const devtoRes = await fetch(
      'https://dev.to/api/articles?username=maliano63717738&per_page=5'
    );

    if (devtoRes.ok) {
      const devto = await devtoRes.json();
      devto.forEach(a => {
        articles.push({
          title: a.title,
          link: a.url,
          image: a.cover_image,
          date: a.published_at,
          source: 'Dev.to',
          description: a.description
        });
      });
    }

    // ===== Medium (JSON trick) =====
    const mediumRes = await fetch(
      'https://medium.com/@aliabdm/latest?format=json'
    );

    if (mediumRes.ok) {
      const text = await mediumRes.text();
      const json = JSON.parse(
        text.replace('])}while(1);</x>', '')
      );

      const posts = json.payload.references.Post;

      Object.values(posts).slice(0, 5).forEach(post => {
        articles.push({
          title: post.title,
          link: `https://medium.com/p/${post.id}`,
          image: post.virtuals.previewImage?.imageId
            ? `https://miro.medium.com/max/800/${post.virtuals.previewImage.imageId}`
            : null,
          date: new Date(post.firstPublishedAt).toISOString(),
          source: 'Medium',
          description: post.virtuals.subtitle
        });
      });
    }

    // ترتيب
    articles.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json(articles.slice(0, 6));
  } catch (e) {
    res.status(500).json({ error: 'Failed to load articles' });
  }
}
