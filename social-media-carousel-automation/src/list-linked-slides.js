// @include helpers
// One GET per slide linked to this post.
const ids = linkIds(ctx().row.Slides);
return ids.map(id => ({ json: { slideId: id, url: rowUrl(T.slides, id) } }));
