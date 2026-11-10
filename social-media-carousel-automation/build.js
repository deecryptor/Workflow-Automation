// Generates carousel-automation.n8n.json and carousel-automation-setup.n8n.json from ./src.  Run: node build.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC = path.join(__dirname, 'src');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const helpers = read('helpers.js').trim();
const video = read('video-common.js').trim();
const pptxLib = read('pptx-lib.js').trim();
const code = f => read(f).replace('// @include helpers', () => helpers).replace('// @include video', () => video).replace('// @include pptx', () => pptxLib).trim();
const uuid = () => crypto.randomUUID();

function makeBuilder() {
  const nodes = [];
  const connections = {};
  const node = (name, type, typeVersion, position, parameters, extra = {}) => {
    if (nodes.some(n => n.name === name)) throw new Error('Duplicate node name: ' + name);
    nodes.push({ parameters, id: uuid(), name, type, typeVersion, position, ...extra });
    return name;
  };
  const link = (from, to, output = 0) => {
    connections[from] = connections[from] || { main: [] };
    while (connections[from].main.length <= output) connections[from].main.push([]);
    connections[from].main[output].push({ node: to, type: 'main', index: 0 });
  };
  const chain = (...names) => names.slice(1).forEach((n, i) => link(names[i], n));
  const sticky = (content, pos, width, height, color) => nodes.push({
    parameters: { content, width, height, color }, id: uuid(),
    name: 'Note ' + (nodes.filter(n => n.type === 'n8n-nodes-base.stickyNote').length + 1),
    type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos,
  });
  return { nodes, connections, node, link, chain, sticky };
}

const RETRY = { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 };

// =====================================================================================
// MAIN WORKFLOW
// =====================================================================================
const M = makeBuilder();
const { node, link, chain } = M;
const codeNode = (name, file, pos, extra = {}) => node(name, 'n8n-nodes-base.code', 2, pos, { jsCode: code(file) }, extra);

const http = (name, pos, { method = 'POST', url, body, auth = 'header', timeout = 120000, file = false, retry = true, extra = {} }) => {
  const p = { method, url, options: { timeout } };
  if (auth === 'header') Object.assign(p, { authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth' });
  if (body) Object.assign(p, { sendBody: true, specifyBody: 'json', jsonBody: body });
  if (file) p.options.response = { response: { responseFormat: 'file', outputPropertyName: 'data' } };
  return node(name, 'n8n-nodes-base.httpRequest', 4.2, pos, p, { ...(retry ? RETRY : {}), ...extra });
};
const fromJson = (name, pos, opts = {}) => http(name, pos, { method: opts.method || 'PATCH', url: '={{ $json.url }}', body: '={{ JSON.stringify($json.body) }}', ...opts });
const claude = (name, pos) => http(name, pos, { url: 'https://openrouter.ai/api/v1/messages', body: '={{ JSON.stringify($json.body) }}', timeout: 900000 });
const optExpr = (field, value) => `(JSON.parse($('Config').first().json.selectOptions || '{}')['${field}'] || {})['${value}'] || '${value}'`;
// One node shows the running step's Status (Check Action picks the label for the button pressed)
const setStatus = (name, pos) => http(name, pos, {
  method: 'PATCH', url: "={{ $('Check Action').first().json.patchUrl }}",
  body: "={{ JSON.stringify({ Status: (JSON.parse($('Config').first().json.selectOptions || '{}')['Status'] || {})[$('Check Action').first().json.status] || $('Check Action').first().json.status, 'n8n run': String($execution.id) }) }}", timeout: 30000,
});
const wait = (name, pos, seconds) => node(name, 'n8n-nodes-base.wait', 1.1, pos, { amount: seconds, unit: 'seconds' }, { webhookId: uuid() });
const ifBool = (name, pos, expr) => node(name, 'n8n-nodes-base.if', 2.2, pos, {
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
    conditions: [{ id: uuid(), leftValue: expr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and',
  },
  looseTypeValidation: true,
  options: {},
});
const rl = value => ({ __rl: true, mode: 'id', value });
const X = i => i * 240;

// ---------- triggers + config ----------
node('Carousel Webhook', 'n8n-nodes-base.webhook', 2, [X(0), 0], {
  httpMethod: 'GET', path: 'carousel-automation', responseMode: 'responseNode', options: {},
}, { webhookId: uuid() });
node('Every 15 Minutes', 'n8n-nodes-base.scheduleTrigger', 1.2, [X(0), 260], {
  rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] },
});
const str = (n, v) => ({ id: uuid(), name: n, value: v, type: 'string' });
const num = (n, v) => ({ id: uuid(), name: n, value: v, type: 'number' });
const bool = (n, v) => ({ id: uuid(), name: n, value: v, type: 'boolean' });
node('Config', 'n8n-nodes-base.set', 3.4, [X(1), 120], {
  mode: 'manual',
  assignments: { assignments: [
    str('baserowUrl', 'http://host.docker.internal:85'),
    str('baserowPublicUrl', 'http://localhost:85'),
    num('contentTableId', 0),
    num('slidesTableId', 0),
    str('selectOptions', '{}'),
    str('llmModel', 'anthropic/claude-sonnet-5.5'),
    num('maxTokens', 64000),
    str('videoModel', 'gemini_3_8_flash'),
    bool('useScrapeCreators', true),
    bool('useOpenRouter', true),
    str('orMediaModel', 'qwen/qwen3.8-omni-flash'),
    str('orImageFallbackModel', 'google/gemini-3.8-flash'),
    str('orAudioModel', 'google/gemini-3.8-flash'),
    str('orVideoFallbackModel', 'google/gemini-3.8-flash'),
    str('orTextModel', 'deepseek/deepseek-v4.1-flash-1017'),
    str('orDocModel', 'google/gemini-3.1-flash-lite'),
    num('orMaxVideoMB', 20),
    num('maxSlides', 20),
    bool('styleAnchor', true),
    str('textMode', 'pptx'), // pptx = text-free art + editable .pptx; image = text drawn on the image
    num('orMaxAudioMB', 40),
    str('imageResolution', '2K'),
    num('secondsPerSlide', 3),
    str('driveFolderId', ''),
    str('igUserId', ''),
    str('igApiVersion', 'v23.0'),
  ] },
  includeOtherFields: false, options: {},
});
node('Error Trigger', 'n8n-nodes-base.errorTrigger', 1, [X(0), -260], {});
ifBool('From Error?', [X(2), -140], "={{ $('Error Trigger').isExecuted }}");
ifBool('From Button?', [X(2), 120], "={{ $('Carousel Webhook').isExecuted }}");

// ---------- button path ----------
http('Baserow: Get Row', [X(3), 0], {
  method: 'GET', timeout: 30000,
  url: "={{ $('Config').first().json.baserowUrl + '/api/database/rows/table/' + $('Config').first().json.contentTableId + '/' + $('Carousel Webhook').first().json.query.row + '/?user_field_names=true' }}",
  extra: { onError: 'continueRegularOutput' },
});
codeNode('Check Action', 'check-action.js', [X(4), 0]);
node('Reply Page', 'n8n-nodes-base.respondToWebhook', 1.1, [X(5), 0], {
  respondWith: 'text', responseBody: '={{ $json.html }}',
  options: { responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }] } },
});
ifBool('Ready to Run?', [X(6), 0], '={{ $json.ok }}');
const swRule = (key, value) => ({
  outputKey: key,
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: uuid(), leftValue: "={{ $('Check Action').first().json.action }}", rightValue: value, operator: { type: 'string', operation: 'equals' } }],
    combinator: 'and',
  },
  renameOutput: true,
});
// style preview, other slides and redo all go to the image lane
const imagesRule = {
  outputKey: 'images · look · redo',
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: uuid(), leftValue: "={{ ['images', 'look', 'redo'].includes($('Check Action').first().json.action) }}", rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and',
  },
  renameOutput: true,
};
setStatus('Baserow: Set Status', [0, 0]);
node('Route Action', 'n8n-nodes-base.switch', 3.2, [X(7), 0], {
  rules: { values: [swRule('research', 'research'), swRule('plan', 'plan'), swRule('slides', 'slides'), imagesRule, swRule('finalize', 'finalize')] },
  options: {},
});

// ---------- 1 · research ----------
const YR = 520;
// research saved by a run whose brief failed is reused (only the brief is rewritten)
codeNode('Load Saved Research', 'load-saved-research.js', [X(0), YR - 200]);
ifBool('Use Saved Research?', [X(1), YR - 200], '={{ $json.use }}');
codeNode('Build: Research Planner', 'build-research-planner.js', [X(1), YR]);
claude('Claude: Plan Research', [X(2), YR]);
codeNode('Parse Research Queries', 'parse-research-queries.js', [X(3), YR]);
http('Tavily: Search', [X(4), YR], {
  url: 'https://api.tavily.com/search', timeout: 60000,
  body: "={{ JSON.stringify({ query: $json.query, topic: $json.topic, search_depth: 'advanced', max_results: 5, include_answer: 'advanced' }) }}",
});
http('Tavily: Extract References', [X(5), YR], {
  url: 'https://api.tavily.com/extract', timeout: 90000, retry: false,
  body: "={{ JSON.stringify({ urls: $('Build: Research Planner').first().json.links, extract_depth: 'advanced' }) }}",
  extra: { executeOnce: true, onError: 'continueRegularOutput' },
});
// references (links + uploaded files) → page reader / Magica uploads / Magica runs (download, Gemini, transcripts, podcast, OCR)
const YRV = YR + 300, YRV2 = YR + 540, YRV3 = YR + 780; // to the right of the plan/slides rows
codeNode('List References', 'list-references.js', [X(6), YR]);
ifBool('Any References?', [X(7), YR], '={{ $json.hasRefs }}');
ifBool('Any Pages To Read?', [X(12), YRV], "={{ $('List References').first().json.hasPages }}");
codeNode('Explode Pages', 'explode-pages.js', [X(13), YRV - 80]);
node('Read Page', 'n8n-nodes-base.httpRequest', 4.2, [X(14), YRV - 80], {
  method: 'GET', url: '={{ $json.readUrl }}',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Accept', value: 'text/plain, application/json' }, { name: 'X-Return-Format', value: 'markdown' }] },
  options: { timeout: 60000, response: { response: { responseFormat: 'text', outputPropertyName: 'body' } }, batching: { batch: { batchSize: 1, batchInterval: 3500 } } },
}, { ...RETRY, onError: 'continueRegularOutput' });
codeNode('Parse Pages', 'parse-pages.js', [X(15), YRV - 80]);
ifBool('Any IG/TikTok Posts?', [X(16), YRV - 200], "={{ $('List References').first().json.hasScPages }}");
codeNode('Explode SC Posts', 'explode-sc-posts.js', [X(17), YRV - 200]);
node('Scrape Creators: Get Post', 'n8n-nodes-base.httpRequest', 4.2, [X(18), YRV - 200], {
  method: 'GET', url: '={{ $json.api }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendQuery: true, queryParameters: { parameters: [{ name: 'url', value: '={{ $json.url }}' }] },
  options: { timeout: 60000 },
}, { ...RETRY, onError: 'continueRegularOutput' });
codeNode('Merge SC Posts', 'merge-sc-posts.js', [X(19), YRV - 200]);
codeNode('Collect Uploads', 'collect-uploads.js', [X(16), YRV]);
ifBool('Any Uploads?', [X(17), YRV], '={{ $json.hasUploads }}');
codeNode('Explode Uploads', 'explode-uploads.js', [X(18), YRV - 80]);
http('Download Upload', [X(19), YRV - 80], { method: 'GET', url: '={{ $json.url }}', auth: 'none', file: true, timeout: 300000, extra: { onError: 'continueRegularOutput' } });
codeNode('Upload To Data URI', 'upload-to-data-uri.js', [X(20), YRV - 80]);
http('Magica: Upload File', [X(21), YRV - 80], { url: 'https://inference.magica.com/v1/uploads', body: '={{ JSON.stringify($json.body) }}', timeout: 600000, extra: { onError: 'continueRegularOutput' } });
codeNode('Build Reference Jobs', 'build-video-jobs.js', [X(22), YRV]);
codeNode('Reference Jobs To Run', 'video-runs-to-start.js', [X(12), YRV2]);
ifBool('Any Magica Runs To Start?', [X(13), YRV2], '={{ $json.anyToStart }}');
codeNode('Explode Magica Starts', 'explode-video-starts.js', [X(14), YRV2 - 80]);
http('Magica: Start Run', [X(15), YRV2 - 80], {
  url: "={{ 'https://inference.magica.com/v1/nodes/' + $json.nodeType + '/run' }}", body: '={{ JSON.stringify($json.body) }}', timeout: 60000,
  extra: { onError: 'continueRegularOutput' },
});
codeNode('Track Magica Runs', 'track-video-runs.js', [X(16), YRV2 - 80]);
ifBool('Magica Still Running?', [X(14), YRV2 + 100], "={{ $json.jobs.some(j => j.status === 'running') }}");
wait('Wait for Magica', [X(12), YRV3], 15);
codeNode('Explode Magica Checks', 'explode-video-checks.js', [X(13), YRV3]);
http('Magica: Check Run', [X(14), YRV3], { method: 'GET', url: '={{ $json.url }}', timeout: 30000, extra: { onError: 'continueRegularOutput' } });
codeNode('Evaluate Magica Runs', 'evaluate-video-jobs.js', [X(15), YRV3]);
ifBool('Magica Runs Done?', [X(16), YRV3], '={{ $json.allDone }}');
codeNode('Reference Notes', 'video-notes.js', [X(17), YRV3]);
// Gemini couldn't watch a YouTube link → Scrape Creators transcript (1 credit), then notes on it if it's long
ifBool('YouTube Backup?', [X(15), YRV2 + 100], "={{ $json.jobs.some(j => j.kind === 'youtube' && j.status === 'failed' && !j.scTried) }}");
codeNode('Explode YouTube Backups', 'explode-youtube-backups.js', [X(16), YRV2 + 220]);
node('Scrape Creators: YouTube Backup', 'n8n-nodes-base.httpRequest', 4.2, [X(17), YRV2 + 220], {
  method: 'GET', url: 'https://api.scrapecreators.com/v1/youtube/video/transcript', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendQuery: true, queryParameters: { parameters: [{ name: 'url', value: '={{ $json.url }}' }] },
  options: { timeout: 120000 },
}, { ...RETRY, onError: 'continueRegularOutput' });
codeNode('Apply YouTube Backups', 'apply-youtube-backups.js', [X(18), YRV2 + 220]);
// OpenRouter calls (Qwen / Claude Haiku / Gemini / DeepSeek) are answered straight away, then the loop continues
const YOR = YRV3 + 240;
ifBool('Any OpenRouter Calls?', [X(12), YOR], '={{ $json.anyOr }}');
codeNode('Explode OpenRouter Calls', 'explode-or-calls.js', [X(13), YOR - 80]);
node('OpenRouter: Run', 'n8n-nodes-base.httpRequest', 4.2, [X(14), YOR - 80], {
  method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}',
  options: { timeout: 600000, batching: { batch: { batchSize: 4, batchInterval: 0 } } },
}, { ...RETRY, onError: 'continueRegularOutput' });
codeNode('Apply OpenRouter Results', 'apply-or-results.js', [X(15), YOR - 80]);
codeNode('Build: Research Brief Request', 'build-research-brief.js', [X(8), YR]);
// saved first (it sits above Claude, so n8n runs it first): a failed brief can be retried without re-collecting
http('Baserow: Save Research Cache', [X(9), YR - 160], {
  method: 'PATCH', url: "={{ $('Check Action').first().json.patchUrl }}", timeout: 120000, retry: false,
  body: "={{ JSON.stringify({ 'Research cache': $json.cache }) }}", extra: { onError: 'continueRegularOutput' },
});
claude('Claude: Write Research Brief', [X(9), YR]);
codeNode('Save Research', 'save-research.js', [X(10), YR]);
fromJson('Baserow: Save Research', [X(11), YR]);

// ---------- 2 · plan ----------
const YP = 820;
codeNode('Build: Text Style Request', 'build-text-style.js', [X(1), YP - 180]);
ifBool('Read Text Style?', [X(2), YP - 180], '={{ $json.need }}');
const orHttp = (name, pos) => node(name, 'n8n-nodes-base.httpRequest', 4.2, pos, {
  method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}',
  options: { timeout: 120000, batching: { batch: { batchSize: 4, batchInterval: 0 } } },
}, { ...RETRY, onError: 'continueRegularOutput' });
orHttp('OpenRouter: Read Text Style', [X(3), YP - 260]);
codeNode('Build: Plan Request', 'build-plan.js', [X(1), YP]);
claude('Claude: Fill Plan', [X(2), YP]);
codeNode('Save Plan', 'save-plan.js', [X(3), YP]);
fromJson('Baserow: Save Plan', [X(4), YP]);

// ---------- 3 · slides (new set) ----------
const YS = 1120;
codeNode('Build: Slides Request', 'build-slides.js', [X(3), YS]);
claude('Claude: Write Slides', [X(4), YS]);
codeNode('Parse Slides', 'parse-slides.js', [X(5), YS]);
http('Baserow: Delete Old Slides', [X(6), YS], {
  url: '={{ $json.deleteUrl }}', body: '={{ JSON.stringify($json.deleteBody) }}', timeout: 30000, retry: false,
  extra: { onError: 'continueRegularOutput' },
});
http('Baserow: Create Slides', [X(7), YS], {
  url: "={{ $('Parse Slides').first().json.createUrl }}", body: "={{ JSON.stringify($('Parse Slides').first().json.createBody) }}", timeout: 60000,
});
codeNode('Save Draft Text', 'save-draft-text.js', [X(8), YS]);
fromJson('Baserow: Text Ready', [X(9), YS]);

// ---------- 3b · redo ticked slides ----------
const YD = 1360;
codeNode('List Slides (images)', 'list-linked-slides.js', [X(1), YD]);
http('Baserow: Get Slide (images)', [X(2), YD], { method: 'GET', url: '={{ $json.url }}', timeout: 30000 });
codeNode('Pick Ticked Slides', 'pick-ticked-slides.js', [X(3), YD]);
ifBool('Any Ticked?', [X(4), YD], '={{ $json.count > 0 }}');
codeNode('No Ticked Slides', 'no-ticked-slides.js', [X(5), YD + 80]);
fromJson('Baserow: Nothing To Redo', [X(6), YD + 80]);

// ---------- shared image pipeline ----------
const YI = 1640;
codeNode('Collect Render Job', 'collect-render-job.js', [X(0), YI]);
codeNode('List Reference Images', 'list-reference-images.js', [X(3), YI]);
ifBool('Has References?', [X(4), YI], '={{ $json.hasRefs }}');
codeNode('Explode Refs', 'explode-refs.js', [X(5), YI - 80]);
http('Download Reference', [X(6), YI - 80], { method: 'GET', url: '={{ $json.url }}', auth: 'none', file: true, timeout: 60000 });
codeNode('Refs To Data URI', 'refs-to-data-uri.js', [X(7), YI - 80]);
// style anchor: one slide is made first and every other slide copies its look (a redo uses a slide you kept)
codeNode('Pick Style Anchor', 'pick-style-anchor.js', [X(8), YI]);
ifBool('Make Style Anchor?', [X(8), YI + 160], '={{ $json.needGen }}');
codeNode('Build Anchor Run', 'build-image-runs.js', [X(9), YI + 280]);
node('OpenRouter: Make Anchor', 'n8n-nodes-base.httpRequest', 4.2, [X(10), YI + 280], {
  method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}',
  options: { timeout: 300000 },
}, { ...RETRY, onError: 'continueRegularOutput' });
codeNode('Anchor Result', 'anchor-result.js', [X(11), YI + 280]);
codeNode('Build Image Runs', 'build-image-runs.js', [X(9), YI]);
node('OpenRouter: Make Image', 'n8n-nodes-base.httpRequest', 4.2, [X(10), YI], {
  method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}',
  options: { timeout: 300000, batching: { batch: { batchSize: 4, batchInterval: 0 } } },
}, { ...RETRY, onError: 'continueRegularOutput' });
codeNode('Collect Images', 'collect-images.js', [X(11), YI]);
const YI2 = 1880;
node('Baserow: Upload Slide Image', 'n8n-nodes-base.httpRequest', 4.2, [X(10), YI2], {
  method: 'POST', url: "={{ $('Config').first().json.baserowUrl + '/api/user-files/upload-file/' }}", authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, contentType: 'multipart-form-data',
  bodyParameters: { parameters: [{ parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'data' }] },
  options: { timeout: 120000 },
}, RETRY);
codeNode('Save Slide Images', 'save-slide-images.js', [X(11), YI2]);
fromJson('Baserow: Update Slides', [X(12), YI2]);
codeNode('Build Image Checks', 'build-image-checks.js', [X(12), YI2 + 180], { executeOnce: true });
ifBool('Check Images?', [X(13), YI2 + 180], '={{ !$json.skip }}');
orHttp('OpenRouter: Check Image', [X(14), YI2 + 260]);
codeNode('Collect Image Checks', 'collect-image-checks.js', [X(15), YI2 + 260]);
codeNode('Finish Render', 'finish-render.js', [X(13), YI2], { executeOnce: true });
fromJson('Baserow: Slides Ready', [X(14), YI2]);
// editable slides: text-free art + real text boxes in a .pptx, rebuilt after every image run
ifBool('Make PPTX?', [X(14), YI2 - 140], "={{ $('Config').first().json.textMode !== 'image' }}");
codeNode('Build PPTX', 'build-pptx.js', [X(15), YI2 - 140], { executeOnce: true });
node('Baserow: Upload PPTX', 'n8n-nodes-base.httpRequest', 4.2, [X(16), YI2 - 140], {
  method: 'POST', url: "={{ $('Config').first().json.baserowUrl + '/api/user-files/upload-file/' }}", authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, contentType: 'multipart-form-data',
  bodyParameters: { parameters: [{ parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'data' }] },
  options: { timeout: 120000 },
}, { ...RETRY, onError: 'continueRegularOutput' });
codeNode('Add PPTX To Row', 'add-pptx.js', [X(17), YI2 - 140], { executeOnce: true });

// ---------- 4 · finalize: Drive + slideshow video ----------
const YF = 2200;
codeNode('List Slides (final)', 'list-linked-slides.js', [X(1), YF]);
http('Baserow: Get Slide (final)', [X(2), YF], { method: 'GET', url: '={{ $json.url }}', timeout: 30000 });
codeNode('Finalize Plan', 'finalize-plan.js', [X(3), YF]);
node('Drive: Create Post Folder', 'n8n-nodes-base.googleDrive', 3, [X(4), YF], {
  resource: 'folder', operation: 'create', name: '={{ $json.folderName }}',
  driveId: { __rl: true, mode: 'list', value: 'My Drive' },
  folderId: rl("={{ $('Config').first().json.driveFolderId || 'root' }}"),
  options: {},
}, RETRY);
codeNode('Explode Slide Files', 'explode-slide-files.js', [X(5), YF]);
http('Download Slide', [X(6), YF], { method: 'GET', url: '={{ $json.url }}', auth: 'none', file: true, timeout: 60000 });
const driveUpload = (name, pos, fileName) => node(name, 'n8n-nodes-base.googleDrive', 3, pos, {
  resource: 'file', operation: 'upload', inputDataFieldName: 'data', name: fileName,
  driveId: { __rl: true, mode: 'list', value: 'My Drive' },
  folderId: rl("={{ $('Drive: Create Post Folder').first().json.id }}"),
  options: {},
}, RETRY);
driveUpload('Drive: Upload Slide', [X(7), YF], "={{ $('Explode Slide Files').item.json.name }}");
codeNode('Caption File', 'caption-file.js', [X(8), YF], { executeOnce: true });
driveUpload('Drive: Upload Caption', [X(9), YF], 'caption.txt');
ifBool('Make Slideshow Video?', [X(10), YF], "={{ $('Finalize Plan').first().json.withVideo }}");
const YV = 2440;
codeNode('Build Slideshow Video', 'build-slideshow.js', [X(0), YV]);
http('Creatomate: Render Slideshow', [X(1), YV], { url: 'https://api.creatomate.com/v2/renders', body: '={{ JSON.stringify($json.renderScript) }}', timeout: 60000 });
wait('Wait for Slideshow', [X(2), YV], 15);
http('Creatomate: Check Slideshow', [X(3), YV], {
  method: 'GET', timeout: 30000,
  url: "={{ 'https://api.creatomate.com/v2/renders/' + $('Creatomate: Render Slideshow').first().json.id }}",
});
codeNode('Evaluate Slideshow', 'evaluate-slideshow.js', [X(4), YV]);
ifBool('Slideshow Ready?', [X(5), YV], '={{ $json.done }}');
http('Download Slideshow', [X(6), YV], { method: 'GET', url: '={{ $json.url }}', auth: 'none', file: true, timeout: 180000 });
driveUpload('Drive: Upload Slideshow', [X(7), YV], 'slideshow.mp4');

// ---------- 4b · platforms ----------
const YQ = 2700;
codeNode('Post Router', 'post-router.js', [X(0), YQ], { executeOnce: true });
ifBool('Upload to YouTube?', [X(1), YQ], '={{ $json.doYouTube }}');
http('Download Video (YouTube)', [X(2), YQ - 80], { method: 'GET', url: "={{ $('Post Router').first().json.videoUrl }}", auth: 'none', file: true, timeout: 180000 });
node('YouTube: Upload Short', 'n8n-nodes-base.youTube', 1, [X(3), YQ - 80], {
  resource: 'video', operation: 'upload',
  title: "={{ ($('Finalize Plan').first().json.title).slice(0, 88) + ' #Shorts' }}",
  regionCode: 'SG', categoryId: '27', binaryProperty: 'data',
  options: {
    description: "={{ $('Finalize Plan').first().json.caption.slice(0, 4900) }}",
    privacyStatus: 'private',
    selfDeclaredMadeForKids: false,
  },
}, RETRY);
codeNode('After YouTube', 'after-youtube.js', [X(4), YQ]);
ifBool('Post to Instagram Now?', [X(5), YQ], "={{ $json.igPlan === 'now' }}");
codeNode('IG Input (now)', 'ig-input-now.js', [X(6), YQ - 80]);

// ---------- Instagram (shared with scheduler) ----------
const YG = 2980;
codeNode('IG Start', 'ig-start.js', [X(0), YG]);
codeNode('IG: Build Containers', 'ig-build-containers.js', [X(1), YG]);
fromJson('IG: Create Item', [X(2), YG], { method: 'POST', timeout: 60000 });
codeNode('IG: Build Parent', 'ig-build-parent.js', [X(3), YG]);
ifBool('IG: Carousel?', [X(4), YG], '={{ $json.isCarousel }}');
fromJson('IG: Create Carousel', [X(5), YG - 80], { method: 'POST', timeout: 60000 });
codeNode('IG: Container Ready', 'ig-container-ready.js', [X(6), YG]);
wait('IG: Wait', [X(7), YG], 15);
http('IG: Check Container', [X(8), YG], { method: 'GET', url: "={{ $('IG: Container Ready').first().json.statusUrl }}", timeout: 30000 });
codeNode('IG: Evaluate', 'ig-evaluate.js', [X(9), YG]);
ifBool('IG: Ready?', [X(10), YG], '={{ $json.ready }}');
http('IG: Publish', [X(11), YG], {
  url: "={{ $('IG: Container Ready').first().json.publishUrl }}", timeout: 60000, retry: false,
  body: "={{ JSON.stringify({ creation_id: $('IG: Container Ready').first().json.creationId }) }}",
});
codeNode('IG: Result', 'ig-result.js', [X(12), YG]);
codeNode('After Instagram', 'after-instagram.js', [X(13), YQ]);
fromJson('Baserow: Save Final', [X(14), YQ]);

// ---------- scheduler ----------
http('Baserow: List Content', [X(3), 260], {
  method: 'GET', timeout: 30000,
  url: "={{ $('Config').first().json.baserowUrl + '/api/database/rows/table/' + $('Config').first().json.contentTableId + '/?user_field_names=true&size=200' }}",
});
codeNode('Due Instagram Post', 'due-instagram-post.js', [X(4), 260]);

// ---------- failures → "Needs attention" in Baserow ----------
http('Baserow: List Content (error)', [X(3), -260], {
  method: 'GET', timeout: 30000, retry: false,
  url: "={{ $('Config').first().json.baserowUrl + '/api/database/rows/table/' + $('Config').first().json.contentTableId + '/?user_field_names=true&size=200' }}",
});
codeNode('Mark Failed Row', 'mark-failed.js', [X(4), -260]);
fromJson('Baserow: Mark Failed', [X(5), -260], { retry: false, timeout: 30000 });

// ---------- wiring ----------
link('Carousel Webhook', 'Config');
link('Every 15 Minutes', 'Config');
link('Error Trigger', 'Config');
link('Config', 'From Error?');
link('From Error?', 'Baserow: List Content (error)', 0);
link('From Error?', 'From Button?', 1);
chain('Baserow: List Content (error)', 'Mark Failed Row', 'Baserow: Mark Failed');
link('From Button?', 'Baserow: Get Row', 0);
link('From Button?', 'Baserow: List Content', 1);
chain('Baserow: List Content', 'Due Instagram Post', 'IG Start');
chain('Baserow: Get Row', 'Check Action', 'Reply Page', 'Ready to Run?');
chain('Ready to Run?', 'Baserow: Set Status', 'Route Action');
link('Route Action', 'Load Saved Research', 0);
link('Route Action', 'Build: Text Style Request', 1);
link('Route Action', 'Build: Slides Request', 2);
link('Route Action', 'List Slides (images)', 3); // style preview · other slides · redo
link('Route Action', 'List Slides (final)', 4);
// research
chain('Load Saved Research', 'Use Saved Research?');
link('Use Saved Research?', 'Claude: Write Research Brief', 0);
link('Use Saved Research?', 'Build: Research Planner', 1);
chain('Build: Research Planner', 'Claude: Plan Research', 'Parse Research Queries', 'Tavily: Search',
  'Tavily: Extract References', 'List References', 'Any References?');
link('Any References?', 'Any Pages To Read?', 0);
link('Any References?', 'Build: Research Brief Request', 1);
link('Any Pages To Read?', 'Explode Pages', 0);
link('Any Pages To Read?', 'Collect Uploads', 1);
chain('Explode Pages', 'Read Page', 'Parse Pages', 'Any IG/TikTok Posts?');
link('Any IG/TikTok Posts?', 'Explode SC Posts', 0);
link('Any IG/TikTok Posts?', 'Collect Uploads', 1);
chain('Explode SC Posts', 'Scrape Creators: Get Post', 'Merge SC Posts', 'Collect Uploads');
chain('Collect Uploads', 'Any Uploads?');
link('Any Uploads?', 'Explode Uploads', 0);
link('Any Uploads?', 'Build Reference Jobs', 1);
chain('Explode Uploads', 'Download Upload', 'Upload To Data URI', 'Magica: Upload File', 'Build Reference Jobs');
chain('Build Reference Jobs', 'Reference Jobs To Run', 'Any OpenRouter Calls?');
link('Any OpenRouter Calls?', 'Explode OpenRouter Calls', 0);
link('Any OpenRouter Calls?', 'Any Magica Runs To Start?', 1);
chain('Explode OpenRouter Calls', 'OpenRouter: Run', 'Apply OpenRouter Results', 'Reference Jobs To Run');
link('Any Magica Runs To Start?', 'Explode Magica Starts', 0);
link('Any Magica Runs To Start?', 'Magica Still Running?', 1);
link('Magica Still Running?', 'Wait for Magica', 0);
link('Magica Still Running?', 'YouTube Backup?', 1);
link('YouTube Backup?', 'Explode YouTube Backups', 0);
link('YouTube Backup?', 'Reference Notes', 1);
chain('Explode YouTube Backups', 'Scrape Creators: YouTube Backup', 'Apply YouTube Backups', 'Reference Jobs To Run');
chain('Explode Magica Starts', 'Magica: Start Run', 'Track Magica Runs', 'Wait for Magica');
chain('Wait for Magica', 'Explode Magica Checks', 'Magica: Check Run', 'Evaluate Magica Runs', 'Magica Runs Done?');
link('Magica Runs Done?', 'YouTube Backup?', 0);
link('Magica Runs Done?', 'Reference Jobs To Run', 1);
chain('Reference Notes', 'Build: Research Brief Request', 'Claude: Write Research Brief', 'Save Research', 'Baserow: Save Research');
link('Build: Research Brief Request', 'Baserow: Save Research Cache');
// plan
chain('Build: Text Style Request', 'Read Text Style?');
link('Read Text Style?', 'OpenRouter: Read Text Style', 0);
link('Read Text Style?', 'Build: Plan Request', 1);
link('OpenRouter: Read Text Style', 'Build: Plan Request');
chain('Build: Plan Request', 'Claude: Fill Plan', 'Save Plan', 'Baserow: Save Plan');
// slides
chain('Build: Slides Request', 'Claude: Write Slides', 'Parse Slides', 'Baserow: Delete Old Slides',
  'Baserow: Create Slides', 'Save Draft Text', 'Baserow: Text Ready');
// redo
chain('List Slides (images)', 'Baserow: Get Slide (images)', 'Pick Ticked Slides', 'Any Ticked?');
link('Any Ticked?', 'Collect Render Job', 0);
link('Any Ticked?', 'No Ticked Slides', 1);
link('No Ticked Slides', 'Baserow: Nothing To Redo');
// image pipeline
chain('Collect Render Job', 'List Reference Images', 'Has References?');
link('Has References?', 'Explode Refs', 0);
link('Has References?', 'Pick Style Anchor', 1);
chain('Explode Refs', 'Download Reference', 'Refs To Data URI', 'Pick Style Anchor', 'Make Style Anchor?');
link('Make Style Anchor?', 'Build Anchor Run', 0);
link('Make Style Anchor?', 'Build Image Runs', 1);
chain('Build Anchor Run', 'OpenRouter: Make Anchor', 'Anchor Result', 'Build Image Runs');
chain('Build Image Runs', 'OpenRouter: Make Image', 'Collect Images', 'Baserow: Upload Slide Image', 'Save Slide Images', 'Baserow: Update Slides', 'Build Image Checks', 'Check Images?');
link('Check Images?', 'OpenRouter: Check Image', 0);
link('Check Images?', 'Finish Render', 1);
chain('OpenRouter: Check Image', 'Collect Image Checks', 'Finish Render', 'Make PPTX?');
link('Make PPTX?', 'Build PPTX', 0);
link('Make PPTX?', 'Baserow: Slides Ready', 1);
chain('Build PPTX', 'Baserow: Upload PPTX', 'Add PPTX To Row', 'Baserow: Slides Ready');
// finalize
chain('List Slides (final)', 'Baserow: Get Slide (final)', 'Finalize Plan', 'Drive: Create Post Folder',
  'Explode Slide Files', 'Download Slide', 'Drive: Upload Slide', 'Caption File', 'Drive: Upload Caption', 'Make Slideshow Video?');
link('Make Slideshow Video?', 'Build Slideshow Video', 0);
link('Make Slideshow Video?', 'Post Router', 1);
chain('Build Slideshow Video', 'Creatomate: Render Slideshow', 'Wait for Slideshow', 'Creatomate: Check Slideshow', 'Evaluate Slideshow', 'Slideshow Ready?');
link('Slideshow Ready?', 'Download Slideshow', 0);
link('Slideshow Ready?', 'Wait for Slideshow', 1);
chain('Download Slideshow', 'Drive: Upload Slideshow', 'Post Router');
chain('Post Router', 'Upload to YouTube?');
link('Upload to YouTube?', 'Download Video (YouTube)', 0);
link('Upload to YouTube?', 'After YouTube', 1);
chain('Download Video (YouTube)', 'YouTube: Upload Short', 'After YouTube', 'Post to Instagram Now?');
link('Post to Instagram Now?', 'IG Input (now)', 0);
link('Post to Instagram Now?', 'After Instagram', 1);
link('IG Input (now)', 'IG Start');
chain('IG Start', 'IG: Build Containers', 'IG: Create Item', 'IG: Build Parent', 'IG: Carousel?');
link('IG: Carousel?', 'IG: Create Carousel', 0);
link('IG: Carousel?', 'IG: Container Ready', 1);
chain('IG: Create Carousel', 'IG: Container Ready', 'IG: Wait', 'IG: Check Container', 'IG: Evaluate', 'IG: Ready?');
link('IG: Ready?', 'IG: Publish', 0);
link('IG: Ready?', 'IG: Wait', 1);
chain('IG: Publish', 'IG: Result', 'After Instagram', 'Baserow: Save Final');

// ---------- canvas layout + notes (layout.js) ----------
require('./layout.js').applyLayout(M);

const main = {
  name: 'Social Media Carousel Automation',
  nodes: M.nodes, connections: M.connections, pinData: {},
  settings: { executionOrder: 'v1', saveManualExecutions: true, timezone: 'Asia/Singapore' },
  meta: { templateCredsSetupCompleted: false }, tags: [],
};

// =====================================================================================
// SETUP WORKFLOW (run once)
// =====================================================================================
const S = makeBuilder();
const jwtHeaders = { sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: "={{ 'JWT ' + $('Baserow: Log In').first().json.access_token }}" }] } };
const shttp = (name, pos, { method = 'POST', url, body, extra = {}, oneByOne = false }) => {
  const p = { method, url, options: { timeout: 60000, ...(oneByOne ? { batching: { batch: { batchSize: 1, batchInterval: 400 } } } : {}) }, ...jwtHeaders };
  if (body) Object.assign(p, { sendBody: true, specifyBody: 'json', jsonBody: body });
  return S.node(name, 'n8n-nodes-base.httpRequest', 4.2, pos, p, extra);
};
const BURL = "$('Setup Form').first().json['Baserow address (from n8n)']";
S.node('Setup Form', 'n8n-nodes-base.formTrigger', 2.2, [0, 0], {
  formTitle: 'Social Media Carousel Automation · Baserow setup',
  formDescription: 'Creates the "Carousel Automation" database (Content, Slides) in your local Baserow. Your login is only sent to your own Baserow.',
  formFields: { values: [
    { fieldLabel: 'Baserow email', fieldType: 'email', requiredField: true },
    { fieldLabel: 'Baserow password', fieldType: 'password', requiredField: true },
    { fieldLabel: 'Baserow address (from n8n)', defaultValue: 'http://host.docker.internal:85', requiredField: true },
    { fieldLabel: 'n8n address', defaultValue: 'http://localhost:5678', requiredField: true },
  ] },
  options: {},
}, { webhookId: uuid() });
S.node('Baserow: Log In', 'n8n-nodes-base.httpRequest', 4.2, [240, 0], {
  method: 'POST', url: `={{ ${BURL} + '/api/user/token-auth/' }}`,
  sendBody: true, specifyBody: 'json',
  jsonBody: "={{ JSON.stringify({ email: $json['Baserow email'], username: $json['Baserow email'], password: $json['Baserow password'] }) }}",
  options: { timeout: 30000 },
});
shttp('Baserow: List Workspaces', [480, 0], { method: 'GET', url: `={{ ${BURL} + '/api/workspaces/' }}` });
shttp('Baserow: Create Database', [720, 0], {
  url: `={{ ${BURL} + '/api/applications/workspace/' + ($input.first().json.id || $input.first().json[0].id) + '/' }}`,
  body: "={{ JSON.stringify({ type: 'database', name: 'Carousel Automation' }) }}",
  extra: { executeOnce: true },
});
const tbl = (name, primary, x) => shttp(`Create Table: ${name}`, [x, 0], {
  url: `={{ ${BURL} + '/api/database/tables/database/' + $('Baserow: Create Database').first().json.id + '/' }}`,
  body: `={{ JSON.stringify({ name: '${name}', data: [['${primary}']], first_row_header: true }) }}`,
});
tbl('Content', 'Title', 1200);
tbl('Slides', 'Name', 1440);
S.node('Field Specs', 'n8n-nodes-base.code', 2, [1680, 0], { jsCode: read('setup-field-specs.js').trim() });
shttp('Baserow: Create Field', [1920, 0], {
  url: `={{ ${BURL} + '/api/database/fields/table/' + $json.table + '/' }}`, body: '={{ JSON.stringify($json.body) }}',
  extra: { onError: 'continueRegularOutput' }, oneByOne: true,
});
S.node('Seed Rows', 'n8n-nodes-base.code', 2, [2160, 0], { jsCode: read('setup-seed.js').trim() }, { executeOnce: true });
shttp('Baserow: Create Sample Rows', [2400, 0], {
  url: `={{ ${BURL} + '/api/database/rows/table/' + $json.table + '/?user_field_names=true' }}`, body: '={{ JSON.stringify($json.body) }}',
  extra: { onError: 'continueRegularOutput' }, oneByOne: true,
});
S.node('Summary', 'n8n-nodes-base.code', 2, [2640, 0], { jsCode: read('setup-summary.js').trim() }, { executeOnce: true });
S.node('Done Page', 'n8n-nodes-base.form', 1, [2880, 0], {
  operation: 'completion', completionTitle: '={{ $json.completionTitle }}', completionMessage: '={{ $json.completionMessage }}', options: {},
}, { webhookId: uuid() });
S.chain('Setup Form', 'Baserow: Log In', 'Baserow: List Workspaces', 'Baserow: Create Database',
  'Create Table: Content', 'Create Table: Slides', 'Field Specs', 'Baserow: Create Field', 'Seed Rows', 'Baserow: Create Sample Rows', 'Summary', 'Done Page');
S.sticky('## Run once\nOpen the form (Execute workflow), enter your Baserow login. Creates the Carousel Automation database with all fields and buttons, then shows the table IDs.\nAfterwards you can delete this execution under Executions (it contains your password).', [-40, -300], 700, 240, 4);

const setup = {
  name: 'Social Media Carousel Automation · Baserow setup (run once)',
  nodes: S.nodes, connections: S.connections, pinData: {},
  settings: { executionOrder: 'v1', saveManualExecutions: true },
  meta: {}, tags: [],
};

fs.writeFileSync(path.join(__dirname, 'carousel-automation.n8n.json'), JSON.stringify(main, null, 2));
fs.writeFileSync(path.join(__dirname, 'carousel-automation-setup.n8n.json'), JSON.stringify(setup, null, 2));
console.log('main:', M.nodes.length, 'nodes · setup:', S.nodes.length, 'nodes');
