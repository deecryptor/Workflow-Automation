// Scrape Creators returns the full post (every carousel slide, caption, video or not).
// Its results replace the free page reader's for Instagram and TikTok; on any failure the page reader's result stays.
const base = $('Parse Pages').first().json.pages;
const sc = $('Explode SC Posts').all().map(i => i.json);
const res = $input.all().map(i => i.json);
const first = (...v) => v.find(x => typeof x === 'string' && x.trim()) || '';
const urlOf = x => (x && (x.url_list || x.urlList || [])[0]) || (typeof x === 'string' ? x : '');

function parseInstagram(r) {
  const d = r.data || r;
  const m = d.xdt_shortcode_media || d.shortcode_media || d.media || d;
  if (!m || (!m.display_url && !m.edge_sidecar_to_children && !m.carousel_media && !m.video_url)) return null;
  const caption = first(m.edge_media_to_caption && m.edge_media_to_caption.edges && m.edge_media_to_caption.edges[0] && m.edge_media_to_caption.edges[0].node.text, m.caption && m.caption.text, m.caption);
  const kids = (m.edge_sidecar_to_children && m.edge_sidecar_to_children.edges || []).map(e => e.node)
    .concat((m.carousel_media || []).map(c => ({ is_video: c.media_type === 2 || !!c.video_versions, display_url: c.display_url || (c.image_versions2 && c.image_versions2.candidates && c.image_versions2.candidates[0] && c.image_versions2.candidates[0].url) })));
  const images = kids.length ? kids.filter(k => !k.is_video).map(k => k.display_url).filter(Boolean) : (m.is_video ? [] : [m.display_url].filter(Boolean));
  const hasVideo = kids.length ? kids.some(k => k.is_video) && !images.length : !!m.is_video;
  // a single video (Reel): its direct link, so Qwen can watch it without Magica's downloader
  const videoUrl = !kids.length && m.is_video ? first(m.video_url, m.video_versions && m.video_versions[0] && m.video_versions[0].url) : '';
  return { caption, images, hasVideo, videoUrl, slides: kids.length || 1 };
}
function parseTikTok(r) {
  const a = r.aweme_detail || (r.data && r.data.aweme_detail) || r.itemInfo && r.itemInfo.itemStruct || null;
  if (!a) return null;
  const ip = a.image_post_info || a.imagePost || {};
  const imgs = (ip.images || a.image_infos || []).map(im => urlOf(im.display_image) || urlOf(im.owner_watermark_image) || urlOf(im.imageURL) || urlOf(im)).filter(Boolean);
  const v = a.video || {};
  const videoUrl = imgs.length ? '' : first(urlOf(v.play_addr), urlOf(v.download_addr), urlOf(v.playAddr), v.playAddr, v.downloadAddr);
  return { caption: first(a.desc, a.description), images: imgs, hasVideo: !imgs.length, videoUrl, slides: imgs.length || 1 };
}

const pages = base.map(p => ({ ...p }));
sc.forEach((s, i) => {
  const r = res[i] || {};
  if (r.error || r.success === false) return; // keep the page reader's result
  const got = s.kind === 'instagram' ? parseInstagram(r) : parseTikTok(r);
  if (!got) return;
  const p = pages.find(x => x.url === s.url);
  if (!p) return;
  p.caption = got.caption || p.caption;
  p.images = got.images.slice(0, 10);
  p.hasVideo = got.hasVideo;
  if (got.videoUrl) p.videoUrl = got.videoUrl;
  p.ok = true; p.error = ''; p.source = 'Scrape Creators';
  if (got.images.length > 10) p.note = `first 10 of ${got.images.length} slides`;
});
return [{ json: { pages } }];
