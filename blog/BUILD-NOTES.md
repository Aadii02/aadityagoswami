# Site and blog build notes

The whole site (portfolio + blog) follows the redesign handoff (`portfolio-redesign-handoff.zip` in `design import/`: `DESIGN_SPEC.md`, `styles/theme.css`, `design-reference/*.dc.html`).
No framework and no build step: GitHub Pages serves these files as they are.

## Layout

```
index.html  about.html  projects.html  contact.html  404.html  blog.html (redirect to blog/)
assets/css/theme.css     the only stylesheet: the handoff's theme.css, then a "Site layer" section
assets/js/site.js        theme toggle, mobile menu, grid layout, Projects + blog index filters
assets/data/projects.json  the projects, in display order
blog/
  index.html  about.html  search-index.json  feed.xml
  tech/index.html  mind/index.html  food/index.html   (one page per notebook)
  posts/<slug>.html
  assets/blog.js  assets/img/
  tools/build.mjs   (optional helper, see below)
```

- **Colours:** components only use the role tokens (`--ink`, `--espresso`, `--copper`, `--ember`, `--stone`, `--paper`, plus the derived `--paper-soft`, `--line`, `--copper-text`, `--ember-text`). The only hex values are in the two token blocks at the top of `theme.css`.
- **Theme:** dark is the default. An inline script in every `<head>` sets `data-theme` on `<html>` before first paint: the saved choice from `localStorage['ag-theme']` (or the old `theme` key, so earlier visitors keep theirs), otherwise `prefers-color-scheme`. Clicking the toggle saves to `ag-theme`.
- **Header and footer** are identical on every page; only relative paths change with folder depth (`../` from `blog/`, `../../` from `blog/posts/` and the notebook folders). Blog is `aria-current="page"` on the blog home and `aria-current="true"` on other blog pages.
- **Blog bar:** on posts, notebook pages and About this blog, a slim bar under the header holds a breadcrumb, "About this blog", Search (also on the `/` key) and RSS. The blog index has the inline search from the design instead (`/` focuses it).

## Adding a post

1. Copy one of the files in `posts/` that matches the notebook, and rename it to the new slug.
2. Edit the JSON block at the top of the `<article>` (`<script type="application/json" id="post-meta">`). Fill in `title`, `cat` (`tech` / `mind` / `food`), `sub`, `date` (YYYY-MM-DD), `excerpt`, `photo`, `alt`, `tags`, `keywords`, plus `place` and `mustTry` for food posts.
   - The newest post is the featured card on the blog home. Its right-hand panel shows `feature.stats` (big numbers) and `feature.tags`, and the card's link text is `feature.cta`. Without a `feature` block it shows the read time and the post's first three tags. Only use numbers that are in the post.
3. Edit the page head (title, description, `og:*`, `article:*`), the breadcrumb's notebook link, the article header, and the text between `<!-- body -->` and `<!-- /body -->`.
4. Run `node blog/tools/build.mjs` from the repo root. It only rewrites text between `<!-- gen:NAME -->` markers, so hand edits elsewhere are safe, and running it twice changes nothing. It refreshes:
   - the blog home: the "Latest" line, ticker, featured post, notebook chips and counts, posts grid, "Pick a notebook" cards and archive rows
   - the notebook pages' counts, chips and grids
   - "03 — From the blog" on the portfolio homepage (the 3 newest posts)
   - each post's read time and "More from" block
   - the Projects page (tally, chips, grid) from `assets/data/projects.json`
   - `search-index.json` and `feed.xml`

If Node isn't available, you can edit the marked regions by hand. The output is plain HTML.
If a post is cross-posted, add `"substack": "https://aadityagoswami.substack.com/p/…"` to its meta block. The script then puts a small "Also on Substack ↗" line inside the post, above the tags.
The two older Substack essays under "From the archive" are the `ARCHIVE` list at the top of `build.mjs`.

## Notes

- **Only real posts are listed**, so every count is true. The grid, chips and search all come from the four posts in `posts/`.
- **Read times** are computed from each post's word count (about 220 words per minute).
- **Photos:** every photo box is a real `<img>` pointing at `assets/img/placeholder-*.jpg`. While the file name contains `placeholder-`, the image stays invisible, so the dashed box and its `[label]` show. Drop in a real photo under a new name and update `src`.
- **Share previews** use `assets/img/og-default.jpg`. Absolute URLs (feed, canonical, `og:url`) use `SITE` in `tools/build.mjs`: `https://aadii02.github.io/aadityagoswami/blog/`. It used to be `https://aadii02.github.io/blog/`, which 404s.
- **Newsletter forms** post to `https://aadityagoswami.substack.com/api/v1/free?nojs=true` in a new tab. This isn't an official documented API. If Substack changes it, swap each `<form>` for the iframe from Substack → Settings → Embed.
- **Contrast:** two derived tokens keep small text at 4.5:1 or better. `--copper-text` is copper lifted 15% toward paper in dark, where raw copper on ink is 4.1:1. `--ember-text` is ember 10% toward paper in light, where raw ember on espresso is 4.2:1. Large display text, borders and fills use the raw tokens.
- **Motion:** everything animated (rise, starfield drift, orbits, tickers, pulse, flame, hover tilt) is switched off under `prefers-reduced-motion`. Tickers also pause on hover.

## Still to do

- Real photos and a portrait. Replace the `[YOUR PHOTO]` boxes and the `placeholder-*.jpg` references.
- Mission Control has no public repo (the old `Skylakes_Flight_Panal` link 404s). Its card shows "TODO: repo link".
- Check the Substack form endpoint with a real sign-up after deploying.
