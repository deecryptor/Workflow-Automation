// Turns each downloaded reference image into a data URL that is sent straight to the image model (Baserow is only on localhost).
const refs = $('Explode Refs').all().map(i => i.json);
const out = [];
const items = $input.all();
for (let i = 0; i < items.length; i++) {
  const bin = items[i].binary && items[i].binary.data;
  if (!bin) throw new Error(`Couldn't download reference image ${refs[i] && refs[i].url}`);
  const buf = await this.helpers.getBinaryDataBuffer(i, 'data');
  const mime = bin.mimeType || 'image/jpeg';
  out.push({ json: { kind: refs[i].kind, slideId: refs[i].slideId, dataUrl: `data:${mime};base64,${buf.toString('base64')}` } });
}
return out;
