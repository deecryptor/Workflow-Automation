// Canvas layout for the main workflow: one lane per button, top to bottom in the order you press them.
// build.js calls applyLayout() after every node exists. Every working node must appear in exactly one lane.
// Keep "Baserow: Save Research Cache" ABOVE "Claude: Write Research Brief": n8n runs a shared output's
// branches top to bottom, so the cache is saved before Claude is called.
const DX = 240, DY = 190, HEAD = 150, GAP = 90;
const LANES = [  ["start", [
    ["Carousel Webhook", "Config", "From Error?", "From Button?", "Baserow: Get Row", "Check Action", "Reply Page", "Ready to Run?", "Baserow: Set Status", "Route Action"],
    ["Every 15 Minutes", null, null, null, "Baserow: List Content", "Due Instagram Post"],
    ["Error Trigger", null, null, null, "Baserow: List Content (error)", "Mark Failed Row", "Baserow: Mark Failed"]]],
  ["brainstorm", [
    [null, null, null, null, null, null, null, null, null, null, null, "Baserow: Save Research Cache"],
    ["Load Saved Research", "Use Saved Research?", "Build: Research Planner", "Claude: Plan Research", "Parse Research Queries", "Tavily: Search", "Tavily: Extract References", "List References", "Any References?", null, "Build: Research Brief Request", "Claude: Write Research Brief", "Save Research", "Baserow: Save Research"]]],
  ["references", [
    ["Any Pages To Read?", null, null, null, "Any IG/TikTok Posts?", null, null, null, "Collect Uploads", "Any Uploads?", null, null, null, null, "Build Reference Jobs"],
    [null, "Explode Pages", "Read Page", "Parse Pages", null, "Explode SC Posts", "Scrape Creators: Get Post", "Merge SC Posts", null, null, "Explode Uploads", "Download Upload", "Upload To Data URI", "Magica: Upload File"],
    ["Reference Jobs To Run", "Any OpenRouter Calls?", null, null, null, "Any Magica Runs To Start?", "Explode Magica Starts", "Magica: Start Run", "Track Magica Runs", "Wait for Magica", "Explode Magica Checks", "Magica: Check Run", "Evaluate Magica Runs", "Magica Runs Done?", "YouTube Backup?", "Reference Notes"],
    [null, null, "Explode OpenRouter Calls", "OpenRouter: Run", "Apply OpenRouter Results", null, "Magica Still Running?", null, null, null, null, null, null, null, "Explode YouTube Backups", "Scrape Creators: YouTube Backup", "Apply YouTube Backups"]]],
  ["plan", [
    ["Build: Text Style Request", "Read Text Style?", null, "Build: Plan Request", "Claude: Fill Plan", "Save Plan", "Baserow: Save Plan"],
    [null, null, "OpenRouter: Read Text Style"]]],
  ["text", [
    ["Build: Slides Request", "Claude: Write Slides", "Parse Slides", "Baserow: Delete Old Slides", "Baserow: Create Slides", "Save Draft Text", "Baserow: Text Ready"]]],
  ["images", [
    ["List Slides (images)", "Baserow: Get Slide (images)", "Pick Ticked Slides", "Any Ticked?", "Collect Render Job", "List Reference Images", "Has References?", null, null, null, "Pick Style Anchor", "Make Style Anchor?", null, null, null, "Build Image Runs", "OpenRouter: Make Image", "Collect Images", "Baserow: Upload Slide Image", "Save Slide Images", "Baserow: Update Slides"],
    [null, null, null, null, null, null, null, "Explode Refs", "Download Reference", "Refs To Data URI", null, null, "Build Anchor Run", "OpenRouter: Make Anchor", "Anchor Result"],
    [null, null, null, null, "No Ticked Slides", "Baserow: Nothing To Redo"],
    ["Build Image Checks", "Check Images?", null, null, "Finish Render", "Make PPTX?", null, null, null, "Baserow: Slides Ready"],
    [null, null, "OpenRouter: Check Image", "Collect Image Checks", null, null, "Build PPTX", "Baserow: Upload PPTX", "Add PPTX To Row"]]],
  ["save", [
    ["List Slides (final)", "Baserow: Get Slide (final)", "Finalize Plan", "Drive: Create Post Folder", "Explode Slide Files", "Download Slide", "Drive: Upload Slide", "Caption File", "Drive: Upload Caption"],
    ["Make Slideshow Video?", null, null, null, null, null, null, null, null, "Post Router", "Upload to YouTube?", null, null, "After YouTube", "Post to Instagram Now?", null, "After Instagram", "Baserow: Save Final"],
    [null, "Build Slideshow Video", "Creatomate: Render Slideshow", "Wait for Slideshow", "Creatomate: Check Slideshow", "Evaluate Slideshow", "Slideshow Ready?", "Download Slideshow", "Drive: Upload Slideshow", null, null, "Download Video (YouTube)", "YouTube: Upload Short", null, null, "IG Input (now)"]]],
  ["instagram", [
    ["IG Start", "IG: Build Containers", "IG: Create Item", "IG: Build Parent", "IG: Carousel?", null, "IG: Container Ready", "IG: Wait", "IG: Check Container", "IG: Evaluate", "IG: Ready?", "IG: Publish", "IG: Result"],
    [null, null, null, null, null, "IG: Create Carousel"]]]];
const NOTES = {  overview: ["## Social Media Carousel Automation\nEach button in the Baserow **Content** table opens this workflow's webhook with `?action=…&row=…`. **Check Action** checks the row is ready, **Baserow: Set Status** shows the step is running, and **Route Action** sends the run to its lane below.\n\n1 **▶ Brainstorm** → *research* → lane 1\n2 **▶ Approve summary → fill plan** → *plan* → lane 2\n3 **▶ Approve → create draft text** → *slides* → lane 3\n4 **▶ Approve draft text → make style preview** / **↻ Redo style preview** → *images* → lane 4\n5 **▶ Approve look → make the other slides** → *look* → lane 4\n   **↻ Redo images** (slides ticked Redo) → *redo* → lane 4\n6 **▶ Approve draft images** → *finalize* → lane 5\n\nEvery 15 minutes the schedule posts rows that are due on Instagram. If any step fails, the Error Trigger marks the row **Needs attention** with the reason at the top of the Posting log. All settings (tables, models, on/off switches) are in **Config**.", 7],
  start: ["### Start · read the button, check the row, set the Status\nTop: button clicks. Middle: the 15-minute Instagram schedule. Bottom: failed runs → row marked Needs attention.", 7],
  brainstorm: ["### 1 · Brainstorm  (▶ Brainstorm)\nReuses saved research if a previous brief failed and nothing changed. Otherwise Claude plans 6–8 web searches (at least one per outline section), Tavily searches and reads your article links, the references are read (lane below), then Claude writes the Content Research Brief, Sources and a Suggested angle.", 5],
  references: ["### 📚 Reading your references  (part of Brainstorm)\nArticles → Tavily, page reader if Tavily fails · Instagram / TikTok posts → Scrape Creators · YouTube → Gemini watches (Scrape Creators transcript only if Gemini fails) · videos, images, carousels → Qwen, Gemini as backup · audio → Gemini · PDFs and text → DeepSeek. OpenRouter calls answer straight away; Magica runs (backup only) are started, then checked every 15 s until done.", 4],
  plan: ["### 2 · Post Creation Plan  (▶ Approve summary → fill plan)\nReads your Text style reference image (if any), then Claude fills the empty plan fields: Niche, Narrative prompt, Format prompt, Text style, Image style (one medium) and the defaults.", 6],
  text: ["### 3 · Draft text  (▶ Approve → create draft text)\nClaude writes each slide's Title, Body text and image prompt, plus the caption and hashtags, following your outline. This row's old slide rows are deleted and the new ones created. No images yet.", 3],
  images: ["### 4 · Images  (style preview · other slides · redo)\n**▶ Approve draft text** / **↻ Redo style preview** → draws only the style preview (first body slide). **▶ Approve look** → draws every other slide to match the preview. **↻ Redo images** → only slides ticked Redo (uses Redo note and Redo reference image). Images are text-free art from Nano Banana (OpenRouter). A vision check flags stray text or a text area that is too light, then the Editable slides .pptx is rebuilt with your Title and Body text on top.", 2],
  save: ["### 5 · Save post  (▶ Approve draft images)\nGoogle Drive folder with every slide, the .pptx and caption.txt (+ slideshow.mp4 from Creatomate if chosen) → private YouTube Short if chosen → Instagram now, or later by the schedule. TikTok is posted by hand from Drive.", 7],
  instagram: ["### Instagram (API with Instagram Login)\nCarousel: one container per JPEG + a parent; Reel: one container. Waits until Instagram has processed it, then publishes.", 5]};

function applyLayout(M) {
  const byName = new Map(M.nodes.map(n => [n.name, n]));
  const placed = new Set();
  M.nodes.splice(0, M.nodes.length, ...M.nodes.filter(n => n.type !== 'n8n-nodes-base.stickyNote'));
  const note = (key, x, y, width, height) => {
    const [content, color] = NOTES[key];
    M.nodes.push({ parameters: { content, width, height, color }, id: require('crypto').randomUUID(), name: 'Note · ' + key, type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [x, y] });
  };
  note('overview', -40, -520, 1500, 470);
  let y = 0;
  for (const [key, rows] of LANES) {
    const top = y;
    rows.forEach((row, r) => row.forEach((name, col) => {
      if (!name) return;
      const n = byName.get(name);
      if (!n) throw new Error('layout: no node called ' + name);
      if (placed.has(name)) throw new Error('layout: placed twice: ' + name);
      n.position = [col * DX, top + HEAD + r * DY];
      placed.add(name);
    }));
    const height = HEAD + rows.length * DY + 10;
    note(key, -60, top, Math.max(...rows.map(r => r.length)) * DX + 40, height);
    y = top + height + GAP;
  }
  const missing = [...byName.keys()].filter(k => byName.get(k).type !== 'n8n-nodes-base.stickyNote' && !placed.has(k));
  if (missing.length) throw new Error('layout: nodes not in any lane: ' + missing.join(', '));
}

module.exports = { applyLayout };
