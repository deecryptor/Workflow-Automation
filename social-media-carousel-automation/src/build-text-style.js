// @include helpers
// Step 2: reads the row's "Text style reference" image(s) and asks a vision model to describe ONLY the on-image
// text styling (font, colours, effects, layout), so every slide can follow it. Runs only when there is a
// reference and the "Text style" field is empty, so your own edits to Text style are kept.

const { row } = ctx();
const refs = fileUrls(row['Text style reference']).slice(0, 2);
const orOn = cfg.useOpenRouter !== false && cfg.useOpenRouter !== 'false';
if (!refs.length || txt(row['Text style']) || !orOn) return [{ json: { need: false } }];

const ALL = ['Font', 'Colours', 'Text effects', 'Layout & placement'];
const chosen = multi(row['Copy from reference']);
const parts = chosen.length ? chosen : ALL;
const extras = parts.includes('Extras');
const handle = txt(row['Handle / series label']);

const get = async url => Buffer.from(await this.helpers.httpRequest({ url, method: 'GET', encoding: 'arraybuffer', json: false, timeout: 60000 }));
const mimeOf = (buf, url) => (buf.slice(0, 4).toString('latin1') === '\x89PNG' || /\.png(\?|$)/i.test(url) ? 'image/png' : buf.slice(8, 12).toString('latin1') === 'WEBP' ? 'image/webp' : 'image/jpeg');
const images = [];
for (const u of refs) {
  try { const b = await get(u); images.push(`data:${mimeOf(b, u)};base64,${b.toString('base64')}`); } catch (e) { /* skip one that won't download */ }
}
if (!images.length) return [{ json: { need: false, note: 'Text style reference could not be downloaded from Baserow.' } }];

const ask = {
  'Font': 'the font: its category (geometric / rounded / grotesk / serif / mono / handwritten), the closest Google Font by name, weight, case (lowercase / sentence / UPPER), relative size and line spacing',
  'Colours': 'colours as hex: main text colour, the colour of any highlighted words, and colours of boxes, outlines or glows',
  'Text effects': 'effects: background box or pill (colour, corner radius, padding), outline or stroke, drop shadow, glow, grain',
  'Layout & placement': 'layout: alignment, which part of the frame the text sits in, how wide the text block is, and the hierarchy between title, body and small labels',
  'Extras': 'small extras (page counter, swipe prompt, series label, handle or logo) and where each sits. Never write the reference\'s own username, series name, brand or logo: call any of them [handle]',
};
const prompt = `You are a typographer. Describe ONLY the on-image text styling of this social media slide, so an image model can reproduce it on new slides with different words and a different photo.
Cover: ${parts.filter(p => ask[p]).map(p => ask[p]).join('; ')}.
${extras ? '' : handle ? 'Ignore page counters, swipe prompts and watermarks. If there is a handle, series label or logo, describe only its size, styling and where it sits, calling it [handle]; never write its actual words.\n' : 'Ignore logos, usernames, handles, series labels, watermarks, page counters and swipe prompts completely.\n'}Do not describe the photo, scene or people. Do not quote the slide's words.
Reply in 60-120 words of plain text, written as instructions, starting with "Text style:".`;

const model = cfg.orVisionModel || cfg.orImageFallbackModel || 'anthropic/claude-haiku-5.5';
return [{ json: { need: true, parts, body: { model, temperature: 0.2, max_tokens: 1200, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))] }] } } }];
