#!/usr/bin/env node
// Optional helper. The committed HTML already works on GitHub Pages; run this after adding or editing a post
// to refresh every generated list:   node blog/tools/build.mjs
//
// It reads the JSON block (<script type="application/json" id="post-meta">) at the top of each blog/posts/*.html,
// then rewrites only the regions between <!-- gen:NAME --> and <!-- /gen:NAME --> markers, plus
// blog/search-index.json and blog/feed.xml. Everything outside the markers is left exactly as you wrote it.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Where the blog lives once deployed. Used only for absolute links in feed.xml and share tags.
const SITE = 'https://aadii02.github.io/blog/';
const BLOG = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATS = {
  food: { label: 'Food & Places', subs: ['Food', 'Cities', 'Treks'] },
  tech: { label: 'Tech', subs: ['Web', 'AI', 'DevOps', 'Aerospace'] },
  mind: { label: 'Mind & Meaning', subs: ['Habits', 'Philosophy', 'Reflections'] },
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const longDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`; };
const shortDate = iso => longDate(iso).slice(0, 6);
const rfc822 = iso => new Date(iso + 'T09:00:00+05:30').toUTCString();
const PIN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
const SEP = '<span class="sep" aria-hidden="true">·</span>';

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
  return { ...meta, file, slug: file.replace(/\.html$/, ''), catLabel: cat.label, words,
    read: Math.max(1, Math.round(words / 220)) + ' min' };
}).sort((a, b) => b.date.localeCompare(a.date));

// ---------- shared snippets ----------
const img = (p, prefix, eager) => `<img src="${prefix}assets/img/placeholder-${p.cat}.jpg" alt="${esc(p.alt)}" width="1200" height="800"${eager ? '' : ' loading="lazy"'} decoding="async">`;
const phl = p => `<span class="phl" aria-hidden="true">${esc(p.photo)}</span>`;

function latestRow(p) {
  return `<a class="row reveal c-${p.cat}" href="posts/${p.slug}.html">
        <div class="row__when mono">${longDate(p.date)}</div>
        <div>
          <div class="row__top"><span class="clab"><i></i>${esc(p.catLabel)} · ${esc(p.sub)}</span><span class="row__read mono">${p.read}</span></div>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.excerpt)}</p>
        </div>
      </a>`;
}
function pinnedCard(p) {
  return `<a class="card pinned reveal c-${p.cat}" href="posts/${p.slug}.html">
      <div class="ph ph-${p.cat}">${img(p, '', false)}${p.cat === 'tech' ? RIG : ''}${phl(p)}</div>
      <div class="card__body">
        <div class="pinned__top"><span class="clab"><i></i>${esc(p.catLabel)} · ${esc(p.sub)}</span><span class="mono muted"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M9 3.5h6l-1 6 4 3v2H6v-2l4-3-1-6Z"/><path d="M12 14.5v6"/></svg> Pinned</span></div>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.excerpt)}</p>
        <div class="meta mono"><span>${longDate(p.date)}</span>${SEP}<span>${p.read} read</span></div>
      </div>
    </a>`;
}
const RIG = `<svg viewBox="0 0 540 340" fill="none" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g stroke="var(--accent)" stroke-width="1.4" opacity="0.8"><rect x="210" y="70" width="120" height="150" rx="6"/><path d="M230 220v40M270 220v52M310 220v40"/><path d="M150 110h60M330 110h60" stroke-dasharray="4 5"/><circle cx="270" cy="145" r="22"/></g></svg>`;

function gridCard(p) {
  const where = p.cat === 'food' && p.place ? `${PIN}${esc(p.place)}` : esc(`${p.catLabel} · ${p.sub}`);
  return `<a class="card reveal" href="../posts/${p.slug}.html" data-sub="${slugify(p.sub)}">
        <div class="ph ph-${p.cat}">${img(p, '../', false)}<span class="tag">${esc(p.sub)}</span>${p.mustTry ? '<span class="hand" aria-hidden="true">must try</span>' : ''}${phl(p)}</div>
        <div class="card__body">
          <span class="pcard__where mono">${where}</span>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.excerpt)}</p>
          <div class="meta mono"><span>${longDate(p.date)}</span>${SEP}<span>${p.read}</span></div>
        </div>
      </a>`;
}
function moreRow(p) {
  const sub = p.cat === 'food' && p.place ? p.place : longDate(p.date);
  return `<a href="${p.slug}.html"><span class="ph ph-${p.cat}" aria-hidden="true"></span><span class="more__s"><span class="more__m mono">${esc(sub)} · ${p.read}</span><span class="more__t">${esc(p.title)}</span></span></a>`;
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

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
const catCount = c => byCat(c).length;
const catSummary = c => `${plural(catCount(c), 'post')} · ${CATS[c].subs.join(' / ')}`;

// home
const pinned = posts.find(p => p.pinned) || posts[0];
fill('index.html', {
  'hero-count': `${Object.keys(CATS).length} notebooks · ${plural(posts.length, 'post')}`,
  pinned: pinnedCard(pinned),
  'nb-food': catSummary('food'), 'nb-tech': catSummary('tech'), 'nb-mind': catSummary('mind'),
  'latest-count': plural(posts.length, 'post'),
  latest: posts.slice(0, 6).map(latestRow).join('\n      '),
});

// categories
for (const c of Object.keys(CATS)) {
  const list = byCat(c);
  const chips = ['All', ...CATS[c].subs].map(s => {
    const n = s === 'All' ? list.length : list.filter(p => p.sub === s).length;
    const id = s === 'All' ? 'all' : slugify(s);
    return `<button class="chip" type="button" data-sub="${id}" aria-pressed="${s === 'All'}">${esc(s)} <span class="n">${n}</span></button>`;
  }).join('\n        ');
  fill(`${c}/index.html`, {
    meta: `<span>${plural(list.length, 'post')}</span>${list.length ? `${SEP}<span>updated ${longDate(list[0].date)}</span>` : ''}`,
    chips,
    grid: list.map(gridCard).join('\n      '),
  });
}

// each post: read time + more from this category
for (const p of posts) {
  const others = byCat(p.cat).filter(o => o.slug !== p.slug).slice(0, 3);
  fill(`posts/${p.file}`, {
    read: `${p.read} read`,
    more: `<h2>More from ${esc(p.catLabel)} <em>${plural(catCount(p.cat), 'post')}</em></h2>
        ${others.length ? others.map(moreRow).join('\n        ') : '<p class="more__none">More coming soon. The newsletter is the easiest way to hear first.</p>'}`,
  });
}

// search index
writeFileSync(join(BLOG, 'search-index.json'), JSON.stringify({
  posts: posts.map(p => ({
    title: p.title, url: `posts/${p.slug}.html`, cat: p.cat, catLabel: p.catLabel, sub: p.sub, place: p.place || '',
    date: p.date, dateShort: shortDate(p.date), read: p.read, excerpt: p.excerpt, tags: p.tags || [], words: p.keywords || '',
  })),
}, null, 1) + '\n');

// RSS
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
