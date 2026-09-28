# Blog Editor — Build Brief for Claude Code

A distraction-free writing editor for Aaditya's personal blog at `/blog` on his portfolio site (static HTML/CSS/JS on GitHub Pages).
It should feel like part of the site, not a SaaS tool. Mood: **Da Vinci's workshop at night**, like a notebook read by candlelight.

Everything visual is in `design/`:

| File | What it is |
|---|---|
| `design/screenshots/*.png` | 8 reference screens at 2× (source of truth for look) |
| `design/screens/*.html` | Same screens as static HTML, so you can inspect exact CSS values |
| `design/tokens.css` | All colours, fonts, sizes as CSS variables |
| `design/fonts/` | Self-hosted woff2 variable fonts + `fonts.css` (OFL licensed) |
| `design/icons/` | 26 stroke icons as single SVGs + `sprite.svg` (`<use href="#i-eye">`) |
| `spec/frontmatter.schema.json` | Exact frontmatter contract |
| `spec/sample-post.md` | A full example of the Markdown the editor must export |

---

## 0. Before writing code: inspect the repo

1. Find how `/blog` works today (hand-written HTML? a JSON index? a build step?). Report back before choosing an approach.
2. Match the existing site's nav, footer and CSS conventions in **Preview mode**. The screenshot's "Work / Blog / About" nav is a guess.
3. Confirm where posts and images should live. The default assumption is `blog/posts/<slug>.md` and `blog/images/<slug>/…`.

## 1. Architecture (recommended default; adjust after step 0)

- **Where the editor lives:** `/blog/editor/`. Add `<meta name="robots" content="noindex">`, don't link it from the site, and exclude it from any sitemap.
- **Stack:** Vite + vanilla TypeScript + **TipTap** (ProseMirror). Build to static files. No backend.
  - TipTap extensions: StarterKit, Link, Image (custom node, see §5), Placeholder, CodeBlockLowlight, Typography, CharacterCount, a custom Callout node, and a custom slash-command extension (Suggestion utility).
  - Markdown: `tiptap-markdown` or a custom serializer. It must produce output **exactly** like `spec/sample-post.md`.
- **Storage:** drafts go in **IndexedDB** (use `idb-keyval` or `idb`). Store one record per post: `{id, doc (TipTap JSON), meta (frontmatter fields), images: {filename: Blob}, updatedAt, status}`. Images stay as Blobs, never as base64 strings in the doc.
- **Autosave:** save 800 ms after the last keystroke. The top-bar status reads `Saving…`, then `Saved · just now`, then `Saved · 2 min ago` (a relative time that updates every 30 s). Show `Uploading 1 image…` while an image is being processed.
- **Publishing (Phase 1):** Export only (§7). The user commits the files to the repo by hand.
- **Publishing (Phase 2, optional):** a "Publish to GitHub" option that uses the GitHub Contents API with a fine-grained PAT. Store the token in IndexedDB, and only after the user explicitly enters it. Commit `post.md` and its images in one commit using the Git Data API (tree + commit). Never hard-code a token.
- **If `/blog` can't render Markdown today:** add a tiny build (a Node script or GitHub Action) that turns `blog/posts/*.md` into HTML pages plus `blog/posts/index.json`. Use the same template as Preview mode. Propose this; don't impose it.

## 2. Visual system (see `design/tokens.css`)

| Token | Hex | Use |
|---|---|---|
| ink | `#121829` | page background |
| espresso | `#3B2A22` | panels, menus, code blocks, toolbars, modal |
| copper | `#B5652B` | borders, tags, hover, hairlines (at 28–55% alpha) |
| ember | `#E8A33D` | **sparingly**: Publish button, active pill/tab/toggle, caret, selection, focused block outline |
| stone | `#8A8F98` | muted text on ink |
| paper | `#EFE6D2` | main text |

Derived colours exist only for contrast (all pass WCAG AA):
- `#B3AA9C` for muted text on espresso.
- `#D4874F` for copper-coloured small text on ink.
- `#2A1E18` for inputs inside panels.
- `#1A2036` for raised surfaces on ink.

**Fonts**
- **Fraunces** for titles and headings.
- **Newsreader** for the writing area and the published body.
- **Instrument Sans** for all UI chrome.
- **JetBrains Mono** for code and shortcuts.

**Rules**
- Touch targets are at least 44 px.
- Every control is a real `<button>`, `<a>` or `<input>` with a `<label>`.
- Icon-only buttons need an `aria-label`.
- Visible focus rings: 2 px ember outline with 2 px offset.
- Respect `prefers-reduced-motion`. When it's on, GIFs start paused (§5).

## 3. Screens (see `design/screenshots/`)

1. **Empty new post (`01`)**
   - Top bar: `‹ Drafts`, a "Category" label, three unselected pills, `0 words · 0 min read`, `New draft · not saved yet`, three icon buttons, and a disabled Publish button.
   - Canvas: a "Add cover image" ghost button, a 56 px title input, an italic subtitle input, a short copper rule, then the body placeholder `Start writing, or press / for blocks…`.
   - Bottom-centre shortcut hints. A faint copper geometric sketch (16% opacity) sits bottom-right; it's decorative, so give it `aria-hidden`.
2. **Mid-draft with the slash menu (`02`)**
   - The menu opens under the caret line. It's 540 px wide, espresso, in a 2-column grid of 8 items: icon tile, name, one-line description, and Markdown shortcut.
   - Keyboard: arrows move, Enter inserts, Esc closes. Typing filters the list (fuzzy match on name and aliases).
   - The menu flips upward when there's no room below.
3. **Settings sidebar (`03`)**
   - A 400 px espresso panel on the right. The canvas re-centres in the space left over.
   - Fields: slug (with a `/blog/` prefix), cover image (Replace/Remove), excerpt (with a `n / 160` counter), tags (chips plus an input; Enter or comma adds a tag, Backspace removes the last), publish date, and a Draft/Published segmented toggle.
   - Footer: "Export Markdown" button.
   - Toggle it with the top-bar icon or ⌘\ .
4. **Preview (`04`)**
   - An espresso preview bar: `Preview` plus the path, a Desktop/Mobile toggle (Mobile renders at 390 px inside a frame), `Back to editing`, and Publish.
   - Below it, the post exactly as `/blog` renders it: category eyebrow, title, subtitle, meta line, cover, and a drop cap on the first paragraph.
   - **Render with the same template/CSS the real blog uses.** Toggle with ⌘⇧P.
5. **Drafts list (`05`)**
   - Heading "Writing desk" with counts.
   - Status tabs (All / Drafts / Scheduled / Published), category filter pills, and search.
   - Table columns: Title (+ one-line excerpt) · Category · Last edited (relative) · Status · Words.
   - The hovered row shows Edit / Preview / Export .md. "New post" is the ember button.
   - Status styles:
     - Draft: hollow stone dot.
     - Scheduled: ember dot plus the date. A post counts as scheduled when it's published with a future date.
     - Published: copper check.
6. **Focus mode (`06`)**
   - Hides all chrome. The current paragraph is at full opacity and the others at 32%.
   - Hint at the bottom: `esc exit focus · N words`. It fades out after 3 s idle.
   - Toggle with ⌘. and exit with Esc.
7. **Export (`07`)**
   - An espresso modal over a 74% scrim: filename, syntax-coloured Markdown with line numbers, "Include frontmatter" and "Bundle images as .zip" checkboxes, Copy, and **Download .md**. The download becomes a `.zip` when images are present and that box is checked.
8. **Image / GIF block (`08`)**: see §5.

**Floating selection toolbar (shown in `06`)**
- Appears above any non-empty text selection, centred on it.
- Buttons: Bold, Italic, Link | H2, H3, Quote, Inline code. Active marks get an ember background.
- The Link button opens an inline URL input inside the toolbar.

## 4. Editor behaviour

**Blocks:** paragraph, H2, H3, image/GIF, code block (with a language picker and copy button), blockquote, divider, bullet list, callout.

**Markdown input rules**

| Type this | Get this |
|---|---|
| `## ` | H2 |
| `### ` | H3 (a single `# ` also maps to H2; the title is the only H1) |
| `> ` | quote |
| ```` ``` ```` + optional language + Enter | code block |
| `- ` or `* ` | bullet list |
| `---` | divider |
| `**x**`, `*x*`, `` `x` `` | inline marks |
| `!! ` | callout |

**Paste handling**
- Pasting a URL onto selected text makes a link.
- Pasting an image file creates an image block.
- Pasting HTML is sanitised to the supported blocks.

**Counts**
- Word count covers the body only.
- Reading time is `Math.max(1, Math.round(words / 225))` minutes.

**Slug**
- Auto-generated from the title: lowercase ASCII, hyphens, no stop-word removal.
- Once the user edits the slug by hand, it stops syncing with the title.
- Must be unique across drafts.

**Category is required to publish.** Publish with no category selected shakes the pills and shows a hint.

**Shortcuts**

| Keys | Action |
|---|---|
| ⌘B / ⌘I / ⌘K | bold / italic / link |
| ⌘⌥2 / ⌘⌥3 | H2 / H3 |
| ⌘S | force save |
| ⌘. | focus mode |
| ⌘⇧P | preview |
| ⌘\ | settings |
| ⌘⇧E | export |

(Use Ctrl on Windows.)

## 5. Images & GIFs (important)

**Ways in**
- The `/` menu → "Image or GIF".
- Drag-and-drop anywhere on the canvas.
- Paste from the clipboard.
- The "Embed from URL" tab (hot-links an external URL; show a warning that external images can disappear).

**Accepted files:** JPG, PNG, WebP, GIF, SVG. Maximum 10 MB each; larger files get a friendly error.

**Processing (in the browser)**
- **GIFs are never re-encoded.** Passing them through a canvas would kill the animation, so store the original Blob.
- JPG/PNG/WebP wider than 1600 px are downscaled to 1600 px on the long edge with `createImageBitmap` + `OffscreenCanvas`, and re-encoded as the same type (JPEG quality 0.85).
- Sanitise SVGs by stripping scripts and `on*` attributes.
- Record the natural `width`/`height` so the export can set them and avoid layout shift.
- Filenames: lowercase and hyphenated from the original name, de-duplicated with `-2`, `-3`.

**Block UI (`08`)**
- Selecting the block gives it a 2 px ember outline and a floating toolbar:
  - width **Normal** (720) / **Wide** (960) / **Full** (100vw);
  - **Alt text**;
  - **Replace**;
  - **Delete**.
- The caption is an editable line below the image (italic, stone, centred).
- The alt text field sits below the caption. Show a small copper dot on "Alt text" while it's empty, and warn when exporting if any image lacks alt text.
- GIFs show a `GIF` badge and a pause/play button. Pausing swaps in a still first frame, captured once to a canvas when the GIF is inserted.

**Cover image:** the same pipeline, stored as `cover.<ext>` and set from the sidebar.

## 6. Markdown output (must match `spec/sample-post.md`)

**Frontmatter**
- Key order: `title, subtitle?, slug, category, tags, date, excerpt, cover, draft`.
- Categories: `food-and-places | tech | mind-and-meaning`.
- Tags are an inline YAML array.
- Omit `subtitle` and `cover` when empty.
- Quote strings that contain `:` or `"`, or that start with special characters.
- Validate against `spec/frontmatter.schema.json` before exporting.

**Images:** export as a `<figure class="img img--normal|wide|full">` HTML block containing `<img src alt width height loading="lazy">` and a `<figcaption>`. Plain `![]()` can't carry captions or widths.

**Paths:** `/blog/images/<slug>/<file>` in the exported file. The editor itself uses blob URLs.

**Other blocks**
- Callout: `> [!NOTE]` (GitHub alert syntax).
- Code: fenced with the language tag.
- Divider: `---`.

**Formatting:** one blank line between blocks, no trailing whitespace, and a single newline at the end of the file.

## 7. Export

- **Download .md:** `<slug>.md`.
- **Download .zip** (when the post has images): uses JSZip. It mirrors the repo structure so it can be unzipped at the repo root:
  ```
  blog/posts/<slug>.md
  blog/images/<slug>/cover.jpg
  blog/images/<slug>/<other images>
  ```
- **Copy:** Markdown to the clipboard. Toast: "Copied".
- **Drafts:** exporting a draft keeps `draft: true`, so the site build can skip it.

## 8. Acceptance checklist

- [ ] All 8 screens match the screenshots within reason (spacing, colours, fonts).
- [ ] The slash menu, selection toolbar and all Markdown shortcuts work by keyboard alone.
- [ ] Autosave survives a reload. The Drafts list reflects edits, and statuses are correct.
- [ ] Image upload, paste, drag-drop and URL embed all work. GIFs stay animated in both the editor and the export.
- [ ] Exported `.md` validates against the schema, and round-trips: import → export gives an identical file.
- [ ] Preview matches the live `/blog` post page.
- [ ] Lighthouse accessibility score ≥ 95, and there's no layout shift from images.
- [ ] Works in current Chrome, Safari and Firefox. Mobile (≥ 390 px) is usable for light editing.

## 9. Nice-to-haves (after v1)

- Import an existing `.md` post into the editor.
- Keep version history per draft (snapshots in IndexedDB).
- Phase 2 GitHub publish (§1).
