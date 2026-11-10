// @include helpers
// Turns the vision check results into ⚠️ lines for the Posting log. A check that fails to run is noted, never fatal.
const reqs = $('Build Image Checks').all().map(i => i.json);
const warnings = [];
let skipped = 0;
$input.all().forEach((it, i) => {
  const n = reqs[i] ? `${reqs[i].n}${reqs[i].both ? ` (${reqs[i].size})` : ''}` : '?';
  let r = null;
  try { r = extractJson((it.json.choices && it.json.choices[0].message.content) || ''); } catch (e) { r = null; }
  if (!r) { skipped++; return; }
  const p = [];
  if (r.ui === true) p.push('app/Reel interface drawn on the image');
  if (r.not_full_bleed === true) p.push('photo does not fill the frame (borders or bands)');
  if (r.collage === true) p.push('collage or split frame');
  if (r.text_ok === false) p.push(String(cfg.textMode || 'pptx') !== 'image' ? 'text drawn on the art (it should be text-free)' : 'text doesn\'t match the Title / Body Text');
  if (r.foreign_label === true) p.push('a handle, logo or label that isn\'t yours');
  if (r.text_area_ok === false) p.push(`the text area is too ${reqs[i] && reqs[i].lightText === false ? 'dark' : 'light'} for the text (the Editable slides file uses a stronger shade behind the text on this slide)`);
  if (p.length) warnings.push(`⚠️ Slide ${n} image: ${p.join('; ')}${txt(r.notes) ? ` (${txt(r.notes)})` : ''}. Tick Redo on that slide and press ↻ Redo images.`);
});
if (skipped) warnings.push(`(image check couldn't run on ${skipped} slide${skipped > 1 ? 's' : ''})`);
return [{ json: { warnings } }];
