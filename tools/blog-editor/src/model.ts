import type { JSONContent } from '@tiptap/core';

/* Categories as they appear in the Markdown frontmatter (spec/frontmatter.schema.json).
   `site` is the notebook id blog/tools/build.mjs uses, `subs` its sub-sections. */
export const CATEGORIES = [
  { id: 'food-and-places', label: 'Food & Places', site: 'food', subs: ['Food', 'Cities', 'Treks'] },
  { id: 'tech', label: 'Tech', site: 'tech', subs: ['Web', 'AI', 'DevOps', 'Aerospace'] },
  { id: 'mind-and-meaning', label: 'Mind & Meaning', site: 'mind', subs: ['Habits', 'Philosophy', 'Reflections'] },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];
export const categoryById = (id: string | null | undefined) => CATEGORIES.find(c => c.id === id);

export type ImageSize = 'normal' | 'wide' | 'full';

export interface PostMeta {
  title: string;
  subtitle: string;
  slug: string;
  /** true once the slug has been edited by hand; it then stops following the title */
  slugLocked: boolean;
  category: CategoryId | null;
  sub: string;
  tags: string[];
  /** YYYY-MM-DD */
  date: string;
  excerpt: string;
  /** file name inside `images` (e.g. "cover.jpg"), or null */
  cover: string | null;
  draft: boolean;
  /** listed under "Top posts" on the blog front page. Optional so drafts saved before the toggle existed still load. */
  featured?: boolean;
}

/** One IndexedDB record per post. Images stay Blobs, keyed by their export file name. */
export interface PostRecord {
  id: string;
  doc: JSONContent;
  meta: PostMeta;
  images: Record<string, Blob>;
  createdAt: number;
  updatedAt: number;
  status: 'draft' | 'published';
  words: number;
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const emptyDoc = (): JSONContent => ({ type: 'doc', content: [{ type: 'paragraph' }] });

export function newPost(): PostRecord {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    doc: emptyDoc(),
    meta: {
      title: '', subtitle: '', slug: '', slugLocked: false, category: null, sub: '',
      tags: [], date: todayISO(), excerpt: '', cover: null, draft: true, featured: false,
    },
    images: {},
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    words: 0,
  };
}

/** Lowercase ASCII, hyphens, no stop-word removal. "Café — Delhi's best!" → "cafe-delhis-best" */
export function slugify(s: string): string {
  return s
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const readingMinutes = (words: number) => Math.max(1, Math.round(words / 225));

/** A post is scheduled when it is marked published but its date is still in the future. */
export function postState(meta: PostMeta): 'draft' | 'scheduled' | 'published' {
  if (meta.draft) return 'draft';
  return meta.date > todayISO() ? 'scheduled' : 'published';
}
