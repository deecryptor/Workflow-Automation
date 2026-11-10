// @include helpers
// The style anchor: one slide every other slide copies (medium, palette, text colours, bullets, spacing).
// Redo: an existing slide you didn't tick (the look you kept). Full render: the first list slide is made first.
const job = $('Collect Render Job').first().json;
if (cfg.styleAnchor === false || cfg.styleAnchor === 'false' || !job.slides.length) return [{ json: { needGen: false } }];
// the style preview itself is made on its own, without an anchor (older images on other slides are not used)
if (ctx().action === 'images' && job.slides.length === 1) return [{ json: { needGen: false } }];
const all = $('Baserow: Get Slide (images)').isExecuted ? $('Baserow: Get Slide (images)').all().map(i => i.json) : [];
const rendering = new Set(job.slides.map(s => s.slideId));
const role = r => (r.Role && r.Role.value) || r.Role || 'body';
const kept = all.filter(r => r && r.id && !rendering.has(r.id) && fileUrls(r.Image).length)
  .sort((a, b) => (role(a) === 'body' ? 0 : 1) - (role(b) === 'body' ? 0 : 1) || Number(a['Slide #']) - Number(b['Slide #']));
for (const r of kept.slice(0, 2)) {
  const files = r.Image.filter(f => f && f.url);
  const f = files.find(x => !/9x16/.test(x.visible_name || '')) || files[0];
  try {
    const buf = Buffer.from(await this.helpers.httpRequest({ url: fileUrls([f])[0], method: 'GET', encoding: 'arraybuffer', json: false, timeout: 60000 }));
    const h = buf.slice(0, 4).toString('latin1');
    const mime = h.startsWith('\x89PNG') ? 'image/png' : h.startsWith('RIFF') ? 'image/webp' : 'image/jpeg';
    return [{ json: { needGen: false, n: Number(r['Slide #']), from: 'kept slide', dataUrl: `data:${mime};base64,${buf.toString('base64')}` } }];
  } catch (e) { /* try the next kept slide */ }
}
if (job.slides.length < 2) return [{ json: { needGen: false } }];
const first = job.slides.find(s => s.role === 'body') || job.slides[0];
return [{ json: { needGen: true, slideId: first.slideId, n: first.n, from: 'made first' } }];
