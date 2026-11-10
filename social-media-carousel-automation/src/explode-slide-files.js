const p = $('Finalize Plan').first().json;
const nn = s => String(s.n).padStart(2, '0');
// with "Both": 01-slide-4x5.jpg and 01-slide-9x16.jpg
return [...p.slides.flatMap(s => (p.both && s.url916
  ? [{ json: { url: s.url, name: `${nn(s)}-slide-4x5.jpg` } }, { json: { url: s.url916, name: `${nn(s)}-slide-9x16.jpg` } }]
  : [{ json: { url: s.url, name: `${nn(s)}-slide.jpg` } }])),
  // the editable slides (.pptx), when made
  ...(p.pptx || []).map(f => ({ json: { url: f.url, name: f.name } }))];
