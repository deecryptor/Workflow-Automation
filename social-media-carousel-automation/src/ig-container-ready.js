// @include helpers
const parent = $('IG: Build Parent').first().json;
const creationId = parent.isCarousel ? ($('IG: Create Carousel').first().json || {}).id : parent.creationId;
if (!creationId) throw new Error('Instagram did not create the post container: ' + JSON.stringify($('IG: Create Carousel').first().json).slice(0, 400));
const base = `https://graph.instagram.com/${cfg.igApiVersion || 'v23.0'}`;
return [{ json: { creationId, statusUrl: `${base}/${creationId}?fields=status_code`, publishUrl: `${base}/${cfg.igUserId}/media_publish` } }];
