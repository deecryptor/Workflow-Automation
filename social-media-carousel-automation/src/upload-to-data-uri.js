// Turns each downloaded file into a data URL so Magica can store it (Baserow is only on localhost; post images expire).
const ups = $('Explode Uploads').all().map(i => i.json);
const MT = { video: 'video', image: 'image', audio: 'audio' };
const out = [];
const items = $input.all();
for (let i = 0; i < items.length; i++) {
  const u = ups[i]; const bin = items[i].binary && items[i].binary.data;
  if (!bin) { out.push({ json: { label: u.label, error: 'download failed', body: {} } }); continue; }
  const buf = await this.helpers.getBinaryDataBuffer(i, 'data');
  if (u.fileKind === 'text' || u.fileKind === 'rtf') {
    // .rtf is read as raw text (formatting codes included)
    out.push({ json: { label: u.label, inlineText: buf.toString(u.fileKind === 'rtf' ? 'latin1' : 'utf8').slice(0, 4000000), body: {} } });
    continue;
  }
  const mime = bin.mimeType || u.mime || 'application/octet-stream';
  const body = { url: `data:${mime};base64,${buf.toString('base64')}`, folder: 'media-library', filename: bin.fileName || u.label.replace(/[^\w.-]+/g, '_').slice(-60) };
  if (MT[u.fileKind]) body.media_type = MT[u.fileKind];
  out.push({ json: { label: u.label, body } });
}
return out;
