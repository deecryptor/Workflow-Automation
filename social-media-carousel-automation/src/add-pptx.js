// @include helpers
// Puts the editable .pptx file(s) into the post's "Editable slides" field, next to the Status / Posting log update.
const fin = $('Finish Render').first().json;
const built = $('Build PPTX').all().map(i => i.json);
const ups = $input.all().map(i => i.json || {});
const nm = f => (ctx().names || {})[f] || f;
const body = { ...fin.body };
const ok = ups.map((u, i) => ({ u, b: built[i] || {} })).filter(x => x.u && x.u.name && !x.b.error);
if (ok.length) body[nm('Editable slides')] = ok.map(x => ({ name: x.u.name, visible_name: x.b.name }));
const err = built.find(b => b.error) || (!ok.length ? { error: `Editable slides (.pptx) not uploaded: ${JSON.stringify(ups[0] || {}).slice(0, 150)}` } : null);
if (ok.length) body['Posting log'] = String(body['Posting log']).replace(/\n|$/, ` · editable slides: ${ok.map(x => x.b.name).join(', ')}\n`);
if (err) body['Posting log'] = String(body['Posting log']).replace(/\n|$/, ` · ⚠️ ${err.error}\n`);
return [{ json: { url: fin.url, body } }];
