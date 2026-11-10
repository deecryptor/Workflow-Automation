// ---------- editable slides (.pptx) — inlined at build time ----------
// A PowerPoint file per slide size: each slide is the text-free background art plus real, editable text boxes
// (Title, Body Text, highlights, bullets, handle, counter) styled from the Text style. Built by hand: a .pptx is
// a zip of XML files, written here without any library (stored, uncompressed: the images are already PNG/JPEG).

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipStore(files) {
  const parts = []; const central = []; let offset = 0;
  // a real timestamp and Unix file attributes, like ordinary zip tools (Keynote rejects zips without them)
  const d = new Date();
  const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)) & 0xFFFF;
  const dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'); const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x0314, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0x81A40000, 38); ch.writeUInt32LE(offset, 42);
    parts.push(lh, name, data); central.push(ch, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const xmlEsc = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const EMU = 914400; // per inch
const PT = 12700;   // EMU per point

const GOOGLE_FONTS = ['Inter', 'Montserrat', 'Poppins', 'Lato', 'Roboto', 'Open Sans', 'DM Sans', 'Nunito', 'Raleway', 'Oswald', 'Work Sans', 'Manrope', 'Outfit', 'Plus Jakarta Sans', 'Bebas Neue', 'Anton', 'Archivo', 'Rubik', 'Playfair Display', 'Merriweather', 'Lora', 'DM Serif Display', 'Libre Baskerville', 'Fraunces', 'Space Grotesk', 'Source Sans 3', 'Noto Sans', 'Karla', 'Mulish', 'Quicksand', 'Josefin Sans', 'League Spartan', 'Barlow', 'IBM Plex Sans', 'Sora', 'Lexend'];
const hexOf = (s, re) => { const m = String(s || '').match(re); return m ? m[1].replace('#', '').toUpperCase() : ''; };
// Font, colours, alignment and highlight read from the Text style (falls back to clean defaults).
function textSpec(style) {
  const s = txt(style);
  const named = (s.match(/Google Font[s]?\s+(?:called\s+|named\s+)?["“]?([A-Z][A-Za-z0-9]*(?:\s(?:[A-Z][A-Za-z0-9]*|\d))*)/) || [])[1];
  const font = named || GOOGLE_FONTS.find(f => new RegExp(`\\b${f}\\b`, 'i').test(s)) || 'Montserrat';
  const sentences = s.split(/(?<=[.!?])\s+|\n+/);
  const colourIn = re => { for (const x of sentences) if (re.test(x) && !/bullet|highlight|accent|handle|counter|swipe|shadow|outline|glow|box/i.test(x)) { const h = hexOf(x, /(#[0-9a-f]{6})\b/i); if (h) return h; } return ''; };
  const main = textColour(s);
  const mainHex = /^#/.test(main.colour) ? main.colour.slice(1) : main.colour === 'black' || main.colour === 'charcoal' ? '1A1A1A' : main.colour === 'navy' ? '1F2A44' : main.colour === 'cream' || main.colour === 'ivory' ? 'FFF8E7' : 'FFFFFF';
  const title = colourIn(/\b(title|headline|heading)\b/i) || mainHex;
  const body = colourIn(/\b(body|copy|paragraph)\b/i) || mainHex;
  const hl = hexOf(sentences.find(x => /highlight|accent/i.test(x)) || '', /(#[0-9a-f]{6})\b/i);
  const alignTxt = sentences.find(x => /align|centred|centered|left|right/i.test(x) && !/handle|counter|swipe/i.test(x)) || '';
  const align = /\bcent(?:er|re)(?:ed|d)?\b/i.test(alignTxt) && !/left/i.test(alignTxt) ? 'ctr' : /right-align|align(?:ed)? right/i.test(alignTxt) ? 'r' : 'l';
  const lum = h => { const n = parseInt(h, 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  const light = lum(body) > 0.6;
  return { font, title, body, highlight: hl || (light ? 'FFD84D' : 'E4572E'), align, light, upperTitle: /\b(title|headline)s?\b[^.]*\b(uppercase|all caps)\b/i.test(s) };
}

// Picks the largest font size (pt) that fits the text in the box (rough width estimate: 0.52 em per character).
function fitSize(paras, boxW, boxH, maxPt, minPt, lineGap, paraGap) {
  for (let pt = maxPt; pt >= minPt; pt -= 1) {
    const perLine = Math.max(8, Math.floor(boxW / PT / (pt * 0.52)));
    const lines = paras.reduce((a, p) => a + Math.max(1, Math.ceil(p.replace(/\*/g, '').length / perLine)), 0);
    const h = (lines * pt * lineGap + (paras.length - 1) * pt * paraGap) * PT;
    if (h <= boxH) return { pt, h: Math.ceil(h) };
  }
  const perLine = Math.max(8, Math.floor(boxW / PT / (minPt * 0.52)));
  const lines = paras.reduce((a, p) => a + Math.max(1, Math.ceil(p.length / perLine)), 0);
  return { pt: minPt, h: Math.ceil((lines * minPt * lineGap + (paras.length - 1) * minPt * paraGap) * PT) };
}
// Runs of one paragraph: *starred* words become bold runs in the highlight colour.
// a soft shadow under light text, so it stays readable even over a busy patch of the art
const SHADOW = '<a:effectLst><a:outerShdw blurRad="50800" dist="19050" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="55000"/></a:srgbClr></a:outerShdw></a:effectLst>';
function runsXml(text, { pt, colour, font, bold, hl, shadow }) {
  const bits = String(text).split(/(\*[^*]+\*)/).filter(Boolean);
  return bits.map(b => {
    const isHl = /^\*[^*]+\*$/.test(b);
    const t = isHl ? b.slice(1, -1) : b;
    return `<a:r><a:rPr lang="en-US" sz="${pt * 100}" b="${bold || isHl ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${isHl ? hl : colour}"/></a:solidFill>${shadow ? SHADOW : ''}<a:latin typeface="${xmlEsc(font)}"/><a:cs typeface="${xmlEsc(font)}"/></a:rPr><a:t>${xmlEsc(t)}</a:t></a:r>`;
  }).join('');
}
let SHAPE_ID = 2;
function textBox(name, x, y, w, h, parasXml, anchor) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${SHAPE_ID++}" name="${xmlEsc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(w)}" cy="${Math.round(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${anchor || 't'}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${parasXml}</p:txBody></p:sp>`;
}
function para(runs, { align, lnPct, spcBefPt, bullet, colour, font, pt }) {
  const bu = bullet
    ? `<a:buClr><a:srgbClr val="${colour}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="•"/>`
    : '<a:buNone/>';
  const ind = bullet ? ` marL="${Math.round(pt * 1.1 * PT)}" indent="-${Math.round(pt * 1.1 * PT)}"` : ' marL="0" indent="0"';
  return `<a:p><a:pPr algn="${align}"${ind}><a:lnSpc><a:spcPct val="${lnPct * 1000}"/></a:lnSpc><a:spcBef><a:spcPts val="${Math.round(spcBefPt * 100)}"/></a:spcBef>${bu}</a:pPr>${runs}<a:endParaRPr lang="en-US" sz="${pt * 100}" dirty="0"><a:latin typeface="${xmlEsc(font)}"/></a:endParaRPr></a:p>`;
}

// One slide's XML. s = { n, role, text, img: {rel, w, h} | null }
function slideXml(s, o) {
  SHAPE_ID = 2;
  const { W, H, spec, total, handle, extras, swipe } = o;
  const m = W * 0.08; const boxW = W - 2 * m;
  const [first, ...rest] = String(s.text || '').split('\n');
  let title = txt(first); if (spec.upperTitle) title = title.toUpperCase();
  let lines = rest.map(l => l.trim()).filter(Boolean);
  if (lines.length === 1) lines = lines[0].split(/(?<=[.!?])\s+(?=["“'*A-Z0-9])/).map(l => l.trim()).filter(Boolean);
  const shapes = [];
  // background art (full bleed), or a plain colour while the slide has no image yet
  if (s.img) {
    shapes.push(`<p:pic><p:nvPicPr><p:cNvPr id="${SHAPE_ID++}" name="Background art"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${s.img.rel}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`);
  }
  // a soft shade behind the text so it always reads (delete it in your editor if the art is already dark/light enough)
  const shadeCol = spec.light ? '000000' : 'FFFFFF';
  const isCover = s.role === 'cover';
  const textBottom = H * (isCover ? 0.62 : 0.72);
  shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${SHAPE_ID++}" name="Text shade (delete if not needed)"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${Math.round(textBottom + H * 0.12)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${shadeCol}"><a:alpha val="${s.strongShade ? 85000 : spec.light ? 65000 : 70000}"/></a:srgbClr></a:gs><a:gs pos="70000"><a:srgbClr val="${shadeCol}"><a:alpha val="${s.strongShade ? 70000 : spec.light ? 42000 : 45000}"/></a:srgbClr></a:gs><a:gs pos="100000"><a:srgbClr val="${shadeCol}"><a:alpha val="0"/></a:srgbClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`);
  const top = H * (isCover ? 0.12 : 0.08);
  if (isCover || !lines.length) {
    const f = fitSize([title], boxW, textBottom - top, isCover ? 58 : 42, 24, 1.08, 0);
    shapes.push(textBox('Title', m, top, boxW, Math.max(f.h, H * 0.1), para(runsXml(title, { pt: f.pt, colour: spec.title, font: spec.font, bold: true, hl: spec.highlight, shadow: spec.light }), { align: spec.align, lnPct: 105, spcBefPt: 0, bullet: false, colour: spec.title, font: spec.font, pt: f.pt })));
  } else {
    const tf = fitSize([title], boxW, H * 0.22, 40, 24, 1.1, 0);
    shapes.push(textBox('Title', m, top, boxW, tf.h, para(runsXml(title, { pt: tf.pt, colour: spec.title, font: spec.font, bold: true, hl: spec.highlight, shadow: spec.light }), { align: spec.align, lnPct: 108, spcBefPt: 0, bullet: false, colour: spec.title, font: spec.font, pt: tf.pt })));
    const by = top + tf.h + tf.pt * 0.9 * PT;
    const bullets = lines.some(l => /^[•\-–]\s/.test(l));
    const clean = lines.map(l => l.replace(/^[•\-–]\s*/, ''));
    const bf = fitSize(clean, boxW - (bullets ? 30 * PT : 0), textBottom - by, Math.min(28, Math.floor(tf.pt * 0.68)), 14, 1.3, 0.55);
    const ps = clean.map((l, i) => para(runsXml(l, { pt: bf.pt, colour: spec.body, font: spec.font, bold: false, hl: spec.highlight, shadow: spec.light }), { align: bullets ? 'l' : spec.align, lnPct: 125, spcBefPt: i ? bf.pt * 0.55 : 0, bullet: bullets && /^[•\-–]\s/.test(lines[i]), colour: spec.body, font: spec.font, pt: bf.pt })).join('');
    shapes.push(textBox('Body Text', m, by, boxW, Math.max(bf.h, textBottom - by), ps));
  }
  // small extras: your handle (bottom centre), page counter and swipe prompt (bottom right)
  const small = Math.max(11, Math.round(W / EMU * 1.6));
  const foot = H - m * 0.9 - small * 1.4 * PT;
  const smallPara = (t, al) => para(runsXml(t, { pt: small, colour: spec.body, font: spec.font, bold: true, hl: spec.highlight, shadow: spec.light }), { align: al, lnPct: 100, spcBefPt: 0, bullet: false, colour: spec.body, font: spec.font, pt: small });
  if (handle) shapes.push(textBox('Handle', m, foot, boxW, small * 1.4 * PT, smallPara(handle.toUpperCase(), 'ctr')));
  const corner = [extras ? `${s.n}/${total}` : '', swipe && s.n === 1 ? 'Swipe →' : ''].filter(Boolean).join('   ');
  if (corner) shapes.push(textBox('Counter', m, foot, boxW, small * 1.4 * PT, smallPara(corner, 'r')));
  const bg = s.img ? '' : `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${spec.light ? '2B2B2B' : 'F4EFE6'}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
  return `${HEAD}<p:sld ${NS}><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

const THEME = `${HEAD}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Carousel Automation"><a:themeElements><a:clrScheme name="Carousel Automation"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2A44"/></a:dk2><a:lt2><a:srgbClr val="F4EFE6"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="Carousel Automation"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Carousel Automation"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="38100"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
const EMPTY_TREE = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';
const MASTER = `${HEAD}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${EMPTY_TREE}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2400"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
const LAYOUT = `${HEAD}<p:sldLayout ${NS} preserve="1"><p:cSld name="Blank">${EMPTY_TREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
const RELS = (items) => `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join('')}</Relationships>`;

// slides: [{ n, role, text, image: Buffer|null }] → .pptx Buffer
function buildPptx(slides, o) {
  const W = 6858000; const H = o.size === '9:16' ? 12192000 : 8572500; // 7.5in wide; 4:5 or 9:16 tall
  const files = []; const media = [];
  const ct = ['<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>', '<Default Extension="xml" ContentType="application/xml"/>', '<Default Extension="png" ContentType="image/png"/>', '<Default Extension="jpeg" ContentType="image/jpeg"/>', '<Default Extension="webp" ContentType="image/webp"/>',
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'];
  const slideFiles = [];
  slides.forEach((s, i) => {
    const k = i + 1; let img = null; const rels = [['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']];
    if (s.image && s.image.length) {
      const h = s.image.slice(0, 4).toString('latin1');
      const ext = h.startsWith('\x89PNG') ? 'png' : h.startsWith('RIFF') ? 'webp' : 'jpeg';
      const mediaName = `image${k}.${ext}`; media.push({ name: `ppt/media/${mediaName}`, data: s.image });
      rels.push(['rId2', 'image', `../media/${mediaName}`]); img = { rel: 'rId2' };
    }
    ct.push(`<Override PartName="/ppt/slides/slide${k}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`);
    slideFiles.push({ name: `ppt/slides/slide${k}.xml`, data: slideXml({ ...s, img }, { ...o, W, H }) });
    slideFiles.push({ name: `ppt/slides/_rels/slide${k}.xml.rels`, data: RELS(rels) });
  });
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  files.push({ name: '[Content_Types].xml', data: `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${ct.join('')}</Types>` });
  files.push({ name: '_rels/.rels', data: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` });
  files.push({ name: 'docProps/core.xml', data: `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(o.title)}</dc:title><dc:creator>Carousel Automation</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` });
  files.push({ name: 'docProps/app.xml', data: `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Carousel Automation</Application><Slides>${slides.length}</Slides></Properties>` });
  files.push({ name: 'ppt/presentation.xml', data: `${HEAD}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((s, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>` });
  files.push({ name: 'ppt/_rels/presentation.xml.rels', data: RELS([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ...slides.map((s, i) => [`rId${i + 3}`, 'slide', `slides/slide${i + 1}.xml`])]) });
  files.push({ name: 'ppt/slideMasters/slideMaster1.xml', data: MASTER });
  files.push({ name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: RELS([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]) });
  files.push({ name: 'ppt/slideLayouts/slideLayout1.xml', data: LAYOUT });
  files.push({ name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: RELS([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]) });
  files.push({ name: 'ppt/theme/theme1.xml', data: THEME });
  return zipStore([...files, ...slideFiles, ...media]);
}
// ---------- end pptx helpers ----------
