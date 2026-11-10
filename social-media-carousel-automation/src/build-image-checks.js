// @include helpers
// After rendering: a vision model looks at each new slide for the mistakes image models make (app/Reel UI
// painted in, borders or letterbox bands, collages, text that doesn't match the Slide text). Results are
// flagged as ⚠️ lines in the Posting log; nothing is redone automatically. Set useOpenRouter to false to skip.

const orOn = cfg.useOpenRouter !== false && cfg.useOpenRouter !== 'false';
const ups = $('Collect Images').all().map(i => i.json);
const files = $('Baserow: Upload Slide Image').all().map(i => i.json || {});
const job = $('Collect Render Job').first().json;
if (!orOn || cfg.checkImages === false || cfg.checkImages === 'false' || !ups.length) return [{ json: { skip: true } }];

const row = ctx().row || {};
const handle = txt(row['Handle / series label']);
const extras = multi(row['Copy from reference']).includes('Extras');
const total = Math.max(...job.slides.map(s => s.n), job.slides.length);
const model = cfg.orVisionModel || cfg.orImageFallbackModel || 'anthropic/claude-haiku-5.5';
const out = [];
for (let i = 0; i < ups.length; i++) {
  const u = ups[i];
  // the image is on Baserow (localhost), so it is sent embedded
  let imageUrl = '';
  try { const b = Buffer.from(await this.helpers.httpRequest({ url: fileUrls([files[i]])[0], method: 'GET', encoding: 'arraybuffer', json: false, timeout: 60000 })); imageUrl = `data:${files[i].mime_type || 'image/png'};base64,${b.toString('base64')}`; } catch (e) { continue; }
  const slide = job.slides.find(s => s.slideId === u.slideId) || {};
  const expected = String(slide.text || '').replace(/\*/g, '');
  const textFree = String(cfg.textMode || 'pptx') !== 'image'; // background art: it should have no text at all
  const lightText = textColour(fitHandle(txt(row['Text style']), handle)).tone !== 'dark';
  const zone = slide.role === 'cover' ? 'upper 60%' : 'upper 70%';
  const prompt = `You are checking a generated vertical social media slide image before it is posted.
${textFree ? 'This is background art: it must contain NO text at all (the words are added later in an editor).' : `Expected on-image text (exact): "${expected}"`}
Allowed small extra text: ${textFree ? 'none' : ([extras ? `a page counter like "${slide.n}/${total}"${slide.n === 1 ? ' and a swipe prompt' : ''}` : '', handle ? `the label "${handle}"` : ''].filter(Boolean).join(' and ') || 'none')}.
Answer with JSON only:
{"ui": true if any phone or app interface is drawn (usernames, profile pictures, progress bars, close or like buttons, "Send message" boxes, captions, status bar),
 "not_full_bleed": true if the photo does not fill the whole frame (borders, plain bands above or below, a picture inside a frame or card, letterboxing),
 "collage": true if it shows more than one panel, grid or split frame,
 "text_ok": ${textFree ? 'true only if there is no text, letters, numbers or writing anywhere in the image' : 'true only if the main text matches the expected text with no misspelled, missing, extra or repeated words (ignore the allowed small extras)'},
 "foreign_label": true if the image shows any handle, @username, website, brand name, logo, watermark or series name${handle ? ` other than "${handle}"` : ''},
${textFree ? ` "text_area_ok": ${lightText ? `true only if the ${zone} of the image is dark and calm enough that WHITE text placed over it would be easy to read (false if it is light, pale, bright or busy there)` : `true only if the ${zone} of the image is light and calm enough that DARK text placed over it would be easy to read`},\n` : ''} "notes": "max 15 words on what is wrong, empty if nothing"}`;
  out.push({ json: { skip: false, n: u.n, size: u.size, both: u.both, slideId: u.slideId, lightText, body: { model, temperature: 0, max_tokens: 400, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageUrl } }] }] } } });
}
return out.length ? out : [{ json: { skip: true } }];
