// @include helpers
// @include video
// Pulls the caption/text and the images out of each page the reader returned.
const pages = $('Explode Pages').all().map(i => i.json);
const out = $input.all().map((it, i) => {
  const p = pages[i];
  const raw = it.json.body !== undefined ? it.json.body : it.json;
  const err = it.json.error ? (it.json.error.message || JSON.stringify(it.json.error)).slice(0, 200) : '';
  let caption = '', text = '', images = [], hasVideo = false, videoUrl = '';
  if (p.kind === 'twitter') {
    let j = raw; try { if (typeof raw === 'string') j = JSON.parse(raw); } catch (e) { j = {}; }
    caption = txt(j.text || j.full_text);
    const media = j.mediaDetails || [];
    images = [...media.filter(m => m.type === 'photo').map(m => m.media_url_https), ...(j.photos || []).map(ph => ph.url)].filter(Boolean);
    hasVideo = media.some(m => m.type === 'video' || m.type === 'animated_gif') || !!j.video;
    // X video: the best-quality mp4, so Qwen can watch it directly
    const variants = [...media.flatMap(m => (m.video_info && m.video_info.variants) || []), ...((j.video && j.video.variants) || [])]
      .map(v => ({ url: v.url || v.src, type: v.content_type || v.type, rate: v.bitrate || 0 })).filter(v => v.url && /mp4/.test(v.type || v.url));
    if (variants.length) videoUrl = variants.sort((x, y) => y.rate - x.rate)[0].url;
    if (j.quoted_tweet && j.quoted_tweet.text) caption += `\n(quoting: ${j.quoted_tweet.text})`;
  } else {
    const b = typeof raw === 'string' ? raw : JSON.stringify(raw || '');
    const title = (b.match(/^Title:\s*(.+)$/m) || [])[1] || '';
    caption = txt(title.replace(/^.*? on (Instagram|TikTok|Threads|Facebook|LinkedIn):\s*/i, '').replace(/^"|"$/g, ''));
    // keep only the post itself: drop "more posts", comments and footers
    const md = (b.split(/Markdown Content:\s*/)[1] || b)
      .split(/\n(More posts from|See more posts|Related posts|You might also like)\b/i)[0];
    const postPart = p.kind === 'article' ? md : md.split(/\n\nLike\n\nReply\n/)[0];
    images = [...postPart.matchAll(/!\[([^\]]*)\]\((https:[^)\s]+)\)/g)]
      .filter(m => !/profile picture|avatar|logo|icon|emoji/i.test(m[1]) && !/s150x150|\.svg|emoji|static\.cdninstagram|rsrc\.php/i.test(m[2]))
      .map(m => m[2]);
    hasVideo = /\.mp4|video_url|"is_video":true|Video by|Watch on (TikTok|Instagram)/i.test(postPart);
    text = (p.kind === 'article' ? md : postPart)
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(Log In|Sign Up|Sign up|Log in|Never miss a post from \S+|Sign up for \w+ to stay in the loop\.|Follow|•)/g, ' ')
      .replace(/^[ \t]*[*\-•][ \t]*$/gm, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 500000); // full page (social pages are already cut at the comments)
  }
  images = [...new Set(images)].slice(0, 10);
  const ok = !!(caption || text.length > 200 || images.length);
  return { url: p.url, kind: p.kind, ok, caption, text, images, hasVideo, videoUrl, error: ok ? '' : (err || 'nothing readable on the page (login wall or private post?)') };
});
return [{ json: { pages: out } }];
