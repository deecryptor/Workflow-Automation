// @include helpers
// Decides what happens on each platform you ticked, given the format and posting mode.

const p = $('Finalize Plan').first().json;
const folder = $('Drive: Create Post Folder').first().json;
const folderUrl = folder && folder.id ? `https://drive.google.com/drive/folders/${folder.id}` : '';
const videoUrl = $('Evaluate Slideshow').isExecuted ? $('Evaluate Slideshow').last().json.url : null;
const due = p.postTime ? new Date(p.postTime) : null;
const log = [];
const has = x => p.platforms.includes(x);

// --- TikTok: manual (photo posts need your own verified domain for the API) ---
if (has('TikTok')) log.push(`TikTok: post manually. On your phone open the Drive folder, save the ${p.slides.length} slides, then TikTok → + → Photo, pick them in order${p.both ? ' (use the 9x16 files)' : ''}, add a trending sound, paste caption.txt, and turn on "AI-generated content" under More options (the slides are AI images)${p.mode === 'Post at scheduled time' && due ? ` (planned for ${due.toISOString().slice(0, 16).replace('T', ' ')} UTC)` : ''}.`);

// --- YouTube: needs the video; API uploads stay private until Google audits your project ---
let doYouTube = false;
if (has('YouTube')) {
  if (!videoUrl) log.push('YouTube: image posts can\'t be created through the API. Choose Format "Carousel + slideshow video" for a Short, or post the slides from the Drive folder in the YouTube app (Create → Post).');
  else doYouTube = true;
}

// --- Instagram: carousel needs 4:5, Reel needs the video. No drafts via the API. ---
let igAs = p.igAs;
let igPlan = 'none';
// Instagram's API fetches images from a public link; the slides now live only on your Baserow (localhost).
const publicImages = p.slides.length > 0 && p.slides.every(s => /^https:\/\//i.test(s.url) && !/localhost|host\.docker\.internal/i.test(s.url));
if (has('Instagram') && !publicImages) log.push('Instagram: post manually from the Drive folder (the slides have no public link for Instagram\'s API).');
if (has('Instagram') && publicImages) {
  if (igAs === 'Carousel' && p.size === '9:16') {
    if (videoUrl) { igAs = 'Reel'; log.push('Instagram: 9:16 slides can\'t be an Instagram carousel, so the slideshow video will be posted as a Reel instead.'); }
    else log.push('Instagram: skipped. 9:16 slides can\'t be posted as an Instagram carousel (needs 4:5). Change Slide size to 4:5 and redo the slides, or add the slideshow video.');
  }
  if (igAs === 'Reel' && !videoUrl) {
    if (p.size === '4:5') { igAs = 'Carousel'; log.push('Instagram: no slideshow video, so it will go up as a carousel instead of a Reel.'); }
    else igAs = null;
  }
  if (igAs && !(igAs === 'Carousel' && p.size === '9:16')) {
    if (p.mode === 'Post now') igPlan = 'now';
    else if (p.mode === 'Post at scheduled time') {
      if (!due) { igPlan = 'none'; log.push('Instagram: no Post time set, so nothing was scheduled. Add a Post time and press ▶ Approve draft images again.'); }
      else { igPlan = 'scheduled'; log.push(`Instagram: scheduled for ${due.toISOString().slice(0, 16).replace('T', ' ')} UTC as a ${igAs}. n8n posts it within 15 minutes of that time, as long as your Mac and Docker are running.`); }
    } else log.push(`Instagram: ready as a ${igAs}. Instagram has no API drafts, so change Posting mode to "Post now" or "Post at scheduled time" and press ▶ Approve draft images again, or post from the Drive folder.`);
  }
}
if (!p.platforms.length) log.push('No platforms ticked: assets saved to Google Drive only.');

const manifest = { images: p.slides.map(s => s.url), video_url: videoUrl, caption: p.caption, ig_as: igAs, folder_url: folderUrl, ig_posted: false };
return [{ json: { doYouTube, igPlan, igAs, videoUrl, folderUrl, manifest, log } }];
