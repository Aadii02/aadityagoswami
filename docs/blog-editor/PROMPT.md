# Paste this into Claude Code

Open Claude Code in your portfolio repo, copy this whole `blog-editor-handoff` folder into the repo root (e.g. as `docs/blog-editor/`), then paste:

---

I want to build a distraction-free Markdown writing editor for my blog. The full spec is in `docs/blog-editor/BRIEF.md`. Reference screenshots are in `docs/blog-editor/design/screenshots/`, and matching static HTML for exact CSS is in `docs/blog-editor/design/screens/`. Tokens, fonts and icons are in `docs/blog-editor/design/`. The Markdown output contract is `docs/blog-editor/spec/sample-post.md` + `frontmatter.schema.json`.

1. Read BRIEF.md and look at every screenshot first.
2. Do step 0 of the brief: inspect how `/blog` currently works and tell me what you found. Propose where the editor, posts and images should live before writing code.
3. Once I confirm, build it in small steps, in this order: editor shell + tokens → TipTap editor with Markdown shortcuts → slash menu + selection toolbar → image/GIF blocks → IndexedDB autosave + drafts list → settings sidebar → preview → export (.md / .zip) → focus mode.
4. After each step, run it and check it against the matching screenshot.
5. Don't commit or push unless I ask.
