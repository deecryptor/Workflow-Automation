// @include helpers// One Nano Banana Pro request (OpenRouter) per slide and size (Slide size "Both" makes a 4:5 and a 9:16 version of every slide). With reference images it uses the image-to-image model so slides
// copy your look; without, text-to-image. The slide text is drawn on the image by the model, following the
// row's Text style (and the Text style reference image, sent last as a typography-only reference).

const { row } = ctx();
const job = $('Collect Render Job').first().json;
const refInfo = $('List Reference Images').first().json;
const refItems = $('Refs To Data URI').isExecuted ? $('Refs To Data URI').all().map(i => i.json) : [];
const refUrls = { cover: [], slide: [], text: [] };
const own = {}; // slideId → that slide's own reference images
refItems.forEach(r => {
  if (!r || !r.dataUrl) return;
  if (r.kind === 'own') (own[r.slideId] = own[r.slideId] || []).push(r.dataUrl);
  else (refUrls[r.kind] || refUrls.slide).push(r.dataUrl);
});

// Style anchor: one slide every other slide copies, so the set looks like one series. "Build Anchor Run" (same code)
// makes just that slide first; here the rest follow it. A redo uses an existing slide you kept as the anchor.
const pick = $('Pick Style Anchor').isExecuted ? $('Pick Style Anchor').first().json : {};
const made = $('Anchor Result').isExecuted ? $('Anchor Result').first().json : null;
const anchorPhase = !!pick.needGen && !made;
const anchorUrl = pick.dataUrl || (made && made.dataUrl) || '';
const anchorN = pick.n;

const sizes = slideSizes(row);
const style = refInfo.imageStyle;
const total = Math.max(...job.slides.map(s => s.n), job.slides.length);
// one medium for the whole set (photo OR illustration OR typographic art, never mixed)
const medium = imageMedium(style);
const photo = isPhotoMedium(medium);
const art = photo ? 'photo' : 'artwork';
// "Recreate the scene (same person)": every cover rebuilds your cover reference (same character, setting, framing)
// so the account has one recognisable face/look. Otherwise cover references only lend their style.
const recreateCover = /recreate/i.test(sel(row['Cover reference use']));
const handleNow = txt(row['Handle / series label']);
const textStyle = fitHandle(txt(row['Text style']), handleNow);
const copyParts = multi(row['Copy from reference']);
const extras = copyParts.includes('Extras');
const handle = handleNow;
// textMode "pptx" (default): the art is text-free and the words go into an editable .pptx; "image": text drawn on the image
const pptxMode = String(cfg.textMode || 'pptx') !== 'image';
const textRef = pptxMode ? [] : refUrls.text.slice(0, 1);

// The photo must fill the frame, and the model must not paint an app screen around it.
const frame = size => [
  `The ${art} fills the entire ${size} canvas edge to edge. No borders, margins, plain bands above or below, frames, cards, poster layouts or letterboxing. The text sits directly on the ${art} (a soft gradient that blends into it is fine).`,
  'This is the image itself, not a screenshot: no phone, no app interface, no Instagram, TikTok, Story or Reel elements (no usernames, profile pictures, progress bars, buttons, icons, message boxes or captions).',
  'Single image only: no collages, no grids, no split frames, no multiple panels.',
];

const slidesNow = anchorPhase ? job.slides.filter(s => s.slideId === pick.slideId) : job.slides;
const sizesFor = s => (anchorPhase ? sizes.slice(0, 1) : sizes);
return slidesNow.flatMap(s => sizesFor(s).map(size => {
  // the anchor slide was already made in the first pass: pass its image through (a 1-token call keeps items lined up)
  if (!anchorPhase && made && made.dataUrl && s.slideId === pick.slideId && size === sizes[0]) {
    return { json: { slideId: s.slideId, n: s.n, size, both: sizes.length > 1, refCount: 0, prompt: '(made first, as the style anchor for the set)', precomputed: made.dataUrl, cost: made.cost || 0,
      body: { model: cfg.orTextModel || 'deepseek/deepseek-v4.1-flash-1017', max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] } } };
  }
  const sceneRefs = s.role === 'cover' ? (refUrls.cover.length ? refUrls.cover : refUrls.slide) : (refUrls.slide.length ? refUrls.slide : refUrls.cover);
  const mine = own[s.slideId] || [];
  // this slide's own reference comes first and wins over the post's references
  const recreate = !mine.length && recreateCover && s.role === 'cover' && refUrls.cover.length > 0;
  const scene = mine.length ? [...mine, ...sceneRefs].slice(0, 3) : recreate ? refUrls.cover.slice(0, 1) : sceneRefs.slice(0, 3);
  const useAnchor = !!anchorUrl && !anchorPhase && s.n !== anchorN;
  const images = [...(useAnchor ? [anchorUrl] : []), ...scene, ...textRef];

  const place = size === '9:16'
    ? 'Place all text between about 15% and 75% of the image height, away from the edges; the photo continues behind and around it.'
    : 'Keep generous margins between the text and the edges.';
  // Title (headline) + Body Text (smaller text below it; bullet lines stay on their own lines). *word* = highlight.
  const [first, ...rest] = String(s.text || '').split('\n');
  const title = String(first || '').trim();
  // one bullet or sentence per line, so the spacing between them can be even
  let lines = rest.map(l => l.trim()).filter(Boolean);
  if (lines.length === 1) lines = lines[0].split(/(?<=[.!?])\s+(?=["“'*A-Z0-9])/).map(l => l.trim()).filter(Boolean);
  const bodyText = lines.join('\n');
  const parts = splitDesign(s.image_prompt);
  parts.design = fitHandle(parts.design, handle); // older prompts may still say [handle]
  const tc = textColour(parts.design || textStyle);
  const colourName = tc.colour ? `${tc.colour}` : 'the body text colour';
  const contrast = tc.tone === 'light'
    ? `CONTRAST: the text is light (${colourName}), so the area behind every word must be dark: place the text over a darker part of the ${art}, or add a soft dark gradient behind the text block that blends into the ${art}. Never light text on a light, pale or busy background.`
    : tc.tone === 'dark'
      ? `CONTRAST: the text is dark (${colourName}), so the area behind every word must be light: place the text over a light, calm part of the ${art}, or add a soft light gradient behind the text block. Never dark text on a dark or busy background.`
      : 'CONTRAST: every word must stand out clearly from what is behind it: put the text over a calm area that contrasts with the text colour, adding a soft gradient behind the text block if needed.';
  const textRules = `TEXT RULES (identical on every slide of the set): the title and body always use the colours the text design gives, never a different text colour on some slides. Bullet markers are always ${colourName === 'the body text colour' ? 'the body text colour' : `the body text colour (${colourName})`}, whatever the design says, and the same marker on every line. Every bullet or sentence starts on its own line, with the same clear gap (about half a line) between each one and a bigger gap between the title and the body. Line spacing about 1.4.`;
  const look = parts.design ? 'following the TEXT DESIGN above' : textStyle ? 'following the TEXT STYLE above' : 'as large, bold, highly readable typography with strong contrast';
  const textRule = bodyText
    ? `Draw the title "${title}" ${look}, and below it the body text "${bodyText}" in a smaller size of the same style${/\n/.test(bodyText) ? ', each line on its own line with even spacing between lines' : ''}. Clear hierarchy, spelled exactly as written.`
    : `Draw this text ${look}, spelled exactly as written: "${title}"`;
  const highlight = /\*[^*]+\*/.test(s.text || '')
    ? 'Words between asterisks are highlighted: draw them in the highlight colour of the text style (or a bolder weight in an accent colour). Never draw the asterisks themselves.'
    : '';
  // Only YOUR handle / series label ever appears (from the field); a reference's own name, handle or logo never does.
  const handleRule = handle
    ? `Write "${handle}" once, small and unobtrusive: styled and placed as the TEXT DESIGN / TEXT STYLE describes it if it does, otherwise in a bottom corner. It is the only name, handle, label or logo allowed on the image.`
    : 'No handles, usernames, series names, brand names, logos or watermarks anywhere.';
  const extraRule = extras
    ? `Add the small extras the text style describes (a page counter reads "${s.n}/${total}"). ${s.n === 1 ? 'If the text style has a swipe prompt, show it on this slide.' : 'No swipe prompt on this slide (it only goes on slide 1).'} ${handleRule}`
    : `No page counters, swipe prompts or watermarks. ${handleRule}`;
  const refNote = [
    useAnchor ? (pptxMode ? `The FIRST reference image is slide ${anchorN} of this same set: match it exactly for medium, rendering style, palette, lighting and where the calm empty text area sits, so the slides look like one series. Draw a new scene.` : `The FIRST reference image is slide ${anchorN} of this same set: match it exactly for medium, rendering style, palette, lighting, text colours, fonts, bullet markers, text placement and spacing, so the slides look like one series. Draw a new scene and this slide's own words; never copy its words.`) : '',
    mine.length ? `The ${useAnchor ? 'next' : 'first'} ${mine.length > 1 ? mine.length + ' reference images are' : 'reference image is'} this slide's own reference from the producer: follow ${mine.length > 1 ? 'them' : 'it'} closely for the scene, subject, composition and look.${scene.length > mine.length ? ' The other scene reference images only lend the overall colour palette and lighting.' : ''} Never copy text, logos, handles or watermarks from any reference.` : scene.length ? (recreate ? 'Recreate the FIRST reference image as closely as possible: the same person, same setting, same composition, same lighting and same framing, with only minor natural variations in pose or expression. This is for brand consistency.' : `Match the colour palette, lighting and mood of the ${useAnchor ? 'next' : 'first'} ${scene.length > 1 ? scene.length + ' reference images' : 'reference image'}, but with a new scene.${photo ? '' : ` Draw it as ${medium} even if a reference is a photo.`}`) : '',
    textRef.length ? `The ${scene.length ? 'LAST' : 'only'} reference image is a TYPOGRAPHY reference: copy only its text styling (font, colours, effects, placement). Do not copy its photo, scene, people, words, logos, handles or watermarks.` : '',
  ].filter(Boolean).join(' ');

  // text-free background art: the same calm text area on every slide, matching where the .pptx puts the words
  const zone = s.role === 'cover' ? 'upper 60%' : 'upper 70%';
  // light (white) text is the default for the editable slides, so the text area must come out dark
  const lightText = tc.tone !== 'dark';
  const space = lightText
    ? `TEXT SPACE (same layout on every slide): white text will be placed over the ${zone} of the frame, so that area must be DARK and calm: deep, low-key tones (deep teal, navy, charcoal, dark sage, dusk, night or shadow), with no bright, pale, white or cream areas, no bright sky or window and no busy detail there. Keep the whole image fairly low-key so every slide matches. Put the subject of the scene in the lower part of the frame.`
    : `TEXT SPACE (same layout on every slide): dark text will be placed over the ${zone} of the frame, so that area must be LIGHT and calm: soft, pale tones with no dark or busy detail there. Put the subject of the scene in the lower part of the frame.`;
  const prompt = pptxMode ? [
    `A vertical ${size} ${photo ? 'photo' : 'image'} used as the background art for ${s.role === 'cover' ? 'the cover of' : s.role === 'cta' ? 'the last slide of' : 'one slide of'} a ${total}-slide slideshow. The words are added later in an editor, so the image itself has NO text.`,
    `ONE LOOK FOR THE WHOLE SET: every slide uses the same medium (${medium}), in the same rendering style, palette and lighting. ${photo ? 'Never an illustration, drawing, cartoon or 3D render.' : 'Never a photograph or photo-realistic image.'}`,
    style ? `Visual style for every slide: ${style}` : '',
    recreate ? '' : `Scene (${photo ? 'a real-life lifestyle photo; no symbolic props or visual metaphors' : `drawn as ${medium}, not a photo`}): ${parts.scene}`,
    txt(s.note) ? `Changes the producer wants on this slide (these take priority): ${txt(s.note)}` : '',
    space,
    refNote,
    `The ${art} fills the entire ${size} canvas edge to edge. No borders, margins, plain bands, frames, cards, poster layouts or letterboxing.`,
    frame(size)[1], frame(size)[2],
    'NO TEXT ANYWHERE: no letters, words, numbers, captions, signs or labels with writing, logos, handles or watermarks. No recognisable real or famous people.',
  ].filter(Boolean).join('\n') : [
    `A vertical ${size} ${photo ? 'photo' : 'image'} with a text overlay, for ${s.role === 'cover' ? 'the cover of' : s.role === 'cta' ? 'the last slide of' : 'one slide of'} a ${total}-slide slideshow. Never write slide numbers or labels like "Slide 2" on the image.`,
    `ONE LOOK FOR THE WHOLE SET: every slide uses the same medium (${medium}), in the same rendering style, palette and lighting. ${photo ? 'Never an illustration, drawing, cartoon or 3D render.' : 'Never a photograph or photo-realistic image.'}`,
    style ? `Visual style for every slide: ${style}` : '',
    recreate ? '' : `Scene (${photo ? 'a real-life lifestyle photo; no symbolic props or visual metaphors' : `drawn as ${medium}, not a photo`}): ${parts.scene}`,
    txt(s.note) ? `Changes the producer wants on this slide (these take priority): ${txt(s.note)}` : '',
    parts.design ? `TEXT DESIGN (follow it exactly for all on-image text: font, weights, sizes, colours, highlight, alignment): ${parts.design}` : textStyle ? `TEXT STYLE (follow it for all on-image text): ${textStyle}` : '',
    textRule,
    textRules,
    contrast,
    highlight,
    place,
    refNote,
    ...frame(size),
    extraRule,
    'No other text. No recognisable real or famous people.',
  ].filter(Boolean).join('\n');

  // the reference images go in as image parts, in order (scene refs first, the typography ref last)
  const body = {
    model: cfg.orImageModel || 'google/gemini-nano-banana-2.1',
    modalities: ['image', 'text'],
    image_config: { aspect_ratio: size, image_size: /^[124]K$/.test(String(cfg.imageResolution)) ? cfg.imageResolution : '2K' },
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))] }],
  };
  return { json: { slideId: s.slideId, n: s.n, size, both: sizes.length > 1, refCount: images.length, prompt, body } };
}));
