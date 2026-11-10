// @include helpers
// @include pptx
// Editable slides: one .pptx per slide size with every slide's current art and its Title / Body Text as real text
// boxes. Rebuilt after every image run (preview, the other slides, redo), so it always matches the Slides table.
const { row } = ctx();
const sizes = slideSizes(row);
const all = $('Baserow: Get Slide (images)').all().map(i => i.json).filter(r => r && r.id)
  .sort((a, b) => Number(a['Slide #']) - Number(b['Slide #']));
// images made in this run (not saved in the rows we read yet)
const made = {};
const ups = $('Baserow: Upload Slide Image').all().map(i => i.json || {});
$('Collect Images').all().forEach((it, i) => { const q = it.json; if (ups[i] && ups[i].url) made[`${q.slideId}|${q.size}`] = fileUrls([ups[i]])[0]; });
const existing = (r, size) => {
  const files = (Array.isArray(r.Image) ? r.Image : []).filter(f => f && f.url);
  const f = size === '9:16' ? files.find(x => /9x16/.test(x.visible_name || '')) || (sizes.length === 1 ? files[0] : null) : files.find(x => !/9x16/.test(x.visible_name || '')) || files[0];
  return f ? fileUrls([f])[0] : '';
};
// slides the image check found too light (or dark) behind the text get a stronger shade
const strong = new Set();
if ($('OpenRouter: Check Image').isExecuted) {
  const reqs = $('Build Image Checks').all().map(i => i.json);
  $('OpenRouter: Check Image').all().forEach((it, i) => {
    try { const r = extractJson((it.json.choices && it.json.choices[0].message.content) || ''); if (r.text_area_ok === false && reqs[i]) strong.add(reqs[i].slideId); } catch (e) { /* no result */ }
  });
}
const get = async url => Buffer.from(await this.helpers.httpRequest({ url, method: 'GET', encoding: 'arraybuffer', json: false, timeout: 60000 }));
const spec = textSpec(fitHandle(txt(row['Text style']), row['Handle / series label']));
const copy = multi(row['Copy from reference']);
const extras = copy.includes('Extras');
const opts = { spec, total: all.length, handle: txt(row['Handle / series label']), extras, swipe: extras, title: txt(row.Title) };
const slug = (txt(row.Title) || 'slides').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'slides';
const out = [];
try {
  for (const size of sizes) {
    const slides = [];
    for (const r of all) {
      const url = made[`${r.id}|${size}`] || existing(r, size);
      let image = null;
      if (url) { try { image = await get(url); } catch (e) { image = null; } }
      slides.push({ n: Number(r['Slide #']), role: (r.Role && r.Role.value) || r.Role || 'body', text: slideText(r), image, strongShade: strong.has(r.id) });
    }
    const buf = buildPptx(slides, { ...opts, size });
    const name = `${slug}-${sizeTag(size)}.pptx`;
    const data = await this.helpers.prepareBinaryData(buf, name, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    out.push({ json: { name, size, slides: slides.length, withArt: slides.filter(s => s.image).length }, binary: { data } });
  }
} catch (e) {
  return [{ json: { error: 'Editable slides (.pptx) not made: ' + String(e.message || e).slice(0, 200) } }];
}
return out;
