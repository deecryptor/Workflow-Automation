// @include helpers
// @include video
// Sorts every reference into how it will be read:
//   articles → Tavily (already done); any article Tavily couldn't read → page reader
//   YouTube → transcript · podcasts → podcast transcript
//   TikTok / Instagram / X / LinkedIn / Threads / Facebook → page reader (caption, text, images) + video download if it's a video
//   uploaded files → by type (video, image, audio, PDF/Word/PowerPoint, text)

const { row } = ctx();
const extract = $('Tavily: Extract References').first().json || {};
const links = [...new Set(splitLinks(row['Reference links']))];
const articles = links.filter(u => refKind(u) === 'article');
const tavilyOk = new Set((extract.results || []).filter(r => r.url && String(r.raw_content || r.content || '').trim().length > 200).map(r => r.url));
const failedArticles = articles.filter(u => !tavilyOk.has(u));

const refs = links.filter(u => refKind(u) !== 'article').map(url => ({ kind: refKind(url), url, label: url }));
// pages to read: social posts + articles Tavily couldn't read
const pages = [
  ...refs.filter(r => SOCIAL.includes(r.kind)).map(r => ({ url: r.url, kind: r.kind, readUrl: readUrlFor(r.url, r.kind) })),
  ...failedArticles.map(url => ({ url, kind: 'article', readUrl: readUrlFor(url, 'article') })),
];
refs.push(...failedArticles.map(url => ({ kind: 'article', url, label: url })));

const fileKind = f => {
  const n = String(f.visible_name || f.name || '').toLowerCase(); const m = String(f.mime_type || '').toLowerCase();
  if (m.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv|avi)$/.test(n)) return 'video';
  if (m.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic)$/.test(n)) return 'image';
  if (m.startsWith('audio/') || /\.(mp3|m4a|wav|aac|ogg|opus|flac)$/.test(n)) return 'audio';
  if (/\.rtf$/.test(n) || /rtf/.test(m)) return 'rtf';
  if (/\.(txt|md|csv|srt|vtt|json|html?)$/.test(n) || m.startsWith('text/')) return 'text';
  return 'document'; // PDF, Word, PowerPoint…
};
const rawFiles = [...(Array.isArray(row['Reference files']) ? row['Reference files'] : []), ...(Array.isArray(row['Reference videos']) ? row['Reference videos'] : [])];
const files = rawFiles.filter(f => f && f.url).map(f => ({
  kind: 'file', fileKind: fileKind(f), label: f.visible_name || f.name || 'uploaded file',
  url: fileUrls([f])[0], size: f.size || 0, mime: f.mime_type || '',
}));
const tooBig = files.filter(f => f.size > 200 * 1024 * 1024);
const okFiles = files.filter(f => !tooBig.includes(f)).slice(0, 10);

const all = [...okFiles, ...refs].slice(0, 12);
return [{ json: {
  refs: all,
  pages: pages.filter(p => all.some(r => r.url === p.url)).slice(0, 8),
  files: all.filter(r => r.kind === 'file'),
  hasRefs: all.length > 0 || tooBig.length > 0,
  hasPages: pages.length > 0,
  // Instagram + TikTok posts also go to Scrape Creators (full carousels); the free reader stays as backup
  scPages: pages.filter(p => ['instagram', 'tiktok'].includes(p.kind) && all.some(r => r.url === p.url)).map(p => ({ url: p.url, kind: p.kind, api: p.kind === 'instagram' ? 'https://api.scrapecreators.com/v1/instagram/post' : 'https://api.scrapecreators.com/v2/tiktok/video' })),
  hasScPages: cfg.useScrapeCreators !== false && cfg.useScrapeCreators !== 'false' && pages.some(p => ['instagram', 'tiktok'].includes(p.kind)),
  // YouTube transcripts from Scrape Creators first (1 credit; Magica's transcript is the backup)
  ytRefs: all.filter(r => r.kind === 'youtube').map(r => r.url),
  hasYt: cfg.useScrapeCreators !== false && cfg.useScrapeCreators !== 'false' && all.some(r => r.kind === 'youtube'),
  skipped: tooBig.map(f => `${f.label} (over 200 MB)`),
} }];
