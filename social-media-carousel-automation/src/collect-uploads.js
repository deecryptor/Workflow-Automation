// @include helpers
// Everything that must be copied into Magica first: your uploaded files + images found in posts.
const info = $('List References').first().json;
const pages = $('Merge SC Posts').isExecuted ? $('Merge SC Posts').first().json.pages : ($('Parse Pages').isExecuted ? $('Parse Pages').first().json.pages : []);
const uploads = [
  ...info.files.map(f => ({ owner: f.url, label: f.label, url: f.url, fileKind: f.fileKind, mime: f.mime })),
  ...pages.flatMap(p => p.images.map((u, k) => ({ owner: p.url, label: `${p.url} image ${k + 1}`, url: u, fileKind: 'image', mime: '' }))),
].slice(0, 30);
// With Magica off nothing is copied: OpenRouter reads files from Baserow and post images from their own links.
const magicaOn = cfg.useMagica === true || cfg.useMagica === 'true';
return [{ json: { uploads: magicaOn ? uploads : [], hasUploads: magicaOn && uploads.length > 0, pages } }];
