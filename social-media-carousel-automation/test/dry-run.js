// Offline dry run of every Code node in both workflows, with mocked API responses. Run: node test/dry-run.js
const assert = require('assert');
const main = require('../carousel-automation.n8n.json');
const setup = require('../carousel-automation-setup.n8n.json');
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;

function harness(wf) {
  const byName = Object.fromEntries(wf.nodes.map(n => [n.name, n]));
  const out = {}; const runs = {};
  const $ = n => ({
    all: () => { if (!out[n]) throw new Error(`referenced ${n} before it ran`); return out[n]; },
    first: () => { if (!out[n]) throw new Error(`referenced ${n} before it ran`); return out[n][0]; },
    last: () => out[n][out[n].length - 1],
    get item() { return out[n][0]; },
    get isExecuted() { return !!out[n]; },
  });
  const helpers = {
    getBinaryDataBuffer: async (i, k) => (global.__bin && global.__bin[i] !== undefined ? Buffer.from(global.__bin[i], 'latin1') : Buffer.from('fake-image-bytes-' + i)),
    prepareBinaryData: async (buf, name, mime) => ({ data: buf.toString('base64'), fileName: name, mimeType: mime }),
    httpRequest: async ({ url }) => (global.__http ? global.__http(url) : Buffer.from('bytes-' + url)),
  };
  const run = async (name, input) => {
    const src = byName[name].parameters.jsCode;
    const idx = runs[name] || 0; runs[name] = idx + 1;
    const fn = new AsyncFn('$', '$input', '$runIndex', src);
    const res = await fn.call({ helpers }, $, { all: () => input, first: () => input[0] }, idx);
    out[name] = res; return res;
  };
  const set = (name, items) => { out[name] = items; return items; };
  const reset = names => names.forEach(n => { delete out[n]; delete runs[n]; });
  return { run, set, out, reset };
}
const J = o => ({ json: o });
const claudeResp = (obj, raw) => J({ type: 'message', stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 500 }, content: [{ type: 'text', text: raw || '```json\n' + JSON.stringify(obj) + '\n```' }] });
const evalExpr = (expr, $) => new Function('$', '$execution', 'return (' + expr.replace(/^=\{\{\s*|\s*\}\}$/g, '') + ')')($, { id: 'exec-1' });

(async () => {
  // ===================== SETUP =====================
  {
    const h = harness(setup);
    h.set('Setup Form', [J({ 'Baserow email': 'a@b.c', 'Baserow password': 'x', 'Baserow address (from n8n)': 'http://host.docker.internal:85', 'n8n address': 'http://localhost:5678' })]);
    h.set('Baserow: Create Database', [J({ id: 77 })]);
    h.set('Create Table: Content', [J({ id: 502 })]);
    h.set('Create Table: Slides', [J({ id: 503 })]);
    const specs = await h.run('Field Specs', [J({})]);
    const names = specs.map(s => s.json.name);
    assert(names.includes('1 · Gather Content & Design Requirements') && names.includes('Slides') && names.includes('Redo') && names.includes('Editable slides'));
    // every action the workflow routes has a button, and the setup creates the field names the workflow reads
    const actions = specs.map(s => (/action=(\w+)/.exec(s.json.body.formula || '') || [])[1]).filter(Boolean);
    for (const a of ['research', 'plan', 'slides', 'images', 'look', 'redo', 'finalize']) assert(actions.includes(a), 'button for ' + a);
    const btn = specs.find(s => s.json.name === '1 · Gather Content & Design Requirements').json.body.formula;
    assert.strictEqual(btn, "button(concat('http://localhost:5678/webhook/carousel-automation?action=research&row=', totext(row_id())), '▶ Brainstorm')");
    console.log('setup: fields =', specs.length, '| sample button formula OK');
    h.set('Baserow: Create Field', specs.map((s, i) => J({ id: 1000 + i, name: s.json.name, ...(s.json.body.select_options ? { select_options: s.json.body.select_options.map((o, k) => ({ id: 9000 + i * 20 + k, value: o.value })) } : {}) })));
    const seed = await h.run('Seed Rows', [J({})]);
    assert.strictEqual(seed.length, 1);
    assert(names.includes('Style Direction') && names.includes('Content Research') && !names.includes('Style profile'));
    const sum = (await h.run('Summary', [J({})]))[0].json;
    const so = JSON.parse(sum.selectOptions);
    assert(so.Status['Summary ready'] && so['Slide size']['Both (4:5 + 9:16)'] && so.Status['Style preview ready']);
    console.log('setup summary:', sum.contentTableId, sum.slidesTableId, '| select fields:', Object.keys(so).join(', '));
    // The optional Instagram auto-post path (off by default) uses fields/options the setup doesn't create; add them for its tests.
    const posting = { Status: { Scheduled: 9901, Posted: 9902 }, Platforms: { TikTok: 9911, Instagram: 9912, YouTube: 9913 },
      'Instagram as': { Carousel: 9921, Reel: 9922 }, 'Posting mode': { 'Save drafts only': 9931, 'Post now': 9932, 'Post at scheduled time': 9933 },
      Format: { Carousel: 9941, 'Carousel + slideshow video': 9942 } };
    for (const [f, o] of Object.entries(posting)) so[f] = { ...(so[f] || {}), ...o };
    var selectOptions = JSON.stringify(so);
  }

  // ===================== MAIN =====================
  const h = harness(main);
  const cfgNode = main.nodes.find(n => n.name === 'Config');
  global.__artFile = process.env.ART_FILE || ''; global.__pptxOut = process.env.PPTX_OUT || '';
  const cfg = Object.fromEntries(cfgNode.parameters.assignments.assignments.map(a => [a.name, a.value]));
  cfg.useMagica = true; // the older reference tests cover the Magica fallbacks; the no-Magica default is tested separately
  assert.strictEqual(cfg.textMode, 'pptx', 'default: text-free art + editable .pptx');
  cfg.textMode = 'image'; // the older image tests cover text drawn on the image; the .pptx default is tested separately
  assert.strictEqual(cfg.styleAnchor, true);
  cfg.styleAnchor = false; // the older flow renders every slide in one go; approve-first is tested separately
  Object.assign(cfg, { contentTableId: 502, slidesTableId: 503, selectOptions, igUserId: '1789', useOpenRouter: false });
  h.set('Config', [J(cfg)]);

  const baseRow = {
    id: 12, Title: 'What is insulin resistance?', 'Research request': 'Simple explainer, thin people, belly fat, tiredness',
    'Reference links': 'https://example.org/article https://example.org/blocked https://www.youtube.com/watch?v=abc https://www.tiktok.com/@a/video/123 https://www.instagram.com/p/DZtBACrgVaX/ https://x.com/jack/status/20 https://open.spotify.com/episode/xyz',
    'Reference files': [
      { url: 'http://localhost:85/media/user_files/ref.mp4', visible_name: 'ref.mp4', size: 1000, mime_type: 'video/mp4' },
      { url: 'http://localhost:85/media/user_files/slide1.png', visible_name: 'slide1.png', size: 500, mime_type: 'image/png' },
      { url: 'http://localhost:85/media/user_files/study.pdf', visible_name: 'study.pdf', size: 900, mime_type: 'application/pdf' },
      { url: 'http://localhost:85/media/user_files/notes.txt', visible_name: 'notes.txt', size: 20, mime_type: 'text/plain' },
    ],
    'Style direction': 'Calm health explainer, teal accent', Platforms: [{ id: 1, value: 'TikTok' }, { id: 2, value: 'Instagram' }, { id: 3, value: 'YouTube' }],
    Slides: [], 'Research brief': '', Niche: 'Keep this niche', 'Narrative prompt': '', 'Format prompt': '', 'Image style': '',
    'Cover reference images': [{ url: 'http://localhost:85/media/user_files/cover.jpg', name: 'cover.jpg' }], 'Slide reference images': [{ url: 'http://localhost:85/media/user_files/slide.png', name: 'slide.png' }],
  };
  const press = async (action, row) => {
    h.set('Carousel Webhook', [J({ query: { action, row: String(row.id) } })]);
    h.reset(['Check Action']);
    const r = (await h.run('Check Action', [J(row)]))[0].json;
    return r;
  };

  // --- guard ---
  let c = await press('plan', baseRow);
  assert(!c.ok && /Brainstorm/.test(c.html) && /Research brief is empty/.test(c.html));
  // --- 1 research ---
  c = await press('research', baseRow);
  assert(c.ok && !('profileUrl' in c));
  {
    // field names with different capitals still work
    const save = h.out['Baserow: Get Row'], saveC = h.out['Check Action'];
    h.set('Baserow: Get Row', [J({ id: 12, Title: 'X', 'Style Direction': 'Bold yellow', 'Reference Files': [{ url: 'http://localhost:85/media/a.docx', visible_name: 'a.docx' }], 'Research Request ': 'req' })]);
    const cc = (await h.run('Check Action', h.out['Baserow: Get Row']))[0].json;
    assert(cc.row['Style direction'] === 'Bold yellow' && cc.row['Reference files'][0].visible_name === 'a.docx' && cc.row['Research request'] === 'req');
    {
      h.set('Baserow: Get Row', [J({ id: 12, Title: 'X', 'Copy from text style reference': [{ value: 'Extras' }] })]);
      const ca = (await h.run('Check Action', h.out['Baserow: Get Row']))[0].json;
      assert(ca.row['Copy from reference'][0].value === 'Extras', 'renamed field is read');
    }
    h.set('Baserow: Get Row', save); h.set('Check Action', saveC);
  }
  const statusExpr = main.nodes.find(n => n.name === 'Baserow: Set Status').parameters.jsonBody;
  assert.strictEqual(typeof JSON.parse(evalExpr(statusExpr, n => ({ first: () => h.out[n][0] }))).Status, 'number');
  {
    const ls = (await h.run('Load Saved Research', [J({})]))[0].json;
    assert(ls.use === false, 'no saved research → full research');
  }
  const plannerReq = (await h.run('Build: Research Planner', [J({})]))[0].json;
  assert.deepStrictEqual(plannerReq.links, ['https://example.org/article', 'https://example.org/blocked']);
  assert(/spotify\.com.*4 uploaded file/.test(plannerReq.body.messages[0].content));
  h.set('Claude: Plan Research', [claudeResp({ queries: [{ query: 'insulin resistance thin people', topic: 'general' }, { query: 'insulin resistance belly fat study', topic: 'news' }] })]);
  const qs = await h.run('Parse Research Queries', h.out['Claude: Plan Research']);
  h.set('Tavily: Search', qs.map((q, i) => J({ answer: 'ans' + i, results: [{ url: 'https://pmc.example/' + i, title: 'Study ' + i, content: 'Finding ' + i }, { url: 'https://shared.example', title: 'Shared', content: 'dup' }] })));
  h.set('Tavily: Extract References', [J({ results: [{ url: 'https://example.org/article', raw_content: 'Article body about IR. '.repeat(20) }], failed_results: [{ url: 'https://example.org/blocked' }] })]);
  // --- references of every type ---
  const lr = (await h.run('List References', [J({})]))[0].json;
  assert.deepStrictEqual(lr.refs.map(r => r.kind + (r.fileKind ? ':' + r.fileKind : '')),
    ['file:video', 'file:image', 'file:document', 'file:text', 'youtube', 'tiktok', 'instagram', 'twitter', 'podcast', 'article']);
  assert.deepStrictEqual(lr.pages.map(p => p.kind), ['tiktok', 'instagram', 'twitter', 'article']);
  assert(lr.pages[1].readUrl === 'https://r.jina.ai/https://www.instagram.com/p/DZtBACrgVaX/' && /syndication\.twimg\.com\/tweet-result\?id=20/.test(lr.pages[2].readUrl));
  assert.strictEqual(lr.pages[3].url, 'https://example.org/blocked');
  await h.run('Explode Pages', [J({})]);
  const igMd = `Title: Dr X on Instagram: "Insulin resistance doesn't announce itself."\n\nURL Source: https://www.instagram.com/p/DZtBACrgVaX/\n\nMarkdown Content:\n[Log In](https://www.instagram.com/accounts/login/)\n![Image 1: drx's profile picture](https://scontent.cdninstagram.com/p.jpg?stp=dst-jpg_s150x150)\n*   ![Image 2: Photo by Dr X](https://scontent.cdninstagram.com/s1.jpg)\n*   ![Image 3: Photo by Dr X](https://scontent.cdninstagram.com/s2.jpg)\n\nInsulin resistance doesn't announce itself.\n\nLike\n\nReply\n\nsomeone: great post\n\nMore posts from drx\n\n[![Image 9: Video by Dr X](https://scontent.cdninstagram.com/other.jpg)](https://www.instagram.com/reel/zzz/)`;
  h.set('Read Page', [
    J({ body: 'Title: tt\n\nMarkdown Content:\nWatch on TikTok video.mp4' }),
    J({ body: igMd }),
    J({ body: JSON.stringify({ text: 'just setting up my twttr', mediaDetails: [] }) }),
    J({ body: 'Title: Blocked article\n\nMarkdown Content:\n' + 'Long readable article text about insulin. '.repeat(20) }),
  ]);
  const pp = (await h.run('Parse Pages', h.out['Read Page']))[0].json.pages;
  if (process.env.DBG) console.log(JSON.stringify(pp, null, 1));
  assert.deepStrictEqual(pp[1].images, ['https://scontent.cdninstagram.com/s1.jpg', 'https://scontent.cdninstagram.com/s2.jpg'], 'IG slides only, no avatars or other posts');
  assert(pp[1].caption === "Insulin resistance doesn't announce itself." && !pp[1].hasVideo && !/great post/.test(pp[1].text));
  assert(pp[2].caption === 'just setting up my twttr' && pp[2].ok && pp[0].hasVideo && pp[3].text.length > 200);
  // Scrape Creators: full IG carousel (3 photos + 1 video slide); TikTok request fails → page reader result kept
  assert(lr.hasScPages && lr.scPages.map(p => p.kind).join() === 'tiktok,instagram' && /v1\/instagram\/post$/.test(lr.scPages[1].api));
  await h.run('Explode SC Posts', [J({})]);
  h.set('Scrape Creators: Get Post', [
    J({ error: { message: '402 - out of credits' } }),
    J({ success: true, credits_charged: 1, data: { xdt_shortcode_media: {
      is_video: false, display_url: 'https://cdn/ig/cover.jpg',
      edge_media_to_caption: { edges: [{ node: { text: 'Full caption from Scrape Creators' } }] },
      edge_sidecar_to_children: { edges: [
        { node: { is_video: false, display_url: 'https://cdn/ig/1.jpg' } }, { node: { is_video: false, display_url: 'https://cdn/ig/2.jpg' } },
        { node: { is_video: true, display_url: 'https://cdn/ig/v.jpg' } }, { node: { is_video: false, display_url: 'https://cdn/ig/3.jpg' } },
      ] } } } }),
  ]);
  const merged = (await h.run('Merge SC Posts', h.out['Scrape Creators: Get Post']))[0].json.pages;
  const igp = merged.find(p => p.kind === 'instagram');
  assert.deepStrictEqual(igp.images, ['https://cdn/ig/1.jpg', 'https://cdn/ig/2.jpg', 'https://cdn/ig/3.jpg']);
  assert(igp.caption === 'Full caption from Scrape Creators' && igp.source === 'Scrape Creators' && !igp.hasVideo);
  assert(merged.find(p => p.kind === 'tiktok').hasVideo && !merged.find(p => p.kind === 'tiktok').source, 'failed SC call keeps page reader result');
  // TikTok photo post parsing
  {
    h.set('Explode SC Posts', [J({ url: 'https://www.tiktok.com/@a/photo/1', kind: 'tiktok' })]);
    const save = h.out['Parse Pages'];
    h.set('Parse Pages', [J({ pages: [{ url: 'https://www.tiktok.com/@a/photo/1', kind: 'tiktok', ok: false, caption: '', text: '', images: [], hasVideo: false }] })]);
    const tk = (await h.run('Merge SC Posts', [J({ aweme_detail: { desc: 'tt caption', image_post_info: { images: [{ display_image: { url_list: ['https://t/1.jpg'] } }, { display_image: { url_list: ['https://t/2.jpg'] } }] } } })]))[0].json.pages[0];
    assert(tk.ok && tk.caption === 'tt caption' && tk.images.length === 2 && !tk.hasVideo);
    h.set('Parse Pages', save); h.set('Explode SC Posts', lr.scPages.map(p => J(p)));
    h.set('Merge SC Posts', [J({ pages: merged })]);
  }
  const cu = (await h.run('Collect Uploads', [J({})]))[0].json;
  assert.deepStrictEqual(cu.uploads.map(u => u.fileKind), ['video', 'image', 'document', 'text', 'image', 'image', 'image']);
  assert.strictEqual(cu.uploads[0].url, 'http://host.docker.internal:85/media/user_files/ref.mp4');
  await h.run('Explode Uploads', [J(cu)]);
  const bins = cu.uploads.map(u => ({ json: {}, binary: { data: { mimeType: { video: 'video/mp4', image: 'image/jpeg', document: 'application/pdf', text: 'text/plain' }[u.fileKind], fileName: 'f' } } }));
  h.set('Download Upload', bins);
  const du2 = await h.run('Upload To Data URI', h.out['Download Upload']);
  assert(du2[0].json.body.media_type === 'video' && du2[2].json.body.media_type === undefined && du2[2].json.body.url.startsWith('data:application/pdf;base64,'));
  assert(typeof du2[3].json.inlineText === 'string');
  h.set('Magica: Upload File', cu.uploads.map((u, i) => (u.fileKind === 'text' ? J({ error: 'empty' }) : J({ url: `https://cdn.magica.example/u${i}` }))));
  let vstate = (await h.run('Build Reference Jobs', [J({})]))[0].json;
  const plan = Object.fromEntries(vstate.jobs.map(j => [j.kind + (j.label.endsWith('.txt') ? ':txt' : '') + ':' + j.n, j.status === 'done' ? `done(${j.via})` : j.attempts.map(a => a.nodeType + (a.input.image_urls ? '[img]' : a.input.file_urls ? '[doc]' : '')).join('>')]));
  console.log('reference plan:', JSON.stringify(plan));
  assert.deepStrictEqual(Object.values(plan), [
    'gemini_3_8_flash>ai_transcription', 'gemini_3_8_flash[img]', 'document_ocr>gemini_3_8_flash[doc]', 'done(text file)',
    'ai_transcription', 'social_media_video_downloader>ai_transcription', 'gemini_3_8_flash[img]>social_media_video_downloader>ai_transcription',
    'social_media_video_downloader>ai_transcription', 'podcast_summarizer', 'done(page text)',
  ]);
  const ig = vstate.jobs[6];
  assert(ig.attempts[0].input.image_urls.length === 3 && /Full caption from Scrape Creators/.test(ig.attempts[0].input.prompt) && /CAPTION/.test(ig.fallbackText));
  assert(!('output_format' in vstate.jobs[4].attempts[0].input) && vstate.jobs[5].attempts[1].input.output_format === 'timestamped');
  // round 1: start all pending; X download fails to start → transcript next
  let st = (await h.run('Reference Jobs To Run', [J(vstate)]))[0].json;
  assert.strictEqual(st.starts.length, 8);
  await h.run('Explode Magica Starts', [J(st)]);
  h.set('Magica: Start Run', st.starts.map((s, i) => (vstate.jobs[s.idx].kind === 'twitter' ? J({ error: { message: '400 No downloadable video was found' } }) : J({ runId: 'r' + i }))));
  vstate = (await h.run('Track Magica Runs', h.out['Magica: Start Run']))[0].json;
  assert(vstate.jobs[7].status === 'pending' && vstate.jobs[7].attempts[vstate.jobs[7].step].nodeType === 'ai_transcription');
  h.set('Wait for Magica', [J(vstate)]);
  let ck = await h.run('Explode Magica Checks', [J(vstate)]);
  const running = ck.map(c => vstate.jobs[c.json.idx]);
  h.set('Magica: Check Run', running.map(j => {
    if (j.kind === 'tiktok') return J({ status: 'COMPLETED', output: { video_url: 'https://dl.example/tt.mp4' } });
    if (j.kind === 'instagram') return J({ status: 'COMPLETED', input: { image_urls: ['u'] }, output: { output: 'SLIDES: Slide 1: LET\'S PREVENT INSULIN RESISTANCE' } });
    if (j.kind === 'podcast') return J({ status: 'COMPLETED', output: { result: 'Podcast transcript text' } });
    if (j.label === 'study.pdf') return J({ status: 'FAILED', error: 'VIDEO_FETCH_FAILED' });
    return J({ status: 'COMPLETED', output: { result: `text for ${j.label}` } });
  }));
  vstate = (await h.run('Evaluate Magica Runs', h.out['Magica: Check Run']))[0].json;
  assert(vstate.jobs[6].status === 'done' && vstate.jobs[6].via === 'slides read by Gemini' && /CAPTION/.test(vstate.jobs[6].text) && /PREVENT/.test(vstate.jobs[6].text));
  assert(vstate.jobs[8].via === 'podcast transcript' && vstate.jobs[2].status === 'pending' && vstate.jobs[2].attempts[vstate.jobs[2].step].input.file_urls);
  assert(vstate.jobs[5].status === 'pending' && vstate.jobs[5].attempts[1].input.video_urls[0] === 'https://dl.example/tt.mp4');
  // round 2: remaining jobs; Gemini on the TikTok download loses its video → transcript; OCR ok; X transcript fails → caption fallback
  h.reset(['Reference Jobs To Run', 'Explode Magica Checks']);
  st = (await h.run('Reference Jobs To Run', [J(vstate)]))[0].json;
  h.set('Magica: Start Run', st.starts.map((s, i) => J({ runId: 'q' + i })));
  vstate = (await h.run('Track Magica Runs', h.out['Magica: Start Run']))[0].json;
  h.set('Wait for Magica', [J(vstate)]);
  ck = await h.run('Explode Magica Checks', [J(vstate)]);
  h.set('Magica: Check Run', ck.map(c => {
    const j = vstate.jobs[c.json.idx];
    if (j.kind === 'tiktok') return J({ status: 'COMPLETED', input: { prompt: 'p' }, output: { output: 'A cheerful baby…' } });
    if (j.kind === 'twitter') return J({ status: 'FAILED', userMessage: 'no speech' });
    if (j.label === 'study.pdf') return J({ status: 'COMPLETED', input: { file_urls: ['u'] }, output: { output: 'Gemini notes on the study' } });
    return J({ status: 'COMPLETED', output: { markdown: 'other text' } });
  }));
  vstate = (await h.run('Evaluate Magica Runs', h.out['Magica: Check Run']))[0].json;
  assert(vstate.jobs[7].status === 'done' && vstate.jobs[7].via === 'caption/text only' && /twttr/.test(vstate.jobs[7].text), 'X falls back to its text');
  assert(vstate.jobs[2].via === 'read by Gemini' && /Gemini notes/.test(vstate.jobs[2].text) && vstate.jobs[5].status === 'pending' && /did not receive the video/.test(vstate.jobs[5].error));
  // round 3: TikTok transcript ok → all done
  h.reset(['Reference Jobs To Run', 'Explode Magica Checks']);
  st = (await h.run('Reference Jobs To Run', [J(vstate)]))[0].json;
  h.set('Magica: Start Run', [J({ runId: 'z1' })]);
  vstate = (await h.run('Track Magica Runs', h.out['Magica: Start Run']))[0].json;
  h.set('Wait for Magica', [J(vstate)]);
  await h.run('Explode Magica Checks', [J(vstate)]);
  h.set('Magica: Check Run', [J({ status: 'COMPLETED', output: { result: 'tiktok words' } })]);
  vstate = (await h.run('Evaluate Magica Runs', h.out['Magica: Check Run']))[0].json;
  assert(vstate.allDone && vstate.jobs.every(j => j.status === 'done'), JSON.stringify(vstate.jobs.map(j => [j.label, j.status, j.error])));
  // long transcripts → Gemini notes on the full text (and fallback to the raw text if notes fail)
  {
    const longText = 'word '.repeat(5000) + 'THE FOUR PILLARS ARE SLEEP, FOOD, MOVEMENT, STRESS';
    const mk = () => ({ n: 1, label: 'https://youtu.be/x', url: 'https://youtu.be/x', kind: 'youtube', attempts: [{ nodeType: 'ai_transcription', input: { inputMode: 'youtube', url: 'https://youtu.be/x' } }], step: 0, status: 'running', runId: 'r', text: '', via: '', error: '', fallbackText: '', fallbackVia: '' });
    h.reset(['Reference Jobs To Run', 'Explode Magica Checks']);
    h.set('Wait for Magica', [J({ jobs: [mk(), { ...mk(), label: 'short' }] })]);
    h.set('Explode Magica Checks', [J({ idx: 0 }), J({ idx: 1 })]);
    let st2 = (await h.run('Evaluate Magica Runs', [J({ status: 'COMPLETED', output: { result: longText } }), J({ status: 'COMPLETED', output: { result: 'short transcript' } })]))[0].json;
    const lj = st2.jobs[0];
    assert(lj.status === 'pending' && lj.attempts[lj.step].condense && lj.text.length > 15000 && !('prompt' in lj.attempts[lj.step].input), 'long transcript queued for notes, prompt not stored in state');
    assert(st2.jobs[1].status === 'done' && !st2.jobs[1].attempts[1], 'short transcript not condensed');
    const s2 = (await h.run('Reference Jobs To Run', [J(st2)]))[0].json;
    assert(s2.starts.length === 1 && /What Is Insulin Resistance/i.test(s2.starts[0].body.input.prompt) && s2.starts[0].body.input.prompt.endsWith('STRESS'), 'notes prompt has topic + full text');
    h.set('Reference Jobs To Run', [J(s2)]);
    h.set('Magica: Start Run', [J({ runId: 'n1' })]);
    st2 = (await h.run('Track Magica Runs', h.out['Magica: Start Run']))[0].json;
    h.set('Wait for Magica', [J(st2)]);
    h.set('Explode Magica Checks', [J({ idx: 0 })]);
    const notes = 'OVERVIEW: Bikman interview.\nLISTS & FRAMEWORKS: four pillars: sleep, food, movement, stress.\n' + 'x'.repeat(400);
    const ok2 = (await h.run('Evaluate Magica Runs', [J({ status: 'COMPLETED', input: { prompt: 'p' }, output: { output: notes } })]))[0].json;
    assert(ok2.jobs[0].status === 'done' && ok2.jobs[0].text === notes && /transcript → Gemini notes on the full transcript/.test(ok2.jobs[0].via), ok2.jobs[0].via);
    assert(ok2.allDone);
    // notes fail → keep raw transcript, don't fall to other attempts
    h.set('Wait for Magica', [J(st2)]);
    const bad = (await h.run('Evaluate Magica Runs', [J({ status: 'FAILED', error: 'TOO_LONG' })]))[0].json;
    assert(bad.jobs[0].status === 'done' && bad.jobs[0].text === longText && /notes failed/.test(bad.jobs[0].error));
    // notes can't even start → keep raw transcript
    h.set('Reference Jobs To Run', [J(s2)]);
    const nost = (await h.run('Track Magica Runs', [J({ error: { message: '413' } })]))[0].json;
    assert(nost.jobs[0].status === 'done' && nost.jobs[0].text === longText);
    h.reset(['Reference Jobs To Run', 'Explode Magica Checks']);
    h.set('Wait for Magica', [J(vstate)]);
  }
  // .rtf upload → plain text (short) and long .rtf → Gemini notes on the full text
  {
    const saveLR = h.out['List References'], saveCU = h.out['Collect Uploads'], saveEU = h.out['Explode Uploads'], saveDU = h.out['Download Upload'], saveMU = h.out['Magica: Upload File'], saveUD = h.out['Upload To Data URI'];
    h.set('Check Action', [J({ ...h.out['Check Action'][0].json, row: { ...baseRow, 'Reference links': '', 'Reference files': [
      { url: 'http://localhost:85/media/user_files/notes.rtf', visible_name: 'notes.rtf', size: 300, mime_type: 'application/rtf' },
      { url: 'http://localhost:85/media/user_files/long.rtf', visible_name: 'long.rtf', size: 90000, mime_type: 'text/rtf' },
    ] } })]);
    const lr2 = (await h.run('List References', [J({})]))[0].json;
    assert.deepStrictEqual(lr2.refs.map(r => r.fileKind), ['rtf', 'rtf']);
    const cu2 = (await h.run('Collect Uploads', [J({})]))[0].json;
    await h.run('Explode Uploads', [J(cu2)]);
    global.__bin = ['{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Insulin resistance doesn\\rquote t announce itself.\\par \\ldblquote Habit 9\\rdblquote  \\emdash  sugar}',
                    '{\\rtf1\\ansi\\f0 ' + 'Long interview notes about insulin. '.repeat(600) + '\\par The four pillars are sleep, food, movement, stress.}'];
    h.set('Download Upload', [0, 1].map(() => ({ json: {}, binary: { data: { mimeType: 'application/rtf', fileName: 'x.rtf' } } })));
    const du3 = await h.run('Upload To Data URI', h.out['Download Upload']);
    global.__bin = null;
    assert(/^\{\\rtf1/.test(du3[0].json.inlineText) && /Habit 9/.test(du3[0].json.inlineText), "rtf read as raw text");
    assert(/four pillars/.test(du3[1].json.inlineText));
    h.set('Magica: Upload File', [J({ error: 'empty' }), J({ error: 'empty' })]);
    const jb = (await h.run('Build Reference Jobs', [J({})]))[0].json.jobs;
    assert(jb[0].status === 'done' && jb[0].via === 'RTF file');
    assert(jb[1].status === 'pending' && jb[1].attempts[0].condense && /FULL RTF file/.test(jb[1].attempts[0].promptHead));
    const s3 = (await h.run('Reference Jobs To Run', [J({ jobs: jb })]))[0].json;
    assert(s3.starts.length === 1 && /four pillars/.test(s3.starts[0].body.input.prompt));
    h.reset(['Reference Jobs To Run']);
    h.set('Check Action', [J({ ...h.out['Check Action'][0].json, row: baseRow })]);
    h.set('List References', saveLR); h.set('Collect Uploads', saveCU); h.set('Explode Uploads', saveEU); h.set('Download Upload', saveDU); h.set('Magica: Upload File', saveMU); h.set('Upload To Data URI', saveUD);
  }
  // nothing running → placeholder check keeps the loop alive
  const ph = await h.run('Explode Magica Checks', [J({ jobs: [{ status: 'pending' }] })]);
  assert.strictEqual(ph[0].json.idx, -1);
  await h.run('Reference Notes', [J(vstate)]);
  console.log('references:', vstate.jobs.map(j => `${j.kind}${j.kind === 'file' ? '(' + j.label + ')' : ''}: ${j.via}`).join(' | '));
  const briefReq = (await h.run('Build: Research Brief Request', [J({})]))[0].json;
  assert(/PRODUCER REFERENCE — uploaded file, watched by Gemini: ref\.mp4/.test(briefReq.body.messages[0].content));
  assert(/PRODUCER REFERENCE — Instagram post, slides read by Gemini/.test(briefReq.body.messages[0].content) && /PRODUCER REFERENCE — podcast, podcast transcript/.test(briefReq.body.messages[0].content));
  assert(/From your references/.test(briefReq.body.messages[0].content) && /example\.org\/blocked/.test(briefReq.sourcesText));
  assert(briefReq.cache === '' && briefReq.hasCacheField === false, 'no Research cache field → nothing saved');
  {
    // research writes a short slideshow pack, not a report
    const bc = briefReq.body.messages[0].content; const bs = briefReq.body.system;
    assert(/SHORT slideshow pack/.test(bs) && /under about 1,500 words/.test(bs) && !/## Key facts/.test(bc) && !/## Surprising numbers/.test(bc));
    const order = ['## In one line', '## Slideshow pack', '### Lists', '### Hooks', '### Angles', '## From your references', "## Don't overstate"].map(x => bc.indexOf(x));
    assert(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), 'pack sections in order');
    // research stops for your review: no automatic plan
    assert(!main.nodes.some(n => n.name === 'Auto Plan?' || n.name === 'Start Plan') && !main.connections['Baserow: Save Research']);
    assert(bc.indexOf('## Suggested angle') > 0 && bc.indexOf('## Suggested angle') < bc.indexOf('## In one line'), 'suggested angle first');
  }
  {
    // with a "Research cache" field: the request is saved before Claude runs, reused on a retry, cleared on success
    const saveC = h.out['Check Action'];
    const cRow = { ...saveC[0].json.row, 'Research cache': '' };
    h.set('Check Action', [J({ ...saveC[0].json, row: cRow })]);
    const br = (await h.run('Build: Research Brief Request', [J({})]))[0].json;
    const saved = JSON.parse(br.cache);
    assert(saved.body.messages[0].content === br.body.messages[0].content && saved.sourcesText === br.sourcesText && saved.key);
    const cacheNode = main.nodes.find(n => n.name === 'Baserow: Save Research Cache');
    const claudeNode = main.nodes.find(n => n.name === 'Claude: Write Research Brief');
    assert(cacheNode.position[1] < claudeNode.position[1], 'cache node sits above Claude so it runs first');
    assert(JSON.parse(new Function('$json', 'return (' + cacheNode.parameters.jsonBody.replace(/^=\{\{\s*|\s*\}\}$/g, '') + ')')(br))['Research cache'] === br.cache);
    assert(cacheNode.onError === 'continueRegularOutput' && !cacheNode.retryOnFail && /patchUrl/.test(cacheNode.parameters.url));
    // retry with the same inputs → reuse (max_tokens raised to Config's)
    h.set('Check Action', [J({ ...saveC[0].json, row: { ...cRow, 'Research cache': br.cache } })]);
    const ls = (await h.run('Load Saved Research', [J({})]))[0].json;
    assert(ls.use && ls.body.messages[0].content === br.body.messages[0].content && ls.sourcesText === br.sourcesText);
    h.set('Claude: Write Research Brief', [claudeResp(null, '## In one line\nReused.')]);
    const sr = (await h.run('Save Research', h.out['Claude: Write Research Brief']))[0].json.body;
    assert(sr['Research cache'] === '' && sr.Sources === br.sourcesText && /Reused/.test(sr['Research brief']), 'saved research used and cleared');
    // inputs changed (new reference link) → not reused
    h.set('Check Action', [J({ ...saveC[0].json, row: { ...cRow, 'Reference links': cRow['Reference links'] + ' https://example.org/new', 'Research cache': br.cache } })]);
    const ls2 = (await h.run('Load Saved Research', [J({})]))[0].json;
    assert(ls2.use === false && ls2.stale === true, 'changed references → fresh research');
    h.set('Check Action', saveC); h.set('Load Saved Research', [J({ use: false })]);
    h.set('Build: Research Brief Request', [J(briefReq)]);
    const w = main.connections['Use Saved Research?'].main;
    assert(w[0][0].node === 'Claude: Write Research Brief' && w[1][0].node === 'Build: Research Planner');
    assert(main.connections['Build: Research Brief Request'].main[0].some(x => x.node === 'Baserow: Save Research Cache'));
  }
  {
    // long search results must not push your references out
    const saveS = h.out['Tavily: Search'];
    h.set('Tavily: Search', saveS.map(it => J({ ...it.json, results: Array.from({ length: 40 }, (_, k) => ({ url: 'https://s.example/' + k + Math.random(), title: 't', content: 'z'.repeat(1200) })) })));
    const big = (await h.run('Build: Research Brief Request', [J({})]))[0].json.body.messages[0].content;
    assert(!/search results cut for length|\[cut: all material/.test(big) && /PRODUCER REFERENCE — Instagram post/.test(big) && /PRODUCER REFERENCE — podcast/.test(big), 'nothing is cut in a normal run');
    // a huge reference (over the 2M-character safety ceiling) is shortened, the others stay whole
    const saveE = h.out['Tavily: Extract References'];
    h.set('Tavily: Extract References', [J({ results: [{ url: 'https://huge.example/a', title: 'huge', raw_content: 'h'.repeat(2500000) }] })]);
    const huge = (await h.run('Build: Research Brief Request', [J({})]))[0].json.body.messages[0].content;
    assert(/\[cut: all material together was too long\]/.test(huge) && /PRODUCER REFERENCE — podcast, podcast transcript: [^\n]*\nPodcast transcript text/.test(huge) && huge.length < 2100000, 'safety ceiling');
    h.set('Tavily: Extract References', saveE);
    h.set('Tavily: Search', saveS);
  }
  assert(/uploaded file: ref\.mp4/.test(briefReq.sourcesText) && /youtube\.com\/watch\?v=abc/.test(briefReq.sourcesText));
  assert(!/could not be read automatically/.test(briefReq.body.messages[0].content));
  assert(/\[1\] Reference supplied by producer — https:\/\/example.org\/article/.test(briefReq.sourcesText));

  // ===================== OpenRouter + Scrape Creators routes (useOpenRouter on) =====================
  {
    const o = harness(main);
    for (const [k, v] of Object.entries(h.out)) o.set(k, v);
    o.set('Config', [J({ ...cfg, useOpenRouter: true })]);
    const olr = (await o.run('List References', [J({})]))[0].json;
    assert(olr.hasYt && olr.ytRefs[0] === 'https://www.youtube.com/watch?v=abc');
    const longTranscript = 'Ben explains insulin resistance in plain words. '.repeat(400); // ~19K chars → gets notes
    // X video link from the free tweet data; TikTok video link + IG carousel from Scrape Creators
    o.set('Read Page', [o.out['Read Page'][0], o.out['Read Page'][1],
      J({ body: JSON.stringify({ text: 'tweet with video', mediaDetails: [{ type: 'video', video_info: { variants: [{ content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/a.m3u8' }, { content_type: 'video/mp4', bitrate: 832000, url: 'https://video.twimg.com/low.mp4' }, { content_type: 'video/mp4', bitrate: 2176000, url: 'https://video.twimg.com/big-high.mp4' }] } }] }) }),
      o.out['Read Page'][3]]);
    const opp = (await o.run('Parse Pages', o.out['Read Page']))[0].json.pages;
    assert(opp[2].videoUrl === 'https://video.twimg.com/big-high.mp4' && opp[2].hasVideo, 'best X mp4');
    o.set('Explode SC Posts', olr.scPages.map(p => J(p)));
    const sc = o.out['Scrape Creators: Get Post'];
    const om = (await o.run('Merge SC Posts', [J({ aweme_detail: { desc: 'tt video caption', video: { play_addr: { url_list: ['https://v16.tiktokcdn.com/tt.mp4'] } } } }), sc[1]]))[0].json.pages;
    assert(om[0].videoUrl === 'https://v16.tiktokcdn.com/tt.mp4' && om[0].caption === 'tt video caption' && !om[1].videoUrl);
    {
      // a single-video Reel gets its direct link too
      o.set('Explode SC Posts', [J({ url: 'https://www.instagram.com/p/DZtBACrgVaX/', kind: 'instagram' })]);
      const reel = (await o.run('Merge SC Posts', [J({ data: { xdt_shortcode_media: { is_video: true, display_url: 'https://cdn/r.jpg', video_url: 'https://cdn/reel.mp4', edge_media_to_caption: { edges: [{ node: { text: 'reel' } }] } } } })]))[0].json.pages;
      assert(reel.find(p => p.kind === 'instagram').videoUrl === 'https://cdn/reel.mp4');
      o.set('Explode SC Posts', olr.scPages.map(p => J(p))); o.set('Merge SC Posts', [J({ pages: om })]);
    }
    const ocu = (await o.run('Collect Uploads', [J({})]))[0].json;
    assert.strictEqual(ocu.uploads.length, h.out['Magica: Upload File'].length, 'same uploads as the Magica-only run');
    let os = (await o.run('Build Reference Jobs', [J({})]))[0].json;
    const tag = a => (a.provider === 'openrouter' ? `${a.task}:${modelLabel(a.model)}` : a.nodeType + (a.input.image_urls ? '[img]' : a.input.file_urls ? '[doc]' : '')) + (a.condense ? '(notes)' : '');
    const modelLabel = m => m.split('/')[1].split('-')[0];
    const oplan = os.jobs.map(j => (j.status === 'done' ? `done(${j.via})` : j.attempts.map(tag).join('>')));
    console.log('openrouter plan:', JSON.stringify(oplan));
    assert.deepStrictEqual(oplan, [
      'video:qwen3.8>video:gemini>gemini_3_8_flash>ai_transcription',
      'images:qwen3.8>images:gemini>gemini_3_8_flash[img]',
      'pdf:gemini>pdf:deepseek>document_ocr>gemini_3_8_flash[doc]',
      'done(text file)',
      'youtube:gemini>ai_transcription',
      'video:qwen3.8>video:gemini>social_media_video_downloader>ai_transcription',
      'images:qwen3.8>images:gemini>gemini_3_8_flash[img]>social_media_video_downloader>ai_transcription',
      'video:qwen3.8>video:gemini>social_media_video_downloader>ai_transcription',
      'podcast_summarizer', 'done(page text)',
    ]);
    assert(os.jobs[1].attempts[0].media.imageUrls[0] === 'http://host.docker.internal:85/media/user_files/slide1.png' && os.jobs[2].attempts[0].media.pdfUrl.endsWith('study.pdf'));
    // round 1: every job starts on OpenRouter; Magica (podcast) waits until the OpenRouter queue is empty
    let ors = (await o.run('Reference Jobs To Run', [J(os)]))[0].json;
    assert(ors.anyOr && ors.orCalls.length === 7 && ors.starts.length === 1 && ors.starts[0].nodeType === 'podcast_summarizer');
    const fetched = [];
    global.__http = url => { fetched.push(url); return /big-/.test(url) ? Buffer.alloc(21 * 1048576) : /\.png$/.test(url) ? Buffer.from('\x89PNG....', 'latin1') : Buffer.from('media:' + url); };
    let calls = (await o.run('Explode OpenRouter Calls', [J(ors)])).map(i => i.json);
    const byIdx = Object.fromEntries(calls.map(c => [c.idx, c]));
    assert(byIdx[0].body.messages[0].content[1].video_url.url.startsWith('data:video/mp4;base64,') && byIdx[0].body.model === 'qwen/qwen3.8-omni-flash');
    assert(byIdx[1].body.messages[0].content[1].image_url.url.startsWith('data:image/png;base64,') && byIdx[1].body.reasoning.enabled === false);
    // PDFs: Gemini Flash Lite reads the pages natively (scans, charts, tables), not just the text layer
    assert(byIdx[2].body.model === 'google/gemini-3.1-flash-lite' && byIdx[2].body.plugins[0].pdf.engine === 'native' && byIdx[2].body.messages[0].content[1].file.file_data.startsWith('data:application/pdf;base64,'));
    assert(/\[Figure:/.test(byIdx[2].body.messages[0].content[0].text) && /scanned pages/.test(byIdx[2].body.messages[0].content[0].text));
    {
      // YouTube: the link itself goes to Gemini, agentic, with short slideshow-focused notes
      const yc = byIdx[4].body.messages[0].content;
      assert(byIdx[4].body.model === 'google/gemini-3.8-flash' && yc[1].type === 'video_url' && yc[1].video_url.url === 'https://www.youtube.com/watch?v=abc' && yc[1].video_url.processing === 'agentic');
      assert(/LISTABLE ITEMS/.test(yc[0].text) && /under 6000 characters/.test(yc[0].text) && /NO VIDEO ACCESS/.test(yc[0].text) && !fetched.includes('https://www.youtube.com/watch?v=abc'), 'not downloaded');
    }
    assert(/Full caption from Scrape Creators/.test(byIdx[6].body.messages[0].content[0].text) && byIdx[6].body.messages[0].content.length === 4, 'IG slides + caption');
    assert(/over the 20 MB/.test(byIdx[7].skip) && byIdx[7].body.max_tokens === 1, 'X video too big → skipped');
    const orAnswer = text => J({ id: 'gen', provider: 'Alibaba', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: text } }], usage: { cost: 0.004 } });
    o.set('OpenRouter: Run', calls.map(c => {
      if (c.idx === 0) return orAnswer('SUMMARY: uploaded talk\nQUOTES: "insulin rises first"');
      if (c.idx === 1) return orAnswer('SLIDES:\nSlide 1: SIGNS');
      if (c.idx === 2) return orAnswer('Here is a summary of the key findings on insulin resistance.');
      if (c.idx === 4) return orAnswer('OVERVIEW: Ben Bikman interview.\n' + 'LISTABLE ITEMS: insulin first. '.repeat(30));
      if (c.idx === 5) return J({ error: { message: 'Provider returned error', code: 502 } });
      if (c.idx === 6) return orAnswer('SLIDES:\nSlide 1: LET\'S PREVENT INSULIN RESISTANCE');
      return J({ choices: [{ finish_reason: 'stop', message: { content: '' } }] });
    }));
    os = (await o.run('Apply OpenRouter Results', o.out['OpenRouter: Run']))[0].json;
    const J0 = os.jobs;
    assert(J0[0].status === 'done' && J0[0].via === 'watched by Qwen');
    assert(J0[1].status === 'done' && J0[1].via === 'slides read by Qwen');
    assert(J0[2].status === 'done' && J0[2].via === 'PDF read by Gemini' && /key findings/.test(J0[2].text));
    assert(J0[4].status === 'done' && J0[4].via === 'watched by Gemini (agentic)' && /^OVERVIEW: Ben Bikman/.test(J0[4].text) && J0[4].text.length < 6000);
    assert(J0[5].status === 'pending' && J0[5].attempts[J0[5].step].model === 'google/gemini-3.8-flash' && /Provider returned error/.test(J0[5].error), 'TikTok: Qwen failed → Gemini next');
    assert(J0[6].status === 'done' && J0[6].via === 'slides read by Qwen' && /CAPTION: Full caption/.test(J0[6].text) && /PREVENT/.test(J0[6].text));
    assert(!/PAGE TEXT/.test(J0[6].text), 'Scrape Creators post: caption only, no page-reader text');
    assert(J0[7].status === 'pending' && J0[7].attempts[J0[7].step].model === 'google/gemini-3.8-flash' && /OpenRouter skipped/.test(J0[7].error));
    // round 2: Gemini on OpenRouter for TikTok (works) and X (too big again → Magica download next)
    ors = (await o.run('Reference Jobs To Run', [J(os)]))[0].json;
    assert(ors.orCalls.map(c => c.idx).join() === '5,7');
    calls = (await o.run('Explode OpenRouter Calls', [J(ors)])).map(i => i.json);
    o.set('OpenRouter: Run', calls.map(c => (c.idx === 5 ? orAnswer('SUMMARY: TikTok talk') : J({}))));
    os = (await o.run('Apply OpenRouter Results', o.out['OpenRouter: Run']))[0].json;
    assert(os.jobs[5].status === 'done' && os.jobs[5].via === 'watched by Gemini');
    assert(os.jobs[7].status === 'pending' && os.jobs[7].attempts[os.jobs[7].step].nodeType === 'social_media_video_downloader');
    // round 3: nothing left on OpenRouter → Magica starts the podcast + the X download
    ors = (await o.run('Reference Jobs To Run', [J(os)]))[0].json;
    assert(!ors.anyOr && ors.starts.map(s => s.idx).join() === '7,8');
    await o.run('Explode Magica Starts', [J(ors)]);
    o.set('Magica: Start Run', [J({ runId: 'x1' }), J({ runId: 'p1' })]);
    os = (await o.run('Track Magica Runs', o.out['Magica: Start Run']))[0].json;
    o.set('Wait for Magica', [J(os)]);
    const ock = await o.run('Explode Magica Checks', [J(os)]);
    o.set('Magica: Check Run', ock.map(c => (c.json.idx === 7 ? J({ status: 'COMPLETED', output: { video_url: 'https://dl.example/x.mp4' } }) : J({ status: 'RUNNING' }))));
    os = (await o.run('Evaluate Magica Runs', o.out['Magica: Check Run']))[0].json;
    const nx = os.jobs[7].attempts[os.jobs[7].step];
    assert(nx.nodeType === 'gemini_3_8_flash' && nx.input.video_urls[0] === 'https://dl.example/x.mp4', 'already tried OpenRouter → straight to Gemini on Magica');
    // a downloaded video that OpenRouter hasn't seen yet goes to Qwen first
    {
      const st = JSON.parse(JSON.stringify(os));
      st.jobs[7].attempts = [{ nodeType: 'social_media_video_downloader', input: {}, then: 'gemini' }]; st.jobs[7].step = 0; st.jobs[7].status = 'running';
      o.set('Wait for Magica', [J(st)]); o.set('Explode Magica Checks', [J({ idx: 7 })]);
      const ev = (await o.run('Evaluate Magica Runs', [J({ status: 'COMPLETED', output: { video_url: 'https://dl.example/x2.mp4' } })]))[0].json;
      assert(ev.jobs[7].attempts.map(tag).join('>') === 'social_media_video_downloader>video:qwen3.8>video:gemini>gemini_3_8_flash');
    }
    // DeepSeek notes fail → Gemini notes on Magica; those fail too → the full transcript is kept
    {
      const st = JSON.parse(JSON.stringify(ors));
      const yj = st.jobs[4];
      Object.assign(yj, { status: 'pending', condensed: false, via: 'transcript', text: longTranscript, attempts: [{ provider: 'openrouter', task: 'condense', model: 'deepseek/x', condense: true, promptHead: 'P', input: {} }, { nodeType: 'gemini_3_8_flash', condense: true, promptHead: 'P', input: {} }], step: 0 });
      st.orCalls = [{ idx: 4 }];
      o.set('Reference Jobs To Run', [J(st)]); o.set('Explode OpenRouter Calls', [J({ idx: 4, model: 'deepseek/x', task: 'condense', body: {} })]);
      const a1 = (await o.run('Apply OpenRouter Results', [J({ choices: [{ finish_reason: 'stop', message: { content: 'too short' } }] })]))[0].json.jobs[4];
      assert(a1.status === 'pending' && a1.step === 1 && a1.attempts[1].nodeType === 'gemini_3_8_flash', 'DeepSeek notes too short → Gemini notes');
      o.set('Wait for Magica', [J({ jobs: st.jobs.map((j, i) => (i === 4 ? { ...a1, status: 'running', runId: 'g' } : j)), skipped: [] })]);
      o.set('Explode Magica Checks', [J({ idx: 4 })]);
      const a2 = (await o.run('Evaluate Magica Runs', [J({ status: 'FAILED', error: 'boom' })]))[0].json.jobs[4];
      assert(a2.status === 'done' && a2.text === longTranscript && /notes failed/.test(a2.error));
    }
    // Magica off (the default): nothing is copied to Magica, every attempt is OpenRouter, text files are read from Baserow
    {
      o.set('Config', [J({ ...cfg, useOpenRouter: true, useMagica: false })]);
      const cu2 = (await o.run('Collect Uploads', [J({})]))[0].json;
      assert(cu2.uploads.length === 0 && cu2.hasUploads === false, 'no Magica uploads');
      const keepUp = ['Magica: Upload File', 'Upload To Data URI', 'Collect Uploads'].map(n => [n, o.out[n]]);
      o.reset(['Magica: Upload File', 'Upload To Data URI']); o.set('Collect Uploads', [J(cu2)]);
      const fetchedText = []; global.__http = url => { fetchedText.push(url); return Buffer.from('notes from my text file'); };
      const nj = (await o.run('Build Reference Jobs', [J({})]))[0].json.jobs;
      assert(nj.every(j => j.attempts.every(a => a.provider === 'openrouter')), 'only OpenRouter attempts');
      const txtJob = nj.find(j => j.kind === 'file' && /\.txt$/.test(j.label));
      assert(txtJob.status === 'done' && txtJob.text === 'notes from my text file' && fetchedText.some(u => /host\.docker\.internal/.test(u)));
      {
        // long .txt → notes by Gemini Flash Lite (DeepSeek as backup); the PDF backup is DeepSeek on the text layer
        global.__http = () => Buffer.from('A long transcript line about insulin. '.repeat(600));
        const lj = (await o.run('Build Reference Jobs', [J({})]))[0].json.jobs.find(j => j.kind === 'file' && /\.txt$/.test(j.label));
        assert(lj.status === 'pending' && lj.attempts.map(a => a.model).join() === 'google/gemini-3.1-flash-lite,deepseek/deepseek-v4.1-flash-1017', 'long .txt notes model: ' + lj.attempts.map(a => a.model));
        const pj = nj.find(j => j.kind === 'file' && /\.pdf$/.test(j.label));
        assert(pj.attempts.map(a => a.task + ':' + a.model).join() === 'pdf:google/gemini-3.1-flash-lite,pdf:deepseek/deepseek-v4.1-flash-1017');
        const back = (await o.run('Explode OpenRouter Calls', [J({ jobs: [{ ...pj, step: 1 }], orCalls: [{ idx: 0 }] })]))[0].json;
        assert(back.body.model === 'deepseek/deepseek-v4.1-flash-1017' && back.body.plugins[0].pdf.engine === 'pdf-text', 'DeepSeek backup reads the extracted text');
        global.__http = url => { fetchedText.push(url); return Buffer.from('notes from my text file'); };
      }
      const pod = nj.find(j => j.kind === 'podcast');
      assert(pod.status === 'failed' && /podcasts can't be read without Magica/.test(pod.error));
      assert(nj.find(j => j.kind === 'youtube').attempts.map(a => a.task).join() === 'youtube', 'YouTube: Gemini only (Scrape Creators transcript later, only if Gemini fails)');
      {
        // uploaded audio → Gemini listens to it on OpenRouter (embedded as base64 input_audio)
        const keepLR = o.out['List References'];
        const aref = { kind: 'file', fileKind: 'audio', label: 'interview.m4a', url: 'http://host.docker.internal:85/media/user_files/interview.m4a', mime: 'audio/mp4' };
        o.set('List References', [J({ ...keepLR[0].json, refs: [aref] })]);
        const aj = (await o.run('Build Reference Jobs', [J({})]))[0].json;
        assert(aj.jobs[0].status === 'pending' && aj.jobs[0].attempts.map(x => x.task + ':' + x.model).join() === 'audio:google/gemini-3.8-flash', 'audio → Gemini');
        global.__http = () => Buffer.from('fake-audio-bytes');
        const ac = (await o.run('Explode OpenRouter Calls', [J({ ...aj, orCalls: [{ idx: 0 }] })]))[0].json;
        const part = ac.body.messages[0].content[1];
        assert(!ac.skip && ac.body.model === 'google/gemini-3.8-flash' && part.type === 'input_audio' && part.input_audio.format === 'm4a' && Buffer.from(part.input_audio.data, 'base64').toString() === 'fake-audio-bytes' && /NO AUDIO ACCESS/.test(ac.body.messages[0].content[0].text));
        o.set('Reference Jobs To Run', [J({ ...aj, orCalls: [{ idx: 0 }] })]); o.set('Explode OpenRouter Calls', [J(ac)]);
        const done = (await o.run('Apply OpenRouter Results', [J({ model: 'google/gemini-3.8-flash', choices: [{ finish_reason: 'stop', message: { content: 'SUMMARY: Dr X on insulin.\n' + 'KEY POINTS: insulin rises first. '.repeat(20) } }] })]))[0].json.jobs[0];
        assert(done.status === 'done' && done.via === 'heard by Gemini' && /Dr X/.test(done.text));
        const refused = (await o.run('Apply OpenRouter Results', [J({ choices: [{ finish_reason: 'stop', message: { content: 'NO AUDIO ACCESS' } }] })]))[0].json.jobs[0];
        assert(refused.status === 'failed', 'NO AUDIO ACCESS counts as a failure');
        // too big → skipped with a clear reason
        o.set('Config', [J({ ...cfg, useOpenRouter: true, useMagica: false, orMaxAudioMB: 0.000001 })]);
        const big = (await o.run('Explode OpenRouter Calls', [J({ ...aj, orCalls: [{ idx: 0 }] })]))[0].json;
        assert(/over the .* limit \(orMaxAudioMB/.test(big.skip));
        o.set('Config', [J({ ...cfg, useOpenRouter: true, useMagica: false })]);
        o.set('List References', keepLR); global.__http = null;
      }
      global.__http = null;
      for (const [n, v] of keepUp) o.set(n, v);
      o.set('Config', [J({ ...cfg, useOpenRouter: true })]);
      // nothing running on Magica → straight to the notes, no 15-second wait
      const sr = main.nodes.find(n => n.name === 'Magica Still Running?');
      const ev = jobs => new Function('$json', 'return (' + sr.parameters.conditions.conditions[0].leftValue.replace(/^=\{\{\s*|\s*\}\}$/g, '') + ')')({ jobs });
      assert(ev([{ status: 'done' }, { status: 'failed' }]) === false && ev([{ status: 'running' }]) === true);
      assert(main.connections['Any Magica Runs To Start?'].main[1][0].node === 'Magica Still Running?' && main.connections['Magica Still Running?'].main[1][0].node === 'YouTube Backup?' && main.connections['Magica Still Running?'].main[0][0].node === 'Wait for Magica');
      assert(main.connections['YouTube Backup?'].main[1][0].node === 'Reference Notes' && main.connections['YouTube Backup?'].main[0][0].node === 'Explode YouTube Backups' && main.connections['Magica Runs Done?'].main[0][0].node === 'YouTube Backup?');
      assert(main.connections['Scrape Creators: YouTube Backup'].main[0][0].node === 'Apply YouTube Backups' && main.connections['Apply YouTube Backups'].main[0][0].node === 'Reference Jobs To Run');
      // Gemini failed on YouTube links → Scrape Creators transcript only for those; long → DeepSeek notes; short → used as is; none → stays failed
      const yb = main.nodes.find(n => n.name === 'YouTube Backup?');
      const ybEv = jobs => new Function('$json', 'return (' + yb.parameters.conditions.conditions[0].leftValue.replace(/^=\{\{\s*|\s*\}\}$/g, '') + ')')({ jobs });
      const failedYt = (url, extra = {}) => ({ kind: 'youtube', url, label: url, status: 'failed', step: 1, attempts: [{ provider: 'openrouter', task: 'youtube' }], text: '', via: '', error: 'Gemini: NO VIDEO ACCESS', ...extra });
      const st0 = { jobs: [{ kind: 'file', status: 'done', text: 'pdf' }, failedYt('https://youtu.be/a'), failedYt('https://youtu.be/b'), failedYt('https://youtu.be/c'), { kind: 'youtube', url: 'https://youtu.be/ok', status: 'done', text: 'gemini notes', via: 'watched by Gemini (agentic)' }], skipped: [] };
      assert(ybEv(st0.jobs) === true && ybEv([{ kind: 'youtube', status: 'done' }]) === false && ybEv([failedYt('x', { scTried: true })]) === false);
      o.set('YouTube Backup?', [J(st0)]);
      const asks = (await o.run('Explode YouTube Backups', [J(st0)])).map(i => i.json);
      assert(asks.map(a => a.idx).join() === '1,2,3' && asks[0].url === 'https://youtu.be/a', 'only the failed YouTube links');
      const longT = 'Ben explains insulin resistance in plain words. '.repeat(400);
      const nb = (await o.run('Apply YouTube Backups', [J({ transcript_only_text: longT }), J({ transcript_only_text: 'A short but real transcript about insulin. '.repeat(10) }), J({ error: { message: 'Video unavailable' } })]))[0].json.jobs;
      assert(nb[1].status === 'pending' && nb[1].step === 0 && nb[1].attempts[0].task === 'condense' && nb[1].text === longT.trim() && /Gemini couldn't watch it/.test(nb[1].via));
      assert(nb[2].status === 'done' && /short but real/.test(nb[2].text) && nb[2].error === '');
      assert(nb[3].status === 'failed' && /NO VIDEO ACCESS; Scrape Creators: Video unavailable/.test(nb[3].error));
      assert(nb.filter(j => j.kind === 'youtube').every(j => j.scTried) && ybEv(nb) === false, 'one backup round only');
      assert(nb[4].text === 'gemini notes' && nb[0].text === 'pdf', 'other jobs untouched');
    }
    // everything off → the Magica-only plan (checked above) comes back
    {
      o.set('Config', [J({ ...cfg, useOpenRouter: false })]);
      const off = (await o.run('Build Reference Jobs', [J({})]))[0].json;
      assert(off.jobs.every(j => j.attempts.every(a => a.provider !== 'openrouter')));
    }
    global.__http = null;
    console.log('openrouter routes: Qwen/Haiku/Gemini/DeepSeek + Scrape Creators YouTube, fallbacks to Magica OK');
  }
    h.set('Claude: Write Research Brief', [claudeResp(null, '## In one line\nIR means cells respond poorly to insulin [1].')]);
  const savedR = (await h.run('Save Research', h.out['Claude: Write Research Brief']))[0].json;
  assert(savedR.body['Research brief'].startsWith('## In one line') && typeof savedR.body.Status === 'number');
  {
    // your renamed fields: read through aliases, the brief is written back under your name, the suggested angle fills Angle
    const keepCA = h.out['Check Action'];
    h.set('Carousel Webhook', [J({ query: { action: 'research', row: '12' } })]);
    h.reset(['Check Action']);
    const rr = (await h.run('Check Action', [J({ id: 12, Title: 'X', 'Content Research': 'req', 'Content Research Reference Links': 'https://a.org', 'Content Research Reference Files': [{ url: 'u', visible_name: 'f.pdf' }], 'Content Research Brief': '', Angle: '' })]))[0].json;
    assert(rr.row['Research request'] === 'req' && rr.row['Reference links'] === 'https://a.org' && rr.row['Reference files'][0].visible_name === 'f.pdf');
    assert(rr.names['Research brief'] === 'Content Research Brief');
    h.set('Claude: Write Research Brief', [claudeResp(null, '## Suggested angle\n5 signs your normal blood test missed it (Signs list, 5 items)\n\n## In one line\nX [1].')]);
    const sb = (await h.run('Save Research', h.out['Claude: Write Research Brief']))[0].json.body;
    assert(/^## Suggested angle/.test(sb['Content Research Brief']) && !('Research brief' in sb) && sb.Angle === '5 signs your normal blood test missed it (Signs list, 5 items)');
    // an Angle you already wrote is kept
    h.reset(['Check Action']);
    await h.run('Check Action', [J({ id: 12, Title: 'X', 'Content Research Brief': '', Angle: 'mine' })]);
    assert(!('Angle' in (await h.run('Save Research', h.out['Claude: Write Research Brief']))[0].json.body));
    {
      // Brainstorm reads an Angle you wrote: the searches and the pack aim at it, and the cache key changes with it
      const sug = '5 signs your normal blood test missed it (Signs list, 5 items)';
      const oldBrief = '## Suggested angle\n' + sug + '\n\n## In one line\nX [1].';
      const runFor = async angle => {
        h.reset(['Check Action']);
        await h.run('Check Action', [J({ id: 12, Title: 'X', 'Content Research': 'req', 'Content Research Brief': oldBrief, Angle: angle, 'Research cache': '' })]);
        const pl = (await h.run('Build: Research Planner', [J({})]))[0].json.body.messages[0].content;
        const br = (await h.run('Build: Research Brief Request', [J({})]))[0].json;
        const sv = (await h.run('Save Research', h.out['Claude: Write Research Brief']))[0].json.body;
        return { pl, bc: br.body.messages[0].content, key: JSON.parse(br.cache).key, sv };
      };
      const mine = await runFor('3 myths about insulin my GP never mentioned');
      assert(/producer's chosen angle \(aim the searches at it\): 3 myths about insulin my GP never mentioned/.test(mine.pl));
      assert(/PRODUCER'S ANGLE \(they wrote it; build the pack around it\): 3 myths about insulin/.test(mine.bc) && /keeping their wording/.test(mine.bc));
      assert(!('Angle' in mine.sv), 'your Angle is never overwritten');
      // the suggestion left from the last Brainstorm (even re-spaced) is not treated as yours, and gets replaced
      const left = await runFor('  5 signs your normal blood test   missed it (Signs list, 5 items) ');
      assert(!/chosen angle/.test(left.pl) && !/PRODUCER'S ANGLE \(they wrote/.test(left.bc) && left.sv.Angle === sug);
      const none = await runFor('');
      assert(!/chosen angle/.test(none.pl) && none.sv.Angle === sug && none.key === left.key && mine.key !== none.key, 'cache key follows your own angle only');
    }
    {
      // a Suggested outline in your request: searches cover each section, the summary has a "Your outline" section
      const req = 'Topic: Insulin Resistance\nAudience: adults 25 to 55.\nPost I want: An informative post.\nSuggested outline: Role of insulin, what is insulin resistance, signs of insulin resistance, what can one do to reverse it and a call-to-action\nOptional pool (not must-cover): statistics, expert mentions';
      h.reset(['Check Action']);
      await h.run('Check Action', [J({ id: 12, Title: 'X', 'Content Research': req, 'Content Research Brief': '', Angle: '' })]);
      const pl = (await h.run('Build: Research Planner', [J({})]))[0].json.body.messages[0].content;
      assert(/producer's outline \(the research must cover every section of it\): Role of insulin, .*call-to-action\n/.test(pl), 'outline only, up to the next label');
      assert(!/The producer's outline[^\n]*Optional pool/.test(pl));
      assert(/Plan 6-8 web searches\. First, at least one search per section/.test(pl) && !/Plan 5 web searches/.test(pl));
      const many = await h.run('Parse Research Queries', [claudeResp(null, JSON.stringify({ queries: Array.from({ length: 10 }, (_, i) => ({ query: 'q' + i, purpose: 'p' })) }))]);
      assert(many.length === 8, 'up to 8 searches with an outline');
      const bc = (await h.run('Build: Research Brief Request', [J({})]))[0].json.body;
      const u = bc.messages[0].content;
      assert(/## Your outline\nThe producer's outline: Role of insulin/.test(u) && /Not covered by the sources/.test(u) && u.indexOf('## Your outline') < u.indexOf('## Slideshow pack') && u.indexOf('## Your outline') > u.indexOf('## In one line'));
      assert(/DEPTH STANDARD for every key point and list item: Every point explains what happens AND why or how/.test(bc.system) && /Under each: 4-7 key points/.test(u) && /give the cause-and-effect chain step by step/.test(u) && /one or two plain sentences \(max 40 words\)/.test(u));
      assert(/for each, find how and why it happens \(the mechanism\)/.test(pl) && /concrete guideline numbers/.test(pl));
      assert(/under about 2,800 words/.test(bc.system) && /Follow every instruction in the PRODUCER'S REQUEST/.test(bc.system));
      // the plan and slide writers get the outline section too
      const fw = await h.run('Check Action', [J({ id: 12 })]);
      const brief = '## Suggested angle\nA\n\n## In one line\nX [1].\n\n## Your outline\n### Role of insulin\n- OUTLINE POINT | [1] | strong\n\n## Slideshow pack\n### Lists\n- a';
      const ev = new AsyncFn('$', 'return (' + 'function(){' + main.nodes.find(n => n.name === 'Build: Slides Request').parameters.jsCode.split('// ---------- end helpers ----------')[0].replace('// ---------- shared helpers', '//') + '; return briefForWriters; }' + ')()');
      const bfw = await ev(n => ({ first: () => (n === 'Config' ? J(cfg) : J({ row: {} })) }));
      assert(/OUTLINE POINT/.test(bfw(brief)) && bfw(brief).indexOf('## Your outline') < bfw(brief).indexOf('## Slideshow pack'));
      // no outline → as before
      h.reset(['Check Action']);
      await h.run('Check Action', [J({ id: 12, Title: 'X', 'Content Research': 'Topic: X\nPost I want: signs', 'Content Research Brief': '', Angle: '' })]);
      assert(/Plan 5 web searches/.test((await h.run('Build: Research Planner', [J({})]))[0].json.body.messages[0].content));
      const b0 = (await h.run('Build: Research Brief Request', [J({})]))[0].json.body;
      assert(!/## Your outline/.test(b0.messages[0].content) && /under about 1,500 words/.test(b0.system));
    }
    {
      // plan + draft text follow the outline section by section
      const outlined = 'Topic: IR\nSuggested outline: Role of insulin, what is insulin resistance, signs, what to do, call-to-action\nOptional pool: stats';
      const both = async req => {
        h.set('Carousel Webhook', [J({ query: { action: 'plan', row: '12' } })]); h.reset(['Check Action']);
        await h.run('Check Action', [J({ id: 12, Title: 'IR', 'Content Research': req, 'Content Research Brief': '## In one line\nX [1].', Angle: 'Always tired after meals?', 'Slide count': 8 })]);
        const pb = (await h.run('Build: Plan Request', [J({})]))[0].json.body;
        h.set('Carousel Webhook', [J({ query: { action: 'slides', row: '12' } })]); h.reset(['Check Action']);
        await h.run('Check Action', [J({ id: 12, Title: 'IR', 'Content Research': req, 'Content Research Brief': '## In one line\nX [1].', Angle: 'Always tired after meals?', 'Slide count': 8, 'Narrative prompt': 'n', 'Format prompt': 'f' })]);
        const sb = (await h.run('Build: Slides Request', [J({})]))[0].json.body;
        return { ps: pb.system, pu: pb.messages[0].content, ss: sb.system, su: sb.messages[0].content };
      };
      const o = await both(outlined);
      assert(/niche: under 15 words: the account's subject plus the specific topic keyword people search/.test(o.ps) && /information-dense educational carousel people save/.test(o.ps) && /the copy standard \(Every point explains/.test(o.ps) && /the title standard \(Titles are clear, searchable labels/.test(o.ps) && /a body of 3-5 bullet lines/.test(o.ps));
      assert(/Points the outline doesn't mention are welcome/.test(o.ps) && /THIS POST IS DIFFERENT: the producer gave an OUTLINE/.test(o.ps) && /Lay the OUTLINE out as slides/.test(o.ps) && /Slide flow:/.test(o.ps) && !/The angle is a list of N items/.test(o.ps));
      assert(/PRODUCER'S OUTLINE \(the post follows it section by section\): Role of insulin, .*call-to-action\n/.test(o.pu) && !/Optional pool/.test(o.pu.split("PRODUCER'S OUTLINE")[1].split('\n')[0]));
      assert(/engaging educational slideshows/.test(o.ss) && /Exactly 8 slides\. Slide 1 is the cover \(role "cover"\), slides 2-7 are the 6 section slides/.test(o.ss) && /never turn the post into one numbered list/.test(o.ss) && /"• "/.test(o.ss) && !/numbered "1\." to/.test(o.ss));
      assert(/PRODUCER'S OUTLINE \(the slides follow it section by section, in this order\): Role of insulin/.test(o.su));
      const l = await both('Topic: IR\nPost I want: signs');
      assert(!/OUTLINE/.test(l.ps + l.pu + l.ss + l.su) && /The angle is a list of N items/.test(l.ps) && /engaging listicle slideshows/.test(l.ss) && /Exactly 8 slides\. Slide 1 is the cover \(role "cover"\), slides 2-7 are the 6 list items/.test(l.ss) && /numbered "1\." to "6\."/.test(l.ss));
      // dense by default for list posts too; topic-neutral examples; "quick tips" keeps the short format
      assert(/Body slide: "title" is numbered and names the item in clear, searchable words/.test(l.ss) && /COPY STANDARD for every body slide/.test(l.ss) && /2-4 bullet lines/.test(l.ss));
      assert(/adapt it to this topic, never copy these/.test(l.ss) && /"How to build an emergency fund"/.test(l.ss) && /for money: accounts, fees, rates, steps/.test(l.ss));
      assert(/an information-dense list carousel people save/.test(l.ps) && /a numbered title that names the item in searchable words/.test(l.ps) && /for a money topic "personal finance basics/.test(l.ps));
      const q = await both('Topic: IR\nPost I want: quick tips, short and punchy');
      assert(/Body slide: "title" max 6 words \(numbered if it's a list\), "body" max 2 short sentences and 25 words/.test(q.ss) && !/COPY STANDARD/.test(q.ss) && /body max 2 short sentences/.test(q.ps) && !/information-dense/.test(q.ps));
      const qo = await both(outlined + '\nKeep it bite-sized');
      assert(/Short and punchy, as the producer asked/.test(qo.ss) && /short and punchy, as the producer asked/.test(qo.ps));
      // the copy on each slide comes from its own section's key points in "Your outline"
      assert(/Set "section" on every slide/.test(o.ss) && /use the facts in FACTS YOU MAY USE that belong to that section/.test(o.ss) && /"outline_sections"/.test(o.su) && !/"section"/.test(l.ss + l.su));
      h.reset(['Check Action']);
      await h.run('Check Action', [J({ id: 12, Title: 'IR', 'Content Research': outlined, 'Content Research Brief': '## In one line\nX [1].\n\n## Your outline\n### Role of insulin\n- KEYPOINT | [1] | strong', Angle: 'A', 'Slide count': 6, 'Narrative prompt': 'n', 'Format prompt': 'f' })]);
      const sr = (await h.run('Build: Slides Request', [J({})]))[0].json;
      assert(/start from the key points listed under that section's heading in "Your outline"/.test(sr.body.system) && /You may add other points from anywhere in FACTS YOU MAY USE/.test(sr.body.system) && !/Never move a point/.test(sr.body.system) && /KEYPOINT/.test(sr.body.messages[0].content) && sr.outline && sr.outlinePoints === true);
      // Parse Slides: a missing section and long bullets are flagged; CTA and covered sections are not
      const wr = { slides: [
        { section: 'cover', title: 'Always tired after meals?', body: '' },
        { section: 'Role of insulin', title: 'What insulin does', body: 'Insulin moves sugar into cells.' },
        { section: 'What is insulin resistance', title: 'When cells stop listening', body: '• cells ignore insulin\n• pancreas makes more\n• sugar stays normal at first' },
        { section: 'Signs', title: 'Signs to notice', body: Array.from({ length: 7 }, () => '• one two three four five six seven eight').join('\n') },
        { section: 'Call-to-action', title: 'Save this', body: 'Share it with a friend.' } ],
        outline_sections: ['Role of insulin', 'What is insulin resistance', 'Signs', 'What to do', 'Call-to-action'] };
      const ps = (await h.run('Parse Slides', [claudeResp(null, JSON.stringify(wr))]))[0].json.warning;
      assert(/No slide for these outline sections: What to do\./.test(ps) && !/Call-to-action\./.test(ps.split('No slide')[1] || ''), ps);
      assert(/Slide 4: body is 7 bullets \/ 56 words \(max 6 \/ 120\)/.test(ps) && !/Slide 3:/.test(ps) && !/no "Your outline" section/.test(ps), ps);
      {
        // the producer's own edited slides set the standard: they pass the checks with no warnings
        const mine = require('./fixtures-producer-slides.json');
        const pm = (await h.run('Parse Slides', [claudeResp(null, JSON.stringify({ slides: mine, outline_sections: mine.slice(1, -1).map(x => x.section) }))]))[0].json.warning;
        assert(!/Slide \d/.test(pm) && !/No slide for/.test(pm), pm);
        // and the slide writer is told that standard
        assert(/COPY STANDARD for every body slide: Every point explains what happens AND why or how/.test(sr.body.system) && /"Signs and symptoms of insulin resistance"/.test(sr.body.system) && /Never vague teasers like "So what goes wrong\?"/.test(sr.body.system));
        assert(/3-5 bullet lines/.test(sr.body.system) && /Never write "Swipe", arrows or page numbers/.test(sr.body.system) && /one reframing sentence/.test(sr.body.system) && /state strong and moderate facts plainly/.test(sr.body.system));
        const sw = (await h.run('Parse Slides', [claudeResp(null, JSON.stringify({ slides: [{ section: 'cover', title: 'Always tired? Swipe →', body: '' }, ...mine.slice(1)], outline_sections: [] }))]))[0].json.warning;
        assert(/Slide 1: has "Swipe" or an arrow/.test(sw), sw);
      }
      // an older summary without "Your outline" → told to re-run Brainstorm
      {
        // the number of slides you ask for is kept (Slide count, or "12 slides" in your request); more than 8/10 is fine
        const planFor = async (extra) => {
          h.set('Carousel Webhook', [J({ query: { action: 'plan', row: '12' } })]); h.reset(['Check Action']);
          await h.run('Check Action', [J({ id: 12, Title: 'IR', 'Content Research Brief': '## In one line\nX [1].', Angle: 'A', ...extra })]);
          return (await h.run('Build: Plan Request', [J({})]))[0].json.body.system;
        };
        assert(/exactly 10, because the producer wants 12 slides in total/.test(await planFor({ 'Content Research': outlined + '\nI want 12 slides' })));
        assert(/exactly 12, because the producer wants 14 slides/.test(await planFor({ 'Content Research': outlined, 'Slide count': 14 })));
        assert(/as many as the outline needs, up to 18/.test(await planFor({ 'Content Research': outlined })));
        assert(/N = exactly 9 \(the producer wants 11 slides in total\)/.test(await planFor({ 'Content Research': 'Topic: IR\nslides: 11' })));
        assert(/N between 4 and 18, as many as the angle needs/.test(await planFor({ 'Content Research': 'Topic: IR' })));
        // Save Plan writes the asked-for number; the slide writer and parser keep 12
        h.set('Claude: Fill Plan', [claudeResp(null, JSON.stringify({ item_count: 6, niche: 'n', narrative_prompt: 'n', format_prompt: 'f', image_style: 'i' }))]);
        await planFor({ 'Content Research': outlined + '\nI want 12 slides' });
        assert((await h.run('Save Plan', h.out['Claude: Fill Plan']))[0].json.body['Slide count'] === 12);
        await planFor({ 'Content Research': 'Topic: IR' });
        assert((await h.run('Save Plan', h.out['Claude: Fill Plan']))[0].json.body['Slide count'] === 8, 'no number asked → the plan decides');
        h.set('Carousel Webhook', [J({ query: { action: 'slides', row: '12' } })]); h.reset(['Check Action']);
        await h.run('Check Action', [J({ id: 12, Title: 'IR', 'Content Research': outlined, 'Content Research Brief': '## Your outline\n### a\n- b', Angle: 'A', 'Slide count': 12, 'Narrative prompt': 'n', 'Format prompt': 'f' })]);
        const s12 = (await h.run('Build: Slides Request', [J({})]))[0].json;
        assert(s12.count === 12 && /Exactly 12 slides\. Slide 1 is the cover \(role "cover"\), slides 2-11 are the 10 section slides/.test(s12.body.system));
        const twelve = Array.from({ length: 12 }, (_, i) => ({ section: i ? 's' + i : 'cover', title: 'Slide ' + (i + 1), body: i ? 'Short text.' : '' }));
        const p12 = (await h.run('Parse Slides', [claudeResp(null, JSON.stringify({ slides: twelve }))]))[0].json;
        assert(p12.createBody.items.length === 12, 'more than 10 slides kept');
        h.set('Build: Slides Request', [J(sr)]);
      }
      h.set('Build: Slides Request', [J({ ...sr, outlinePoints: false })]);
      assert(/no "Your outline" section/.test((await h.run('Parse Slides', [claudeResp(null, JSON.stringify(wr))]))[0].json.warning));
      h.set('Carousel Webhook', [J({ query: { action: 'research', row: '12' } })]);
    }
    const ng = (h.reset(['Check Action']), h.set('Carousel Webhook', [J({ query: { action: 'plan', row: '12' } })]), (await h.run('Check Action', [J({ id: 12, Title: 'X', 'Content Research Brief': '' })]))[0].json);
    assert(!ng.ok && /the Content Research Brief is empty/.test(ng.html));
    h.set('Check Action', keepCA);
  }
  console.log('research: sources', briefReq.sourcesText.split('\n').length, '| status id', savedR.body.Status);

  // --- 2 plan ---
  const row2 = { ...baseRow, 'Research brief': savedR.body['Research brief'] };
  c = await press('plan', row2); assert(c.ok);
  const planReq = (await h.run('Build: Plan Request', [J({})]))[0].json;
  assert.deepStrictEqual(planReq.missing, ['Narrative prompt', 'Format prompt', 'Image style']);
  assert(/Calm health explainer/.test(JSON.stringify(planReq.body)) && /collage/.test(JSON.stringify(planReq.body)));
  h.set('Claude: Fill Plan', [claudeResp({ niche: 'AI niche', narrative_prompt: 'Arc', format_prompt: 'Rules', image_style: 'Editorial', slide_count: 8, text_style: 'Font: Poppins Bold titles, Regular body, charcoal #222, teal #2A9D8F highlights.' })]);
  const savedP = (await h.run('Save Plan', h.out['Claude: Fill Plan']))[0].json.body;
  assert(!('Niche' in savedP) && savedP['Narrative prompt'] === 'Arc' && savedP['Slide count'] === 8);
  assert.strictEqual(savedP['Slide size'], JSON.parse(selectOptions)['Slide size']['4:5 (Instagram + TikTok)']);
  assert(!('Music' in savedP), 'Music field removed: never written');
  {
    // fields you deleted (Format, Posting mode, Instagram as) are not written
    const keepCA = h.out['Check Action']; const r0 = { ...keepCA[0].json.row }; delete r0.Format; delete r0['Posting mode']; delete r0['Instagram as'];
    h.set('Check Action', [J({ ...keepCA[0].json, row: r0 })]); h.reset(['Save Plan']);
    const sp2 = (await h.run('Save Plan', h.out['Claude: Fill Plan']))[0].json.body;
    assert(!('Format' in sp2) && !('Posting mode' in sp2) && !('Instagram as' in sp2));
    h.set('Check Action', keepCA); h.set('Save Plan', [J({ body: savedP })]);
  }
  assert(savedP['Text style'] === 'Font: Poppins Bold titles, Regular body, charcoal #222, teal #2A9D8F highlights.', 'plan writes a Text style');
  assert(/text_style/.test(planReq.body.system) && /real Google Font/.test(planReq.body.system));
  console.log('plan: kept user Niche, filled', Object.keys(savedP).join(', '));

  // --- 3 slides ---
  const so = JSON.parse(selectOptions);
  const row3 = { ...row2, 'Narrative prompt': 'Arc', 'Format prompt': 'Rules', 'Image style': 'Editorial', 'Slide count': 5, 'Slide size': { id: so['Slide size']['4:5 (Instagram + TikTok)'], value: '4:5 (Instagram + TikTok)' }, Slides: [{ id: 90 }, { id: 91 }] };
  c = await press('slides', row3); assert(c.ok);
  const slidesReq = (await h.run('Build: Slides Request', [J({})]))[0].json;
  assert(slidesReq.count === 5 && slidesReq.oldSlideIds.length === 2 && /STYLE DIRECTION: Calm/.test(JSON.stringify(slidesReq.body)));
  {
    const sys = slidesReq.body.system;
    assert(/hook_options/.test(sys) && /scroll-stopping/.test(sys) && /search/.test(sys) && /No #fyp/.test(sys) && /"hook_options"/.test(slidesReq.body.messages[0].content));
  }
  const slideJson = { hook_options: ['Slide text 1', 'Hook B', 'Hook C'], slides: [1, 2, 3, 4, 5].map(n => ({ n, role: 'body', text: 'Slide text ' + n, image_prompt: 'Scene ' + n })), caption: 'Caption here', hashtags: ['insulin', '#health'], music_suggestion: 'calm piano' };
  h.set('Claude: Write Slides', [claudeResp(slideJson)]);
  const ps = (await h.run('Parse Slides', h.out['Claude: Write Slides']))[0].json;
  assert(ps.createBody.items[0].Role === so.Role.cover && ps.createBody.items[4].Role === so.Role.cta && ps.copy.Hashtags === '#insulin #health');
  h.set('Baserow: Create Slides', [J({ items: ps.createBody.items.map((it, i) => ({ id: 200 + i, ...it, Role: { value: i === 0 ? 'cover' : i === 4 ? 'cta' : 'body' } })) })]);
  // the image prompt carries the full text design (font, sizes, colours, highlight) for review
  {
    const ip = ps.createBody.items.map(it => it['Image prompt']);
    assert(/^SCENE: Scene 2\nTEXT DESIGN: /.test(ip[1]) && /largest text of the whole set/.test(ip[0]) && /about 60% of the cover headline/.test(ip[1]) && /save\/share line/.test(ip[4]));
    assert(/Montserrat/.test(ip[1]), 'no Text style yet → default typography spelled out');
  }
  // the draft text is saved for review: no images yet
  const sd = (await h.run('Save Draft Text', [J({})]))[0].json.body;
  assert(sd['Post caption'] === 'Caption here' && sd.Hashtags === '#insulin #health' && /5 slides written \(asked for 5\)/.test(sd['Posting log']) && /Approve draft text → make style preview/.test(sd['Posting log']));
  assert(sd.Status === (so.Status['Draft text ready'] || 'Draft text ready'));
  assert(main.connections['Baserow: Create Slides'].main[0][0].node === 'Save Draft Text' && main.connections['Save Draft Text'].main[0][0].node === 'Baserow: Text Ready' && !main.connections['Baserow: Text Ready']);
  // "Approve text → make images": every slide is rendered from the saved (editable) text and design
  c = await press('images', row3); assert(c.ok && /Style preview started/.test(c.html));
  assert(main.connections['Ready to Run?'].main[0][0].node === 'Baserow: Set Status' && main.connections['Baserow: Set Status'].main[0][0].node === 'Route Action' && main.connections['Route Action'].main[3][0].node === 'List Slides (images)');
  const allPicked = (await h.run('Pick Ticked Slides', ps.createBody.items.map((it, i) => J({ id: 200 + i, ...it, Role: { value: i === 0 ? 'cover' : i === 4 ? 'cta' : 'body' }, Redo: false }))))[0].json;
  assert.strictEqual(allPicked.count, 5);
  await h.run('Collect Render Job', [J(allPicked)]);
  const refs = (await h.run('List Reference Images', [J({})]))[0].json;
  assert.deepStrictEqual(refs.refs.map(r => r.kind + ':' + r.url), ['cover:http://host.docker.internal:85/media/user_files/cover.jpg', 'slide:http://host.docker.internal:85/media/user_files/slide.png']);
  const ex = await h.run('Explode Refs', [J(refs)]);
  const dl = ex.map((e, i) => ({ json: {}, binary: { data: { mimeType: i ? 'image/png' : 'image/jpeg', fileName: 'r' + i } } }));
  const du = await h.run('Refs To Data URI', dl);
  assert(du[1].json.dataUrl.startsWith('data:image/png;base64,') && du[0].json.kind === 'cover');
  const runsReq = await h.run('Build Image Runs', h.out['Refs To Data URI']);
  const content = r => r.json.body.messages[0].content;
  assert(runsReq[0].json.body.model === 'google/gemini-nano-banana-2.1' && /Never write slide numbers/.test(runsReq[0].json.prompt) && !/slide 1 of/i.test(runsReq[0].json.prompt) && runsReq[0].json.body.modalities.join() === 'image,text' && content(runsReq[0])[1].image_url.url.startsWith('data:image/jpeg;base64,'));
  assert(content(runsReq[2])[1].image_url.url.startsWith('data:image/png') && runsReq[2].json.body.image_config.aspect_ratio === '4:5' && runsReq[2].json.body.image_config.image_size === '2K');
  assert(/"Slide text 3"/.test(content(runsReq[2])[0].text) && /"Slide text 3"/.test(runsReq[2].json.prompt));
  assert(/TEXT DESIGN \(follow it exactly/.test(runsReq[2].json.prompt) && /Scene \(a real-life lifestyle photo; no symbolic props or visual metaphors\): Scene 3\n/.test(runsReq[2].json.prompt) && /following the TEXT DESIGN above/.test(runsReq[2].json.prompt) && !/SCENE:/.test(runsReq[2].json.prompt));
  // OpenRouter answers straight away with the images (data URLs); one comes back as a link instead
  const png = 'data:image/png;base64,' + Buffer.from('PNGDATA').toString('base64');
  global.__http = url => Buffer.from('linked-image:' + url);
  h.set('OpenRouter: Make Image', runsReq.map((_, i) => J({ choices: [{ message: { content: '', images: [{ type: 'image_url', image_url: { url: i === 3 ? 'https://cdn.example/img3.png' : png } }] } }], usage: { cost: 0.134 } })));
  const ci = await h.run('Collect Images', h.out['OpenRouter: Make Image']);
  assert(ci.length === 5 && ci[0].json.name === 'slide-1.png' && Buffer.from(ci[0].binary.data.data, 'base64').toString() === 'PNGDATA' && ci[0].binary.data.mimeType === 'image/png');
  assert(Buffer.from(ci[3].binary.data.data, 'base64').toString() === 'linked-image:https://cdn.example/img3.png');
  {
    // a slide with no image stops the run with a clear message
    const keep = h.out['OpenRouter: Make Image'];
    h.reset(['Collect Images']);
    await assert.rejects(h.run('Collect Images', [keep[0], J({ error: { message: 'Provider returned error' } }), J({ choices: [{ message: { content: 'I cannot make that' } }] }), keep[3], keep[4]]),
      /Image generation failed: slide 2: Provider returned error; slide 3: no image; the model said "I cannot make that"/);
    h.set('Collect Images', ci);
  }
  global.__http = null;
  {
    const up = main.nodes.find(n => n.name === 'Baserow: Upload Slide Image');
    assert(up.parameters.contentType === 'multipart-form-data' && up.parameters.bodyParameters.parameters[0].inputDataFieldName === 'data' && /upload-file/.test(up.parameters.url));
    const mk = main.nodes.find(n => n.name === 'OpenRouter: Make Image');
    assert(/openrouter\.ai\/api\/v1\/chat\/completions/.test(mk.parameters.url) && mk.onError === 'continueRegularOutput');
    assert(!main.nodes.some(n => /^Magica: (Upload Refs|Start Image Runs|Check Image Runs|Fetch Image Results|Keep Image)$/.test(n.name)), 'no Magica image steps');
    for (const n of ['Claude: Plan Research', 'Claude: Write Research Brief', 'Claude: Fill Plan', 'Claude: Write Slides']) assert(main.nodes.find(x => x.name === n).parameters.url === 'https://openrouter.ai/api/v1/messages', n);
  }
  h.set('Baserow: Upload Slide Image', ci.map((_, i) => J({ name: `abc${i}.png`, url: `http://localhost:85/media/user_files/abc${i}.png`, mime_type: 'image/png' })));
  const ssi = await h.run('Save Slide Images', h.out['Baserow: Upload Slide Image']);
  assert(ssi[0].json.url.endsWith('/503/200/?user_field_names=true') && ssi[0].json.body.Image[0].name === 'abc0.png' && ssi[0].json.body['Image URL'] === 'http://localhost:85/media/user_files/abc0.png');
  assert(ssi.length === 5 && ssi[0].json.body.Image.length === 1 && ssi[0].json.body.Image[0].visible_name === 'slide-1.png' && !('Image URL 9:16' in ssi[0].json.body));
  {
    // Slide size "Both": a 4:5 and a 9:16 image per slide, saved together on the slide row
    const keepOut = ['Check Action', 'Build Image Runs', 'OpenRouter: Make Image', 'Collect Images', 'Baserow: Upload Slide Image', 'Save Slide Images'].map(n => [n, h.out[n]]);
    h.set('Check Action', [J({ ...h.out['Check Action'][0].json, row: { ...h.out['Check Action'][0].json.row, 'Slide size': { value: 'Both (4:5 + 9:16)' } } })]);
    const br = await h.run('Build Image Runs', h.out['Refs To Data URI']);
    assert(br.length === 10 && br[0].json.body.image_config.aspect_ratio === '4:5' && br[1].json.body.image_config.aspect_ratio === '9:16' && br[1].json.n === 1 && br[1].json.both);
    assert(/fills the entire 9:16 canvas/.test(br[1].json.prompt) && /between about 15% and 75%/.test(br[1].json.prompt) && /fills the entire 4:5 canvas/.test(br[0].json.prompt));
    h.set('OpenRouter: Make Image', br.map(() => J({ choices: [{ message: { images: [{ image_url: { url: png } }] } }] })));
    const bci = await h.run('Collect Images', h.out['OpenRouter: Make Image']);
    assert(bci[0].json.name === 'slide-1-4x5.png' && bci[1].json.name === 'slide-1-9x16.png' && bci[1].json.size === '9:16');
    h.set('Baserow: Upload Slide Image', bci.map((_, i) => J({ name: `f${i}.png`, url: `http://localhost:85/media/f${i}.png` })));
    const bs = (await h.run('Save Slide Images', h.out['Baserow: Upload Slide Image'])).map(i => i.json);
    assert(bs.length === 5 && bs[0].body.Image.map(f => f.visible_name).join() === 'slide-1-4x5.png,slide-1-9x16.png');
    assert(bs[0].body['Image URL'] === 'http://localhost:85/media/f0.png' && bs[0].body['Image URL 9:16'] === 'http://localhost:85/media/f1.png');
    // 9:16 only: one image per slide
    h.set('Check Action', [J({ ...h.out['Check Action'][0].json, row: { ...h.out['Check Action'][0].json.row, 'Slide size': { value: '9:16 (TikTok, Reels, Shorts)' } } })]);
    const b9 = await h.run('Build Image Runs', h.out['Refs To Data URI']);
    assert(b9.length === 5 && b9.every(r => r.json.body.image_config.aspect_ratio === '9:16' && !r.json.both));
    for (const [n, v] of keepOut) h.set(n, v);
  }
  const fin = (await h.run('Finish Render', [J({})]))[0].json.body;
  assert(fin.Status === (so.Status['Draft image ready'] || 'Draft image ready'), 'images done');
  assert(/images made for 5 slides · \$0\.67 OpenRouter/.test(fin['Posting log']) && !('Post caption' in fin) && !('Music' in fin));
  assert.deepStrictEqual(ps.hooks, ['Hook B', 'Hook C']);
  assert(/Other hooks you could use[^\n]*\n• Hook B\n• Hook C/.test(sd['Posting log']), 'runner-up hooks in the log');
  console.log('slides: 5 rows, refs used, log:', fin['Posting log']);
  assert(!ps.warning && !/⚠️/.test(fin['Posting log']));

  // --- cover promise ↔ body-slide count (5 slides = cover + 3 body + cta) ---
  {
    const sys = slidesReq.body.system;
    assert(/it must be 3, the number of body slides/.test(sys));
    const tryCover = async text => {
      h.reset(['Parse Slides']);
      const sj = { ...slideJson, slides: slideJson.slides.map((s, i) => (i ? s : { ...s, text })) };
      return (await h.run('Parse Slides', [claudeResp(sj)]))[0].json.warning;
    };
    assert(/promises 7 but there are 3/.test(await tryCover('7 signs of insulin resistance')));
    assert(/promises 5 but there are 3/.test(await tryCover('Five mistakes I made')));
    assert.strictEqual(await tryCover('3 signs of insulin resistance'), '');
    assert.strictEqual(await tryCover('What 30 days without sugar did to me'), '');
    assert.strictEqual(await tryCover('Why you feel tired after lunch'), '');
    h.set('Parse Slides', [J(ps)]);
    console.log('cover promise check: 7≠3 and five≠3 warned; 3, "30 days", no number OK');
  }

  // --- cover "recreate the scene (same person)" mode ---
  {
    const savedCA = h.out['Check Action'];
    h.set('Check Action', [J({ ...savedCA[0].json, row: { ...savedCA[0].json.row, 'Cover reference use': { value: 'Recreate the scene (same person)' } } })]);
    h.reset(['Build Image Runs']);
    const rc = await h.run('Build Image Runs', h.out['Refs To Data URI']);
    assert(/Recreate the FIRST reference image/.test(rc[0].json.prompt) && /"Slide text 1"/.test(rc[0].json.prompt));
    const urlsOf = (r => r.json.body.messages[0].content.slice(1).map(c => c.image_url.url));
    assert.deepStrictEqual(urlsOf(rc[0]), [h.out['Refs To Data URI'][0].json.dataUrl], 'recreate: only the cover reference');
    assert(!/Recreate/.test(rc[2].json.prompt) && urlsOf(rc[2])[0] === h.out['Refs To Data URI'][1].json.dataUrl);
    assert(!/Recreate/.test(runsReq[0].json.prompt));
    h.set('Check Action', savedCA); h.set('Build Image Runs', runsReq);
    console.log('cover recreate mode: cover rebuilds the reference, body slides unchanged, default unchanged');
  }

  const imageMediumT = new Function('cfg', main.nodes.find(n => n.name === 'Build Image Runs').parameters.jsCode.match(/function txt[\s\S]*?\n}\n|const txt = [^\n]+\n/)[0] + main.nodes.find(n => n.name === 'Build Image Runs').parameters.jsCode.match(/function imageMedium[\s\S]*?\n}\n/)[0] + 'return imageMedium;')({});
  // --- redo one slide with its own reference image and a note ---
  {
    const keys = ['Check Action', 'Pick Ticked Slides', 'Collect Render Job', 'List Reference Images', 'Explode Refs', 'Refs To Data URI', 'Build Image Runs'];
    const saved = keys.map(k => [k, h.out[k]]);
    const savedCA = h.out['Check Action'];
    h.set('Check Action', [J({ ...savedCA[0].json, action: 'redo' })]);
    const rows = ps.createBody.items.map((it, i) => J({ id: 200 + i, ...it, Role: { value: i === 0 ? 'cover' : i === 4 ? 'cta' : 'body' }, Redo: i === 2,
      ...(i === 2 ? { 'Redo reference image': [{ url: 'http://localhost:85/media/user_files/mine.jpg' }], 'Redo note': 'make it a kitchen at night' } : {}),
      ...(i === 3 ? { 'Redo reference image': [{ url: 'http://localhost:85/media/user_files/not-ticked.jpg' }] } : {}) }));
    const pk = (await h.run('Pick Ticked Slides', rows))[0].json;
    assert(pk.count === 1 && pk.ticked[0].n === 3 && pk.ticked[0].ownRefs[0] === 'http://host.docker.internal:85/media/user_files/mine.jpg' && pk.ticked[0].note === 'make it a kitchen at night');
    await h.run('Collect Render Job', [J(pk)]);
    const lr = (await h.run('List Reference Images', [J({})]))[0].json;
    assert(lr.hasRefs && lr.refs.map(r => r.kind).join() === 'cover,slide,own' && lr.refs[2].slideId === 202 && !lr.refs.some(r => /not-ticked/.test(r.url)), 'only the ticked slide\'s own reference');
    const ex2 = await h.run('Explode Refs', [J(lr)]);
    const du2 = await h.run('Refs To Data URI', ex2.map((e, i) => ({ json: {}, binary: { data: { mimeType: 'image/jpeg', fileName: 'r' + i } } })));
    assert(du2[2].json.kind === 'own' && du2[2].json.slideId === 202);
    const rr = await h.run('Build Image Runs', du2);
    const urls = rr[0].json.body.messages[0].content.slice(1).map(c => c.image_url.url);
    assert(rr.length === 1 && rr[0].json.n === 3 && urls[0] === du2[2].json.dataUrl && urls[1] === du2[1].json.dataUrl, 'own reference first, then the post\'s slide reference');
    assert(/The first reference image is this slide's own reference from the producer: follow it closely/.test(rr[0].json.prompt) && /only lend the overall colour palette/.test(rr[0].json.prompt));
    assert(/Changes the producer wants on this slide \(these take priority\): make it a kitchen at night/.test(rr[0].json.prompt));
    // slides without their own reference or note are unchanged
    assert(!/own reference|Changes the producer wants/.test(runsReq[2].json.prompt));
    for (const [k, v] of saved) h.set(k, v);
    console.log('redo: one slide with its own reference image + note');
  }
  {
    // [handle] in a text style: your handle replaces it; with no handle, the sentence about it is dropped
    const style = 'Use Inter, left-aligned, pure white (#FFFFFF).\n\nBullet points use grey (#5A5A5A) checkmarks.\n\nAt the bottom center, display [handle] in small, semi-bold (600), widely tracked UPPERCASE text.';
    const savedCA = h.out['Check Action'];
    const rowWith = extra => h.set('Check Action', [J({ ...savedCA[0].json, row: { ...savedCA[0].json.row, 'Text style': style, ...extra } })]);
    rowWith({ 'Handle / series label': '' });
    h.reset(['Parse Slides']);
    const noH = (await h.run('Parse Slides', h.out['Claude: Write Slides']))[0].json.createBody.items[1]['Image prompt'];
    assert(!/handle/i.test(noH) && !/bottom center/.test(noH) && /checkmarks\.\s*Sizes:/.test(noH), noH);
    rowWith({ 'Handle / series label': '@example.health' });
    h.reset(['Parse Slides']);
    const withH = (await h.run('Parse Slides', h.out['Claude: Write Slides']))[0].json.createBody.items[1]['Image prompt'];
    assert(/At the bottom center, display "@example\.health" in small/.test(withH) && !/\[handle\]/.test(withH));
    // older saved prompts that still say [handle] are cleaned at render time too
    rowWith({ 'Handle / series label': '' });
    h.reset(['Build Image Runs']);
    const old = h.out['Collect Render Job'][0].json;
    h.set('Collect Render Job', [J({ ...old, slides: old.slides.map(x => ({ ...x, image_prompt: 'SCENE: a desk\nTEXT DESIGN: ' + style })) })]);
    const rr = await h.run('Build Image Runs', h.out['Refs To Data URI']);
    assert(!/\[handle\]|bottom center/.test(rr[0].json.prompt) && /No handles, usernames/.test(rr[0].json.prompt));
    h.set('Collect Render Job', [J(old)]); h.set('Check Action', savedCA); h.reset(['Parse Slides']); await h.run('Parse Slides', h.out['Claude: Write Slides']);
    console.log('[handle] placeholder: replaced with your handle, or dropped');
  }
  {
    // Title + Body Text fields: written separately, read back (your edits win), older slides fall back to Slide text
    const it = h.out['Parse Slides'][0].json.createBody.items;
    assert(it[1]['Body text'] === it[1]['Body Text'] && it[1].Title && it[1]['Body Text'] !== undefined && it[1]['Slide text'] === (it[1]['Body Text'] ? it[1].Title + '\n' + it[1]['Body Text'] : it[1].Title) && it[0]['Body Text'] === '');
    const savedCA = h.out['Check Action'];
    h.set('Check Action', [J({ ...savedCA[0].json, action: 'redo' })]);
    const pk = (await h.run('Pick Ticked Slides', [
      J({ id: 1, 'Slide #': 2, Role: { value: 'body' }, Redo: true, Title: 'My edited title', 'Body Text': '• first point\n• second point', 'Slide text': 'OLD\nold body' }),
      J({ id: 2, 'Slide #': 3, Role: { value: 'body' }, Redo: true, 'Slide text': 'Old title\nold body' }),
      J({ id: 3, 'Slide #': 4, Role: { value: 'body' }, Redo: true, Title: 'Title only', 'Body Text': '' }),
    ]))[0].json.ticked;
    assert(pk[0].text === 'My edited title\n• first point\n• second point' && pk[1].text === 'Old title\nold body' && pk[2].text === 'Title only');
    const keep = ['Collect Render Job', 'Build Image Runs'].map(k => [k, h.out[k]]);
    h.set('Collect Render Job', [J({ slides: pk.map(x => ({ ...x, image_prompt: 'SCENE: desk\nTEXT DESIGN: Inter.' })), isNew: false })]);
    h.reset(['Build Image Runs']);
    const br = await h.run('Build Image Runs', h.out['Refs To Data URI']);
    assert(/Draw the title "My edited title" .*body text "• first point\n• second point" in a smaller size of the same style, each line on its own line with even spacing/.test(br[0].json.prompt), br[0].json.prompt);
    assert(/Draw this text .*"Title only"/.test(br.find(r => r.json.n === 4).json.prompt));
    for (const [k, v] of keep) h.set(k, v);
    h.set('Check Action', savedCA);
    const fp = (await h.run('Finalize Plan', [J({ id: 9, 'Slide #': 1, Title: 'T', 'Body Text': 'B', Image: [{ url: 'http://localhost:85/media/x.png', visible_name: 'slide-1.png' }] })]).catch(() => null));
    if (fp) assert(JSON.stringify(fp[0].json).includes('T\\nB'));
    console.log('slide text: Title + Body Text, edits win, Slide text fallback, bullets kept on lines');
  }
  {
    // one medium + one text look for the whole set; light text gets a dark area; a style anchor slide is made first
    const savedCA = h.out['Check Action'];
    const keys = ['Collect Render Job', 'Pick Style Anchor', 'Build Anchor Run', 'Anchor Result', 'Build Image Runs', 'Baserow: Get Slide (images)', 'OpenRouter: Make Image', 'Collect Images', 'List Reference Images', 'Refs To Data URI'];
    const saved = keys.map(k => [k, h.out[k]]);
    const style = 'Use Inter, left-aligned. All primary text is pure white (#FFFFFF). Bullet points are muted dark grey (#5A5A5A) checkmarks.';
    h.set('Config', [J({ ...cfg, styleAnchor: true })]);
    const ill = 'Minimalist, aesthetic flat illustration with simple shapes, warm cream background and muted sage accents. Calm empty space left for text.';
    h.set('Check Action', [J({ ...savedCA[0].json, action: 'images', row: { ...savedCA[0].json.row, 'Image style': ill, 'Text style': style, 'Handle / series label': '' } })]);
    h.set('List Reference Images', [J({ refs: [], hasRefs: false, imageStyle: ill })]); h.reset(['Refs To Data URI']);
    const slides = [1, 2, 3, 4].map(n => ({ slideId: 300 + n, n, role: n === 1 ? 'cover' : n === 4 ? 'cta' : 'body', text: n === 1 ? 'Hook' : `Title ${n}\n• point a\n• point b`, image_prompt: `SCENE: scene ${n}\nTEXT DESIGN: ${style}` }));
    h.set('Collect Render Job', [J({ slides, isNew: false })]);
    h.set('Baserow: Get Slide (images)', slides.map(x => J({ id: x.slideId, 'Slide #': x.n, Role: { value: x.role }, Image: [] })));
    // full render: nothing kept → the first list slide (2) is the anchor, made first on its own
    h.reset(['Pick Style Anchor', 'Anchor Result', 'Build Anchor Run', 'Build Image Runs']);
    const pa = (await h.run('Pick Style Anchor', [J({})]))[0].json;
    assert(pa.needGen === true && pa.n === 2 && pa.slideId === 302);
    const ar = await h.run('Build Anchor Run', [J(pa)]);
    assert(ar.length === 1 && ar[0].json.n === 2 && !/slide 2 of this same set/.test(ar[0].json.prompt));
    const p2 = ar[0].json.prompt;
    assert(/A vertical 4:5 image with a text overlay/.test(p2) && /same medium \(illustration \(Minimalist, aesthetic flat illustration with simple shapes/.test(p2) && /Never a photograph or photo-realistic image/.test(p2), p2);
    assert(/Scene \(drawn as illustration .*not a photo\): scene 2/.test(p2) && !/real-life lifestyle photo/.test(p2) && /The artwork fills the entire 4:5 canvas/.test(p2));
    assert(/CONTRAST: the text is light \(#FFFFFF\), so the area behind every word must be dark/.test(p2) && /Bullet markers are always the body text colour \(#FFFFFF\)/.test(p2));
    const anchorImg = 'data:image/png;base64,' + Buffer.from('ANCHOR').toString('base64');
    const an = (await h.run('Anchor Result', [J({ choices: [{ message: { images: [{ image_url: { url: anchorImg } }] } }], usage: { cost: 0.05 } })]))[0].json;
    assert(an.dataUrl === anchorImg && an.cost === 0.05);
    const rest = await h.run('Build Image Runs', [J(an)]);
    assert(rest.length === 4 && rest[1].json.precomputed === anchorImg && rest[1].json.body.max_tokens === 1, 'anchor slide passed through');
    const r3 = rest[2].json; const imgs3 = r3.body.messages[0].content.slice(1).map(c => c.image_url.url);
    assert(imgs3[0] === anchorImg && /The FIRST reference image is slide 2 of this same set: match it exactly for medium/.test(r3.prompt));
    assert(rest[0].json.body.messages[0].content[1].image_url.url === anchorImg, 'the cover follows the anchor too');
    // Collect Images uses the anchor image for slide 2 and adds its cost
    const png = 'data:image/png;base64,' + Buffer.from('X').toString('base64');
    const ci = await h.run('Collect Images', rest.map((q, i) => (i === 1 ? J({ choices: [{ message: { content: 'o' } }], usage: { cost: 0.000001 } }) : J({ choices: [{ message: { images: [{ image_url: { url: png } }] } }], usage: { cost: 0.054 } }))));
    assert(ci.length === 4 && Buffer.from(ci[1].binary.data.data, 'base64').toString() === 'ANCHOR' && Math.abs(ci[1].json.cost - 0.050001) < 1e-9);
    // anchor failed → the set is made without one
    h.reset(['Build Image Runs']);
    const an0 = (await h.run('Anchor Result', [J({ error: { message: 'boom' } })]))[0].json;
    const noA = await h.run('Build Image Runs', [J(an0)]);
    assert(an0.dataUrl === '' && noA.length === 4 && !noA.some(r => r.json.precomputed || /same set/.test(r.json.prompt)));
    // redo: a slide you kept is the anchor (downloaded), nothing extra is made
    h.set('Check Action', [J({ ...h.out['Check Action'][0].json, action: 'redo' })]);
    h.reset(['Anchor Result', 'Build Image Runs', 'Pick Style Anchor']);
    h.set('Collect Render Job', [J({ slides: [slides[2]], isNew: false })]);
    h.set('Baserow: Get Slide (images)', slides.map(x => J({ id: x.slideId, 'Slide #': x.n, Role: { value: x.role }, Image: x.n === 3 ? [] : [{ url: `http://localhost:85/media/s${x.n}.png`, visible_name: `slide-${x.n}.png` }] })));
    const fetched = []; global.__http = url => { fetched.push(url); return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from('kept')]); };
    const pk = (await h.run('Pick Style Anchor', [J({})]))[0].json;
    assert(pk.needGen === false && pk.n === 2 && /^data:image\/png;base64,/.test(pk.dataUrl) && /host\.docker\.internal:85\/media\/s2\.png/.test(fetched[0]));
    const rr = await h.run('Build Image Runs', [J(pk)]);
    assert(rr.length === 1 && rr[0].json.body.messages[0].content[1].image_url.url === pk.dataUrl && /slide 2 of this same set/.test(rr[0].json.prompt));
    global.__http = null;
    // styleAnchor off → no anchor
    h.set('Config', [J({ ...cfg, styleAnchor: false })]); h.reset(['Pick Style Anchor']);
    assert((await h.run('Pick Style Anchor', [J({})]))[0].json.needGen === false && !(await h.run('Pick Style Anchor', [J({})]))[0].json.dataUrl);
    h.set('Config', [J({ ...cfg, styleAnchor: true })]);
    // a photo medium and dark text read the other way
    assert(/Never an illustration/.test(runsReq[0].json.prompt) && /A vertical 4:5 photo/.test(runsReq[0].json.prompt));
    // wiring
    const cn = (a, i = 0) => (main.connections[a].main[i] || []).map(c => c.node);
    assert(cn('Has References?', 1)[0] === 'Pick Style Anchor' && cn('Refs To Data URI')[0] === 'Pick Style Anchor' && cn('Pick Style Anchor')[0] === 'Make Style Anchor?');
    assert(cn('Make Style Anchor?', 0)[0] === 'Build Anchor Run' && cn('Make Style Anchor?', 1)[0] === 'Build Image Runs' && cn('Build Anchor Run')[0] === 'OpenRouter: Make Anchor' && cn('OpenRouter: Make Anchor')[0] === 'Anchor Result' && cn('Anchor Result')[0] === 'Build Image Runs');
    for (const [k, v] of saved) (v ? h.set(k, v) : h.reset([k]));
    h.set('Check Action', savedCA); h.set('Config', [J(cfg)]);
    console.log('one look per set: medium, text rules, contrast, style anchor (made first / kept slide / failed / off)');
    {
      // the plan names one medium and contrasts backgrounds with the text; scene prompts follow the medium
      const keepWh = h.out['Carousel Webhook'], keepCA2 = h.out['Check Action'];
      const hook = { 'Content Research': 'Topic: IR', 'Content Research Brief': '## In one line\nX [1].', Angle: 'A', 'Image style': ill, 'Text style': style, 'Narrative prompt': 'n', 'Format prompt': 'f', 'Slide count': 6 };
      h.set('Carousel Webhook', [J({ query: { action: 'plan', row: '12' } })]); h.reset(['Check Action']);
      await h.run('Check Action', [J({ id: 12, Title: 'IR', ...hook })]);
      const pb = (await h.run('Build: Plan Request', [J({})]))[0].json.body;
      assert(/Start with "Medium: " and exactly ONE medium/.test(pb.system) && /never mix media/.test(pb.system) && /with light text \(e\.g\. white\), the area where text sits is dark/.test(pb.system));
      assert(/TEXT STYLE ALREADY SET \(choose image backgrounds that contrast with its text colour\): Use Inter/.test(pb.messages[0].content));
      h.set('Carousel Webhook', [J({ query: { action: 'slides', row: '12' } })]); h.reset(['Check Action']);
      await h.run('Check Action', [J({ id: 12, Title: 'IR', ...hook })]);
      const sb = (await h.run('Build: Slides Request', [J({})]))[0].json.body.system;
      assert(/described for this medium: illustration \(.*\) \(never a photo\)/.test(sb) && /Leave a calm, darker area for the text/.test(sb) && !/as a real-life photo moment/.test(sb));
      assert(imageMediumT('Medium: soft 3D illustration. Pastel.') === 'soft 3D illustration' && imageMediumT('Editorial, natural light') === 'real-life photograph');
      h.set('Carousel Webhook', keepWh); h.set('Check Action', keepCA2);
    }
  }
  {
    // approve-first: the preview (first list slide) alone, then "Approve look" makes the others; text-free art + editable .pptx
    const savedCA = h.out['Check Action'];
    const keys = ['Config', 'Pick Ticked Slides', 'Collect Render Job', 'Pick Style Anchor', 'Build Image Runs', 'Baserow: Get Slide (images)', 'Collect Images', 'Baserow: Upload Slide Image', 'Finish Render', 'Build PPTX', 'List Reference Images', 'Refs To Data URI', 'Anchor Result', 'Collect Image Checks'];
    const saved = keys.map(k => [k, h.out[k]]);
    const pc = { ...cfg, styleAnchor: true, textMode: 'pptx' };
    h.set('Config', [J(pc)]);
    const style = 'Use a clean neo-grotesk sans-serif font, closest to Google Font Inter. All primary text is left-aligned and pure white (#FFFFFF). The title is bold. Bullet points are muted dark grey (#5A5A5A) checkmark icons. Highlight colour #FFD84D.';
    const rowP = { ...savedCA[0].json.row, Title: 'What Is Insulin Resistance and Why It Matters', 'Image style': 'Medium: flat illustration. Deep teal backgrounds.', 'Text style': style, 'Handle / series label': '', 'Slide count': 4, 'Slide size': { value: '4:5 (Instagram + TikTok)' }, 'Copy from reference': [{ value: 'Extras' }] };
    const setAction = a => h.set('Check Action', [J({ ...savedCA[0].json, action: a, row: rowP, names: {} })]);
    const art = global.__artFile ? require('fs').readFileSync(global.__artFile) : Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from('fake')]);
    const rows = [
      { id: 401, 'Slide #': 1, Role: { value: 'cover' }, Title: 'Always tired after meals?', 'Body Text': '', Image: [] },
      { id: 402, 'Slide #': 2, Role: { value: 'body' }, Title: 'What insulin does', 'Body Text': '• Moves sugar from your blood into your cells\n• Tells your body to *store* extra energy\n• Keeps blood sugar steady between meals', Image: [] },
      { id: 403, 'Slide #': 3, Role: { value: 'body' }, Title: 'When cells stop listening', 'Body Text': 'Your cells respond less to insulin. Your pancreas makes more to keep up. Blood sugar can look normal for years.', Image: [] },
      { id: 404, 'Slide #': 4, Role: { value: 'cta' }, Title: 'Save this for your next check-up', 'Body Text': 'Share it with someone who needs it.', Image: [] },
    ];
    // 1) "Approve draft text → make draft images" = the style preview only (slide 2)
    setAction('images');
    const pv = (await h.run('Pick Ticked Slides', rows.map(r => J(r))))[0].json;
    assert(pv.count === 1 && pv.ticked[0].n === 2 && pv.previewN === 2 && pv.previewMade === false);
    // 2) "Approve look": everything but the preview once it has an image; everything when it doesn't
    setAction('look');
    const withPrev = rows.map(r => (r.id === 402 ? { ...r, Image: [{ url: 'http://localhost:85/media/prev.png', visible_name: 'slide-2.png' }] } : r));
    const lk = (await h.run('Pick Ticked Slides', withPrev.map(r => J(r))))[0].json;
    assert(lk.count === 3 && lk.ticked.map(t => t.n).join() === '1,3,4' && lk.previewMade === true);
    const lk0 = (await h.run('Pick Ticked Slides', rows.map(r => J(r))))[0].json;
    assert(lk0.count === 4, 'no preview yet → all slides');
    // the preview is made with no anchor; "look" uses the preview as its anchor
    setAction('images');
    await h.run('Collect Render Job', [J(pv)]);
    h.set('Baserow: Get Slide (images)', rows.map(r => J(r)));
    assert((await h.run('Pick Style Anchor', [J({})]))[0].json.needGen === false && !h.out['Pick Style Anchor'][0].json.dataUrl);
    setAction('look');
    await h.run('Collect Render Job', [J(lk)]);
    h.set('Baserow: Get Slide (images)', withPrev.map(r => J(r)));
    global.__http = () => art;
    const la = (await h.run('Pick Style Anchor', [J({})]))[0].json;
    assert(la.needGen === false && la.n === 2 && la.dataUrl, 'look: the preview is the anchor');
    // 3) text-free art prompts
    h.set('List Reference Images', [J({ refs: [], hasRefs: false, imageStyle: rowP['Image style'] })]); h.reset(['Refs To Data URI', 'Anchor Result']);
    const lr = await h.run('Build Image Runs', [J(la)]);
    const p3 = lr.find(r => r.json.n === 3).json.prompt;
    assert(lr.length === 3 && /used as the background art for one slide of a 4-slide slideshow\. The words are added later in an editor, so the image itself has NO text/.test(p3));
    assert(/NO TEXT ANYWHERE/.test(p3) && /TEXT SPACE \(same layout on every slide\): white text will be placed over the upper 70% of the frame, so that area must be DARK and calm/.test(p3) && /no bright, pale, white or cream areas/.test(p3) && !/Draw the title|TEXT DESIGN|Bullet markers|page counter/.test(p3));
    assert(/slide 2 of this same set: match it exactly for medium, rendering style, palette, lighting and where the calm empty text area sits/.test(p3) && /same medium \(flat illustration\)/.test(p3));
    assert(/upper 60%/.test(lr.find(r => r.json.n === 1).json.prompt));
    // 4) Finish Render: the preview status (falls back until "Style preview ready" exists in Status) and log
    setAction('images');
    await h.run('Collect Render Job', [J(pv)]);
    h.set('Collect Images', [J({ slideId: 402, n: 2, size: '4:5', both: false, name: 'slide-2.png', cost: 0.054 })]);
    h.set('Pick Style Anchor', [J({ needGen: false })]);
    h.reset(['Collect Image Checks']);
    const f1 = (await h.run('Finish Render', [J({})]))[0].json.body;
    assert(/style preview made \(slide 2\)\. Check its look in the Slides table and the Editable slides file\. Like it\? Press ▶ Approve look → make the other slides/.test(f1['Posting log']));
    const optsNow = JSON.parse(pc.selectOptions || '{}');
    assert(f1.Status === (optsNow.Status && optsNow.Status['Style preview ready'] !== undefined ? optsNow.Status['Style preview ready'] : (optsNow.Status || {})['Draft image ready'] || 'Draft image ready'));
    h.set('Config', [J({ ...pc, selectOptions: JSON.stringify({ ...optsNow, Status: { ...(optsNow.Status || {}), 'Style preview ready': 9999 } }) })]);
    assert((await h.run('Finish Render', [J({})]))[0].json.body.Status === 9999);
    h.set('Config', [J(pc)]);
    // 5) the editable .pptx: every slide with its art (preview made now, the others empty yet) and real text boxes
    h.set('Baserow: Get Slide (images)', rows.map(r => J(r)));
    h.set('Baserow: Upload Slide Image', [J({ name: 'up-2.png', url: 'http://localhost:85/media/user_files/up-2.png' })]);
    const fetched = []; global.__http = url => { fetched.push(url); return art; };
    const bp = await h.run('Build PPTX', [J({})]);
    assert(bp.length === 1 && !bp[0].json.error && bp[0].json.name === 'what-is-insulin-resistance-and-why-it-matters-4x5.pptx' && bp[0].json.slides === 4 && bp[0].json.withArt === 1, JSON.stringify(bp[0].json));
    assert(fetched.length === 1 && /host\.docker\.internal:85\/media\/user_files\/up-2\.png/.test(fetched[0]));
    const buf = Buffer.from(bp[0].binary.data.data, 'base64');
    if (global.__pptxOut) require('fs').writeFileSync(global.__pptxOut, buf);
    assert(buf.slice(0, 4).toString('latin1') === 'PK\x03\x04' && bp[0].binary.data.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    const str = buf.toString('utf8');
    assert(/<a:latin typeface="Inter"\/>/.test(str) && /<a:srgbClr val="FFFFFF"\/><\/a:solidFill><a:effectLst><a:outerShdw [^>]*><a:srgbClr val="000000"><a:alpha val="55000"\/><\/a:srgbClr><\/a:outerShdw><\/a:effectLst><a:latin/.test(str) && /<a:buClr><a:srgbClr val="FFFFFF"\/><\/a:buClr><a:buFont typeface="Arial"\/><a:buChar char="•"\/>/.test(str), 'Inter, white text, white bullets');
    assert(/<a:srgbClr val="FFD84D"\/><\/a:solidFill><a:effectLst>.*?<\/a:effectLst><a:latin typeface="Inter"\/><a:cs typeface="Inter"\/><\/a:rPr><a:t>store<\/a:t>/.test(str), 'highlighted word');
    assert(/<a:t>Your cells respond less to insulin\.<\/a:t>/.test(str) && /<a:t>Your pancreas makes more to keep up\.<\/a:t>/.test(str), 'one sentence per paragraph');
    assert(/name="Text shade \(delete if not needed\)"/.test(str) && /<a:t>1\/4   Swipe →<\/a:t>/.test(str) && /<a:t>2\/4<\/a:t>/.test(str) && !/name="Handle"/.test(str));
    assert(/<p:sldSz cx="6858000" cy="8572500"\/>/.test(str) && (str.match(/<p:sldId /g) || []).length === 4 && /ppt\/media\/image2\.(png|jpeg)/.test(str));
    assert(/<a:alpha val="65000"\/>/.test(str) && !/<a:alpha val="85000"\/>/.test(str), 'normal shade');
    {
      // the image check says slide 2's text area is too light → that slide gets a stronger shade + a warning
      h.set('Collect Render Job', [J({ slides: [{ slideId: 402, n: 2, role: 'body', text: 'T\nB' }], isNew: false })]);
      h.set('Baserow: Upload Slide Image', [J({ name: 'up-2.png', url: 'http://localhost:85/media/user_files/up-2.png', mime_type: 'image/png' })]);
      h.reset(['Build Image Checks']); h.set('Config', [J({ ...pc, useOpenRouter: true })]);
      const bic = await h.run('Build Image Checks', [J({})]);
      assert(bic[0].json.lightText === true && /"text_area_ok": true only if the upper 70% of the image is dark and calm enough that WHITE text placed over it would be easy to read/.test(bic[0].json.body.messages[0].content[0].text));
      const res = [J({ choices: [{ message: { content: JSON.stringify({ ui: false, not_full_bleed: false, collage: false, text_ok: true, foreign_label: false, text_area_ok: false, notes: 'pale sky behind text' }) } }] })];
      h.set('OpenRouter: Check Image', res);
      const w = (await h.run('Collect Image Checks', res))[0].json.warnings.join('\n');
      assert(/Slide 2 image: the text area is too light for the text \(the Editable slides file uses a stronger shade behind the text on this slide\)/.test(w), w);
      h.reset(['Build PPTX']);
      const bp2 = await h.run('Build PPTX', [J({})]);
      const s2 = Buffer.from(bp2[0].binary.data.data, 'base64').toString('utf8');
      const slide2 = s2.slice(s2.indexOf('What insulin does') - 3000, s2.indexOf('What insulin does'));
      assert(/<a:alpha val="85000"\/>/.test(s2) && (s2.match(/<a:alpha val="85000"\/>/g) || []).length === 1, 'only slide 2 gets the strong shade');
      h.reset(['OpenRouter: Check Image', 'Build Image Checks', 'Collect Image Checks']); h.set('Config', [J(pc)]);
    }
    // 6) the file goes into "Editable slides" with the status update; the Drive folder gets it on Save post
    const fin = (await h.run('Finish Render', [J({})]))[0].json;
    const ad = (await h.run('Add PPTX To Row', [J({ name: 'stored-pptx.pptx', url: 'http://localhost:85/media/user_files/stored-pptx.pptx' })]))[0].json;
    assert(ad.url === fin.url && ad.body['Editable slides'][0].name === 'stored-pptx.pptx' && ad.body['Editable slides'][0].visible_name === bp[0].json.name && / · editable slides: what-is-insulin/.test(ad.body['Posting log']));
    h.set('Build PPTX', [J({ error: 'Editable slides (.pptx) not made: boom' })]);
    const ad2 = (await h.run('Add PPTX To Row', [J({ error: { message: 'no binary' } })]))[0].json.body;
    assert(!('Editable slides' in ad2) && /⚠️ Editable slides \(\.pptx\) not made: boom/.test(ad2['Posting log']) && ad2.Status === fin.body.Status);
    global.__http = null;
    // wiring
    const cn = (a, i = 0) => (main.connections[a].main[i] || []).map(c => c.node);
    assert(cn('Route Action', 3)[0] === 'List Slides (images)' && /\['images', 'look', 'redo'\]/.test(main.nodes.find(n => n.name === 'Route Action').parameters.rules.values[3].conditions.conditions[0].leftValue));
    assert(cn('Finish Render')[0] === 'Make PPTX?' && cn('Make PPTX?', 0)[0] === 'Build PPTX' && cn('Make PPTX?', 1)[0] === 'Baserow: Slides Ready' && cn('Build PPTX')[0] === 'Baserow: Upload PPTX' && cn('Baserow: Upload PPTX')[0] === 'Add PPTX To Row' && cn('Add PPTX To Row')[0] === 'Baserow: Slides Ready');
    const ex = await h.run('Explode Slide Files', [J({})]).catch(() => null);
    for (const [k, v] of saved) (v ? h.set(k, v) : h.reset([k]));
    h.set('Check Action', savedCA);
    console.log('approve-first look + text-free art + editable .pptx');
  }

  // --- research → plan → slides quality changes (video-style directions, slideshow pack, title/body) ---
  {
    const savedCA = h.out['Check Action'];
    const keep = ['Build: Plan Request', 'Claude: Fill Plan', 'Save Plan', 'Build: Slides Request', 'Claude: Write Slides', 'Parse Slides', 'Build Image Runs'];
    const saved = Object.fromEntries(keep.map(k => [k, h.out[k]]));
    const pack = '## In one line\nCells ignore insulin [1].\n\n## Key facts\n- LONG ARTICLE FACT [2]\n\n## From your references\nHook: "your doctor checks the wrong thing" [3]\n\n## Don\'t overstate\n- say "linked to"\n\n## Slideshow pack\n### Lists\n- the 3pm crash | energy dips after meals | [4] | weak\n### Angles\n- 5 signs your normal blood test missed';
    const setRow = r => h.set('Check Action', [J({ ...savedCA[0].json, row: { ...savedCA[0].json.row, ...r } })]);
    setRow({ 'Research brief': pack, Angle: '', 'Narrative prompt': '', 'Format prompt': '', 'Image style': '', 'Slide count': null });

    h.reset(['Build: Plan Request']);
    const pr = (await h.run('Build: Plan Request', [J({})]))[0].json.body;
    assert(/EXAMPLE A \(personal finance/.test(pr.system) && /EXAMPLE B \(corporate career/.test(pr.system) && /never list slide-by-slide/i.test(pr.system));
    const um = pr.messages[0].content;
    assert(/Slideshow pack/.test(um) && /your doctor checks the wrong thing/.test(um) && /linked to/.test(um) && !/LONG ARTICLE FACT/.test(um), 'plan gets the pack, references and caveats, not the article');
    h.set('Claude: Fill Plan', [claudeResp({ angle: '5 signs your normal blood test missed', item_count: 5, niche: 'n', narrative_prompt: 'np', format_prompt: 'fp', image_style: 'is' })]);
    h.reset(['Save Plan']);
    const sp = (await h.run('Save Plan', h.out['Claude: Fill Plan']))[0].json.body;
    assert(sp['Slide count'] === 7 && sp.Angle === '5 signs your normal blood test missed');
    // a typed Angle is kept
    setRow({ 'Research brief': pack, Angle: 'my own angle', 'Slide count': null });
    h.reset(['Build: Plan Request', 'Save Plan']);
    await h.run('Build: Plan Request', [J({})]);
    assert(!('Angle' in (await h.run('Save Plan', h.out['Claude: Fill Plan']))[0].json.body));
    // old briefs without a pack are passed whole
    setRow({ 'Research brief': '## Key facts\n- LONG ARTICLE FACT [2]' });
    h.reset(['Build: Plan Request']);
    assert(/LONG ARTICLE FACT/.test((await h.run('Build: Plan Request', [J({})]))[0].json.body.messages[0].content));

    // slide writer: Format prompt is the system voice, facts = pack only
    setRow({ 'Research brief': pack, 'Slide count': 7, 'Format prompt': 'casual lowercase, like a friend', Angle: '5 signs' });
    h.reset(['Build: Slides Request']);
    const sr = (await h.run('Build: Slides Request', [J({})]))[0].json;
    assert(sr.count === 7 && /^You are a TikTok slideshow content creator/.test(sr.body.system) && /casual lowercase, like a friend/.test(sr.body.system));
    assert(/it must be 5, the number of body slides/.test(sr.body.system) && /Never put two items on one slide/.test(sr.body.system));
    assert(/ANGLE: 5 signs/.test(sr.body.messages[0].content) && !/LONG ARTICLE FACT/.test(sr.body.messages[0].content));

    // title/body parsing + quality warnings
    const sl = [
      { role: 'cover', title: '5 signs your normal blood test missed', body: 'ignored' },
      { role: 'body', title: '1. the 3pm crash', body: 'You eat lunch. Then your energy drops.', image_prompt: 'desk at 3pm' },
      { role: 'body', title: '2. dark neck patches', body: 'One. Two. Three sentences here.' },
      { role: 'body', title: 'Habits 2 and 3 of 3', body: 'Walk.' },
      { role: 'body', title: '4. skin tags', body: 'Small and common.' },
      { role: 'body', title: '5. always hungry', body: 'Even after meals.' },
      { role: 'cta', title: 'normal isn\'t the whole story', body: 'save this for your next check-up' },
    ];
    h.set('Build: Slides Request', [J(sr)]);
    h.reset(['Parse Slides']);
    const pz = (await h.run('Parse Slides', [claudeResp({ slides: sl, caption: 'c', hashtags: [] })]))[0].json;
    const it = pz.createBody.items;
    assert(it[0]['Slide text'] === '5 signs your normal blood test missed', 'cover has no body');
    assert(it[1]['Slide text'] === '1. the 3pm crash\nYou eat lunch. Then your energy drops.');
    assert(!/promises/.test(pz.warning), '5 promised, 5 body slides');
    // dense copy (the default): 3 short sentences are fine; two items on one slide is still flagged
    assert(!/Slide 3:/.test(pz.warning) && /Slide 4: looks like two items/.test(pz.warning) && !/Slide 2:/.test(pz.warning), pz.warning);
    {
      // "quick tips" / short and punchy → the short limits
      h.set('Build: Slides Request', [J({ ...h.out['Build: Slides Request'][0].json, dense: false })]); h.reset(['Parse Slides']);
      const ps2 = (await h.run('Parse Slides', [claudeResp({ slides: sl, caption: 'c', hashtags: [] })]))[0].json;
      assert(/Slide 3: body is 3 sentences/.test(ps2.warning) && /Slide 4: looks like two items/.test(ps2.warning));
      h.set('Build: Slides Request', [J(sr)]); h.reset(['Parse Slides']);
      await h.run('Parse Slides', [claudeResp({ slides: sl, caption: 'c', hashtags: [] })]);
    }

    // image prompt renders a headline over smaller body text; cover stays one line
    h.set('Collect Render Job', [J({ isNew: true, slides: it.map((x, i) => ({ slideId: 300 + i, n: i + 1, role: i === 0 ? 'cover' : i === 6 ? 'cta' : 'body', text: x['Slide text'], image_prompt: x['Image prompt'] })) })]);
    h.reset(['Build Image Runs']);
    const ir = await h.run('Build Image Runs', h.out['Refs To Data URI']);
    assert(/Draw the title "1\. the 3pm crash" following the TEXT DESIGN above/.test(ir[1].json.prompt) && /body text "You eat lunch\.\nThen your energy drops\." in a smaller size of the same style, each line on its own line with even spacing/.test(ir[1].json.prompt));
    assert(/exactly as written[^"]*"5 signs your normal blood test missed"/.test(ir[0].json.prompt) && /no symbolic props/.test(ir[1].json.prompt) && /no recognisable real or famous people/i.test(ir[1].json.prompt));

    h.set('Check Action', savedCA);
    for (const k of keep) { if (saved[k]) h.set(k, saved[k]); else h.reset([k]); }
    h.reset(['Collect Render Job']); await h.run('Collect Render Job', [J(allPicked)]);
    console.log('quality: plan has video examples + pack-only research, angle saved, Format = writer voice, title/body split, ⚠️ checks, headline/body rendering');
  }

  // --- full-bleed / no-UI rules, Text style + typography reference, highlights, extras ---
  {
    const savedCA = h.out['Check Action'];
    const saved = ['List Reference Images', 'Refs To Data URI', 'Build Image Runs', 'Collect Render Job'].map(k => [k, h.out[k]]);
    const cfgBefore = h.out.Config; h.set('Config', [J({ ...cfgBefore[0].json, useOpenRouter: true })]);
    const setRow = r => h.set('Check Action', [J({ ...savedCA[0].json, row: { ...savedCA[0].json.row, ...r } })]);
    const slides7 = [
      { slideId: 1, n: 1, role: 'cover', text: 'the problem may not be *screen time*', image_prompt: 'p' },
      { slideId: 2, n: 2, role: 'body', text: '1. the 3pm crash\nyou eat lunch. then you *crash*.', image_prompt: 'desk at 3pm' },
    ];
    h.set('Collect Render Job', [J({ isNew: true, slides: slides7 })]);
    // 9:16 with no references: full-bleed + no UI rules, UI never named in the safe zone, no "carousel"
    setRow({ 'Slide size': { value: '9:16 (TikTok, Reels, Shorts)' }, 'Cover reference images': [], 'Slide reference images': [], 'Text style': '', 'Text style reference': [] });
    h.reset(['List Reference Images', 'Build Image Runs']); h.reset(['Refs To Data URI']);
    await h.run('List Reference Images', [J({})]);
    let ir = await h.run('Build Image Runs', [J({})]);
    let pr = ir[1].json.prompt;
    assert(/fills the entire 9:16 canvas edge to edge/.test(pr) && /not a screenshot: no phone, no app interface/.test(pr) && /between about 15% and 75%/.test(pr));
    assert(!/TikTok covers/.test(pr) && !/carousel/i.test(pr) && /No page counters, swipe prompts or watermarks\. No handles, usernames, series names, brand names, logos/.test(pr));
    assert(/highlighted: draw them in the highlight colour/.test(ir[0].json.prompt) && (r => r.json.body.messages[0].content.slice(1).map(c => c.image_url.url))(ir[1]).length === 0 && ir[1].json.body.model === 'google/gemini-nano-banana-2.1');

    // Text style + typography reference (sent last), Extras with handle → page counter + handle
    const tRow = { 'Slide size': { value: '9:16 (TikTok, Reels, Shorts)' }, 'Text style': 'Title: black text in a white rounded box.', 'Text style reference': [{ url: 'http://localhost:85/media/user_files/kayla.jpg' }],
      'Slide reference images': [{ url: 'http://localhost:85/media/user_files/slide.png' }], 'Copy from reference': [{ value: 'Font' }, { value: 'Extras' }], 'Handle / series label': '@example.health' };
    setRow(tRow);
    h.reset(['List Reference Images', 'Build Image Runs']);
    const lr = (await h.run('List Reference Images', [J({})]))[0].json;
    assert.deepStrictEqual(lr.refs.map(r => r.kind), ['cover', 'slide', 'text']);
    h.set('Refs To Data URI', lr.refs.map(r => J({ kind: r.kind })));
    h.set('Refs To Data URI', [J({ kind: 'cover', dataUrl: 'data:image/jpeg;base64,Yw==' }), J({ kind: 'slide', dataUrl: 'data:image/png;base64,cw==' }), J({ kind: 'text', dataUrl: 'data:image/jpeg;base64,dA==' })]);
    ir = await h.run('Build Image Runs', h.out['Refs To Data URI']);
    pr = ir[1].json.prompt;
    assert.deepStrictEqual((r => r.json.body.messages[0].content.slice(1).map(c => c.image_url.url))(ir[1]), ['data:image/png;base64,cw==', 'data:image/jpeg;base64,dA=='], 'scene refs first, typography ref last');
    assert(/TEXT STYLE \(follow it for all on-image text\): Title: black text in a white rounded box/.test(pr) && /following the TEXT STYLE above/.test(pr));
    assert(/The LAST reference image is a TYPOGRAPHY reference: copy only its text styling/.test(pr) && /page counter reads "2\/2"/.test(pr) && /Write "@example\.health" once.*only name, handle, label or logo allowed/.test(pr));
    {
      // your own handle shows even without Extras; no page counter then
      setRow({ ...tRow, 'Copy from reference': [{ value: 'Font' }] }); h.reset(['Build Image Runs']);
      const p2 = (await h.run('Build Image Runs', h.out['Refs To Data URI']))[1].json.prompt;
      assert(/Write "@example\.health" once/.test(p2) && /No page counters, swipe prompts or watermarks/.test(p2) && !/page counter reads/.test(p2));
      // Extras without a handle → counter, but no handle or logo at all
      setRow({ ...tRow, 'Copy from reference': [{ value: 'Extras' }], 'Handle / series label': '' }); h.reset(['Build Image Runs']);
      const p3 = (await h.run('Build Image Runs', h.out['Refs To Data URI']))[1].json.prompt;
      assert(/page counter reads/.test(p3) && /No handles, usernames, series names/.test(p3) && !/example/.test(p3));
      const r3 = await h.run('Build Image Runs', h.out['Refs To Data URI']);
      assert(/swipe prompt, show it on this slide/.test(r3[0].json.prompt) && /No swipe prompt on this slide \(it only goes on slide 1\)/.test(r3[1].json.prompt), 'swipe prompt on slide 1 only');
      setRow(tRow);
    }

    // Step 2 reads the text style only when there's a reference and Text style is empty
    global.__http = () => Buffer.from('\x89PNG fake');
    const sRow = { 'Text style': '', 'Text style reference': [{ url: 'http://localhost:85/media/user_files/kayla.png' }], 'Copy from reference': [], 'Handle / series label': '@example.health' };
    setRow(sRow);
    h.reset(['Build: Text Style Request']);
    const ts = (await h.run('Build: Text Style Request', [J({})]))[0].json;
    const tsText = ts.body.messages[0].content[0].text;
    assert(ts.need && /closest Google Font/.test(tsText) && /describe only its size, styling and where it sits, calling it \[handle\]/.test(tsText) && ts.body.messages[0].content[1].image_url.url.startsWith('data:image/png;base64,'), 'own handle set → only the label position is read');
    {
      setRow({ ...sRow, 'Handle / series label': '' }); h.reset(['Build: Text Style Request']);
      const t2 = (await h.run('Build: Text Style Request', [J({})]))[0].json.body.messages[0].content[0].text;
      assert(/Ignore logos, usernames, handles, series labels/.test(t2));
      setRow({ ...sRow, 'Handle / series label': '', 'Copy from reference': [{ value: 'Extras' }] }); h.reset(['Build: Text Style Request']);
      const t3 = (await h.run('Build: Text Style Request', [J({})]))[0].json.body.messages[0].content[0].text;
      assert(/Never write the reference's own username, series name, brand or logo: call any of them \[handle\]/.test(t3));
      setRow(sRow);
    }
    setRow({ 'Text style': 'already written', 'Text style reference': [{ url: 'x' }] });
    h.reset(['Build: Text Style Request']);
    assert.strictEqual((await h.run('Build: Text Style Request', [J({})]))[0].json.need, false);
    global.__http = undefined;
    // Save Plan writes the read style into an empty Text style
    setRow({ 'Text style': '', Angle: 'a', 'Slide count': 7 });
    h.set('OpenRouter: Read Text Style', [J({ choices: [{ message: { content: 'Text style: Inter Bold, white box, centred.' } }] })]);
    h.reset(['Save Plan']);
    assert.strictEqual((await h.run('Save Plan', h.out['Claude: Fill Plan']))[0].json.body['Text style'], 'Inter Bold, white box, centred.');
    h.reset(['OpenRouter: Read Text Style', 'Save Plan']);

    // Image check → ⚠️ lines in the Posting log
    h.set('Collect Images', [J({ slideId: 1, n: 1 }), J({ slideId: 2, n: 2 })]);
    h.set('Baserow: Upload Slide Image', [J({ url: 'http://localhost:85/media/o1.png', mime_type: 'image/png' }), J({ url: 'http://localhost:85/media/o2.png', mime_type: 'image/png' })]);
    const fetchedImgs = []; global.__http = url => { fetchedImgs.push(url); return Buffer.from('img'); };
    setRow({ 'Handle / series label': '@example.health' });
    h.reset(['Build Image Checks', 'Collect Image Checks']);
    const bc = await h.run('Build Image Checks', [J({})]);
    assert(bc.length === 2 && !bc[0].json.skip && bc[1].json.body.messages[0].content[1].image_url.url === 'data:image/png;base64,' + Buffer.from('img').toString('base64') && fetchedImgs[1] === 'http://host.docker.internal:85/media/o2.png' && /"1\. the 3pm crash you eat lunch\. then you crash\."|1\. the 3pm crash\nyou eat lunch\. then you crash\./.test(bc[1].json.body.messages[0].content[0].text));
    const cc = (await h.run('Collect Image Checks', [
      J({ choices: [{ message: { content: '{"ui":false,"not_full_bleed":false,"collage":false,"text_ok":true,"notes":""}' } }] }),
      J({ choices: [{ message: { content: '```json\n{"ui":true,"not_full_bleed":true,"collage":false,"text_ok":false,"foreign_label":true,"notes":"Story bar at top"}\n```' } }] }),
    ]))[0].json;
    assert(cc.warnings.length === 1 && /Slide 2 image: app\/Reel interface.*does not fill the frame.*doesn't match.*handle, logo or label that isn't yours.*Story bar at top/.test(cc.warnings[0]));
    {
      const ct = bc[0].json.body.messages[0].content[0].text;
      assert(/"foreign_label"/.test(ct) && /other than "@example\.health"/.test(ct) && /Allowed small extra text: the label "@example\.health"/.test(ct) && /ignore the allowed small extras/.test(ct));
    }
    h.reset(['Finish Render']);
    assert(/⚠️ Slide 2 image/.test((await h.run('Finish Render', [J({})]))[0].json.body['Posting log']));
    // switched off → skip
    h.set('Config', cfgBefore);
    h.reset(['Build Image Checks']); assert((await h.run('Build Image Checks', [J({})]))[0].json.skip === true, 'off when useOpenRouter is false');
    h.reset(['Collect Image Checks', 'Build Image Checks', 'Finish Render']); global.__http = null;

    h.set('Check Action', savedCA);
    for (const [k, v] of saved) { if (v) h.set(k, v); else h.reset([k]); }
    console.log('images: full-bleed + no-UI rules, Text style + typography ref last, highlights, extras/handle, text style read in step 2, image check ⚠️ lines');
  }

  // --- redo (none ticked, then two ticked) ---
  const row4 = { ...row3, Slides: [200, 201, 202, 203, 204].map(id => ({ id })), 'Post caption': 'Caption here', Music: 'calm piano' };
  c = await press('redo', row4); assert(c.ok);
  const ls = await h.run('List Slides (images)', [J({})]);
  assert.strictEqual(ls.length, 5);
  h.reset(['Pick Ticked Slides']);
  let picked = (await h.run('Pick Ticked Slides', ls.map((l, i) => J({ id: l.json.slideId, 'Slide #': i + 1, Redo: false }))))[0].json;
  assert.strictEqual(picked.count, 0);
  const nt = (await h.run('No Ticked Slides', [J({})]))[0].json;
  assert(/no slides were ticked/.test(nt.body['Posting log']));
  h.reset(['Pick Ticked Slides']);
  picked = (await h.run('Pick Ticked Slides', ls.map((l, i) => J({ id: l.json.slideId, 'Slide #': i + 1, Role: { value: 'body' }, 'Slide text': 'Edited ' + (i + 1), 'Image prompt': 'p', Redo: i === 1 || i === 3 }))))[0].json;
  assert.strictEqual(picked.count, 2);
  h.reset(['Collect Render Job', 'Baserow: Create Slides', 'Refs To Data URI', 'List Reference Images', 'Build Image Runs', 'Collect Images', 'Finish Render']);
  const job = (await h.run('Collect Render Job', [J(picked)]))[0].json;
  assert(job.slides.map(s => s.n).join() === '2,4');
  await h.run('List Reference Images', [J({})]);
  const rr2 = await h.run('Build Image Runs', [J({})]);
  assert(rr2.length === 2 && /"Edited 2"/.test(rr2[0].json.prompt));
  h.set('Collect Images', [J({ cost: 0.13 }), J({ cost: 0.14 })]);
  const fin2 = (await h.run('Finish Render', [J({})]))[0].json.body;
  assert(/redid slides 2, 4\. All good\? Press ▶ Approve draft images · \$0\.27 OpenRouter/.test(fin2['Posting log']) && !('Post caption' in fin2));
  assert(fin2.Status === (so.Status['Draft images redone'] || 'Draft images redone'), 'redo done');
  console.log('redo: none-ticked message OK, ticked 2 & 4 re-rendered');

  // --- 4 finalize: carousel + video, all platforms, Post now ---
  const row5 = { ...row4, Format: { value: 'Carousel + slideshow video' }, 'Posting mode': { value: 'Post now' }, 'Instagram as': { value: 'Carousel' }, Hashtags: '#insulin #health', 'Music URL (for video)': 'https://cdn.example/music.mp3' };
  c = await press('finalize', row5); assert(c.ok);
  const lf = await h.run('List Slides (final)', [J({})]);
  {
    // by default no video is made (you make it in CapCut)
    const fv = (await h.run('Finalize Plan', lf.map((l, i) => J({ id: l.json.slideId, 'Slide #': 5 - i, 'Slide text': 'T', 'Image URL': 'https://cdn/k.jpg' }))))[0].json;
    assert(fv.withVideo === false && fv.both === false);
  }
  h.set('Config', [J({ ...cfg, makeVideo: true })]); // the video path still works when switched back on
  const fp = (await h.run('Finalize Plan', lf.map((l, i) => J({ id: l.json.slideId, 'Slide #': 5 - i, 'Slide text': 'T' + (5 - i), 'Image URL': `https://cdn.magica.com/keep${5 - i}.jpg` }))))[0].json;
  assert(fp.slides[0].n === 1 && fp.withVideo && fp.size === '4:5' && fp.caption === 'Caption here\n\n#insulin #health');
  h.set('Drive: Create Post Folder', [J({ id: 'FOLDER1' })]);
  const files = await h.run('Explode Slide Files', [J({})]);
  assert(files[0].json.name === '01-slide.jpg');
  {
    // Slide size "Both": Drive gets a 4:5 and a 9:16 file per slide
    h.set('Check Action', [J({ ...h.out['Check Action'][0].json, row: { ...h.out['Check Action'][0].json.row, 'Slide size': { value: 'Both (4:5 + 9:16)' } } })]);
    const keepFP = h.out['Finalize Plan'];
    const fb = (await h.run('Finalize Plan', [J({ id: 1, 'Slide #': 1, 'Slide text': 'T1', 'Image URL': 'https://cdn/a-45.jpg', 'Image URL 9:16': 'https://cdn/a-916.jpg', Image: [{ url: 'http://localhost:85/media/a.jpg', visible_name: 'slide-1-4x5.jpg' }, { url: 'http://localhost:85/media/b.jpg', visible_name: 'slide-1-9x16.jpg' }] })]))[0].json;
    assert(fb.both && fb.size === '4:5' && fb.slides[0].url === 'http://host.docker.internal:85/media/a.jpg' && fb.slides[0].url916 === 'http://host.docker.internal:85/media/b.jpg');
    const bf = (await h.run('Explode Slide Files', [J({})])).map(i => i.json);
    assert.deepStrictEqual(bf.map(f => f.name), ['01-slide-4x5.jpg', '01-slide-9x16.jpg']);
    assert(bf[1].url === 'http://host.docker.internal:85/media/b.jpg');
    h.set('Finalize Plan', keepFP); h.set('Check Action', [J({ ...h.out['Check Action'][0].json, row: { ...h.out['Check Action'][0].json.row, 'Slide size': undefined } })]);
    await h.run('Explode Slide Files', [J({})]);
  }
  const cap = (await h.run('Caption File', [J({})]))[0];
  assert(cap.binary.data.fileName === 'caption.txt');
  const vs = (await h.run('Build Slideshow Video', [J({})]))[0].json.renderScript;
  assert(vs.elements.length === 6 && vs.elements[1].animations && vs.elements[5].type === 'audio');
  h.reset(['Evaluate Slideshow']);
  for (const st of ['rendering', 'succeeded']) await h.run('Evaluate Slideshow', [J({ status: st, url: st === 'succeeded' ? 'https://f002.backblazeb2.com/show.mp4' : null })]);
  h.set('Evaluate Slideshow', [h.out['Evaluate Slideshow'][0]]);
  const pr = (await h.run('Post Router', [J({})]))[0].json;
  assert(pr.doYouTube && pr.igPlan === 'now' && pr.manifest.video_url && pr.log.some(l => l.startsWith('TikTok: post manually')));
  {
    // slides on Baserow (no public link) → Instagram is left for you to post by hand
    const keepFP = h.out['Finalize Plan'];
    h.set('Finalize Plan', [J({ ...keepFP[0].json, slides: keepFP[0].json.slides.map(sl => ({ ...sl, url: 'http://host.docker.internal:85/media/x.png' })) })]);
    h.reset(['Post Router']);
    const lp = (await h.run('Post Router', [J({})]))[0].json;
    assert(lp.igPlan === 'none' && lp.log.some(l => /Instagram: post manually from the Drive folder/.test(l)));
    h.set('Finalize Plan', keepFP); h.set('Post Router', [J(pr)]);
  }
  h.set('YouTube: Upload Short', [J({ id: 'yt123' })]);
  const ay = (await h.run('After YouTube', [J({})]))[0].json;
  assert(ay.log.some(l => /youtu.be\/yt123/.test(l)));
  const igIn = await h.run('IG Input (now)', [J({})]);
  await h.run('IG Start', igIn);
  const cont = await h.run('IG: Build Containers', h.out['IG Start']);
  assert(cont.length === 5 && cont[0].json.body.is_carousel_item && cont[0].json.url === 'https://graph.instagram.com/v23.0/1789/media');
  h.set('IG: Create Item', cont.map((_, i) => J({ id: 'c' + i })));
  const parent = (await h.run('IG: Build Parent', h.out['IG: Create Item']))[0].json;
  assert(parent.isCarousel && parent.body.children === 'c0,c1,c2,c3,c4');
  h.set('IG: Create Carousel', [J({ id: 'P1' })]);
  const ready = (await h.run('IG: Container Ready', [J({})]))[0].json;
  assert(ready.statusUrl === 'https://graph.instagram.com/v23.0/P1?fields=status_code');
  for (const st of ['IN_PROGRESS', 'FINISHED']) await h.run('IG: Evaluate', [J({ status_code: st })]);
  await h.run('IG: Result', [J({ id: 'IGMEDIA9' })]);
  const fin3 = (await h.run('After Instagram', [J({})]))[0].json.body;
  assert(fin3.Status === so.Status.Posted && /drive.google.com\/drive\/folders\/FOLDER1/.test(fin3['Drive folder']) && JSON.parse(fin3['Asset manifest']).ig_posted);
  console.log('finalize (post now) log:\n  ' + fin3['Posting log'].split('\n').join('\n  '));

  // --- finalize variants via Post Router: scheduled IG, carousel-only YouTube, 9:16 carousel ---
  const variant = async (patch) => {
    h.set('Finalize Plan', [J({ ...fp, ...patch })]);
    h.reset(['Post Router']);
    if (!patch.withVideo) { delete h.out['Evaluate Slideshow']; } else h.set('Evaluate Slideshow', [J({ done: true, url: 'https://x/show.mp4' })]);
    return (await h.run('Post Router', [J({})]))[0].json;
  };
  let v = await variant({ mode: 'Post at scheduled time', postTime: '2026-11-10T01:00:00Z', withVideo: false });
  assert(v.igPlan === 'scheduled' && !v.doYouTube && v.log.some(l => /YouTube: image posts can't/.test(l)));
  v = await variant({ size: '9:16', withVideo: false, mode: 'Post now' });
  assert(v.igPlan === 'none' && v.log.some(l => /Instagram: skipped/.test(l)));
  v = await variant({ size: '9:16', withVideo: true, mode: 'Post now' });
  assert(v.igAs === 'Reel' && v.igPlan === 'now');
  v = await variant({ mode: 'Save drafts only', withVideo: true });
  assert(v.igPlan === 'none' && v.log.some(l => /no API drafts/.test(l)));
  console.log('post router variants: scheduled / 9:16 skip / 9:16→Reel / drafts OK');

  // --- scheduler ---
  const sch = harness(main);
  sch.set('Config', [J(cfg)]);
  const manifest = { images: ['https://a/1.jpg', 'https://a/2.jpg'], video_url: null, caption: 'Cap', ig_as: 'Carousel', ig_posted: false };
  const rows = [
    { id: 1, Status: { value: 'Scheduled' }, Platforms: [{ value: 'Instagram' }], 'Post time': '2020-01-01T00:00:00Z', 'Asset manifest': JSON.stringify(manifest), 'Posting log': 'old' },
    { id: 2, Status: { value: 'Scheduled' }, Platforms: [{ value: 'Instagram' }], 'Post time': '2999-01-01T00:00:00Z', 'Asset manifest': JSON.stringify(manifest) },
    { id: 3, Status: { value: 'Draft post saved' }, Platforms: [{ value: 'Instagram' }], 'Post time': '2020-01-01T00:00:00Z', 'Asset manifest': JSON.stringify(manifest) },
  ];
  const due = await sch.run('Due Instagram Post', [J({ results: rows })]);
  assert(due.length === 1 && due[0].json.rowId === 1);
  await sch.run('IG Start', due);
  const sc = await sch.run('IG: Build Containers', sch.out['IG Start']);
  sch.set('IG: Create Item', sc.map((_, i) => J({ id: 'k' + i })));
  await sch.run('IG: Build Parent', sch.out['IG: Create Item']);
  sch.set('IG: Create Carousel', [J({ id: 'P2' })]);
  await sch.run('IG: Container Ready', [J({})]);
  await sch.run('IG: Result', [J({ id: 'M2' })]);
  const sfin = (await sch.run('After Instagram', [J({})]))[0].json;
  assert(sfin.url.endsWith('/502/1/?user_field_names=true') && sfin.body.Status === so.Status.Posted && /old$/.test(sfin.body['Posting log']));
  const none = await sch.run('Due Instagram Post', [J({ results: rows.slice(1) })]);
  assert.strictEqual(none.length, 0);
  console.log('scheduler: due row 1 posted, future/non-scheduled rows ignored');

  // --- failure paths ---
  await assert.rejects(() => sch.run('IG: Evaluate', [J({ status_code: 'ERROR' })]), /could not process/);

  // --- failed step → row marked "Needs attention" ---
  {
    const st = main.nodes.find(n => n.name === 'Baserow: Set Status').parameters.jsonBody;
    assert(/'n8n run': String\(\$execution\.id\)/.test(st));
    const c = main.connections;
    assert(c['Error Trigger'].main[0][0].node === 'Config');
    assert(c['Config'].main[0][0].node === 'From Error?');
    assert(c['From Error?'].main[0][0].node === 'Baserow: List Content (error)' && c['From Error?'].main[1][0].node === 'From Button?');
    const eh = harness(main);
    eh.set('Config', [J(cfg)]);
    const err = { execution: { id: '481', url: 'http://localhost:5678/workflow/1/executions/481', lastNodeExecuted: 'Claude: Write Slides', error: { message: 'LLM API error: overloaded' } } };
    eh.set('Error Trigger', [J(err)]);
    const rowsE = [
      { id: 3, Status: { value: 'Brainstorming…' }, 'n8n run': '480', 'Posting log': '' },
      { id: 7, Status: { value: 'Writing text draft…' }, 'n8n run': '481', 'Posting log': 'older line' },
    ];
    let mk = (await eh.run('Mark Failed Row', [J({ results: rowsE })]))[0].json;
    assert(mk.url.endsWith('/502/7/?user_field_names=true') && mk.body.Status === so.Status['Needs attention']);
    assert(/❌ Writing text draft failed at "Claude: Write Slides": LLM API error: overloaded/.test(mk.body['Posting log']) && /executions\/481/.test(mk.body['Posting log']) && /older line$/.test(mk.body['Posting log']));
    // no "n8n run" field: falls back to the single in-progress row
    eh.reset(['Mark Failed Row']);
    mk = (await eh.run('Mark Failed Row', [J({ results: [{ id: 9, Status: { value: 'Finalising draft post…' } }, { id: 10, Status: { value: 'Posted' } }] })]))[0].json;
    assert(mk.url.endsWith('/502/9/?user_field_names=true'));
    // ambiguous: two rows in progress, no id match → change nothing
    eh.reset(['Mark Failed Row']);
    const amb = await eh.run('Mark Failed Row', [J({ results: [{ id: 9, Status: { value: 'Finalising draft post…' } }, { id: 11, Status: { value: 'Filling plan…' } }] })]);
    assert.strictEqual(amb.length, 0);
    console.log('failure marking: matched by n8n run id, single-busy fallback, ambiguous left alone');
  }
  {
    const h2 = harness(setup);
    h2.set('Baserow: Create Database', [J({ id: 77 })]); h2.set('Create Table: Content', [J({ id: 502 })]); h2.set('Create Table: Slides', [J({ id: 503 })]);
    h2.set('Setup Form', [J({ 'n8n address': 'http://localhost:5678' })]);
    const names = (await h2.run('Field Specs', [J({})])).map(s => s.json.name);
    assert(names.includes('n8n run') && names.includes('Cover reference use'));
  }
  const tiktok = (await (async () => { h.reset(['Post Router']); return (await h.run('Post Router', [J({})]))[0].json; })()).log.find(l => l.startsWith('TikTok'));
  assert(/AI-generated content/.test(tiktok));

  console.log('\nDRY RUN PASSED');
})().catch(e => { console.error('FAILED:', e.stack || e); process.exit(1); });
