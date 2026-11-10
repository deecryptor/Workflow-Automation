// @include helpers
const job = $('IG Start').first().json;
const base = `https://graph.instagram.com/${cfg.igApiVersion || 'v23.0'}`;
const ids = $input.all().map(i => i.json.id);
if (ids.some(x => !x)) throw new Error('Instagram rejected a media item: ' + JSON.stringify($input.all().map(i => i.json)).slice(0, 500));
if (job.igAs === 'Reel') return [{ json: { isCarousel: false, creationId: ids[0] } }];
return [{ json: { isCarousel: true, url: `${base}/${cfg.igUserId}/media`, body: { media_type: 'CAROUSEL', children: ids.join(','), caption: job.manifest.caption.slice(0, 2200) } } }];
