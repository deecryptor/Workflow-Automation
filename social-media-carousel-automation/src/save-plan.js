// @include helpers
// Writes the plan into empty fields and sets sensible defaults for format, size and posting.

const { row, patchUrl } = ctx();
const { missing } = $('Build: Plan Request').first().json;
const p = extractJson(claudeText($input.first().json));
const map = { 'Niche': p.niche, 'Narrative prompt': p.narrative_prompt, 'Format prompt': p.format_prompt, 'Image style': p.image_style };

const body = { Status: opt('Status', 'Plan ready') };
for (const f of missing) if (txt(map[f])) body[f] = txt(map[f]);

// defaults only for fields your table still has
const has = f => Object.prototype.hasOwnProperty.call(row, f);
if (has('Format') && !sel(row.Format)) body.Format = opt('Format', 'Carousel');
if (!sel(row['Slide size'])) {
  // Instagram's API only accepts 4:5 to 1.91:1 for carousel images; TikTok handles 4:5 fine.
  body['Slide size'] = opt('Slide size', '4:5 (Instagram + TikTok)'); // default; pick 9:16 or Both yourself
}
// N list items + cover + takeaway slide
const fromPlan = Number(p.item_count) ? Number(p.item_count) + 2 : Number(p.slide_count);
// the number you asked for wins (Slide count, or "10 slides" in your request); otherwise the plan's
if (!Number(row['Slide count'])) body['Slide count'] = wantedSlides(row) || Math.min(MAX_SLIDES, Math.max(3, fromPlan || 7));
if (!txt(row.Angle) && txt(p.angle)) body.Angle = txt(p.angle);
if (has('Posting mode') && !sel(row['Posting mode'])) body['Posting mode'] = opt('Posting mode', 'Save drafts only');
if (has('Instagram as') && !sel(row['Instagram as'])) body['Instagram as'] = opt('Instagram as', 'Carousel');

// Text style read from the row's "Text style reference" (only when that field was empty).
if ($('OpenRouter: Read Text Style').isExecuted && !txt(row['Text style'])) {
  const r = $('OpenRouter: Read Text Style').first().json || {};
  const t = txt(r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content);
  if (t) body['Text style'] = t.replace(/^text style:\s*/i, '');
}
// No reference: the strategist's typography goes into Text style (only if that field is still empty).
if (!txt(row['Text style']) && !body['Text style'] && txt(p.text_style)) body['Text style'] = txt(p.text_style).replace(/^text style:\s*/i, '');

return [{ json: { url: patchUrl, body } }];
