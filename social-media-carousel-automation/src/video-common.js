// ---------- reference helpers (inlined at build time) ----------
// What kind of source a link is, and how it will be read.
const REF_RULES = [
  { kind: 'youtube', re: /(youtube\.com\/(watch|shorts|live)|youtu\.be\/)/i },
  { kind: 'podcast', re: /(open\.spotify\.com\/(episode|show)|podcasts\.apple\.com|pca\.st|overcast\.fm|castbox\.fm|podbean\.com|buzzsprout\.com|anchor\.fm|podcasters\.spotify|\.(mp3|m4a|aac|wav|ogg|opus)(\?|$)|\/(feed|rss)(\/|\?|$)|\.rss(\?|$))/i },
  { kind: 'tiktok', re: /tiktok\.com\//i },
  { kind: 'instagram', re: /instagram\.com\/(reel|reels|p|tv)\//i },
  { kind: 'twitter', re: /(twitter\.com|x\.com)\/[^/]+\/status\/\d+/i },
  { kind: 'linkedin', re: /linkedin\.com\/(posts|feed\/update|pulse)\//i },
  { kind: 'threads', re: /threads\.(net|com)\//i },
  { kind: 'facebook', re: /(facebook\.com|fb\.watch)\//i },
];
const refKind = u => (REF_RULES.find(r => r.re.test(u)) || {}).kind || 'article';
const SOCIAL = ['tiktok', 'instagram', 'twitter', 'linkedin', 'threads', 'facebook'];
const DOWNLOADABLE = { tiktok: 'tiktok', instagram: 'instagram', twitter: 'twitter', linkedin: 'linkedin' };
const isPhotoOnlyUrl = u => /tiktok\.com\/@[^/]+\/photo\//i.test(u);
const splitLinks = s => txt(s).split(/\s+/).filter(u => /^https?:\/\//i.test(u)).map(u => u.replace(/[),.;]+$/, ''));
// kept for older code paths
const videoKind = u => (['youtube', 'tiktok', 'instagram', 'twitter'].includes(refKind(u)) ? refKind(u) : null);
// Page reader: X has a public embed API; everything else goes through the free r.jina.ai reader.
const readUrlFor = (u, kind) => {
  const tw = kind === 'twitter' && u.match(/status\/(\d+)/);
  return tw ? `https://cdn.syndication.twimg.com/tweet-result?id=${tw[1]}&token=a` : `https://r.jina.ai/${u}`;
};

const VIDEO_PROMPT = `You are analysing a reference video for a studio that makes educational carousels (TikTok photo posts, Instagram carousels).
Watch AND listen to the whole video. Reply in plain text with exactly these sections:
SUMMARY: one or two lines.
FORMAT: is it a talking video, a photo slideshow, b-roll with captions, etc.; length; number of slides/scenes.
HOOK: the first line or first slide text, verbatim, and why it grabs attention.
ON-SCREEN TEXT: every slide or caption, verbatim, in order, with mm:ss.
KEY POINTS: 5-10 bullets with mm:ss timestamps.
QUOTES: up to 5 short verbatim spoken quotes with mm:ss (write "none" if there is no speech).
CLAIMS: factual or health claims made, verbatim, and whether the video gives a source.
STYLE: visual look, colours, typography, pacing, music or sound.
Never invent anything you did not see or hear. If you cannot access the video, reply only: NO VIDEO ACCESS.`;

const AUDIO_PROMPT = `You are analysing a reference audio file (podcast, interview, voice note or talk) for a studio that makes educational carousels (TikTok photo posts, Instagram carousels).
Listen to the whole recording. Reply in plain text with exactly these sections:
SUMMARY: one or two lines: who is speaking and what it is about.
KEY POINTS: 5-10 bullets with mm:ss timestamps.
LISTABLE ITEMS: any lists, steps, signs, myths or tips the speakers give, with mm:ss.
CLAIMS: factual or health claims made, verbatim where short, and whether a source is given.
HOOKS & ANALOGIES: memorable lines, metaphors and examples.
QUOTES: 3-5 short verbatim quotes with mm:ss.
CAVEATS: what the speakers hedge, dispute, sell or state as opinion.
Keep the whole reply under ${Number(cfg.notesMaxChars) || 6000} characters. Never invent anything you did not hear. If you cannot hear any audio, reply only: NO AUDIO ACCESS.`;

const imagePrompt = caption => `These images are from a reference social media post (a photo carousel or image post), in order.${caption ? `\nThe post's caption: """${String(caption).slice(0, 20000)}"""` : ''}
Reply in plain text with exactly these sections:
SLIDES: for each image, "Slide n:" then its on-screen text verbatim, then a one-line description of the visual.
HOOK: the first slide's text and why it grabs attention.
STRUCTURE: how the post flows from slide to slide (list, myth-vs-fact, steps, story…).
CLAIMS: factual or health claims made, verbatim, and whether a source is shown.
STYLE: layout, colours, typography, imagery.
Only report what is actually in the images. If you received no images, reply only: NO IMAGES.`;

// Text from any Magica run output (LLM text, transcript, OCR, etc.).
function findText(x) {
  if (!x) return '';
  if (typeof x === 'string') return /^https?:\/\/\S+$/i.test(x.trim()) ? '' : x;
  if (Array.isArray(x)) return x.map(findText).filter(Boolean).join('\n');
  if (typeof x === 'object') {
    for (const k of ['text', 'transcript', 'markdown', 'content', 'response', 'message', 'output', 'result', 'summary', 'data']) {
      if (k in x) { const t = findText(x[k]); if (t) return t; }
    }
  }
  return '';
}
// Notes on any reference are kept short so the research brief (Claude) reads less: about 6,000 characters each.
const NOTES_MAX = Number(cfg.notesMaxChars) || 6000;
// Instructions for Gemini's notes on a long transcript/document (the full text is appended at start time).
const condensePrompt = (j, row) => `You are a research assistant. Below is the FULL ${j.via || 'text'} of a reference (${j.label}) that a producer gave for a carousel about: "${String(row.Title || '').trim()}"${row['Research request'] ? ` (${String(row['Research request']).trim().slice(0, 500)})` : ''}.
Read ALL of it, start to finish, and write SHORT structured research notes covering the whole thing, not just the beginning. Keep only what helps that carousel; skip intros, sponsors and tangents:
OVERVIEW: who is speaking/writing, what it is, how long, overall argument (3-4 lines).
OUTLINE: the main sections or topics in the order they appear (with mm:ss if timestamps exist).
KEY POINTS: 8-15 short bullets covering the whole piece, in order.
CLAIMS: every factual, health or numeric claim, quoted verbatim where short, with who said it and whether a source or study is mentioned.
LISTS & FRAMEWORKS: every list, "X things", pillars, steps or framework mentioned, written out IN FULL with every item.
QUOTES: 3-6 short, punchy verbatim quotes useful for a carousel.
ANALOGIES & HOOKS: memorable metaphors, examples and hooks.
CAVEATS: anything the speaker hedges, disputes, or that sounds like opinion or promotion.
Keep the whole reply under ${NOTES_MAX} characters: short lines, no repetition.
Only use what is in the text. Transcripts may contain recognition errors: keep wording, note obvious errors.

FULL TEXT:
`;

// ---------- OpenRouter + shared job steps ----------
// OpenRouter models (change them in Config). Magica stays the last fallback on every route.
const OR_ON = cfg.useOpenRouter !== false && cfg.useOpenRouter !== 'false';
// Magica is switched off: every reference is read through OpenRouter. useMagica: true in Config brings its fallbacks back.
const MAGICA_ON = cfg.useMagica === true || cfg.useMagica === 'true';
const MG = (...attempts) => (MAGICA_ON ? attempts : []);
const OR = {
  media: cfg.orMediaModel || 'qwen/qwen3.8-omni-flash',               // social + uploaded images and videos
  imageBackup: cfg.orImageFallbackModel || 'google/gemini-3.8-flash',
  audio: cfg.orAudioModel || 'google/gemini-3.8-flash',                // uploaded audio files
  videoBackup: cfg.orVideoFallbackModel || 'google/gemini-3.8-flash',
  text: cfg.orTextModel || 'deepseek/deepseek-v4.1-flash-1017',        // notes on long YouTube/podcast transcripts
  doc: cfg.orDocModel || 'google/gemini-3.1-flash-lite',               // PDFs (reads the pages) + notes on long .txt/RTF/PDF text
  youtube: cfg.orYoutubeModel || 'google/gemini-3.8-flash',           // watches YouTube links (agentic mode)
};
// YouTube links go straight to Gemini (it watches the video itself). youtubeViaGemini: false in Config turns it off.
const YT_GEMINI = cfg.youtubeViaGemini !== false && cfg.youtubeViaGemini !== 'false';
const modelLabel = m => (/qwen/i.test(m) ? 'Qwen' : /haiku/i.test(m) ? 'Claude Haiku' : /claude/i.test(m) ? 'Claude' : /gemini/i.test(m) ? 'Gemini' : /deepseek/i.test(m) ? 'DeepSeek' : String(m || 'model'));
// One OpenRouter attempt. media = { videoUrl } | { imageUrls, caption } | { pdfUrl, name }
const orAttempt = (task, model, media) => ({ provider: 'openrouter', nodeType: 'openrouter', task, model, media: media || {}, input: {} });
const orImages = (urls, caption) => (OR_ON && urls.length ? [orAttempt('images', OR.media, { imageUrls: urls.slice(0, 10), caption: caption || '' }), orAttempt('images', OR.imageBackup, { imageUrls: urls.slice(0, 10), caption: caption || '' })] : []);
const orVideo = url => (OR_ON && url ? [orAttempt('video', OR.media, { videoUrl: url }), orAttempt('video', OR.videoBackup, { videoUrl: url })] : []);
const orAudio = (url, name) => (OR_ON && url ? [orAttempt('audio', OR.audio, { audioUrl: url, name })] : []);
// PDFs: Gemini reads the pages themselves (scans, charts, tables); DeepSeek on the extracted text layer is the backup.
const orPdf = (url, name) => (OR_ON && url ? [orAttempt('pdf', OR.doc, { pdfUrl: url, name }), orAttempt('pdf', OR.text, { pdfUrl: url, name })] : []);
const orYoutube = url => (OR_ON && YT_GEMINI && url ? [orAttempt('youtube', OR.youtube, { youtubeUrl: url })] : []);
// What Gemini writes after watching a YouTube reference: short notes aimed at the slideshow, not a full summary.
const ytPrompt = row => `You are a research assistant for a studio that makes TikTok and Instagram photo slideshows (listicles).
Watch this YouTube video (speech, on-screen text and visuals) and write SHORT research notes for a slideshow about: "${String(row.Title || '').trim()}"${row['Research request'] ? ` (${String(row['Research request']).trim().slice(0, 500)})` : ''}.
Keep only what helps that slideshow; skip intros, sponsors and tangents. Reply in plain text with exactly these sections:
OVERVIEW: who is speaking, what the video is, its length, the main argument (2-3 lines).
LISTABLE ITEMS: every tip, sign, habit, mistake, step or myth that could be one slide, one line each, with mm:ss.
CLAIMS: factual, health or numeric claims, verbatim where short, with mm:ss and whether a study or source is named.
ON-SCREEN TEXT: titles, lists or chart labels shown on screen that matter, verbatim, with mm:ss (write "none" if there are none).
HOOKS & ANALOGIES: memorable lines, metaphors and examples.
QUOTES: 3-5 short verbatim quotes in the speaker's own words, with mm:ss.
CAVEATS: what the speaker hedges, disputes, sells or states as opinion.
Keep the whole reply under ${NOTES_MAX} characters. Never invent anything you did not see or hear. If you cannot access the video, reply only: NO VIDEO ACCESS.`;
// Notes on a long transcript/document: PDF/.txt/RTF files → Gemini Flash Lite, DeepSeek as backup;
// transcripts → DeepSeek, Gemini Flash as backup; Gemini on Magica last.
const condenseAttempts = (j, row) => {
  const isDoc = /^(PDF|text file|RTF file)/.test(j.via || '');
  const notesModel = isDoc ? OR.doc : OR.text;
  const notesBackup = isDoc ? OR.text : OR.videoBackup;
  const head = condensePrompt(j, row || {});
  const magica = { nodeType: cfg.videoModel || 'gemini_3_8_flash', condense: true, promptHead: head, input: { max_tokens: 32000, temperature: 0.2 } };
  return [
    ...(OR_ON ? [{ ...orAttempt('condense', notesModel), condense: true, promptHead: head }, { ...orAttempt('condense', notesBackup), condense: true, promptHead: head }] : []),
    ...MG(magica),
  ];
};
const LONG_TEXT = Number(cfg.condenseOver) || 15000;
// Moves a job to its next attempt (or finishes it with what it already has).
function advanceJob(j, why) {
  const cur = j.attempts[j.step];
  if (cur && cur.condense) {
    const next = j.attempts[j.step + 1];
    if (next && next.condense) { j.error = 'notes: ' + why; j.step++; j.runId = null; j.status = 'pending'; return; }
    j.status = 'done'; j.runId = null; j.error = 'notes failed (' + why + '), used the full text instead'; j.attempts = j.attempts.slice(0, j.step + 1); return;
  }
  j.error = why; j.step++; j.runId = null; j.status = j.step < j.attempts.length ? 'pending' : 'failed';
  if (j.status === 'failed' && j.fallbackText) { j.status = 'done'; j.text = j.fallbackText; j.via = j.fallbackVia; }
}
const VIA = { ai_transcription: 'transcript', podcast_summarizer: 'podcast transcript', document_ocr: 'document text', social_media_video_downloader: 'download' };
const viaFor = a => {
  if (a.provider === 'openrouter') return a.task === 'youtube' ? `watched by ${modelLabel(a.model)} (agentic)` : a.task === 'video' ? `watched by ${modelLabel(a.model)}` : a.task === 'images' ? `slides read by ${modelLabel(a.model)}` : a.task === 'audio' ? `heard by ${modelLabel(a.model)}` : a.task === 'pdf' ? (/deepseek/i.test(a.model) ? 'PDF text' : `PDF read by ${modelLabel(a.model)}`) : `read by ${modelLabel(a.model)}`;
  return VIA[a.nodeType] || (a.input.video_urls ? 'watched by Gemini' : a.input.image_urls ? 'slides read by Gemini' : 'read by Gemini');
};
// A finished attempt's text: store it, and queue notes if it is long.
function finishJob(j, a, rawText, row) {
  const text = String(rawText || '').trim();
  if (a.condense) {
    if (text.length < 300) return advanceJob(j, 'empty notes');
    j.text = text; j.via = `${j.via} → ${modelLabel(a.model || 'gemini')} notes on the full ${j.via.includes('transcript') ? 'transcript' : 'text'}`;
    j.condensed = true; j.status = 'done'; j.runId = null; return;
  }
  if (!text || /NO (VIDEO|IMAGES|DOCUMENT|AUDIO) ACCESS|^\s*NO IMAGES/i.test(text.slice(0, 200))) return advanceJob(j, 'no usable text returned');
  const images = a.task === 'images' || (a.input && a.input.image_urls);
  j.text = j.fallbackText && images ? `${j.fallbackText}\n\n${text}` : text;
  j.via = viaFor(a); j.status = 'done'; j.runId = null;
  if (j.text.length > LONG_TEXT && !j.condensed) {
    j.fullLength = j.text.length;
    j.attempts = [...j.attempts.slice(0, j.step + 1), ...condenseAttempts(j, row)];
    j.step++; j.status = 'pending';
  }
}
// ---------- end reference helpers ----------
