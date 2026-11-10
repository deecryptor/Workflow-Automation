const MAX_CHECKS = 40; // 40 × 15 s = 10 minutes
const s = ($input.first().json || {}).status_code;
if (s === 'ERROR' || s === 'EXPIRED') throw new Error('Instagram could not process the post (status ' + s + '). Check the image/video format: JPEG images at 4:5, MP4 for Reels.');
const ready = s === 'FINISHED';
if (!ready && $runIndex + 1 >= MAX_CHECKS) throw new Error('Timed out waiting for Instagram to process the post (last status ' + s + ').');
return [{ json: { ready, status: s } }];
