# Blog build notes

Built from `design import/HANDOFF.md` and the mockups in `design import/blog-handoff.zip` (`design/*.dc.html`).
No framework and no build step: GitHub Pages serves these files as they are.

## Layout

```
blog/
  index.html  about.html  search-index.json  feed.xml
  food/index.html  tech/index.html  mind/index.html
  posts/<slug>.html
  assets/blog.css  assets/blog.js  assets/img/
  tools/build.mjs   (optional helper, see below)
```

Every blog page loads the portfolio's own `assets/css/style.css`, `assets/js/theme.js` and `assets/js/main.js` first, then `blog/assets/blog.css` and `blog.js`.
The blog is a section of the portfolio, not a separate site. Every blog page uses the portfolio's own header (Home, About, Projects, **Blog** marked active, Contact, theme toggle) and footer, word for word. Only the relative paths change with folder depth: `../` from `blog/`, `../../` from `blog/posts/` and the category folders.
Directly under the header, a **blog bar** holds the blog's own navigation: Blog home, Food & Places, Tech, Mind & Meaning, About this blog, plus Search (also on the `/` key) and RSS.
Buttons, tags, rows, reveals, the rail, the toast and the rocket cursor also come from the portfolio. `blog.css` only adds the category tokens, blog bar, cards, filters, article templates and the search overlay.
The theme uses the same `localStorage` key (`theme`) as the portfolio, so a choice made on either side carries over.

## Adding a post

1. Copy one of the files in `posts/` that matches the category, and rename it to the new slug.
2. Edit the JSON block at the top of the `<article>` (`<script type="application/json" id="post-meta">`). Fill in `title`, `cat` (`food` / `tech` / `mind`), `sub`, `date` (YYYY-MM-DD), `excerpt`, `photo`, `alt`, `tags`, `keywords`, plus `place` and `mustTry` for food posts. Set `"pinned": true` to feature the post on the home page.
3. Edit the page head (title, description, `og:*`, `article:*`), the blog bar's `aria-current` (it goes on the post's category), the article header, and the text between `<!-- body -->` and `<!-- /body -->`. Leave the site header and footer alone: they must stay identical to the portfolio's.
4. Run `node blog/tools/build.mjs` from the repo root. It refreshes every list, count, "More from" block, the read times, `search-index.json` and `feed.xml`. It only rewrites text between `<!-- gen:NAME -->` markers, so hand edits elsewhere are safe. Running it twice changes nothing.

If Node isn't available, you can edit the marked regions by hand. The output is plain HTML.

## Judgement calls

- **Folder name:** the brief says `design-import/`; the actual folder is `design import/`, with the design files inside `blog-handoff.zip`. I read them from there.
- **Header and footer:** these are the portfolio's, unchanged, including the 820px floating bar. The mockups' blog-specific header (categories, search and a Portfolio button) and its four-column footer were replaced. Categories and search now live in the blog bar. The footer newsletter form is gone; newsletter sign-up remains on every article and as the "Subscribe on Substack" button on the blog home and About this blog.
- **Home link:** the portfolio nav gained a **Home** link on every page, portfolio and blog, so the two headers really are identical. Before, the portfolio had no Home item and the name in the header was the only way home.
- **Blog about page:** it's labelled "About this blog" in the blog bar and page title, so it doesn't clash with the portfolio's About.
- **Old `blog.html`:** this is now a redirect (meta refresh + canonical + a visible link) to `blog/index.html`.
- **Only real posts are listed.** The mockups show about 23 example posts (8 Food, 9 Tech, 6 Mind). I built the 4 sample posts and listed only those, so there are no dead links and every count is true. Filter chips still show every subcategory, with a count of 0 and an empty state where nothing exists yet.
- **The 4th sample post** is "Understanding Vector Databases" (Tech / AI). The mockups only have three article designs, so it reuses the Tech template (TOC, code block, notes). Its copy is a short general explainer, not personal claims.
- **Read times** are computed from each post's word count (about 220 words per minute), so the short sample posts show 1–2 min instead of the mockups' 6–9 min. They grow as you write.
- **Newsletter forms** post to `https://aadityagoswami.substack.com/api/v1/free?nojs=true` and open in a new tab. I knew the Substack name from the portfolio, so I didn't leave `SUBSTACK_URL_HERE`. This is the endpoint custom Substack forms commonly use, but it's not an official documented API. If Substack changes it, swap each `<form>` for the iframe from Substack → Settings → Embed. "Subscribe on Substack" buttons link to `/subscribe`.
- **Photos:** every photo box is a real `<img>` with alt text, width/height and `loading="lazy"`, pointing at `assets/img/placeholder-*.jpg`. While the file name contains `placeholder-`, the image is transparent, so the patterned box and its `[label]` stay visible as in the mockups. Drop in a real photo under a new name, update `src`, and it shows automatically. Above-the-fold images (article heroes, home portrait) use eager loading with `fetchpriority="high"` instead of lazy, to avoid slowing the first paint.
- **Share previews** use `assets/img/og-default.jpg` (a 1200×630 card) for every page until real photos exist. The absolute URLs assume the site is served at `https://aadii02.github.io/`. If it ends up at `/portfolio/` or a custom domain, change `SITE` in `tools/build.mjs` and the `og:url` / `og:image` / canonical tags in each page head.
- **Altitude rail:** this reuses the portfolio's rail, coloured by category. It shows at ≥1200px (the portfolio breakpoint moved from 1240px to 1200px to match the brief). The readout shows whole km, not the mockup's `42.1 km`. Below 1200px the header's progress bar does the job.
- **Table of contents:** a sticky right column at ≥1280px. Narrower screens can't fit 680px of text plus the TOC next to the rail, so there it becomes a box above the article.
- **Active states:** Blog is `aria-current="page"` on the blog home and `aria-current="true"` on other blog pages (you're in that section, not on its page). The same applies to the category in the blog bar on article pages. The portfolio's `main.js` and `style.css` accept both values.
- **Contrast fixes beyond the mockups:**
  - Primary buttons use `#3867E0` in dark mode (white text 5.0:1; the mockup blue was 3.7:1). This is set in the portfolio stylesheet, so the portfolio buttons match.
  - Pressed Food chips in light mode use `#A8581B`.
  - Grey `--dim` text is replaced by `--muted` across the blog.
  - Category tags mix 20% of the text colour into the ink.
  - The shared footer text moved from `--dim` to `--muted` (it was under 4.5:1), which also improves the portfolio pages.

## Verified

- Every page at 380px and 1440px, in dark and light: no horizontal scroll, no console errors, and every reveal becomes visible by the bottom of the page. Article rails read 100 km at the bottom.
- axe-core 4.10 (the engine behind Lighthouse's accessibility score): 0 violations on all 9 pages, both themes, both widths (WCAG 2.1 AA + best practices).
- Search: `/` and the header button open it, text and category filtering work, ↑/↓/Enter/Esc work, focus is trapped, and scroll unlocks on close.
- Filters: 200ms fade, stagger back in, and state in the hash (`tech/#ai` loads filtered).
- Code copy and toast, the TOC highlight, and theme persistence across the blog and the portfolio.
- All 325 local links resolve. `feed.xml` is valid RSS; `search-index.json` is valid.

## Still to do

- Real photos and a portrait. Replace the `placeholder-*.jpg` references.
- Real posts. The sample copy is from the mockups.
- Check the Substack form endpoint with a real sign-up after deploying.
- If you change the `SITE` URL, update the absolute share/canonical URLs (see above).
