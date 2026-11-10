// @include helpers
// Instagram (API with Instagram Login): one container per carousel image, or one Reel container.
if (!cfg.igUserId) throw new Error('Set igUserId in the Config node (your Instagram professional account ID) before posting to Instagram.');
const job = $input.first().json;
const base = `https://graph.instagram.com/${cfg.igApiVersion || 'v23.0'}`;
const m = job.manifest;
if (job.igAs === 'Reel') {
  return [{ json: { url: `${base}/${cfg.igUserId}/media`, body: { media_type: 'REELS', video_url: m.video_url, caption: m.caption.slice(0, 2200), share_to_feed: true } } }];
}
const imgs = m.images.slice(0, 10);
if (imgs.length < 2) throw new Error('An Instagram carousel needs at least 2 slides.');
return imgs.map(u => ({ json: { url: `${base}/${cfg.igUserId}/media`, body: { image_url: u, is_carousel_item: true } } }));
