import type { JSONContent } from '@tiptap/core';
import { CATEGORIES, categoryById, postState, type PostRecord } from '../model';
import { deletePost, listPosts } from '../store/db';
import { $, el, esc, formatNumber, icon, toast } from '../lib/dom';

type Tab = 'all' | 'draft' | 'scheduled' | 'published';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2 min ago", "Today, 9:14", "Yesterday", "22 Sep", "22 Sep 2025" */
export function lastEdited(at: number, now = new Date()): string {
  const d = new Date(at);
  const mins = Math.round((now.getTime() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86400000);
  if (days === 0) return `Today, ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (days === 1) return 'Yesterday';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`}`;
}

/** "30 Sep" from "2026-09-30" */
const shortDate = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };

/** First bit of body text, for the one-line excerpt under the title. */
export function firstText(doc: JSONContent, max = 90): string {
  let out = '';
  const walk = (n: JSONContent) => {
    if (out.length > max) return;
    if (n.type === 'codeBlock' || n.type === 'image') return;
    if (n.text) out += n.text;
    n.content?.forEach(walk);
    if (n.type === 'paragraph' || n.type === 'heading') out += ' ';
  };
  walk(doc);
  out = out.replace(/\s+/g, ' ').trim();
  if (out.length <= max) return out;
  return out.slice(0, max).replace(/\s+\S*$/, '') + '…';
}


/** Writing desk (screen 05). */
export class DraftsView {
  readonly root: HTMLElement;
  private posts: PostRecord[] = [];
  private tab: Tab = 'all';
  private cat: string | null = null;
  private query = '';

  constructor() {
    this.root = el(`
      <div class="desk">
        <header class="desk-bar">
          <span class="desk-bar__name">Aaditya Goswami</span>
          <span class="desk-bar__slash" aria-hidden="true">/</span>
          <span class="desk-bar__app">Blog studio</span>
          <span class="topbar__spacer"></span>
          <a class="btn btn--primary" href="#/new">${icon('plus')}New post</a>
        </header>
        <main class="desk-main" id="main">
          <h1 class="desk-title">Writing desk</h1>
          <p class="desk-sub" aria-live="polite"></p>
          <div class="desk-filters">
            <div class="desk-tabs" role="group" aria-label="Status filter"></div>
            <span class="topbar__spacer"></span>
            <div class="desk-cats" role="group" aria-label="Category filter">
              ${CATEGORIES.map(c => `<button type="button" class="pill pill--sm" data-cat="${c.id}" aria-pressed="false">${esc(c.label)}</button>`).join('')}
            </div>
            <div class="desk-search">
              ${icon('search')}
              <input type="search" aria-label="Search posts" placeholder="Search posts">
            </div>
          </div>
          <table class="desk-table">
            <thead><tr>
              <th scope="col">Title</th><th scope="col" class="col-cat">Category</th><th scope="col" class="col-edited">Last edited</th>
              <th scope="col" class="col-status">Status</th><th scope="col" class="col-words">Words</th><th scope="col" class="col-actions"><span class="sr-only">Actions</span></th>
            </tr></thead>
            <tbody></tbody>
          </table>
          <p class="desk-empty" hidden></p>
        </main>
      </div>`);
    this.bind();
  }

  async mount(host: HTMLElement) {
    host.replaceChildren(this.root);
    this.posts = await listPosts();
    this.render();
  }

  private bind() {
    this.root.addEventListener('click', async e => {
      const t = e.target as HTMLElement;
      const tab = t.closest<HTMLElement>('[data-tab]')?.dataset.tab as Tab | undefined;
      if (tab) { this.tab = tab; this.render(); return; }
      const cat = t.closest<HTMLElement>('.desk-cats [data-cat]')?.dataset.cat;
      if (cat) { this.cat = this.cat === cat ? null : cat; this.render(); return; }
      const del = t.closest<HTMLElement>('[data-delete]')?.dataset.delete;
      if (del) { await this.confirmDelete(del, t.closest('tr')!); return; }
      // the whole row opens the post (the title link is the accessible target)
      const row = t.closest<HTMLElement>('tr[data-id]');
      if (row && !t.closest('a, button')) location.hash = `#/edit/${row.dataset.id}`;
    });
    $<HTMLInputElement>('.desk-search input', this.root).addEventListener('input', e => {
      this.query = (e.target as HTMLInputElement).value.trim().toLowerCase();
      this.render();
    });
  }

  private async confirmDelete(id: string, row: Element) {
    const post = this.posts.find(p => p.id === id);
    const name = post?.meta.title.trim() || 'Untitled draft';
    const actions = row.querySelector('.row-actions')!;
    actions.innerHTML = `<span class="row-confirm">Delete “${esc(name)}”?</span>
      <button type="button" class="btn btn--sm btn--danger" data-confirm>Delete</button>
      <button type="button" class="btn btn--sm" data-cancel>Keep</button>`;
    row.classList.add('is-confirming');
    actions.querySelector<HTMLButtonElement>('[data-cancel]')!.focus();
    actions.querySelector('[data-cancel]')!.addEventListener('click', () => this.render());
    actions.querySelector('[data-confirm]')!.addEventListener('click', async () => {
      await deletePost(id);
      this.posts = this.posts.filter(p => p.id !== id);
      this.render();
      toast(`Deleted “${name}”`);
    });
  }

  private render() {
    const states = this.posts.map(p => ({ p, s: postState(p.meta) }));
    const count = (s?: string) => (s ? states.filter(x => x.s === s).length : states.length);
    const n = count();

    $('.desk-sub', this.root).textContent = n
      ? `${n} piece${n === 1 ? '' : 's'} — ${count('draft')} draft${count('draft') === 1 ? '' : 's'}, ${count('scheduled')} scheduled, ${count('published')} published`
      : 'Nothing here yet. Every post starts as a draft.';

    const tabs: [Tab, string, number][] = [['all', 'All', n], ['draft', 'Drafts', count('draft')], ['scheduled', 'Scheduled', count('scheduled')], ['published', 'Published', count('published')]];
    $('.desk-tabs', this.root).innerHTML = tabs.map(([id, label, c]) =>
      `<button type="button" class="desk-tab" data-tab="${id}" aria-pressed="${this.tab === id}">${label} <span class="desk-tab__n">${c}</span></button>`).join('');
    this.root.querySelectorAll<HTMLButtonElement>('.desk-cats [data-cat]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === this.cat)));

    const rows = states.filter(({ p, s }) =>
      (this.tab === 'all' || s === this.tab) &&
      (!this.cat || p.meta.category === this.cat) &&
      (!this.query || `${p.meta.title} ${p.meta.subtitle} ${p.meta.excerpt} ${p.meta.tags.join(' ')} ${firstText(p.doc, 400)}`.toLowerCase().includes(this.query)));

    $('tbody', this.root).innerHTML = rows.map(({ p, s }) => this.row(p, s)).join('');
    // no posts at all: the subtitle says so, and an empty table would only look broken
    $('.desk-table', this.root).hidden = n === 0;
    const empty = $('.desk-empty', this.root);
    empty.hidden = rows.length > 0 || n === 0;
    empty.textContent = 'No posts match these filters.';
  }

  private row(p: PostRecord, s: 'draft' | 'scheduled' | 'published') {
    const m = p.meta;
    const title = m.title.trim();
    const blurb = m.excerpt.trim() || firstText(p.doc) || 'No content yet';
    const cat = categoryById(m.category);
    const status = s === 'published'
      ? `<span class="status status--published">${icon('check')}Published</span>`
      : s === 'scheduled'
        ? `<span class="status status--scheduled"><span class="status__dot" aria-hidden="true"></span>Scheduled · ${shortDate(m.date)}</span>`
        : `<span class="status status--draft"><span class="status__dot" aria-hidden="true"></span>Draft</span>`;
    const label = esc(title || 'Untitled draft');
    return `
      <tr data-id="${p.id}">
        <td class="col-title">
          <a class="row-title${title ? '' : ' row-title--untitled'}" href="#/edit/${p.id}">${label}</a>
          <span class="row-blurb">${esc(blurb)}</span>
        </td>
        <td class="col-cat">${cat ? `<span class="tag">${esc(cat.label)}</span>` : '<span class="row-none" aria-label="No category">—</span>'}</td>
        <td class="col-edited">${lastEdited(p.updatedAt)}</td>
        <td class="col-status">${status}</td>
        <td class="col-words">${formatNumber(p.words)}</td>
        <td class="col-actions"><div class="row-actions">
          <a class="icon-btn icon-btn--sm" href="#/edit/${p.id}" aria-label="Edit ${label}">${icon('edit')}</a>
          <a class="icon-btn icon-btn--sm" href="#/edit/${p.id}/preview" aria-label="Preview ${label}">${icon('eye')}</a>
          <a class="icon-btn icon-btn--sm" href="#/edit/${p.id}/export" aria-label="Export ${label} as Markdown">${icon('download')}</a>
          <button type="button" class="icon-btn icon-btn--sm" data-delete="${p.id}" aria-label="Delete ${label}">${icon('trash')}</button>
        </div></td>
      </tr>`;
  }
}
