// @include helpers
// Takes each image Nano Banana Pro returned (a data URL, or a link) and turns it into a file for Baserow.
// If any slide has no image, the run stops with a clear message (the row is marked "Needs attention").
const reqs = $('Build Image Runs').all().map(i => i.json);
const items = $input.all();
const out = []; const failed = [];
for (let i = 0; i < items.length; i++) {
  const q = reqs[i] || {}; const r = items[i].json || {};
  const label = `slide ${q.n}${q.both ? ` (${q.size})` : ''}`;
  const ch = r.choices && r.choices[0];
  const msg = (ch && ch.message) || {};
  const im = (msg.images || [])[0];
  // the style anchor slide was made first; its image comes through here
  const url = q.precomputed || (im && ((im.image_url && im.image_url.url) || im.url));
  if (!url) {
    const why = r.error ? (r.error.message || JSON.stringify(r.error)) : msg.content ? `no image; the model said "${String(msg.content).slice(0, 120)}"` : 'no image returned';
    failed.push(`${label}: ${String(why).slice(0, 200)}`); continue;
  }
  let buf; let mime = 'image/png';
  const m = /^data:([^;,]+);base64,/.exec(url);
  if (m) { mime = m[1]; buf = Buffer.from(url.slice(m[0].length), 'base64'); } else { buf = Buffer.from(await this.helpers.httpRequest({ url, method: 'GET', encoding: 'arraybuffer', json: false, timeout: 120000 })); mime = /\.png(\?|$)/i.test(url) ? 'image/png' : 'image/jpeg'; }
  const name = `slide-${q.n}${q.both ? '-' + sizeTag(q.size) : ''}.${/png/.test(mime) ? 'png' : 'jpg'}`;
  const data = await this.helpers.prepareBinaryData(buf, name, mime);
  out.push({ json: { slideId: q.slideId, n: q.n, size: q.size, both: q.both, name, cost: (Number(r.usage && r.usage.cost) || 0) + (Number(q.cost) || 0) }, binary: { data } });
}
if (failed.length) throw new Error('Image generation failed: ' + failed.join('; '));
return out;
