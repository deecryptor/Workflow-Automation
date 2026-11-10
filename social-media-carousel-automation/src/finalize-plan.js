// @include helpers
// Collects the approved slides and decides what each chosen platform gets.

const { row, rowId } = ctx();
const slides = $input.all().map(i => i.json).filter(r => r && r.id)
  .map(r => {
    const files = Array.isArray(r.Image) ? r.Image : [];
    const tall = files.find(f => /9x16/.test(f.visible_name || ''));
    return { id: r.id, n: Number(r['Slide #']) || 0, text: slideText(r), url: fileUrls(files)[0] || txt(r['Image URL']), url916: tall ? (fileUrls([tall])[0] || txt(r['Image URL 9:16'])) : '' };
  })
  .sort((a, b) => a.n - b.n);
const missing = slides.filter(s => !s.url).map(s => s.n);
if (missing.length) throw new Error(`Slides ${missing.join(', ')} have no image yet. Redo them before approving.`);

const platforms = multi(row.Platforms);
const format = sel(row.Format) || 'Carousel';
// Slideshow videos are made by hand (CapCut), so the workflow never renders one. makeVideo: true in Config turns it back on.
const withVideo = (cfg.makeVideo === true || cfg.makeVideo === 'true') && /video/i.test(format);
const sizes = slideSizes(row);
const size = sizes[0]; // the main version (4:5 when made): used for Instagram
const both = sizes.length > 1;
const mode = sel(row['Posting mode']) || 'Save drafts only';
const caption = [txt(row['Post caption']), txt(row.Hashtags)].filter(Boolean).join('\n\n');
const title = txt(row.Title).replace(/\s*\(example\)\s*$/i, '');

return [{
  json: {
    rowId, title, slides, platforms, format, withVideo, size, both, mode, caption,
    postTime: row['Post time'] || null,
    igAs: sel(row['Instagram as']) || 'Carousel',
    musicUrl: txt(row['Music URL (for video)']),
    folderName: `${rowId} · ${title}`.slice(0, 120),
    // the editable slides (.pptx) go into the Drive folder too
    pptx: (Array.isArray(row['Editable slides']) ? row['Editable slides'] : []).filter(f => f && f.url).map(f => ({ url: fileUrls([f])[0], name: f.visible_name || 'slides.pptx' })),
  },
}];
