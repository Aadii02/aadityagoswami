// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSchema, type JSONContent } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { baseExtensions } from '../src/editor/extensions';
import { imageExtensions } from '../src/editor/image';
import { ImageStore } from '../src/images/store';
import { parseBody } from '../src/markdown/parse';
import { serializeBody, serializeInline } from '../src/markdown/serialize';
import { frontmatterData, metaFromFrontmatter, serializeFrontmatter, validateFrontmatter } from '../src/markdown/frontmatter';
import { parseFrontmatter, renderMarkdown } from '../../../blog/tools/post-page.mjs';
import { newPost, slugify } from '../src/model';
import { baseName, uniqueName } from '../src/images/process';

// (import.meta.url isn't a file: URL under happy-dom; vitest runs from tools/blog-editor)
const SAMPLE = readFileSync(resolve(process.cwd(), '../../docs/blog-editor/spec/sample-post.md'), 'utf8');
const schema = getSchema([...baseExtensions(), ...imageExtensions(new ImageStore({}))]);

/** Through the real editor schema, the way a document looks after TipTap loads it. */
const normalise = (doc: JSONContent) => PMNode.fromJSON(schema, doc).toJSON() as JSONContent;

/** Import a whole .md file and export it again. */
function roundTrip(md: string) {
  const { data, body } = parseFrontmatter(md);
  const meta = metaFromFrontmatter(data);
  const slug = meta.slug;
  const prefix = `/blog/images/${slug}/`;
  const doc = normalise(parseBody(body, { imageName: p => (p.startsWith(prefix) ? p.slice(prefix.length) : null) }));
  const fm = frontmatterData(meta, meta.cover ? prefix + meta.cover : null);
  return `${serializeFrontmatter(fm)}\n${serializeBody(doc, { imagePath: n => prefix + n })}`;
}

describe('Markdown contract (spec/sample-post.md)', () => {
  it('round-trips the sample post byte for byte', () => {
    expect(roundTrip(SAMPLE)).toBe(SAMPLE.replace(/\r\n/g, '\n'));
  });

  it('the sample frontmatter validates against the schema', () => {
    expect(validateFrontmatter(parseFrontmatter(SAMPLE).data)).toEqual([]);
  });

  it('ends with a single newline and has no trailing whitespace', () => {
    const out = roundTrip(SAMPLE);
    expect(out.endsWith('\n') && !out.endsWith('\n\n')).toBe(true);
    expect(out.split('\n').some(l => /\s$/.test(l))).toBe(false);
  });
});

describe('serializer', () => {
  const p = (...content: JSONContent[]) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });
  const t = (text: string, ...marks: string[]) => ({ type: 'text', text, ...(marks.length ? { marks: marks.map(type => ({ type })) } : {}) });
  const body = (doc: JSONContent) => serializeBody(normalise(doc), { imagePath: n => `/blog/images/x/${n}` });

  it('keeps marks open across text nodes', () => {
    expect(body(p(t('a '), t('bold ', 'bold'), t('both', 'bold', 'italic'), t(' end')))).toBe('a **bold** ***both*** end\n');
  });

  it('moves spaces outside emphasis', () => {
    expect(serializeInline([t('x'), t(' y ', 'italic'), t('z')])).toBe('x *y* z');
  });

  it('escapes markdown punctuation and block markers at the start of a paragraph', () => {
    expect(body(p(t('# not a heading * or [link]')))).toBe('\\# not a heading \\* or \\[link\\]\n');
    expect(body(p(t('- not a list')))).toBe('\\- not a list\n');
    expect(body(p(t('a <b> tag, a < b')))).toBe('a \\<b> tag, a < b\n');
  });

  it('writes links with marks inside', () => {
    const link = { type: 'text', text: 'here', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }, { type: 'bold' }] };
    expect(body(p(t('see '), link))).toBe('see [**here**](https://example.com)\n');
  });

  it('code spans use enough backticks', () => {
    expect(serializeInline([t('a `tick` b', 'code')])).toBe('``a `tick` b``');
  });

  it('skips empty paragraphs and unfinished uploads', () => {
    expect(body({ type: 'doc', content: [{ type: 'paragraph' }, { type: 'imageUpload' }, { type: 'paragraph', content: [t('x')] }, { type: 'paragraph' }] })).toBe('x\n');
  });

  it('empty doc is an empty body', () => {
    expect(body({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('');
  });

  it('round-trips every block type', () => {
    const md = [
      'Intro with *italic*, **bold**, `code` and a [link](https://example.com).',
      '## Heading two', '### Heading three',
      '> Quote line\n> — Someone',
      '> [!NOTE]\n> First para.\n>\n> Second para.',
      '- one\n- two with **bold**',
      '---',
      '```python\nprint("hi")\n\n# comment\n```',
      '```\nplain\n```',
      '<figure class="img img--full">\n  <img src="https://example.com/a.gif" alt="A &quot;quoted&quot; alt" width="10" height="20" loading="lazy">\n</figure>',
      'Line one\\\nline two',
    ].join('\n\n') + '\n';
    const doc = normalise(parseBody(md));
    expect(serializeBody(doc, { imagePath: n => n })).toBe(md);
  });
});

describe('frontmatter', () => {
  const meta = () => {
    const m = newPost().meta;
    Object.assign(m, { title: 'Chai: a love story', slug: 'chai-a-love-story', category: 'food-and-places', tags: ['chai', 'delhi'], date: '2026-10-01', excerpt: 'Say "yes".' });
    return m;
  };

  it('omits empty subtitle and cover, keeps key order, quotes prose', () => {
    expect(serializeFrontmatter(frontmatterData(meta(), null))).toBe(
      '---\ntitle: "Chai: a love story"\nslug: chai-a-love-story\ncategory: food-and-places\ntags: [chai, delhi]\ndate: 2026-10-01\nexcerpt: "Say \\"yes\\"."\ndraft: true\n---\n');
  });

  it('reports schema problems', () => {
    const m = meta();
    Object.assign(m, { slug: 'Bad Slug', category: null, excerpt: 'x'.repeat(161) });
    const fields = validateFrontmatter(frontmatterData(m, null)).map(p => p.field);
    expect(fields).toEqual(expect.arrayContaining(['slug', 'category', 'excerpt']));
  });
});

describe('site renderer (blog/tools/post-page.mjs)', () => {
  it('renders the sample with the site classes', () => {
    const { html } = renderMarkdown(parseFrontmatter(SAMPLE).body, { resolveSrc: (s: string) => s.replace(/^\/blog\//, '../') });
    expect(html).toContain('<p class="lead">');
    expect(html).toContain('<blockquote class="pq">');
    expect(html).toContain('<cite class="pq__cite">— Leonardo da Vinci</cite>');
    expect(html).toContain('<div class="note">');
    expect(html).toContain('src="../images/three-dhabas-between-delhi-and-manali/rotis.gif"');
    expect(html).toContain('<figure class="img img--wide">');
    expect(html).not.toMatch(/<script/);
  });

  it('escapes HTML in text and neutralises javascript: links', () => {
    const { html } = renderMarkdown('Hi \\<script>x</script> [a](javascript:alert(1))');
    expect(html).not.toContain('<script');
    expect(html).toContain('href="#"');
  });
});

describe('names', () => {
  it('slugify', () => {
    expect(slugify('Café — Delhi’s best!')).toBe('cafe-delhis-best');
    expect(slugify('  The   Workshop, not the To-Do list ')).toBe('the-workshop-not-the-to-do-list');
  });
  it('image file names', () => {
    expect(baseName('My Photo (2).JPG')).toBe('my-photo-2');
    expect(uniqueName('rotis', 'gif', ['rotis.gif', 'rotis-2.gif'])).toBe('rotis-3.gif');
  });
});
