// @include helpers
// The style anchor slide's image (made first). If it failed, the set is made without an anchor.
const r = $input.first().json || {};
const msg = (r.choices && r.choices[0] && r.choices[0].message) || {};
const im = (msg.images || [])[0];
const url = im && ((im.image_url && im.image_url.url) || im.url);
let dataUrl = '';
if (url && /^data:/.test(url)) dataUrl = url;
else if (url) {
  try { dataUrl = 'data:image/png;base64,' + Buffer.from(await this.helpers.httpRequest({ url, method: 'GET', encoding: 'arraybuffer', json: false, timeout: 120000 })).toString('base64'); } catch (e) { /* no anchor */ }
}
const error = dataUrl ? '' : String(r.error ? (r.error.message || JSON.stringify(r.error)) : msg.content || 'no image returned').slice(0, 200);
return [{ json: { dataUrl, cost: Number(r.usage && r.usage.cost) || 0, error } }];
