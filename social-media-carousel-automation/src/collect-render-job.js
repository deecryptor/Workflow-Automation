// @include helpers
// The slides to draw in this run (picked by Pick Ticked Slides), in slide order.

const slides = [...($input.first().json.ticked || [])].sort((a, b) => a.n - b.n);
return [{ json: { slides } }];
