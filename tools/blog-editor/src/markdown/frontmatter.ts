import schema from '../../../../docs/blog-editor/spec/frontmatter.schema.json';
import { categoryById, type PostMeta } from '../model';

/** The frontmatter object in export key order: title, subtitle?, slug, category, sub?, tags, date, excerpt, cover?, draft. */
export function frontmatterData(meta: PostMeta, coverPath: string | null): Record<string, unknown> {
  const d: Record<string, unknown> = { title: meta.title.trim() };
  if (meta.subtitle.trim()) d.subtitle = meta.subtitle.trim();
  d.slug = meta.slug;
  d.category = meta.category;
  if (meta.sub) d.sub = meta.sub;
  d.tags = meta.tags;
  d.date = meta.date;
  d.excerpt = meta.excerpt.trim();
  if (coverPath) d.cover = coverPath;
  d.draft = meta.draft;
  return d;
}

/** Imported frontmatter → post fields. The cover becomes its file name inside the post's image store. */
export function metaFromFrontmatter(d: Record<string, unknown>): PostMeta {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const cover = str(d.cover);
  return {
    title: str(d.title), subtitle: str(d.subtitle), slug: str(d.slug), slugLocked: !!d.slug,
    category: (categoryById(str(d.category))?.id ?? null), sub: str(d.sub),
    tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
    date: str(d.date), excerpt: str(d.excerpt),
    cover: cover ? cover.split('/').pop()! : null,
    draft: d.draft !== false,
  };
}

// prose fields are always double-quoted (as in the sample); other strings only when YAML would misread them
const ALWAYS_QUOTE = new Set(['title', 'subtitle', 'excerpt']);
const needsQuotes = (s: string) =>
  s === '' || /[:"#'\n]|^\s|\s$/.test(s) || /^[-?!&*%@`|>{}[\],]/.test(s) || /^(true|false|null|yes|no|on|off|~|[\d.+-]+)$/i.test(s);
const quote = (s: string) => JSON.stringify(s);

function yamlScalar(key: string, v: unknown): string {
  if (typeof v === 'boolean') return String(v);
  const s = String(v ?? '');
  if (ALWAYS_QUOTE.has(key) || (key !== 'date' && needsQuotes(s))) return quote(s);
  return s;
}

/** `---\n…\n---` block. Tags are an inline array. */
export function serializeFrontmatter(data: Record<string, unknown>): string {
  const lines = Object.entries(data).map(([k, v]) =>
    Array.isArray(v) ? `${k}: [${v.map(t => (needsQuotes(String(t)) ? quote(String(t)) : t)).join(', ')}]` : `${k}: ${yamlScalar(k, v)}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

/* ---------- validation against spec/frontmatter.schema.json ---------- */

export interface Problem { field: string; message: string }

type Prop = { type?: string; enum?: string[]; pattern?: string; minLength?: number; maxLength?: number; format?: string; uniqueItems?: boolean; items?: Prop };

/** Checks the frontmatter object against the schema (the subset of JSON Schema it uses). */
export function validateFrontmatter(data: Record<string, unknown>): Problem[] {
  const out: Problem[] = [];
  const props = schema.properties as Record<string, Prop>;
  for (const req of schema.required) if (data[req] === undefined || data[req] === null || data[req] === '') out.push({ field: req, message: `${label(req)} is required.` });
  for (const [key, value] of Object.entries(data)) {
    const p = props[key];
    if (!p) { out.push({ field: key, message: `“${key}” isn’t allowed in the frontmatter.` }); continue; }
    if (value === null || value === undefined) continue;
    checkValue(key, value, p, out);
  }
  return out;
}

function checkValue(key: string, value: unknown, p: Prop, out: Problem[]) {
  const name = label(key);
  if (p.enum && !p.enum.includes(value as string)) { out.push({ field: key, message: `${name} must be one of ${p.enum.join(', ')}.` }); return; }
  if (p.type === 'string' || p.format || p.pattern) {
    if (typeof value !== 'string') { out.push({ field: key, message: `${name} must be text.` }); return; }
    if (p.minLength && value.length < p.minLength) out.push({ field: key, message: `${name} can’t be empty.` });
    if (p.maxLength && value.length > p.maxLength) out.push({ field: key, message: `${name} is ${value.length} characters; the limit is ${p.maxLength}.` });
    if (p.pattern && !new RegExp(p.pattern).test(value)) out.push({ field: key, message: `${name} “${value}” should be lowercase letters, numbers and single hyphens.` });
    if (p.format === 'date' && !(/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)))) out.push({ field: key, message: `${name} must be a date (YYYY-MM-DD).` });
  }
  if (p.type === 'boolean' && typeof value !== 'boolean') out.push({ field: key, message: `${name} must be true or false.` });
  if (p.type === 'array') {
    if (!Array.isArray(value)) { out.push({ field: key, message: `${name} must be a list.` }); return; }
    if (p.uniqueItems && new Set(value).size !== value.length) out.push({ field: key, message: `${name} has duplicates.` });
    value.forEach(v => p.items && checkValue(key, v, p.items, out));
  }
}

const LABELS: Record<string, string> = { title: 'Title', slug: 'Slug', category: 'Category', date: 'Publish date', excerpt: 'Excerpt', tags: 'Tag', sub: 'Section', cover: 'Cover', subtitle: 'Subtitle', draft: 'Status' };
const label = (k: string) => LABELS[k] ?? k;

/** Extra checks the site build needs beyond the schema. */
export function siteProblems(meta: PostMeta): Problem[] {
  const cat = categoryById(meta.category);
  if (cat && !meta.sub) return [{ field: 'sub', message: `Pick a section inside ${cat.label} so the site build can file the post.` }];
  return [];
}
