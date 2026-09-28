#!/usr/bin/env node
// Optional helper. The committed HTML already works on GitHub Pages; run this after adding or editing a post
// (or assets/data/projects.json) to refresh every generated list:   node blog/tools/build.mjs
//
// It reads the JSON block (<script type="application/json" id="post-meta">) at the top of each blog/posts/*.html,
// then rewrites only the regions between <!-- gen:NAME --> and <!-- /gen:NAME --> markers, plus
// blog/search-index.json and blog/feed.xml. Everything outside the markers is left exactly as you wrote it.
import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, renderPostPage, relativeImage } from './post-page.mjs';

// Where the blog lives once deployed. Used only for absolute links in feed.xml and share tags.
const SITE = 'https://aadii02.github.io/aadityagoswami/blog/';
const BLOG = join(dirname(fileURLToPath(import.meta.url)), '..');

// Notebooks, in display order. Colours live in theme.css ([data-nb="…"]).
const CATS = {
  tech: { label: 'Tech', subs: ['Web', 'AI', 'DevOps', 'Aerospace'],
    blurb: 'Engines, test stands, software and the occasional deep dive into AI.' },
  mind: { label: 'Mind & Meaning', subs: ['Habits', 'Philosophy', 'Reflections'],
    blurb: 'Habits, focus and the slower questions behind the work.' },
  food: { label: 'Food & Places', subs: ['Food', 'Cities', 'Treks'],
    blurb: 'Street food, cities and the places worth the queue.' },
};
// Older essays that live on Substack: listed under "From the archive" and in the ticker.
const ARCHIVE = [
  { title: 'Reusability: What It Actually Means, and Why India Should Care', kind: 'Essay',
    url: 'https://aadityagoswami.substack.com/p/reusability-what-it-actually-means' },
  { title: "Why We're Building a Community Before We Build a Rocket", kind: 'Essay',
    url: 'https://aadityagoswami.substack.com/p/why-were-building-a-community-before' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const longDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`; };
const shortDate = iso => longDate(iso).slice(0, 6);
const rfc822 = iso => new Date(iso + 'T09:00:00+05:30').toUTCString();
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const ARROW = '<svg class="arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>';

// ---------- Markdown posts (from the blog editor): blog/posts/<slug>.md → blog/posts/<slug>.html ----------
// A post goes live when it has draft: false and its date has arrived; until then no .html is written (or a stale one
// is removed). Pages written here carry a "Generated from" comment; hand-written pages are never touched.
{
  const GENERATED = '<!-- Generated from blog/posts/';
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dir = join(BLOG, 'posts');
  const files = readdirSync(dir);
  const mdSlugs = new Set();
  for (const file of files.filter(f => f.endsWith('.md'))) {
    const slug = file.replace(/\.md$/, '');
    mdSlugs.add(slug);
    const { data, body } = parseFrontmatter(readFileSync(join(dir, file), 'utf8'));
    if (data.slug !== slug) throw new Error(`posts/${file}: file name and slug "${data.slug}" differ`);
    const out = join(dir, `${slug}.html`);
    const existing = existsSync(out) ? readFileSync(out, 'utf8') : null;
    if (existing !== null && !existing.includes(GENERATED)) throw new Error(`posts/${slug}.html is hand-written; pick another slug for posts/${file}`);
    const live = data.draft === false && data.date <= today;
    if (!live) {
      if (existing !== null) unlinkSync(out);
      console.log(`skipped posts/${file} (${data.draft !== false ? 'draft' : `scheduled for ${data.date}`})`);
      continue;
    }
    if (!data.sub) throw new Error(`posts/${file}: add "sub:" (the section inside ${data.category}) so the post can be filed`);
    writeFileSync(out, renderPostPage(data, body, { resolveSrc: relativeImage }));
  }
  // a generated page whose .md is gone goes too
  for (const file of files.filter(f => f.endsWith('.html') && !mdSlugs.has(f.replace(/\.html$/, '')))) {
    if (readFileSync(join(dir, file), 'utf8').includes(GENERATED)) unlinkSync(join(dir, file));
  }
}

// ---------- read posts ----------
const posts = readdirSync(join(BLOG, 'posts')).filter(f => f.endsWith('.html')).map(file => {
  const html = readFileSync(join(BLOG, 'posts', file), 'utf8');
  const m = html.match(/<script type="application\/json" id="post-meta">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`${file}: missing post-meta block`);
  const meta = JSON.parse(m[1]);
  const body = (html.match(/<!-- body -->([\s\S]*?)<!-- \/body -->/) || [])[1] || '';
  const words = body.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const cat = CATS[meta.cat];
  if (!cat) throw new Error(`${file}: unknown cat "${meta.cat}"`);
  if (!cat.subs.includes(meta.sub)) throw new Error(`${file}: sub "${meta.sub}" isn't one of ${cat.subs.join(', ')}`);
  const minutes = Math.max(1, Math.round(words / 220));
  return { ...meta, file, slug: file.replace(/\.html$/, ''), catLabel: cat.label, words, minutes, read: minutes + ' min' };
}).sort((a, b) => b.date.localeCompare(a.date));

// ---------- region replacement ----------
function fill(file, regions) {
  const path = join(BLOG, file);
  let html = readFileSync(path, 'utf8');
  for (const [name, content] of Object.entries(regions)) {
    const re = new RegExp(`(<!-- gen:${name} -->)[\\s\\S]*?(<!-- /gen:${name} -->)`, 'g');
    if (!re.test(html)) throw new Error(`${file}: no gen:${name} markers`);
    html = html.replace(re, (_, a, b) => a + content + b);
  }
  writeFileSync(path, html);
}

const byCat = c => posts.filter(p => p.cat === c);
const number = p => String(posts.length - posts.indexOf(p)).padStart(2, '0');   // newest post has the highest number
const haystack = p => [p.title, p.excerpt, p.sub, p.catLabel, p.place || '', ...(p.tags || []), p.keywords || ''].join(' ').toLowerCase();

// A post card for the blog index and the notebook pages. prefix = path from the page to blog/.
const postCard = (p, prefix) => `<a class="card post-card" href="${prefix}posts/${p.slug}.html" data-item data-nb="${p.cat}" data-sub="${slugify(p.sub)}" data-search="${esc(haystack(p))}">
        <span class="post-card__band" aria-hidden="true"></span>
        <div class="post-card__body">
          <span class="post-card__num" data-num="${number(p)}" aria-hidden="true"></span>
          <p class="post-card__kicker"><span class="nb-name">${esc(p.catLabel)}</span><span>· ${esc(p.sub)}</span></p>
          <h3 class="post-card__title">${esc(p.title)}</h3>
          <p class="post-card__excerpt">${esc(p.excerpt)}</p>
          <p class="post-card__meta"><span><time datetime="${p.date}">${longDate(p.date)}</time> · ${p.read} read</span>${ARROW}</p>
        </div>
      </a>`;

// ---------- blog index ----------
{
  const latest = posts[0];
  const f = latest.feature || {};
  const stats = f.stats || [[String(latest.minutes), 'min read']];
  const fTags = f.tags || (latest.tags || []).slice(0, 3);
  const featured = `<a class="featured tilt" href="posts/${latest.slug}.html" data-nb="${latest.cat}">
      <div class="featured__main">
        <p class="featured__kicker"><span class="featured__badge">Latest post</span><span>${esc(latest.catLabel)} · <time datetime="${latest.date}">${longDate(latest.date)}</time> · ${latest.read}</span></p>
        <h2 class="featured__title">${esc(latest.title)}</h2>
        <p class="featured__excerpt">${esc(latest.excerpt)}</p>
        <span class="featured__cta">${esc(f.cta || 'Read the post')} ${ARROW}</span>
      </div>
      <div class="featured__panel" aria-hidden="true">
        ${stats.map(([n, unit]) => `<p class="featured__stat"><span class="featured__num">${esc(n)}</span><span class="featured__unit">${esc(unit)}</span></p>`).join('\n        ')}
        <ul class="featured__tags">${fTags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      </div>
    </a>`;

  const tick = [...posts.map(p => `<span data-nb="${p.cat}"><span class="tdot"></span>${esc(p.title)}</span>`),
    ...ARCHIVE.map((a, i) => `<span style="--nb: var(${i % 2 ? '--stone' : '--paper'})"><span class="tdot"></span>${esc(a.title)}</span>`)];
  // two identical halves so the -50% marquee loops seamlessly; each half repeats until it is wider than a screen
  const half = [];
  while (half.length < 8) half.push(...tick);
  const ticker = half.concat(half).join('');

  const chip = (id, label, n) => `<button class="chip nb-chip" type="button" data-nb="${id}" data-nb-filter="${id}" aria-pressed="${id === 'all'}"><span class="tdot" aria-hidden="true"></span>${esc(label)} <span class="chip__count"><span class="sr-only">(</span>${n}<span class="sr-only">)</span></span></button>`;
  const chips = [chip('all', 'All', posts.length), ...Object.keys(CATS).map(c => chip(c, CATS[c].label, byCat(c).length))];

  const notebooks = Object.entries(CATS).map(([c, cat], i) => {
    const list = byCat(c);
    return `<button class="nb-card tilt" type="button" data-nb="${c}" data-pick-notebook="${c}" aria-controls="post-grid" aria-labelledby="nb-${c}-do nb-${c}-name">
        <span class="nb-card__top"><span>Notebook ${String(i + 1).padStart(2, '0')}</span><span>${list.length} in feed</span></span>
        <span class="nb-card__name" id="nb-${c}-name">${esc(cat.label)}</span>
        <span class="nb-card__blurb">${esc(cat.blurb)}</span>
        <span class="nb-card__posts">${list.length ? list.map(p => `<span>${esc(p.title)}</span>`).join('') : '<span class="nb-card__none">First post coming soon.</span>'}</span>
        <span class="sr-only" id="nb-${c}-do">Show posts from</span>
      </button>`;
  });

  const archive = ARCHIVE.map(a => `<li><a class="row" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer"><span class="row__kind">${esc(a.kind)}</span><span class="row__title">${esc(a.title)}<span class="sr-only"> (on Substack, opens in a new tab)</span></span>${ARROW.replace('width="22" height="22"', 'width="36" height="36"')}</a></li>`);

  fill('index.html', {
    'latest-line': `Latest: <time datetime="${latest.date}">${longDate(latest.date)}</time> · ${plural(posts.length, 'post')} in the feed`,
    ticker,
    featured,
    chips: '\n        ' + chips.join('\n        ') + '\n        ',
    grid: '\n      ' + posts.map(p => postCard(p, '')).join('\n      ') + '\n      ',
    notebooks: '\n      ' + notebooks.join('\n      ') + '\n      ',
    archive: '\n        ' + archive.join('\n        ') + '\n        ',
  });
}

// ---------- notebook pages (blog/tech, blog/mind, blog/food) ----------
for (const c of Object.keys(CATS)) {
  const list = byCat(c);
  const chips = ['All', ...CATS[c].subs].map(s => {
    const n = s === 'All' ? list.length : list.filter(p => p.sub === s).length;
    const id = s === 'All' ? 'all' : slugify(s);
    return `<button class="chip" type="button" data-sub="${id}" aria-pressed="${s === 'All'}">${esc(s)} <span class="chip__count"><span class="sr-only">(</span>${n}<span class="sr-only">)</span></span></button>`;
  }).join('\n        ');
  fill(`${c}/index.html`, {
    meta: `<span>${plural(list.length, 'post')}</span>${list.length ? `<span>· updated ${longDate(list[0].date)}</span>` : ''}`,
    chips,
    grid: '\n      ' + list.map(p => postCard(p, '../')).join('\n      ') + '\n      ',
  });
}

// ---------- portfolio homepage (../index.html), "03 — From the blog": the three newest posts ----------
const homeCard = p => `<a class="card post-card post-card--compact" href="blog/posts/${p.slug}.html" data-nb="${p.cat}">
          <span class="post-card__band" aria-hidden="true"></span>
          <div class="post-card__body">
            <p class="post-card__kicker">${esc(p.catLabel)} · ${shortDate(p.date)}</p>
            <h3 class="post-card__title">${esc(p.title)}</h3>
            <p class="post-card__excerpt">${esc(p.excerpt)}</p>
            <p class="post-card__meta">${p.read} read</p>
          </div>
        </a>`;
fill('../index.html', {
  'home-blog': '\n        ' + posts.slice(0, 3).map(homeCard).join('\n        ') +
    // fewer than two on-site posts: point readers at the older writing on Substack
    (posts.length < 2 ? '\n        <p><a class="link-arrow" href="https://aadityagoswami.substack.com" target="_blank" rel="noopener noreferrer">More on Substack →</a></p>' : '') + '\n        ',
});

// ---------- projects page (../projects.html) from ../assets/data/projects.json ----------
{
  const { projects } = JSON.parse(readFileSync(join(BLOG, '../assets/data/projects.json'), 'utf8'));
  const CATS_ORDER = ['Propulsion', 'Software', 'Avionics', 'Research', 'Machine Learning', 'Hardware', 'Web', 'Personal'];
  const STATUS = { live: 'Live', active: 'Active', progress: 'In progress', done: 'Done / Submitted' };
  const tally = Object.entries(STATUS).map(([cls, label]) =>
    `<div class="tally__item"><dt>${label}</dt><dd class="st-${cls}">${projects.filter(p => p.statusClass === cls).length}</dd></div>`);
  const chip = (id, label, n) => `<button class="chip chip--caps" type="button" data-cat="${id}" aria-pressed="${id === 'all'}">${esc(label)} <span class="chip__count"><span class="sr-only">(</span>${n}<span class="sr-only">)</span></span></button>`;
  const chips = [chip('all', 'All', projects.length),
    ...CATS_ORDER.map(c => chip(slugify(c), c, projects.filter(p => p.category === c).length))];
  const card = (p, i) => {
    const tag = p.link ? `a class="card proj-card" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer"` : 'article class="card proj-card"';
    const end = p.link ? 'a' : 'article';
    return `<li data-item data-cat="${slugify(p.category)}" id="${p.id}">
        <${tag}>
          <p class="proj-card__top"><span>${String(i + 1).padStart(2, '0')} · ${esc(p.category)}</span><span class="status status--${p.statusClass}">${esc(p.status)}</span></p>
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.description)}</p>
          <ul class="proj-card__tags" aria-label="Tags">${p.tags.map(t => `<li class="tag">${esc(t)}</li>`).join('')}</ul>
          ${p.link ? `<span class="proj-card__link">${esc(p.linkLabel)} ↗<span class="sr-only"> (opens in a new tab)</span></span>` : ''}${p.linkTodo ? `<!-- TODO: ${esc(p.linkTodo)} --><span class="proj-card__link">TODO: repo link</span>` : ''}
        </${end}>
      </li>`;
  };
  const unknown = projects.filter(p => !CATS_ORDER.includes(p.category));
  if (unknown.length) throw new Error(`projects.json: unknown category on ${unknown.map(p => p.name).join(', ')}`);
  fill('../projects.html', {
    'proj-count': String(projects.length),
    'proj-tally': '\n        ' + tally.join('\n        ') + '\n        ',
    'proj-chips': '\n      ' + chips.join('\n      ') + '\n      ',
    'proj-grid': '\n      ' + projects.map(card).join('\n      ') + '\n      ',
  });
}

// ---------- each post: read time + more from this notebook ----------
const moreRow = p => `<a href="${p.slug}.html" data-nb="${p.cat}"><span class="ph" aria-hidden="true"></span><span class="more__s"><span class="more__m">${longDate(p.date)} · ${p.read}</span><span class="more__t">${esc(p.title)}</span></span></a>`;
for (const p of posts) {
  const others = byCat(p.cat).filter(o => o.slug !== p.slug).slice(0, 3);
  fill(`posts/${p.file}`, {
    // cross-posted? set "substack": "https://…" in the post's meta block
    'also-substack': p.substack ? `<p class="also-substack">Also on <a href="${esc(p.substack)}" target="_blank" rel="noopener noreferrer">Substack ↗</a></p>` : '',
    read: `${p.read} read`,
    more: `<h2>More from ${esc(p.catLabel)} <em>${plural(byCat(p.cat).length, 'post')}</em></h2>
        ${others.length ? others.map(moreRow).join('\n        ') : '<p class="more__none">More coming soon. The newsletter is the easiest way to hear first.</p>'}`,
  });
}

// ---------- search index ----------
writeFileSync(join(BLOG, 'search-index.json'), JSON.stringify({
  posts: posts.map(p => ({
    title: p.title, url: `posts/${p.slug}.html`, cat: p.cat, catLabel: p.catLabel, sub: p.sub, place: p.place || '',
    date: p.date, dateShort: shortDate(p.date), read: p.read, excerpt: p.excerpt, tags: p.tags || [], words: p.keywords || '',
  })),
}, null, 1) + '\n');

// ---------- RSS ----------
const items = posts.map(p => `    <item>
      <title>${esc(p.title)}</title>
      <link>${SITE}posts/${p.slug}.html</link>
      <guid isPermaLink="true">${SITE}posts/${p.slug}.html</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <category>${esc(p.catLabel)}</category>
      <description>${esc(p.excerpt)}</description>
    </item>`).join('\n');
writeFileSync(join(BLOG, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Aaditya Goswami — Blog</title>
    <link>${SITE}</link>
    <atom:link href="${SITE}feed.xml" rel="self" type="application/rss+xml"/>
    <description>Food and places, engineering notes and essays from the founder of SkyLakes Aerospace.</description>
    <language>en-in</language>
    <lastBuildDate>${posts.length ? rfc822(posts[0].date) : new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`);

console.log(`built ${posts.length} posts: ${posts.map(p => p.slug).join(', ')}`);
