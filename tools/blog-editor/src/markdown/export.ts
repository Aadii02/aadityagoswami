import type { JSONContent } from '@tiptap/core';
import type { PostRecord } from '../model';
import type { ImageStore } from '../images/store';
import { serializeBody } from './serialize';
import { frontmatterData, serializeFrontmatter, siteProblems, validateFrontmatter, type Problem } from './frontmatter';

export interface ExportResult {
  /** "<slug>.md" */
  filename: string;
  /** the whole file (frontmatter + body) */
  markdown: string;
  frontmatter: Record<string, unknown>;
  body: string;
  /** stored images the post uses, keyed by file name */
  images: { name: string; blob: Blob }[];
  /** schema + site problems; empty when the file is ready */
  problems: Problem[];
  /** images without alt text (a warning, not a blocker) */
  missingAlt: number;
}

/** Everything the Markdown export (and the preview) needs, from the post's current state. */
export function buildExport(post: PostRecord, doc: JSONContent, store: ImageStore): ExportResult {
  const slug = post.meta.slug || 'untitled';
  const imagePath = (name: string) => `/blog/images/${slug}/${name}`;
  const cover = post.meta.cover && store.has(post.meta.cover) ? post.meta.cover : null;
  const frontmatter = frontmatterData(post.meta, cover ? imagePath(cover) : null);
  const body = serializeBody(doc, { imagePath });

  const used = new Set<string>();
  let missingAlt = 0;
  const walk = (n: JSONContent) => {
    if (n.type === 'image') {
      if (n.attrs?.src && store.has(n.attrs.src)) used.add(n.attrs.src);
      if (!n.attrs?.alt?.trim()) missingAlt++;
    }
    n.content?.forEach(walk);
  };
  walk(doc);
  if (cover) used.add(cover);

  return {
    filename: `${slug}.md`,
    markdown: `${serializeFrontmatter(frontmatter)}\n${body}`,
    frontmatter,
    body,
    images: [...used].map(name => ({ name, blob: store.get(name)! })),
    problems: [...validateFrontmatter(frontmatter), ...siteProblems(post.meta)],
    missingAlt,
  };
}
