// @include helpers
// @include video
// One OpenRouter request per job whose next attempt is on OpenRouter. Media is downloaded here and sent
// embedded (data URLs), so it works with links that expire or block outside servers (Instagram, TikTok).
const state = $input.first().json;
const row = $('Check Action').first().json.row || {};
const MAX_MB = Number(cfg.orMaxVideoMB) || 20;
const MAX_AUDIO_MB = Number(cfg.orMaxAudioMB) || 40;
// OpenRouter audio formats; .opus is Ogg inside
const audioFormat = name => ({ mp3: 'mp3', wav: 'wav', m4a: 'm4a', aac: 'aac', ogg: 'ogg', opus: 'ogg', flac: 'flac', aiff: 'aiff', aif: 'aiff' })[(String(name).toLowerCase().match(/\.([a-z0-9]+)(\?|$)/) || [])[1]] || 'mp3';
const PDF_PROMPT = 'Reply with the full text of this document, exactly as written, in order. Keep headings, lists and tables (tables as plain-text rows, keeping every number and unit). Read text inside images and scanned pages too. For a chart, diagram or infographic, write [Figure: what it shows, with its numbers and labels]. Do not summarise or add anything.';
const get = async url => Buffer.from(await this.helpers.httpRequest({ url, method: 'GET', encoding: 'arraybuffer', json: false, timeout: 180000 }));
const dataUrl = (buf, mime) => `data:${mime};base64,${buf.toString('base64')}`;
const imageMime = (buf, url) => {
  const h = buf.slice(0, 12).toString('latin1');
  if (h.startsWith('\x89PNG')) return 'image/png';
  if (h.startsWith('RIFF') && h.slice(8, 12) === 'WEBP') return 'image/webp';
  if (h.startsWith('GIF8')) return 'image/gif';
  return /\.png(\?|$)/i.test(url) ? 'image/png' : 'image/jpeg';
};
const videoMime = url => (/\.mov(\?|$)/i.test(url) ? 'video/quicktime' : /\.webm(\?|$)/i.test(url) ? 'video/webm' : 'video/mp4');

const out = [];
for (const { idx } of state.orCalls || []) {
  const j = state.jobs[idx]; const a = j.attempts[j.step];
  const item = { idx, model: a.model, task: a.task };
  try {
    let content; let extra = {};
    if (a.task === 'youtube') {
      // Gemini on Google AI Studio opens YouTube links itself; agentic mode loads only the parts it needs
      content = [{ type: 'text', text: ytPrompt(row) }, { type: 'video_url', video_url: { url: a.media.youtubeUrl, processing: 'agentic' } }];
      extra = { max_tokens: 32000 };
    } else if (a.task === 'video') {
      const buf = await get(a.media.videoUrl);
      const mb = buf.length / 1048576;
      if (mb > MAX_MB) throw new Error(`video is ${mb.toFixed(1)} MB, over the ${MAX_MB} MB OpenRouter limit (orMaxVideoMB in Config)`);
      content = [{ type: 'text', text: VIDEO_PROMPT }, { type: 'video_url', video_url: { url: dataUrl(buf, videoMime(a.media.videoUrl)) } }];
      extra = { max_tokens: 32000 };
      item.mb = +mb.toFixed(2);
    } else if (a.task === 'images') {
      const imgs = [];
      for (const u of a.media.imageUrls) { try { const b = await get(u); imgs.push(dataUrl(b, imageMime(b, u))); } catch (e) { /* skip a slide that won't download */ } }
      if (!imgs.length) throw new Error('none of the images could be downloaded');
      content = [{ type: 'text', text: imagePrompt(a.media.caption) }, ...imgs.map(url => ({ type: 'image_url', image_url: { url } }))];
      extra = { max_tokens: 12000, reasoning: { enabled: false } };
    } else if (a.task === 'audio') {
      // Gemini listens to the file itself (sent embedded: OpenRouter takes audio as base64, not links)
      const buf = await get(a.media.audioUrl);
      const mb = buf.length / 1048576;
      if (mb > MAX_AUDIO_MB) throw new Error(`audio is ${mb.toFixed(1)} MB, over the ${MAX_AUDIO_MB} MB limit (orMaxAudioMB in Config): trim it or upload a transcript (.txt)`);
      content = [{ type: 'text', text: AUDIO_PROMPT }, { type: 'input_audio', input_audio: { data: buf.toString('base64'), format: audioFormat(a.media.name || a.media.audioUrl) } }];
      extra = { max_tokens: 32000 };
      item.mb = +mb.toFixed(2);
    } else if (a.task === 'pdf') {
      const buf = await get(a.media.pdfUrl);
      content = [{ type: 'text', text: PDF_PROMPT }, { type: 'file', file: { filename: a.media.name || 'document.pdf', file_data: dataUrl(buf, 'application/pdf') } }];
      // Gemini reads the PDF natively; text-only models get OpenRouter's free text extraction
      extra = { max_tokens: 32000, reasoning: { enabled: false }, plugins: [{ id: 'file-parser', pdf: { engine: /deepseek|qwen/i.test(a.model) ? 'pdf-text' : 'native' } }] };
    } else {
      // notes on a long transcript/document: the full text goes in here only
      content = a.promptHead + String(j.text).slice(0, 3000000);
      extra = { max_tokens: 48000 };
    }
    item.body = { model: a.model, temperature: a.task === 'pdf' ? 0 : 0.2, ...extra, messages: [{ role: 'user', content }] };
  } catch (e) {
    // nothing to send: a 1-token call keeps the items lined up, and the job moves to its next attempt
    item.skip = String(e.message || e).slice(0, 300);
    item.body = { model: OR.text, max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] };
  }
  out.push({ json: item });
}
return out;
