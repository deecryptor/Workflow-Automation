// @include helpers
// Reference images uploaded to this post's row. Max 3 per kind for scene/style, 1 typography reference.

const { row } = ctx();
const pickFiles = (f, n) => fileUrls(row[f]).slice(0, n || 3);
const cover = pickFiles('Cover reference images');
const slide = pickFiles('Slide reference images');
const text = pickFiles('Text style reference', 1);
const refs = [...cover.map(url => ({ kind: 'cover', url })), ...slide.map(url => ({ kind: 'slide', url })), ...text.map(url => ({ kind: 'text', url }))];
// a slide's own "Redo reference image" (Slides table) is used for that slide only
for (const s of $('Collect Render Job').first().json.slides || []) for (const url of s.ownRefs || []) refs.push({ kind: 'own', slideId: s.slideId, url });
return [{ json: { refs, hasRefs: refs.length > 0, imageStyle: txt(row['Image style']) } }];
