// ---------- shared helpers (inlined into Code nodes at build time) ----------
const cfg = $('Config').first().json;
const T = { content: Number(cfg.contentTableId), slides: Number(cfg.slidesTableId) };
let OPT = {};
try { OPT = typeof cfg.selectOptions === 'string' ? JSON.parse(cfg.selectOptions || '{}') : (cfg.selectOptions || {}); } catch (e) { OPT = {}; }

const B = String(cfg.baserowUrl || 'http://host.docker.internal:85').replace(/\/+$/, '');
const rowUrl = (table, id) => `${B}/api/database/rows/table/${table}/${id}/?user_field_names=true`;
const rowsUrl = table => `${B}/api/database/rows/table/${table}/?user_field_names=true`;
// Single/multiple select: send the option id when known (from setup), otherwise the option text.
const opt = (field, value) => (OPT[field] && OPT[field][value] !== undefined ? OPT[field][value] : value);
const sel = v => (v && typeof v === 'object' ? v.value : v) || '';
// Slide size: 4:5, 9:16 or Both -> the sizes to make (4:5 first)
const slideSizes = row => { const v = sel(row['Slide size']); return /both/i.test(v) ? ['4:5', '9:16'] : String(v).trim().startsWith('9:16') ? ['9:16'] : ['4:5']; };
const sizeTag = size => (size === '9:16' ? '9x16' : '4x5');
const multi = v => (Array.isArray(v) ? v.map(x => (x && typeof x === 'object' ? x.value : x)).filter(Boolean) : []);
const linkIds = v => (Array.isArray(v) ? v.map(x => (x && typeof x === 'object' ? x.id : x)).filter(Boolean) : []);
// Baserow file URLs point at the browser address (localhost); n8n runs in Docker, so rewrite them.
const fileUrls = v => (Array.isArray(v) ? v : []).map(f => f && f.url).filter(Boolean)
  .map(u => u.replace(String(cfg.baserowPublicUrl || 'http://localhost:85').replace(/\/+$/, ''), B));
const txt = v => (v === null || v === undefined ? '' : String(v)).trim();

function claudeBody(system, user, maxTokens) {
  return { model: cfg.llmModel, max_tokens: maxTokens || Number(cfg.maxTokens) || 64000, system, messages: [{ role: 'user', content: user }] };
}
function claudeText(resp) {
  if (!resp || resp.type === 'error' || resp.error) throw new Error('LLM API error: ' + JSON.stringify((resp && resp.error) || resp).slice(0, 800));
  if (resp.stop_reason === 'max_tokens') throw new Error('Claude ran out of tokens mid-answer. Raise maxTokens in the Config node.');
  return (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}
function extractJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const s = t.indexOf('{'); const e = t.lastIndexOf('}');
  if (s === -1 || e <= s) throw new Error('No JSON object in model output: ' + t.slice(0, 400));
  try { return JSON.parse(t.slice(s, e + 1)); } catch (err) { throw new Error('Model returned invalid JSON (' + err.message + '): ' + t.slice(s, s + 400)); }
}
// Finds the first media URL anywhere in a model's output.
function findUrl(x, re) {
  re = re || /^https?:\/\//i;
  if (!x) return null;
  if (typeof x === 'string') return re.test(x) ? x : null;
  if (Array.isArray(x)) { for (const v of x) { const u = findUrl(v, re); if (u) return u; } return null; }
  if (typeof x === 'object') {
    for (const k of ['images', 'image', 'image_url', 'imageUrl', 'url', 'urls', 'output', 'result', 'video', 'video_url']) {
      if (k in x) { const u = findUrl(x[k], re); if (u) return u; }
    }
    for (const v of Object.values(x)) { const u = findUrl(v, re); if (u) return u; }
  }
  return null;
}
const ctx = () => $('Check Action').first().json;
// A slide's Image prompt = SCENE (the photo) + TEXT DESIGN (font, sizes, colours, highlight, layout), so you can
// review and edit both before any image is made. The image step follows whatever the field says.
const DEFAULT_TEXT_STYLE = 'Font: Montserrat (a clean geometric sans-serif), sentence case. Title in ExtraBold, body in Regular. Text colour with strong contrast to the photo: charcoal #222222 on light areas, white #FFFFFF on dark areas. Highlight colour: the accent colour of the image style. Left-aligned, no boxes or outlines, a soft shadow only if needed for contrast.';
const ROLE_SIZES = {
  cover: 'Sizes: the hook is the headline, the largest text of the whole set, about two-thirds of the image width, at most 4 short lines. No body text.',
  body: 'Sizes: the title is a bold headline about 60% of the cover headline size; the body text sits right below it in the same font, regular weight, about half the title size, short lines of up to about 8 words.',
  cta: 'Sizes: the takeaway is a bold headline about the size of a list-slide title; the save/share line sits below it at about half that size.',
};
function slideDesign(scene, role, text, textStyle) {
  const hl = /\*[^*]+\*/.test(text || '') ? ' Words between asterisks are highlighted in the highlight colour (never draw the asterisks).' : '';
  return `SCENE: ${String(scene || '').trim()}\nTEXT DESIGN: ${String(textStyle || '').trim() || DEFAULT_TEXT_STYLE} ${ROLE_SIZES[role] || ROLE_SIZES.body}${hl}`;
}
// The standard the producer's own edits set for slide copy (used by the research summary, the plan and the slide writer).
const DEPTH_STANDARD = 'Every point explains what happens AND why or how (the mechanism: the chain of cause and effect, step by step); names the specific things this topic involves (e.g. for health: conditions, foods, body parts, tests; for money: accounts, fees, rates, steps; for skills: tools, techniques, mistakes); gives concrete numbers with units where the material has them (amounts, minutes, times per week, percentages, dollars, years); explains each technical term in plain words in brackets, e.g. "visceral fat (fat around your organs)" or "APR (the yearly cost of borrowing)"; and turns advice into a clear action (what to do, how much, how often). State well-supported facts plainly ("contributes to", "raises the risk of"); hedge only weak or creator claims, and briefly.';
// Slide titles the producer prefers: clear, searchable labels that name the topic, never teasers.
const TITLE_STANDARD = 'Titles are clear, searchable labels or questions that name THIS post\'s topic in the words people search. The style, shown on other topics (adapt it to this topic, never copy these): health: "What happens when you are insulin resistant?", "Signs and symptoms of insulin resistance", "How to reverse insulin resistance"; money: "What happens when you only pay the minimum?", "Signs your budget is leaking money", "How to build an emergency fund". Never vague teasers like "So what goes wrong?" or "Signs worth asking about".';
// Short, punchy copy only when you ask for it ("quick tips", "short and punchy", "bite-sized", "one-liners"); otherwise dense and educational.
function shortCopy(row) {
  return /\b(quick tips?|short (?:and|&) punchy|punchy|bite[- ]?sized|short copy|minimal text|one[- ]liners?)\b/i.test(`${txt(row['Research request'])}\n${txt(row['Style direction'])}`);
}
// The ONE medium every slide of a post uses: the Image style's "Medium: …" line, else guessed from its words.
function imageMedium(style) {
  const s = txt(style);
  const m = s.match(/^\s*medium\s*:\s*([^\n.]+)/im);
  if (m) return m[1].trim();
  const ill = s.match(/[^.]*?\b(illustrat\w*|vector|flat design|cartoon|hand-drawn|drawing|watercolou?r|gouache|line art|3d render\w*|claymation)\b[^.,]*/i);
  if (ill) return `illustration (${ill[0].trim().slice(0, 100)})`;
  if (/\btypograph/i.test(s) && !/photo/i.test(s)) return 'typographic art on a plain or softly textured background (no photo)';
  return 'real-life photograph';
}
const isPhotoMedium = m => /photo/i.test(m) && !/illustrat|no photo/i.test(m);
// The main text colour in a text design, and whether it is light or dark (decides what goes behind the text).
function textColour(design) {
  const sents = (txt(design).match(/[^.\n]*\b(text|font|copy|title|headline|body)\b[^.\n]*/gi) || []).filter(x => !/bullet|highlight|accent|handle|counter/i.test(x));
  const t = sents.join(' ');
  const hex = (t.match(/#[0-9a-f]{6}\b/i) || [])[0];
  if (hex) {
    const n = parseInt(hex.slice(1), 16);
    const L = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    return { colour: hex.toUpperCase(), tone: L > 0.6 ? 'light' : L < 0.4 ? 'dark' : '' };
  }
  const w = (t.match(/\b(off-white|white|cream|ivory|black|charcoal|navy)\b/i) || [])[0];
  return w ? { colour: w.toLowerCase(), tone: /white|cream|ivory/i.test(w) ? 'light' : 'dark' } : { colour: '', tone: '' };
}
// A slide's text from the Slides table: "Title" + "Body Text" (older slides: "Slide text", title on the first line).
// Inside the workflow it travels as one string: the title, then the body on the following line(s).
function slideText(r) {
  const title = txt(r.Title); const body = txt(r['Body Text'] !== undefined ? r['Body Text'] : r['Body text']);
  if (title || body) return body ? `${title}\n${body}` : title;
  return txt(r['Slide text']);
}
// The text style calls the handle "[handle]" (it's read from a reference, never copied). Your own Handle / series label
// goes in its place; with no handle, the sentences about it are dropped so the model never draws one.
function fitHandle(style, handle) {
  const s = String(style || '');
  if (!/\[handle\]/i.test(s)) return s;
  const h = txt(handle);
  if (h) return s.replace(/\[handle\]/gi, `"${h.replace(/"/g, "'")}"`);
  return s.replace(/[^.!?\n]*\[handle\][^.!?\n]*(?:[.!?]+|$)[ \t]*/gim, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
// Splits a saved Image prompt back into its two parts (older slides have only a scene).
function splitDesign(p) {
  const s = String(p || '');
  const m = /^\s*SCENE:\s*([\s\S]*?)\n\s*TEXT DESIGN:\s*([\s\S]*)$/i.exec(s);
  return m ? { scene: m[1].trim(), design: m[2].trim() } : { scene: s.trim(), design: '' };
}
// What the research depends on: if any of these change, research saved from a failed run is not reused.
// Most slides in one post (Instagram carousels take up to 20).
const MAX_SLIDES = Number(cfg.maxSlides) || 20;
// The number of slides you asked for: Slide count, else "10 slides" / "slides: 10" in Content Research or Style direction. 0 = not set.
function wantedSlides(row) {
  const fit = n => Math.min(MAX_SLIDES, Math.max(3, n));
  if (Number(row['Slide count'])) return fit(Number(row['Slide count']));
  const t = `${txt(row['Research request'])}\n${txt(row['Style direction'])}`;
  const m = t.match(/\b(\d{1,2})[\s-]*slides?\b/i) || t.match(/\bslides?(?:\s*count)?\s*[:=]\s*(\d{1,2})\b/i);
  return m && Number(m[1]) >= 3 ? fit(Number(m[1])) : 0;
}
// Your "Suggested outline: …" (or "Outline: …") in the research request, up to the next "Label:" line.
function outlineOf(request) {
  const m = String(request || '').match(/^[ \t]*(?:suggested\s+)?outline\s*[:\-]\s*([\s\S]*?)(?=\n[ \t]*[A-Z][\w ()/'-]{0,40}:\s|$)/im);
  return m ? m[1].trim() : '';
}
// The angle line Brainstorm suggests at the top of the summary.
function suggestedAngle(brief) {
  const m = String(brief || '').match(/^##\s*Suggested angle\s*\n([\s\S]*?)(?=\n##\s|$)/im);
  return m ? m[1].replace(/^\s*[-*]\s*/gm, '').trim() : '';
}
// Your own angle: what's in Angle, unless it's still just the suggestion from the last Brainstorm.
function ownAngle(row) {
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const a = norm(txt(row.Angle));
  return a && a !== norm(suggestedAngle(txt(row['Research brief']))) ? a : '';
}
function researchKey(row) {
  const files = f => (Array.isArray(f) ? f.map(x => `${x.visible_name || x.name || ''}:${x.size || ''}`).join('|') : '');
  const s = JSON.stringify([row.Title, row['Research request'], row['Style direction'], row['Reference links'], files(row['Reference files']), files(row['Reference videos']), ownAngle(row)].map(v => (typeof v === 'string' ? v.trim() : v || '')));
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36) + ':' + s.length;
}
// Steps 2-3 work from the parts of the brief written for slides (Slideshow pack, references, caveats),
// not the whole article. Older briefs without a Slideshow pack are used whole.
function briefForWriters(brief) {
  const b = txt(brief);
  const sec = {};
  b.split(/^(?=## )/m).forEach(s => { const h = (s.match(/^## (.+)/) || [])[1]; if (h) sec[h.trim().toLowerCase().replace(/’/g, "'")] = s.trim(); });
  if (!sec['slideshow pack']) return b;
  return ['in one line', 'your outline', 'slideshow pack', 'from your references', "don't overstate"].map(k => sec[k]).filter(Boolean).join('\n\n');
}
// ---------- end helpers ----------
