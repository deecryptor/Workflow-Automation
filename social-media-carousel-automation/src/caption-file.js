// A caption.txt in the Drive folder, ready to copy when posting by hand.
const p = $('Finalize Plan').first().json;
const text = [
  p.title, '',
  'CAPTION (copy-paste):', p.caption, '',
  `Slides: ${p.slides.length} · Size: ${p.both ? '4:5 + 9:16' : p.size} · Format: ${p.format}`,
  'TikTok: turn on "AI-generated content" (More options) before posting.',
  ...p.slides.map(s => `${s.n}. ${String(s.text || '').replace(/\*/g, '').replace(/\n/g, ' — ')}`),
].join('\n');
const binary = { data: await this.helpers.prepareBinaryData(Buffer.from(text, 'utf8'), 'caption.txt', 'text/plain') };
return [{ json: { name: 'caption.txt' }, binary }];
