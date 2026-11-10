// @include helpers
// @include video
// Agent 2 — Research analyst: turns searches + your reference links into an editable, sourced brief.

const { row } = ctx();
const queries = $('Parse Research Queries').all().map(i => i.json);
const results = $('Tavily: Search').all().map(i => i.json);
const extract = $('Tavily: Extract References').first().json || {};

const sources = [];
const seen = new Map();
const cite = (url, title) => {
  if (!seen.has(url)) { sources.push({ url, title: title || url }); seen.set(url, sources.length); }
  return seen.get(url);
};

const blocks = [];      // web searches + article references
const refBlocks = [];   // your other references (kept separately so they always fit)
for (const r of extract.results || []) {
  if (!r.url) continue;
  const n = cite(r.url, r.title || 'Reference supplied by producer');
  blocks.push(`### [${n}] PRODUCER REFERENCE: ${r.url}\n${String(r.raw_content || r.content || '')}`);
}
const unreadable = []; // articles Tavily couldn't read are retried by the page reader and reported below

// Your other references: videos, podcasts, photo/text posts, files, pages Tavily couldn't read
// (kept in full: nothing is cut unless everything together passes the safety ceiling below)
const videoInfo = $('Reference Notes').isExecuted ? $('Reference Notes').first().json : { notes: [], skipped: [] };
const okVideos = videoInfo.notes.filter(v => v.ok);
const videoBlocks = [];
for (const v of videoInfo.notes) {
  if (!v.ok) { unreadable.push(`${v.label} (${v.error || 'failed'})`); continue; }
  videoBlocks.push(v);
}
unreadable.push(...(videoInfo.skipped || []));

results.forEach((r, i) => {
  const q = queries[i] || {};
  const lines = [`### Search: "${q.query}" (${q.purpose})`];
  if (r.answer) lines.push(`Summary: ${r.answer}`);
  for (const s of r.results || []) {
    if (!s.url) continue;
    const n = cite(s.url, s.title);
    lines.push(`- [${n}] ${s.title || ''}${s.published_date ? ' (' + s.published_date + ')' : ''}\n  ${String(s.content || '').slice(0, 1200)}`);
  }
  blocks.push(lines.join('\n'));
});
const KIND = { youtube: 'YouTube video', podcast: 'podcast', tiktok: 'TikTok post', instagram: 'Instagram post', twitter: 'X post', linkedin: 'LinkedIn post', threads: 'Threads post', facebook: 'Facebook post', article: 'web page', file: 'uploaded file' };
for (const v of videoBlocks) {
  const isFile = v.kind === 'file' || !/^https?:/.test(v.url || '') || /host\.docker\.internal|localhost/.test(v.url || '');
  const what = KIND[v.kind] || 'reference';
  const n = cite(isFile ? `uploaded file: ${v.label}` : v.url, `${what[0].toUpperCase() + what.slice(1)} (${v.via}) — ${v.label}`);
  const body = String(v.text);
  refBlocks.push(`### [${n}] PRODUCER REFERENCE — ${what}, ${v.via}: ${v.label}\n${body}`);
}
// No length limits. Safety ceiling only: Claude reads about 1M tokens, so above ~2M characters (~500K tokens)
// the longest pieces are shortened evenly, and the brief says so. Normal runs never get near this.
const CEILING = 2000000;
let parts = [...blocks, ...refBlocks];
const total = parts.reduce((a, p) => a + p.length, 0);
if (total > CEILING) {
  // find the per-piece size that brings the total under the ceiling, and shorten only pieces longer than that
  let lo = 0, hi = Math.max(...parts.map(p => p.length));
  while (hi - lo > 100) { const mid = (lo + hi) >> 1; parts.reduce((a, p) => a + Math.min(p.length, mid), 0) > CEILING ? (hi = mid) : (lo = mid); }
  parts = parts.map(p => (p.length > lo ? p.slice(0, lo) + '\n[cut: all material together was too long]' : p));
  unreadable.push('some very long references were shortened to fit (total over 2 million characters)');
}
const corpus = parts.join('\n\n');
if (!sources.length) throw new Error('No search results or readable reference links. Check the Tavily credential or broaden the topic.');

const outline = outlineOf(row['Research request']);
const system = `You are a meticulous research analyst for a social media studio. Turn the material into a SHORT slideshow pack: the raw material a carousel copywriter works from, accurate enough to use without re-checking. It is not a report: no essays, no background sections.
Rules:
- Use ONLY the material provided. Never add facts, numbers or quotes from memory.
- Cite every claim with its source number in square brackets, e.g. [3].
- Prefer concrete, surprising, relatable details. Flag weak, promotional or anecdotal sources as such.
- DEPTH STANDARD for every key point and list item: ${DEPTH_STANDARD}
- Producer references that are social posts, videos or podcasts are what a creator said or showed, not evidence: attribute their claims ("a reference post claims…") unless a search result or study backs them up. Use them mainly for angles, hooks and format ideas.
- Quote spoken lines from transcripts only as written; transcripts may contain recognition errors.
- Note where sources disagree, and what must not be overstated.
- Tag the strength of slide-ready claims: strong = trials, reviews or guidelines; moderate = observational studies or reputable health bodies; weak = clinic, blog or wellness pages; creator claim = said by a creator or reference and not backed by the material.
- Plain English for a non-expert reader. Markdown, no tables.
- Follow every instruction in the PRODUCER'S REQUEST (e.g. sections to cover, optional pools such as statistics or expert mentions).
- Keep the whole pack under about ${outline ? '2,800' : '1,500'} words. Short lines; never repeat a fact in two places.`;

const user = `TOPIC: ${txt(row.Title)}
PRODUCER'S REQUEST: ${txt(row['Research request']) || '(none)'}
${ownAngle(row) ? `PRODUCER'S ANGLE (they wrote it; build the pack around it): ${ownAngle(row)}\n` : ''}${unreadable.length ? `These reference links could not be read automatically (mention this at the end): ${[...new Set(unreadable)].join(', ')}\n` : ''}
MATERIAL
${corpus}

Write the pack with exactly these sections:
## Suggested angle
(1-2 lines: the strongest of your 3 angles below${outline ? ", one that fits the producer's outline" : ''}, as the hook + the list it uses + how many items, e.g. "5 signs your 'normal' blood test missed insulin resistance (Signs list, 5 items)". The producer reviews and edits it before the plan is written. If PRODUCER'S ANGLE is given, use it here in the same format, keeping their wording; if the material can't support it, say so in one line and suggest the closest angle it does support.)
## In one line
(the single most useful, surprising true thing about this topic, with [n])
${outline ? `## Your outline
The producer's outline: ${outline}
Go through it section by section, in their order, using their wording as each heading (### Section). Under each: 4-7 key points the slides can use, one per line, following the DEPTH STANDARD (for a "what is / what happens" section, give the cause-and-effect chain step by step; for a "what can lead to" section, name each condition and how it connects; for a "what to do" section, give each action with how much and how often):
- one or two plain sentences (max 40 words) | [n] | strong / moderate / weak / creator claim
Add numbers from studies and named experts where the material has them. If the material does not cover a section, write "Not covered by the sources: add a reference or research it further." Never fill a gap from memory. A call-to-action section needs no research: give 2 short save/share lines instead.
` : ''}## Slideshow pack
### Lists
The 2-3 list types the material supports best (the one PRODUCER'S ANGLE needs first, else the one the producer asked for; e.g. signs, habits, mistakes, myths vs facts, surprising facts), 5-8 items each. One item per line:
- short line (max 12 words) | one or two plain sentences explaining what it is and why, with specifics | [n] | strong / moderate / weak / creator claim
### Hooks
8 hooks in the audience's voice (first person or "you"), each promising a number one of the lists can deliver. Then up to 3 hooks the producer's references used, quoted exactly and marked (reference).
### How the audience talks
3-6 phrases real people use about this (forums, comments, transcripts), quoted when sourced.
### Analogies
1-3 plain-language comparisons that explain the key idea.
### Angles
3 ready slideshow angles (the first is PRODUCER'S ANGLE, if given). For each: the hook, which list it uses and how many items, and one line on why people would save or share it.
## From your references
(only if the producer gave references: per reference, 2-4 lines: its hook quoted exactly, its format, and what is worth borrowing, with [n] and mm:ss or slide numbers. Otherwise write "No references given.")
## Don't overstate
(3-6 bullets: caveats the writer must respect, including where sources disagree)`;

const sourcesText = sources.map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`).join('\n');
const body = claudeBody(system, user, Number(cfg.maxTokens) || 64000);
// Saved to the row before Claude writes the brief, so a failed brief can be retried without collecting everything again
const cache = 'Research cache' in row ? JSON.stringify({ key: researchKey(row), at: new Date().toISOString(), sourcesText, body }) : '';
return [{ json: { sourcesText, body, cache, hasCacheField: 'Research cache' in row } }];
