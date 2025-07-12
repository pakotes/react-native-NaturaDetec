function stripHtml(html) {
  if (!html || html.trim() === '') return null;
  const cleaned = html.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
  return cleaned === '' ? null : cleaned;
}
module.exports = stripHtml;