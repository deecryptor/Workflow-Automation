// @include helpers
// Keeps only the slides you ticked "Redo" on (with your edited text / prompt).
const all = $input.all().map(i => i.json).filter(r => r && r.id);
// "Approve draft text → make draft images": only the style preview (the first list slide), so you can approve the look
// "Approve look → make the other slides": every slide except the preview, which they copy
// "Redo images": only the ticked slides
const action = ctx().action;
const anchorOn = cfg.styleAnchor !== false && cfg.styleAnchor !== 'false';
const bySlide = [...all].sort((a, b) => Number(a['Slide #']) - Number(b['Slide #']));
const roleOf = r => (r.Role && r.Role.value) || r.Role || 'body';
const preview = bySlide.find(r => roleOf(r) === 'body') || bySlide[0] || {};
const previewMade = fileUrls(preview.Image).length > 0;
const want = r => {
  if (action === 'images') return !anchorOn || all.length < 2 || r.id === preview.id;
  if (action === 'look') return !anchorOn || !previewMade || r.id !== preview.id;
  return r.Redo === true || r.Redo === 'true';
};
const ticked = all.filter(want)
  .map(r => ({
    slideId: r.id,
    n: Number(r['Slide #']),
    role: (r.Role && r.Role.value) || r.Role || 'body',
    text: slideText(r),
    image_prompt: r['Image prompt'],
    // optional, per slide: your own reference image(s) and a note for this slide's next render
    ownRefs: fileUrls(r['Redo reference image']).slice(0, 2),
    note: txt(r['Redo note']),
  }));
return [{ json: { ticked, count: ticked.length, previewN: Number(preview['Slide #']) || 0, previewMade } }];
