// Markdown post → blog post page. Shared by blog/tools/build.mjs (to write blog/posts/<slug>.html)
// and by the editor's Preview, so the preview is the page the site will serve.
// No dependencies: it reads the Markdown the editor exports (docs/blog-editor/spec/sample-post.md), not arbitrary Markdown.

export const SITE = 'https://aadii02.github.io/aadityagoswami/blog/';

const ICONS = {
  food: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h18a9 9 0 0 1-18 0Z"/><path d="M8.5 8.5c0-1.5 1-1.5 1-3M12 8.5c0-1.5 1-1.5 1-3M15.5 8.5c0-1.5 1-1.5 1-3"/></svg>',
  tech: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15"/></svg>',
  mind: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>',
};
const NOTE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>';
const COPY_BTN = '<button class="copy" type="button" aria-label="Copy code"><svg class="idle" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg><svg class="ok" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg><span class="copy__label">Copy</span></button>';

/** Frontmatter categories → the site's notebooks (blog/tools/build.mjs CATS). */
export const CATEGORIES = {
  'food-and-places': { site: 'food', label: 'Food & Places',
    bio: 'Building rockets in Delhi, eating my way through every city I visit, and writing both down.' },
  'tech': { site: 'tech', label: 'Tech',
    bio: 'Building reusable small-lift launch vehicles in Delhi, studying mechanical engineering, and writing down what I learn on the way.' },
  'mind-and-meaning': { site: 'mind', label: 'Mind & Meaning',
    bio: 'I build rockets for a living and think about how to live the rest of the time. These essays are where the second part goes.' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = s => String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/&\w+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const longDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`; };
/** "street-food" → "Street food", for display next to the site's hand-written Title Case tags */
export const tagLabel = t => { const s = String(t).replace(/-/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };
export const readMinutes = words => Math.max(1, Math.round(words / 225));

/* ============================== frontmatter ============================== */

function yamlValue(raw) {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v.startsWith('"')) return JSON.parse(v);
  if (v.startsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  if (v.startsWith('[')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.match(/"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^,]+/g).map(x => yamlValue(x)).map(String);
  }
  return v;
}

/** Splits `---\nkey: value\n---\n\nbody` into data + body. Only the flat subset the editor writes. */
export function parseFrontmatter(src) {
  const text = src.replace(/\r\n?/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const kv = /^([A-Za-z_][\w-]*):\s?(.*)$/.exec(line);
    if (!kv) throw new Error(`frontmatter: can't read line "${line}"`);
    data[kv[1]] = yamlValue(kv[2]);
  }
  return { data, body: text.slice(m[0].length).replace(/^\n+/, '') };
}

/* ============================== inline Markdown ============================== */

const safeHref = url => {
  const u = url.trim();
  return /^(javascript|vbscript|data):/i.test(u) ? '#' : u;
};

/** **bold**, *italic*, `code`, [links](url), \escapes. Everything else is escaped text. */
export function inline(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\\' && i + 1 < n && /[!-/:-@[-`{-~]/.test(src[i + 1])) { out += esc(src[i + 1]); i += 2; continue; }
    if (c === '\\' && i + 1 === n) { out += '<br>'; i++; continue; }
    if (c === '`') {
      const ticks = /^`+/.exec(src.slice(i))[0];
      const end = src.indexOf(ticks, i + ticks.length);
      if (end > -1) {
        let code = src.slice(i + ticks.length, end);
        if (code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
        out += `<code class="ic">${esc(code)}</code>`;
        i = end + ticks.length; continue;
      }
    }
    if (c === '[') {
      const close = findClose(src, i + 1, ']');
      if (close > -1 && src[close + 1] === '(') {
        const paren = findClose(src, close + 2, ')');
        if (paren > -1) {
          const href = safeHref(src.slice(close + 2, paren).replace(/\\(.)/g, '$1'));
          const ext = /^https?:\/\//i.test(href) && !href.startsWith(SITE.replace(/blog\/$/, ''));
          out += `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${inline(src.slice(i + 1, close))}</a>`;
          i = paren + 1; continue;
        }
      }
    }
    if (c === '*' || c === '_') {
      const strong = src[i + 1] === c;
      const mark = strong ? c + c : c;
      const end = findMark(src, i + mark.length, mark);
      if (end > -1 && !/\s/.test(src[i + mark.length] ?? ' ')) {
        const inner = inline(src.slice(i + mark.length, end));
        out += strong ? `<strong>${inner}</strong>` : `<em>${inner}</em>`;
        i = end + mark.length; continue;
      }
    }
    out += esc(c);
    i++;
  }
  return out;
}

/** Index of an unescaped `ch`, skipping nested brackets/parens. */
function findClose(s, from, ch) {
  const open = ch === ']' ? '[' : '(';
  let depth = 0;
  for (let j = from; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '`') { const e = s.indexOf('`', j + 1); if (e > -1) { j = e; continue; } }
    if (s[j] === open) depth++;
    else if (s[j] === ch) { if (depth === 0) return j; depth--; }
  }
  return -1;
}

/** Index of the closing emphasis mark, skipping code spans, escapes and (for `*`) `**` pairs. */
function findMark(s, from, mark) {
  for (let j = from; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '`') { const e = s.indexOf('`', j + 1); if (e > -1) { j = e; continue; } }
    if (s.startsWith(mark, j) && !/\s/.test(s[j - 1])) {
      if (mark.length === 1 && s[j + 1] === mark) { // a ** inside *…*: skip the pair
        const e = findMark(s, j + 2, mark + mark);
        if (e > -1) { j = e + 1; continue; }
      }
      return j;
    }
  }
  return -1;
}

/* ============================== blocks ============================== */

const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? m[1] : null; };
const unescAttr = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * Markdown body → the site's post body markup (.pbody children).
 * `resolveSrc` maps the exported image path (/blog/images/<slug>/x.jpg) to what the page should load.
 * @param {string} body
 * @param {{ resolveSrc?: (src: string) => string, numbered?: boolean }} [options]
 */
export function renderMarkdown(body, { resolveSrc = s => s, numbered = false } = {}) {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  const headings = [];
  let words = 0;
  const countText = t => { words += t.replace(/<[^>]+>/g, ' ').replace(/&\w+;/g, ' ').split(/\s+/).filter(Boolean).length; };
  const isBlockStart = l => /^(#{2,3} |```|>|[-*] |---\s*$|<figure\b)/.test(l);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // fenced code
    const fence = /^```([\w+#-]*)\s*$/.exec(line);
    if (fence) {
      const code = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
      i++;
      const lang = fence[1];
      countText(code.join(' '));
      blocks.push(`<div class="code">
        <div class="code__top">
          <span class="code__file mono"><span>${esc(lang || 'text')}</span></span>
          ${COPY_BTN}
        </div>
        <pre tabindex="0"><code${lang ? ` class="language-${esc(lang)}"` : ''}>${code.map(l => `<span class="ln">${esc(l) || ' '}</span>`).join('')}</code></pre>
      </div>`);
      continue;
    }

    // image figure (the only HTML the editor writes)
    if (/^<figure\b/.test(line)) {
      const html = [];
      while (i < lines.length) { html.push(lines[i]); if (/<\/figure>/.test(lines[i++])) break; }
      const src = html.join('\n');
      const img = /<img\b[^>]*>/.exec(src)?.[0] ?? '';
      const size = /img--(wide|full)/.exec(attr(src.split('\n')[0], 'class') ?? '')?.[1] ?? 'normal';
      const cap = /<figcaption>([\s\S]*?)<\/figcaption>/.exec(src)?.[1];
      const w = attr(img, 'width'), h = attr(img, 'height');
      if (cap) countText(cap);
      blocks.push(`<figure class="img img--${size}"><img src="${esc(resolveSrc(unescAttr(attr(img, 'src') ?? '')))}" alt="${attr(img, 'alt') ?? ''}"${w ? ` width="${w}"` : ''}${h ? ` height="${h}"` : ''} loading="lazy" decoding="async">${cap ? `<figcaption class="cap">${cap}</figcaption>` : ''}</figure>`);
      continue;
    }

    const heading = /^(#{2,3}) (.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = inline(heading[2]);
      countText(text);
      if (level === 2 && numbered) {
        let id = slugify(text) || `section-${headings.length + 1}`;
        while (headings.some(h => h.id === id)) id += '-2';
        headings.push({ id, text });
        blocks.push(`<h2 id="${id}"><span class="n">${String(headings.length).padStart(2, '0')}</span>${text}</h2>`);
      } else {
        blocks.push(`<h${level}>${text}</h${level}>`);
      }
      i++; continue;
    }

    if (/^---\s*$/.test(line)) { blocks.push('<div class="brk" aria-hidden="true"><span></span><span></span><span></span></div>'); i++; continue; }

    // blockquote, or a GitHub alert (> [!NOTE]) which becomes the site's note box
    if (line.startsWith('>')) {
      const q = [];
      while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^> ?/, ''));
      const alert = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i.exec(q[0]);
      const paras = splitParas(alert ? q.slice(1) : q);
      paras.forEach(p => countText(p));
      if (alert) {
        blocks.push(`<div class="note">${NOTE_ICON}<span>${paras.map(inline).join('<br><br>')}</span></div>`);
      } else {
        // a last line starting with an em dash is the attribution
        const lastPara = paras[paras.length - 1] ?? '';
        const lastLines = lastPara.split('\n');
        let cite = '';
        if (/^(—|--)\s/.test(lastLines[lastLines.length - 1])) {
          cite = lastLines.pop().replace(/^(—|--)\s*/, '');
          paras[paras.length - 1] = lastLines.join('\n');
        }
        const ps = paras.filter(p => p.trim()).map(p => `<p>${inlineLines(p)}</p>`).join('');
        blocks.push(`<blockquote class="pq"><span class="pq__mark" aria-hidden="true">“</span>${ps}${cite ? `<cite class="pq__cite">— ${inline(cite)}</cite>` : ''}</blockquote>`);
      }
      continue;
    }

    // bullet list (items may continue on lines indented by two spaces)
    if (/^[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && (/^[-*] /.test(lines[i]) || (/^ {2}\S/.test(lines[i]) && items.length))) {
        if (/^[-*] /.test(lines[i])) items.push(lines[i].slice(2)); else items[items.length - 1] += '\n' + lines[i].trim();
        i++;
      }
      items.forEach(t => countText(t));
      blocks.push(`<ul class="plist">${items.map(t => `<li>${inlineLines(t)}</li>`).join('')}</ul>`);
      continue;
    }

    // paragraph: runs until a blank line or the start of another block
    const para = [];
    while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines[i]))) para.push(lines[i++]);
    const text = para.join('\n');
    countText(text);
    blocks.push(`<p>${inlineLines(text)}</p>`);
  }

  // the site opens every post with a larger lead paragraph
  if (blocks[0]?.startsWith('<p>')) blocks[0] = '<p class="lead">' + blocks[0].slice(3);
  return { html: blocks.join('\n      '), headings, words };
}

/** Lines of one paragraph: a trailing backslash is a hard break, other newlines are soft. */
function inlineLines(text) {
  return text.split('\n').map((l, idx, all) => {
    const hard = l.endsWith('\\') && idx < all.length - 1;
    return inline(hard ? l.slice(0, -1) : l) + (hard ? '<br>' : '');
  }).join('\n');
}

function splitParas(lines) {
  const out = [];
  let cur = [];
  for (const l of lines) {
    if (!l.trim()) { if (cur.length) out.push(cur.join('\n')); cur = []; } else cur.push(l);
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}

/* ============================== page ============================== */

/**
 * The full post page, identical in structure to the hand-written posts in blog/posts/, so blog/tools/build.mjs
 * can list it and refresh its generated regions like any other post.
 * `resolveSrc` maps exported image paths; `coverSrc` is the cover as the page should load it.
 * @param {Record<string, any>} data frontmatter
 * @param {string} body Markdown body
 * @param {{ resolveSrc?: (src: string) => string, coverSrc?: string, preview?: boolean }} [options]
 */
export function renderPostPage(data, body, { resolveSrc, coverSrc, preview = false } = {}) {
  // the editor can preview a draft before it has a category
  const cat = CATEGORIES[data.category] ?? (preview ? { site: 'mind', label: 'No category yet', bio: CATEGORIES['mind-and-meaning'].bio } : null);
  if (!cat) throw new Error(`${data.slug}: unknown category "${data.category}"`);
  const nb = cat.site;
  const slug = data.slug;
  const url = `${SITE}posts/${slug}.html`;
  const title = data.title;
  const lede = data.subtitle || data.excerpt || '';
  const description = data.excerpt || data.subtitle || '';
  const tags = data.tags || [];
  const { html, headings, words } = renderMarkdown(body, { resolveSrc, numbered: nb === 'tech' });
  const minutes = readMinutes(words);
  const sub = data.sub || '';
  const cover = data.cover ? (coverSrc ?? resolveSrc?.(data.cover) ?? data.cover) : null;
  // /blog/images/<slug>/cover.jpg → https://…/aadityagoswami/blog/images/<slug>/cover.jpg
  const ogImage = data.cover ? SITE.replace(/blog\/$/, '') + data.cover.replace(/^\//, '') : `${SITE}assets/img/og-default.jpg`;
  const meta = {
    slug, title, cat: nb, sub, date: data.date, dateLong: longDate(data.date),
    excerpt: description, lede, photo: data.cover ? '' : '[Cover image]', alt: '',
    tags: tags.map(tagLabel), headTags: tags.slice(0, 2).map(tagLabel),
    keywords: [...tags.map(t => t.replace(/-/g, ' ')), ...slug.split('-').filter(w => w.length > 3)].join(' '),
    source: `${slug}.md`,
  };

  const body_ = nb === 'tech' && headings.length
    ? `<div class="ptech">
      <nav class="toc" aria-label="On this page">
        <div class="toc__title mono">On this page</div>
        ${headings.map(h => `<a href="#${h.id}"><i aria-hidden="true"></i>${h.text}</a>`).join('\n        ')}
        <div class="toc__foot mono"><span><!-- gen:read -->${minutes} min read<!-- /gen:read --></span><span class="toc__pct">0%</span></div>
      </nav>
      <div class="pbody">
      ${html}
      </div>
    </div>`
    : `<div class="pbody">
      ${html}
    </div>`;

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<!-- Generated from blog/posts/${esc(slug)}.md by blog/tools/build.mjs. Edit the .md (or the post in the blog editor), not this file. -->
<title>${esc(title)} — Aaditya Goswami</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:site_name" content="Aaditya Goswami — Blog">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)} — Aaditya Goswami">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@aadiii_g02">
<meta name="twitter:title" content="${esc(title)} — Aaditya Goswami">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<meta property="article:published_time" content="${data.date}">
<meta property="article:author" content="Aaditya Goswami">
<meta property="article:section" content="${esc(cat.label)}">
${tags.map(t => `<meta property="article:tag" content="${esc(tagLabel(t))}">`).join('\n')}
<meta name="color-scheme" content="dark light">
${preview ? '<meta name="robots" content="noindex">\n' : ''}<script>(function(d){var t;try{t=localStorage.getItem('ag-theme')||localStorage.getItem('theme')}catch(e){}if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';d.setAttribute('data-theme',t);d.classList.add('js')})(document.documentElement)</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap">
<link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="Aaditya Goswami — Blog" href="../../blog/feed.xml">
<link rel="stylesheet" href="../../assets/css/theme.css">
<script src="../../assets/js/site.js" defer></script>
<script src="../assets/blog.js" defer></script>
</head>
<body data-root="../">
<a class="skip" href="#main">Skip to content</a>

<header class="site-header">
  <nav class="site-nav" aria-label="Main">
    <button class="nav-menu" type="button" aria-expanded="false" aria-controls="nav-links">Menu <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
    <div class="nav-links" id="nav-links">
      <a href="../../index.html">Home</a>
      <a href="../../about.html">About</a>
      <a href="../../projects.html">Projects</a>
      <a href="../../blog/index.html" aria-current="true">Blog</a>
      <a href="../../contact.html">Contact</a>
    </div>
    <button class="theme-toggle" type="button" aria-label="Switch to light theme">
      <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
    </button>
  </nav>
</header>

<main id="main" class="post">
<div class="container blogbar">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="../index.html">Blog</a><span aria-hidden="true">/</span><a href="../${nb}/index.html">${esc(cat.label)}</a></nav>
    <div class="blogbar__tools">
      <a href="../about.html">About this blog</a>
      <button class="search-btn" type="button" data-open-search aria-haspopup="dialog">Search <kbd class="kbd" aria-hidden="true">/</kbd></button>
      <a href="../feed.xml">RSS</a>
    </div>
  </div>

  <div data-nb="${nb}">
  <article>
    <script type="application/json" id="post-meta">
${JSON.stringify(meta, null, 1).replace(/</g, '\\u003c')}
</script>
    <header class="phead">
      <div class="phead__tags"><a class="ctag" href="../${nb}/index.html">${ICONS[nb]}${esc(cat.label)}</a>${meta.headTags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <h1>${esc(title)}</h1>
      ${lede ? `<p class="phead__lede">${esc(lede)}</p>` : ''}
      <div class="meta-line"><time datetime="${data.date}">${meta.dateLong}</time><span class="sep" aria-hidden="true">·</span><span><!-- gen:read -->${minutes} min read<!-- /gen:read --></span><span class="sep" aria-hidden="true">·</span><span>${esc(cat.label)}${sub ? ` / ${esc(sub)}` : ''}</span></div>
    </header>

    <figure class="phero">
      <div class="ph ph-${nb}">${cover
        ? `<img src="${esc(cover)}" alt="" width="1200" height="550" fetchpriority="high" decoding="async">`
        : `<img src="../assets/img/placeholder-${nb}.jpg" alt="" width="1200" height="800" fetchpriority="high" decoding="async"><span class="phl" aria-hidden="true">[Cover image]</span>`}</div>
    </figure>

<!-- body -->
    ${body_}
<!-- /body -->

    <div class="pend">
      <!-- gen:also-substack --><!-- /gen:also-substack -->
      ${tags.length ? `<div class="pend__tags" aria-label="Tags">${tags.map(t => `<span class="tag">${esc(tagLabel(t))}</span>`).join('')}</div>` : ''}

      <div class="card bio">
        <div class="ph ph-me"><img src="../assets/img/placeholder-portrait.jpg" alt="Portrait of Aaditya Goswami" width="900" height="1200" loading="lazy" decoding="async"></div>
        <div>
          <div class="bio__name">Aaditya Goswami</div>
          <div class="bio__role mono">Founder &amp; CEO, SkyLakes Aerospace</div>
          <p>${esc(cat.bio)}</p>
          <div class="links-row">
            <a class="btn btn--sm" href="../../index.html">Portfolio ↗</a>
            <a class="btn-ghost btn--sm" href="https://skylakes.space" target="_blank" rel="noopener noreferrer">SkyLakes Aerospace ↗</a>
          </div>
        </div>
      </div>

      <section class="more" aria-label="More from ${esc(cat.label)}">
        <!-- gen:more --><h2>More from ${esc(cat.label)}</h2>
        <p class="more__none">More coming soon. The newsletter is the easiest way to hear first.</p><!-- /gen:more -->
      </section>

      <div class="card nl">
        <div class="nl__kick mono"><i aria-hidden="true"></i>Newsletter</div>
        <h2 class="nl__title">Get the next one by email</h2>
        <p>Essays, engineering notes and food finds. One email per post, sent through Substack.</p>
        <form class="nlform" action="https://aadityagoswami.substack.com/api/v1/free?nojs=true" method="post" target="_blank">
            <label class="sr-only" for="post-email">Email address</label>
            <input class="search" id="post-email" type="email" name="email" placeholder="you@example.com" autocomplete="email" required>
            <button class="btn" type="submit">Subscribe</button>
          </form>
        <span class="nl__small mono">No spam. Unsubscribe any time.</span>
      </div>
    </div>
  </article>
  </div>
</main>
<div class="search-dialog" id="search" hidden>
  <div class="search-dialog__scrim" data-close-search></div>
  <div class="search-dialog__panel" role="dialog" aria-modal="true" aria-label="Search posts">
    <div class="search-dialog__bar">
      <label class="sr-only" for="search-input">Search posts</label>
      <input class="search" id="search-input" type="search" placeholder="Search posts, places, tools…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="search-results" aria-autocomplete="list">
      <button class="kbd search-dialog__close" type="button" data-close-search aria-label="Close search">Esc</button>
    </div>
    <div class="search-dialog__cats" role="group" aria-label="Filter by notebook">
      <button class="schip" type="button" data-cat="all" data-nb="all" aria-pressed="true"><i aria-hidden="true"></i>All</button>
      <button class="schip" type="button" data-cat="tech" data-nb="tech" aria-pressed="false"><i aria-hidden="true"></i>Tech</button>
      <button class="schip" type="button" data-cat="mind" data-nb="mind" aria-pressed="false"><i aria-hidden="true"></i>Mind &amp; Meaning</button>
      <button class="schip" type="button" data-cat="food" data-nb="food" aria-pressed="false"><i aria-hidden="true"></i>Food &amp; Places</button>
    </div>
    <div class="search-dialog__body">
      <div class="search-dialog__count" id="search-count" role="status" aria-live="polite"></div>
      <div id="search-results" role="listbox" aria-label="Results"></div>
      <p class="search-dialog__empty" id="search-empty" hidden>No posts match that. Try a place, a tool, or a broader word.</p>
    </div>
    <div class="search-dialog__foot">
      <span class="search-dialog__hint"><span><kbd class="kbd">↑</kbd> <kbd class="kbd">↓</kbd> move</span><span><kbd class="kbd">↵</kbd> open</span></span>
      <span>Runs in your browser · search-index.json</span>
    </div>
  </div>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>

<footer class="site-footer">
  <div class="container site-footer__inner">
    <p class="site-footer__copy">© 2026 Aaditya Goswami · Delhi, India</p>
    <nav class="social" aria-label="Social">
      <a href="https://www.linkedin.com/in/aaditya-goswami-908a98303" target="_blank" rel="noopener noreferrer">LinkedIn</a>
      <a href="https://x.com/aadiii_g02" target="_blank" rel="noopener noreferrer">X</a>
      <a href="https://instagram.com/aadiii_g02" target="_blank" rel="noopener noreferrer">Instagram</a>
      <a href="https://github.com/Aadii02" target="_blank" rel="noopener noreferrer">GitHub</a>
    </nav>
  </div>
</footer>
</body>
</html>
`;
}

/** /blog/images/<slug>/x.jpg → ../images/<slug>/x.jpg (relative, so it works under the Pages sub-path) */
export const relativeImage = src => src.replace(/^\/blog\//, '../');
