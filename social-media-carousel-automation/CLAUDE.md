# Social Media Carousel Automation (n8n + Baserow)

This repo is the complete source of a carousel automation. A Baserow row (topic, audience, optional outline, reference links and files) becomes a researched, designed Instagram/TikTok carousel. Every step starts from a button in Baserow, and a person approves the result before pressing the next one.

These instructions are for an AI coding agent such as Claude Code that builds, runs or changes this project. They also work as a technical guide for people.

## Rules

1. **Once it's running, the live n8n workflow is the source of truth.** People also edit it in the n8n editor. Before any change, download it, patch it surgically, show the owner the diff, and upload only after they approve. Don't rebuild with `build.js` and import over a working workflow unless the owner asks for a fresh build.
2. **Paid calls:** ask before running anything that costs money or credits (OpenRouter, Tavily, Scrape Creators, Creatomate, Magica). That includes pressing workflow buttons for a test run. `node test/dry-run.js` is free and offline; run it after every change.
3. **Secrets** go only in a `.env` file (copy `.env.example`; `.env` is gitignored) and in n8n's credential store. Never write keys into any other file, and never print them.
4. **Baserow permissions:** a database token can read and write rows, and can upload files to `/api/user-files/upload-file/`. It **cannot** create, rename or delete fields, buttons or databases. Give the owner the exact names and formulas so they can make those changes. The setup workflow can create fields because it logs in with the email and password the owner types into its form.
5. **Back up before every upload:** `python3 tools/n8n_api.py backup <workflow id> <what-changes>`. Backups (`live-backup-*.json`) are gitignored.

## Files

| Path | What it is |
|---|---|
| `carousel-automation.n8n.json` | The main workflow. Credentials are referenced by name only |
| `carousel-automation-setup.n8n.json` | One-time workflow that creates the Baserow database, both tables, every field and button, and an example row |
| `build.js` | Generates both workflow files from `src/` and `layout.js`: `node build.js` |
| `src/*.js` | The code of each Code node, one file per node. Shared code is pulled in with `// @include helpers` (`helpers.js`), `// @include video` (`video-common.js`) and `// @include pptx` (`pptx-lib.js`) |
| `src/setup-field-specs.js` | The Baserow schema: every field, option and button, in step order. The source for the setup workflow |
| `layout.js` | Canvas layout: one lane per button, plus the notes. Every working node must sit in exactly one lane, or the build throws an error |
| `test/dry-run.js` | Offline test suite. It runs every Code node's real code against fake API responses. `test/fixtures-producer-slides.json` holds a producer's hand-edited slides; they must pass Parse Slides with no warnings |
| `tools/n8n_api.py` | n8n API helper: `list`, `download`, `backup`, `upload`, `create`, `set-error-workflow`. Commands that change n8n only do a dry run unless `--go` is given. It reads `N8N_URL` and `N8N_API_KEY` from `.env` |
| `baserow/schema.json` | Field layout of both tables, with no data |
| `docs/how-to-write-content-research.md` | Guide to writing the Content Research field |

## Build from scratch

Steps 3, 4 and 6 need the owner (logins and keys). Steps 7–8 need their approval before `--go`.

1. **Docker.** Start n8n (for example on port 5678) and Baserow (for example on port 85). Start Baserow with `BASEROW_EXTRA_PUBLIC_URLS=http://host.docker.internal:85` and `BASEROW_EXTRA_ALLOWED_HOSTS=host.docker.internal`, so n8n can reach it from inside Docker:
   ```
   docker volume create baserow_data
   docker run -d --name baserow -e BASEROW_PUBLIC_URL=http://localhost:85 -e BASEROW_EXTRA_PUBLIC_URLS=http://host.docker.internal:85 -e BASEROW_EXTRA_ALLOWED_HOSTS=host.docker.internal -v baserow_data:/baserow/data -p 85:80 --restart unless-stopped baserow/baserow:2.4.1
   ```
   Copy `.env.example` to `.env` and fill in `N8N_URL` and `N8N_API_KEY` (n8n → Settings → n8n API).
2. **Check the source:**
   ```
   node build.js
   node test/dry-run.js
   ```
   The tests must end with `DRY RUN PASSED`. `build.js` regenerates both workflow files.
3. **Create the Baserow tables (owner).** In n8n, import `carousel-automation-setup.n8n.json` and click **Execute workflow**. In the form, enter the Baserow email and password; change the two addresses if your ports differ.
   - The result page should say "All 47 fields were added".
   - Its **Summary** node lists `contentTableId`, `slidesTableId` and `selectOptions`.
   - Then delete that execution, because it stores the password.
4. **Database token (owner).** In Baserow: Settings → Database tokens → create one for this database with all permissions. Save it as `BASEROW_TOKEN` in `.env`; it also goes into the n8n credential below.
5. **Fill in Config.** In the main workflow's **Config** node, set:
   - `contentTableId`, `slidesTableId` and `selectOptions`, from step 3;
   - `driveFolderId`, the Google Drive folder the posts are saved in;
   - `baserowUrl` and `baserowPublicUrl`, if your Baserow address differs.
6. **Credentials (owner).** In n8n, create credentials with **exactly these names**; the nodes look them up by name.

   | Name | Type | Header / setup | Needed for |
   |---|---|---|---|
   | Baserow | Header Auth | `Authorization: Token <database token>` | everything |
   | OpenRouter | Header Auth | `Authorization: Bearer <key>` | every AI step |
   | Tavily | Header Auth | `Authorization: Bearer <key>` | Brainstorm web search |
   | Scrape Creators | Header Auth | `x-api-key: <key>` | Instagram/TikTok posts, YouTube transcript backup |
   | Google Drive account | Google Drive OAuth2 | OAuth sign-in | saving the post |
   | Creatomate, YouTube account, Magica | various | optional | slideshow MP4, Shorts upload, backup readers (all off by default) |
7. **Import the main workflow:**
   ```
   python3 tools/n8n_api.py create carousel-automation.n8n.json --go
   ```
   - Open it once in the editor and pick the matching credential on every node that shows a warning.
   - Activate it, then run `python3 tools/n8n_api.py set-error-workflow <new id> --go`. The workflow becomes its own error workflow; this takes two passes because the id only exists after the import.
8. **Buttons.** The setup workflow already made the 8 buttons, pointing to `<n8n address>/webhook/carousel-automation?action=…&row=…`. Test with the example row, which uses paid calls: press **▶ Brainstorm** and check that Status changes to "Brainstorming…" and then "Summary ready".

## How it works

**Start lane.** A button opens the webhook with `?action=&row=`, then:
1. **Config** loads the settings.
2. **Baserow: Get Row** fetches the row.
3. **Check Action** checks that the row is ready and picks the Status label.
4. **Ready to Run?** checks the result, and **Baserow: Set Status** writes the label plus the `n8n run` id.
5. **Route Action** sends the run to its lane.

Two other triggers sit in the same lane:
- **Every 15 Minutes** only handles scheduled Instagram posts, which are off by default.
- **Error Trigger** marks a crashed run's row **Needs attention**. It finds the row by its `n8n run` id.

| Button (Baserow field) | `action` | Status while running | What happens |
|---|---|---|---|
| ▶ Brainstorm (1 · Gather Content & Design Requirements) | `research` | Brainstorming… → Summary ready | Claude plans 6–8 searches (at least one per outline section). Tavily searches and extracts, the references are read, and Claude writes the Content Research Brief, Sources and a suggested Angle. The Research cache lets a failed brief be retried without searching again |
| ▶ Approve summary → fill plan (2 · Brainstorming Summary) | `plan` | Filling plan… → Plan ready | Reads the Text style reference image, then fills the empty fields: Niche, Narrative prompt, Format prompt, Text style and Image style |
| ▶ Approve → create draft text (3 · Post Creation Plan) | `slides` | Writing text draft… → Draft text ready | Writes Title, Body text and an image prompt for each slide, plus the caption and hashtags. Deletes this row's old Slides rows and creates new ones |
| ▶ Approve draft text → make style preview (4 · Draft Text), ↻ Redo style preview | `images` | Making draft images… → Style preview ready | Draws only the style preview (the first body slide) |
| ▶ Approve look → make the other slides (5 · Style Preview) | `look` | Making draft images… → Draft image ready | Draws every other slide, using the preview as the style anchor. Builds the .pptx |
| ↻ Redo images | `redo` | Redoing draft images… → Draft images redone | Redraws only the slides ticked **Redo**. The optional Slides fields `Redo note` (long text) and `Redo reference image` (file) are used if you add them |
| ▶ Approve draft images (6 · Draft Images) | `finalize` | Finalising draft post… → Draft post saved | Creates a Google Drive folder with every slide, the .pptx and `caption.txt`. Optional extras (off by default): slideshow MP4, YouTube Short, Instagram |

Status option ids live in Config `selectOptions`. If a Status option is added or renamed in Baserow, refresh `selectOptions` from `GET /api/database/fields/table/<content table id>/`.

**Models.** All go through OpenRouter and are set in Config, except the image model.

| Job | Model | Config key |
|---|---|---|
| Plan research, write brief, plan, slide copy | `anthropic/claude-sonnet-5.5`, called through `https://openrouter.ai/api/v1/messages` (Anthropic format) | `llmModel` |
| Slide art (text-free) | `google/gemini-nano-banana-2.1` (about $0.05 per slide) | `orImageModel` (default set in `src/build-image-runs.js`) |
| YouTube links (Gemini watches; agentic mode) | `google/gemini-3.8-flash` | `orYoutubeModel` |
| Uploaded/social videos and images | `qwen/qwen3.8-omni-flash`, then Gemini 3.8 Flash | `orMediaModel`, `orVideoFallbackModel`, `orImageFallbackModel` |
| Audio files | `google/gemini-3.8-flash` | `orAudioModel` |
| PDFs (reads the pages natively) | `google/gemini-3.1-flash-lite`, then DeepSeek on the extracted text | `orDocModel` |
| Notes on long `.txt`/RTF/PDF text (over 15,000 characters) | Gemini 3.1 Flash Lite, then DeepSeek | `orDocModel`, `orTextModel` |
| Notes on long transcripts (YouTube backup transcripts) | `deepseek/deepseek-v4.1-flash-1017`, then Gemini 3.8 Flash | `orTextModel` |

The backups:
- **Scrape Creators** fetches a YouTube transcript only when Gemini fails on that link (the `YouTube Backup?` branch).
- **Magica** readers are off by default; set `useMagica: true` in Config to enable them.

Other flags in Config:
- `textMode: 'pptx'`: text-free art plus an editable .pptx (`'image'` draws the text onto the art instead);
- `styleAnchor: true`;
- `maxSlides: 20`;
- `useOpenRouter` and `useScrapeCreators`.

## Content rules

Any change to the prompts, the plan, the image step, the vision check or the .pptx builder must keep these.

- **Text contrast.** Light text sits only on a dark area, and dark text only on a light area. Three parts enforce it:
  - the art prompt asks for a dark text zone;
  - the vision check returns `text_area_ok`;
  - the .pptx adds an 85% shade and a soft shadow behind light text.

  Bullet markers use the body text colour. Colours and spacing are the same on every slide.
- **One look per set.** One medium per carousel (photo, illustration or typographic art), never mixed. The plan sees the Text style before it writes the Image style.
- **Copy standard** (`DEPTH_STANDARD` and `TITLE_STANDARD` in `src/helpers.js`):
  - **Titles:** searchable keyword titles, never teasers.
  - **Bullets:** dense, mechanism-level, 3–5 per slide and up to about 100 words, with real numbers and units, plain-language definitions in brackets, and actionable how-much/how-often advice.
  - **Tone:** confident, with no filler hedging.
  - **Short copy** only when Content Research or Style Direction asks for quick tips, short and punchy, bite-sized or one-liners.
- **Facts come only from the research and the references,** never from model memory. Gaps are flagged as "Not covered by the sources".
- **Outlines.** A `Suggested outline:` line in Content Research means: one search per section, a "## Your outline" section in the brief (4–7 key points per section), and slides in outline order with a call-to-action last.
- **Slide count.** The Slide count field, or "N slides" in Content Research or Style Direction, is kept exactly, up to 20.
- **Handle.** The handle comes only from the Handle / series label field (`[handle]` in Text style is replaced with it). A reference's own handle or logo is never copied.

## Gotchas

- **Branch order follows canvas position.** n8n v1 runs the branches of a shared output in canvas order, top first. **Baserow: Save Research Cache** must stay above **Claude: Write Research Brief** (in `layout.js`, it sits in the row above). A test checks this.
- **Field names.** Fields are matched by name, ignoring case and spaces. A renamed field needs an entry in Check Action's `ALIASES` map. Writes use `ctx().names`. Baserow silently ignores writes to unknown field names. The Slides field is `Body text` (lowercase t); Parse Slides writes both spellings.
- **Inlined helpers.** A workflow that was patched live can contain older, trimmed copies of the shared helpers in its code nodes. When comparing live code with `src/`, compare only the code after `// ---------- end helpers ----------` or `// ---------- end reference helpers ----------`. The shared model table `OR = {…}` is copied into 9 nodes, so a model change must patch all 9.
- **Saving in the editor.** Saving in the n8n editor drops default parameter values (such as `method: GET`) and snaps nodes a few pixels. This is harmless.
- **API settings.** On PUT/POST, the public API accepts only some settings keys (`tools/n8n_api.py` filters them). After a PUT, call `/activate` again.
- **.pptx files.** `src/pptx-lib.js` writes the zip by hand (stored, no compression). Keynote crashes unless every entry has a real DOS date and unix attributes. Check a .pptx with python-pptx plus a preview (for example `qlmanage` on macOS).
- **Image uploads.** Slide images upload to Baserow with the database token and are linked in the Slides `Image` field. Slide size "Both" puts the 4:5 and 9:16 images in the same field.
