// @include helpers
// One update per slide: its image(s) go into the Image field (with "Both": the 4:5 and the 9:16 version).
// Image URL holds the main version (4:5 when made); the 9:16 version's link goes in "Image URL 9:16" if that field exists.
const prep = $('Collect Images').all().map(i => i.json);
const bySlide = new Map();
$input.all().forEach((it, i) => {
  const f = it.json || {}; const p = prep[i];
  if (!f.name) throw new Error(`Baserow didn't accept the image for slide ${p.n}${p.both ? ` (${p.size})` : ''}: ${JSON.stringify(f).slice(0, 300)}`);
  if (!bySlide.has(p.slideId)) bySlide.set(p.slideId, []);
  bySlide.get(p.slideId).push({ ...p, file: f.name, imageUrl: f.url || '' });
});
return [...bySlide.entries()].map(([slideId, ims]) => {
  ims.sort((a, b) => (a.size === '4:5' ? 0 : 1) - (b.size === '4:5' ? 0 : 1));
  const body = { Image: ims.map(im => ({ name: im.file, visible_name: im.name || `slide-${im.n}.jpg` })), 'Image URL': ims[0].imageUrl, Redo: false };
  const tall = ims.find(im => im.size === '9:16');
  if (ims.length > 1 && tall) body['Image URL 9:16'] = tall.imageUrl;
  return { json: { url: rowUrl(T.slides, slideId), body } };
});
