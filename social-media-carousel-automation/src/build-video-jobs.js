// @include helpers
// @include video
// One job per reference. Each job has a list of attempts; if one fails the next is tried, and if all fail
// whatever text was already found (caption, page text) is used instead. OpenRouter goes first, Magica is the backup.
//   article Tavily couldn't read → page reader text
//   YouTube → Gemini watches it (OpenRouter, agentic) → else Magica transcript → else Scrape Creators transcript (+ notes, fetched after the loop) · podcast → Magica podcast transcript
//   TikTok / Instagram / X videos → Qwen watches (video link from Scrape Creators / X) → Gemini (OpenRouter)
//       → Magica download → Gemini → else photo slides → else Magica transcript → else caption
//   photo posts / carousels → Qwen reads the slides → Claude Haiku → Gemini (Magica) → else caption
//   uploaded video → Qwen → Gemini (OpenRouter) → Gemini (Magica) → transcript · image → Qwen → Gemini (OpenRouter) → Gemini (Magica) · audio → Gemini (OpenRouter) → Magica transcript
//   uploaded PDF → OpenRouter PDF text (free) → Magica document reader → Gemini · Word/PowerPoint → Magica document reader
//   long transcripts / text (over 15,000 characters) → DeepSeek notes → else Gemini notes (Magica) → else the full text

const info = $('List References').first().json;
const row = $('Check Action').first().json.row || {};
const collected = $('Collect Uploads').first().json;
const pages = collected.pages || [];
const ups = collected.uploads || [];
const upRes = $('Magica: Upload File').isExecuted ? $('Magica: Upload File').all().map(i => i.json) : [];
const upMeta = $('Magica: Upload File').isExecuted ? $('Upload To Data URI').all().map(i => i.json) : [];
const stored = {}; const inline = {};
ups.forEach((u, i) => {
  const r = upRes[i] || {}; const m = upMeta[i] || {};
  if (m.inlineText) inline[u.owner] = m.inlineText;
  else if (r.url) (stored[u.owner] = stored[u.owner] || []).push(r.url);
});

const M = cfg.videoModel || 'gemini_3_8_flash';
const geminiVideo = url => ({ nodeType: M, input: { prompt: VIDEO_PROMPT, video_urls: [url], max_tokens: 16000, temperature: 0.2 } });
const geminiImages = (urls, caption) => ({ nodeType: M, input: { prompt: imagePrompt(caption), image_urls: urls.slice(0, 10), max_tokens: 12000, temperature: 0.2 } });
const geminiDoc = url => ({ nodeType: M, input: { prompt: 'Read this document. Summarise it for a researcher: the main points, every factual or health claim (verbatim where short), numbers, and who wrote it. If you cannot open it, reply only: NO DOCUMENT ACCESS.', file_urls: [url], max_tokens: 16000, temperature: 0.2 } });
const ocr = url => ({ nodeType: 'document_ocr', input: { file_url: url } });
// (every Magica attempt below is wrapped in MG(), which drops it while Magica is off)
// Magica only accepts output_format for uploads and social links, not YouTube.
const transcribe = input => ({ nodeType: 'ai_transcription', input: input.inputMode === 'youtube' ? input : { output_format: 'timestamped', ...input } });
const podcast = url => ({ nodeType: 'podcast_summarizer', input: { podcastUrl: url } });

// Text files: read straight from Baserow (no Magica upload needed)
for (const r of info.refs) {
  if (r.kind !== 'file' || !['text', 'rtf'].includes(r.fileKind) || inline[r.url]) continue;
  try { const buf = Buffer.from(await this.helpers.httpRequest({ url: r.url, method: 'GET', encoding: 'arraybuffer', json: false, timeout: 60000 })); inline[r.url] = buf.toString(r.fileKind === 'rtf' ? 'latin1' : 'utf8').slice(0, 4000000); } catch (e) { /* reported as unreadable below */ }
}
const jobs = info.refs.map((r, i) => {
  const job = { n: i + 1, label: r.label, url: r.url, kind: r.kind, attempts: [], step: 0, status: 'pending', runId: null, text: '', via: '', error: '', fallbackText: '', fallbackVia: '' };
  const page = pages.find(p => p.url === r.url);
  const imgs = stored[r.url] || [];
  if (page && page.ok) {
    // when Scrape Creators supplied the post, its caption is clean; the page reader's text (login prompts, comments) is left out
    const pageText = page.source !== 'Scrape Creators' && page.text && page.text !== page.caption;
    const bits = [page.caption && `CAPTION: ${page.caption}`, pageText && `PAGE TEXT:\n${page.text}`].filter(Boolean);
    job.fallbackText = bits.join('\n\n'); job.fallbackVia = r.kind === 'article' ? 'page text' : 'caption/text only';
  } else if (page) job.error = page.error;
  const done = (text, via) => { job.status = 'done'; job.text = text; job.via = via; job.attempts = []; };

  if (r.kind === 'file') {
    const urls = stored[r.url] || [];
    if (r.fileKind === 'text' || r.fileKind === 'rtf') {
      if (!inline[r.url]) { job.status = 'failed'; job.error = 'could not read the text file'; return job; }
      done(inline[r.url], r.fileKind === 'rtf' ? 'RTF file' : 'text file');
      // long text files also get notes on the full text
      if (job.text.length > LONG_TEXT) { job.status = 'pending'; job.attempts = condenseAttempts(job, row); job.step = 0; }
      return job;
    }
    // OpenRouter reads the file straight from Baserow; the Magica copy (if the upload worked) is the backup
    const m = urls[0];
    if (r.fileKind === 'video') job.attempts = [...orVideo(r.url), ...(m ? MG(geminiVideo(m), transcribe({ inputMode: 'upload', audioUrl: [m] })) : [])];
    else if (r.fileKind === 'image') job.attempts = [...orImages([r.url], ''), ...(urls.length ? MG(geminiImages(urls, '')) : [])];
    else if (r.fileKind === 'audio') job.attempts = [...orAudio(r.url, r.label), ...(m ? MG(transcribe({ inputMode: 'upload', audioUrl: [m] })) : [])];
    // PDFs: OpenRouter's free PDF text first; Magica's document reader (also Word, PowerPoint) and Gemini as backup
    else if (/\.pdf$/i.test(r.label || '') || /pdf/i.test(r.mime || '')) job.attempts = [...orPdf(r.url, r.label), ...(m ? MG(ocr(m), geminiDoc(m)) : [])];
    else job.attempts = m ? MG(ocr(m)) : [];
    if (!job.attempts.length) {
      job.status = 'failed';
      job.error = MAGICA_ON ? 'upload to Magica failed' : r.fileKind === 'audio' ? 'audio files need OpenRouter (useOpenRouter in Config) or a transcript (.txt) upload' : r.fileKind === 'document' ? 'Word/PowerPoint files can\'t be read without Magica: save it as a PDF and upload that' : 'could not be read';
      return job;
    }
  } else if (r.kind === 'article') {
    if (job.fallbackText) done(job.fallbackText, 'page text'); else { job.status = 'failed'; job.error = job.error || 'page could not be read'; }
  } else if (r.kind === 'youtube') {
    // Gemini watches the link itself (agentic) and writes short notes. If it can't, Scrape Creators fetches the
    // transcript afterwards (the YouTube Backup? branch). With OpenRouter off, Magica transcribes it instead.
    job.attempts = [...orYoutube(r.url), ...MG(transcribe({ inputMode: 'youtube', url: r.url }))];
    if (!job.attempts.length) { job.status = 'failed'; job.error = 'no transcript'; }
  } else if (r.kind === 'podcast') {
    job.attempts = MG(podcast(r.url));
    if (!job.attempts.length) { if (job.fallbackText) done(job.fallbackText, job.fallbackVia); else { job.status = 'failed'; job.error = 'podcasts can\'t be read without Magica: upload the transcript as a .txt file instead'; } }
  } else {
    const dl = DOWNLOADABLE[r.kind];
    const photoFirst = isPhotoOnlyUrl(r.url) || (page && page.ok && imgs.length && !page.hasVideo);
    const caption = page && page.caption;
    // video: link from Scrape Creators / X → Qwen, Gemini (OpenRouter); then Magica downloads it → Gemini
    const video = [...orVideo(page && page.videoUrl), ...(dl ? MG({ nodeType: 'social_media_video_downloader', input: { video_url: r.url, platform: dl }, then: 'gemini' }) : [])];
    // slides: Qwen, Claude Haiku (OpenRouter) on the Magica copies (or the post's own links), then Gemini (Magica)
    const slideUrls = imgs.length ? imgs : (page && page.ok ? page.images || [] : []);
    const slides = [...orImages(slideUrls, caption), ...(imgs.length ? MG(geminiImages(imgs, caption)) : [])];
    const trans = ['tiktok', 'instagram', 'twitter'].includes(r.kind) ? MG(transcribe({ inputMode: r.kind, url: r.url })) : [];
    job.attempts = photoFirst ? [...slides, ...video, ...trans] : [...video, ...slides, ...trans];
    if (!job.attempts.length) { job.fallbackText ? done(job.fallbackText, job.fallbackVia) : (job.status = 'failed', job.error = job.error || 'nothing readable'); }
  }
  return job;
});
return [{ json: { jobs, skipped: info.skipped } }];
