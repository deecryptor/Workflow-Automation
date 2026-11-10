// @include helpers
// Validates the slideshow and prepares the Slides rows (old slides for this post are replaced).
// Each slide gets "Title" and "Body Text" fields (plus "Slide text", title + body, for tables that still have it);
// the image step renders them as a bold headline over smaller body text. Quality problems are listed as ⚠️ lines in the Posting log.

const { rowId, row } = ctx();
const { count, oldSlideIds, outline, outlinePoints, dense } = $('Build: Slides Request').first().json;
const long = dense !== false; // dense copy (the default) allows longer bodies
const out = extractJson(claudeText($input.first().json));
let slides = (out.slides || [])
  .map(s => {
    if (!s) return null;
    let title = txt(s.title); let body = txt(s.body);
    if (!title && txt(s.text)) { const [first, ...rest] = txt(s.text).split('\n'); title = txt(first); body = txt(rest.join(' ')); }
    return title ? { ...s, title, body } : null;
  })
  .filter(Boolean);
if (slides.length < 2) throw new Error('The slide writer returned fewer than 2 slides: ' + JSON.stringify(out).slice(0, 300));
slides = slides.slice(0, MAX_SLIDES).map((s, i, a) => {
  const role = i === 0 ? 'cover' : i === a.length - 1 ? 'cta' : 'body';
  const body = role === 'cover' ? '' : s.body;
  return { n: i + 1, role, section: txt(s.section), title: s.title, body, text: body ? `${s.title}\n${body}` : s.title, image_prompt: txt(s.image_prompt) };
});

const warnings = [];
// The cover's promise must match what follows: "5 mistakes" needs 5 body slides.
const WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const promised = (() => {
  // skips "#1", "$10", "2.5", and times/amounts like "30 days", "10%", "5 kg"
  const m = slides[0].title.toLowerCase().match(/(?<![#$£€\d.,])\b(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)\b(?![.,]\d)(?!\s*(%|percent|years?|yrs?|months?|weeks?|days?|hours?|minutes?|mins?|am|pm|kg|lbs?|k\b))/);
  const n = m ? (WORDS[m[1]] || Number(m[1])) : null;
  return n >= 2 && n <= 20 ? n : null;
})();
const bodySlides = slides.filter(s => s.role === 'body');
if (promised && promised !== bodySlides.length) warnings.push(`⚠️ The cover promises ${promised} but there are ${bodySlides.length} body slides. Edit the cover's Title and redo slide 1, or press ▶ Approve → create draft text again.`);

// With an outline: every section needs a slide, and the key points come from the summary's "Your outline"
if (outline) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const covered = slides.map(s => norm(s.section)).filter(Boolean);
  const missingSecs = (Array.isArray(out.outline_sections) ? out.outline_sections : []).map(txt).filter(Boolean)
    .filter(sec => !/call.?to.?action|\bcta\b/i.test(sec) && !covered.some(c => c && (c === norm(sec) || c.includes(norm(sec)) || norm(sec).includes(c))));
  if (missingSecs.length) warnings.push(`⚠️ No slide for these outline sections: ${missingSecs.join('; ')}. Raise Slide count (max ${MAX_SLIDES}) or edit the Slide flow in Narrative prompt, then press ▶ Approve → create draft text again.`);
  if (!outlinePoints) warnings.push('⚠️ Your summary has no "Your outline" section (it was written before outlines were supported), so the slides used the general facts. Press ▶ Brainstorm again for key points under each outline section.');
}

// Text that is too long to render well, or two items squeezed onto one slide.
const words = s => s.replace(/\*/g, '').replace(/^\s*[•\-]\s/gm, '').split(/\s+/).filter(Boolean).length;
const sentences = s => (s.match(/[^.!?]+[.!?]+(\s|$)/g) || (s ? [s] : [])).length;
for (const s of slides) {
  const p = [];
  if (s.role === 'cover' && words(s.title) > 12) p.push(`hook is ${words(s.title)} words (max 12)`);
  const maxT = long ? 10 : 6;
  if (s.role === 'body' && words(s.title.replace(/^\d+[.)]\s*/, '')) > maxT) p.push(`title is ${words(s.title)} words (max ${maxT})`);
  if (/swipe|→/i.test(s.title + ' ' + s.body)) p.push('has "Swipe" or an arrow in the text (the swipe prompt is added separately)');
  const bullets = (s.body.match(/^\s*[•\-]\s/gm) || []).length;
  // dense copy (the default): up to 6 bullets / 120 words (outline) or 5 / 100 (list); short and punchy: the old limits
  const maxB = outline ? 6 : 5, maxW = outline ? 120 : 100;
  if (s.role === 'body' && long && bullets) { if (bullets > maxB || words(s.body) > maxW) p.push(`body is ${bullets} bullets / ${words(s.body)} words (max ${maxB} / ${maxW})`); }
  else if (s.role === 'body' && long) { if (words(s.body) > maxW) p.push(`body is ${words(s.body)} words (max ${maxW})`); }
  else if (s.role === 'body' && outline && bullets) { if (bullets > 4 || words(s.body) > 30) p.push(`body is ${bullets} bullets / ${words(s.body)} words (max 4 / 30)`); }
  else if (s.role === 'body' && (sentences(s.body) > 2 || words(s.body) > (outline ? 30 : 25))) p.push(`body is ${sentences(s.body)} sentences / ${words(s.body)} words (max 2 / ${outline ? 30 : 25})`);
  if (s.role === 'body' && /\b\d+\s*(and|&|\+)\s*\d+\b/i.test(s.title)) p.push('looks like two items on one slide');
  if (p.length) warnings.push(`⚠️ Slide ${s.n}: ${p.join('; ')}. Edit its Title / Body Text before you press ▶ Approve draft text → make style preview (or later: tick Redo and press ↻ Redo images).`);
}
const warning = warnings.join('\n');

// the plan's Text style (or your edit of it), written into every slide's design
const textStyleNow = txt(row['Text style']);
const items = slides.map(s => ({
  Name: `${txt(row.Title).slice(0, 60)} · ${s.n}`,
  Content: [rowId],
  'Slide #': s.n,
  Role: opt('Role', s.role),
  Title: s.title,
  'Body Text': s.body,
  'Body text': s.body, // either spelling of the field works (Baserow ignores the one you don't have)
  'Slide text': s.text, // older tables; ignored once you delete the field
  'Image prompt': slideDesign(s.image_prompt, s.role, s.text, fitHandle(textStyleNow, row['Handle / series label'])),
  Redo: false,
}));

// the runner-up hooks go in the Posting log, in case you prefer one
const hooks = (Array.isArray(out.hook_options) ? out.hook_options : []).map(txt).filter(h => h && h.replace(/\*/g, '').toLowerCase() !== slides[0].title.replace(/\*/g, '').toLowerCase()).slice(0, 4);
const tags = (out.hashtags || []).map(t => (String(t).startsWith('#') ? t : '#' + t)).join(' ');
return [{
  json: {
    requested: count,
    warning,
    hooks,
    copy: { 'Post caption': txt(out.caption), Hashtags: tags },
    deleteUrl: `${B}/api/database/rows/table/${T.slides}/batch-delete/`,
    deleteBody: { items: oldSlideIds },
    hasOld: oldSlideIds.length > 0,
    createUrl: `${B}/api/database/rows/table/${T.slides}/batch/?user_field_names=true`,
    createBody: { items },
  },
}];
