// @include helpers
// Turns the approved slides into a 9:16 MP4 for Reels / Shorts / TikTok video. 4:5 slides sit on a blurred backdrop.
const p = $('Finalize Plan').first().json;
const secs = Number(cfg.secondsPerSlide) || 3;
const scenes = p.slides.map((s, i) => {
  const els = p.size === '9:16'
    ? [{ type: 'image', source: s.url, fit: 'cover' }]
    : [
      { type: 'image', source: s.url, fit: 'cover', blur_radius: 40, color_overlay: 'rgba(0,0,0,0.25)' },
      { type: 'image', source: s.url, fit: 'contain' },
    ];
  const scene = { type: 'composition', name: `Slide-${s.n}`, track: 1, duration: secs, elements: els };
  if (i > 0) scene.animations = [{ time: 0, duration: 0.4, transition: true, type: 'fade' }];
  return scene;
});
const elements = [...scenes];
if (p.musicUrl) elements.push({ type: 'audio', name: 'Music', track: 2, source: p.musicUrl, duration: Math.max(1, p.slides.length * secs - 0.4 * (p.slides.length - 1)) });
return [{ json: { renderScript: { output_format: 'mp4', width: 1080, height: 1920, frame_rate: 30, elements } } }];
