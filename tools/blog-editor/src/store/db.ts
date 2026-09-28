import { createStore, del, get, set, values } from 'idb-keyval';
import type { PostRecord } from '../model';

/* Drafts live in IndexedDB, one record per post: {id, doc, meta, images: {name: Blob}, updatedAt, status, …}.
   Images are stored as Blobs (structured clone), never base64. */
const posts = createStore('blog-studio', 'posts');

export const getPost = (id: string) => get<PostRecord>(id, posts);
export const savePost = (post: PostRecord) => set(post.id, post, posts);
export const deletePost = (id: string) => del(id, posts);

export async function listPosts(): Promise<PostRecord[]> {
  const all = await values<PostRecord>(posts);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** "paranthe-wali-gali" → "paranthe-wali-gali-2" when another post already uses it. */
export function uniqueSlug(slug: string, taken: Set<string>): string {
  if (!slug || !taken.has(slug)) return slug;
  let i = 2;
  while (taken.has(`${slug}-${i}`)) i++;
  return `${slug}-${i}`;
}

export async function slugsExcept(id: string): Promise<Set<string>> {
  return new Set((await listPosts()).filter(p => p.id !== id).map(p => p.meta.slug).filter(Boolean));
}
