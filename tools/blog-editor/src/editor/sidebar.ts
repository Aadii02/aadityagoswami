import { CATEGORIES, categoryById, slugify, type PostRecord } from '../model';
import { $, el, esc, icon, MOD, toast } from '../lib/dom';
import type { ImageStore } from '../images/store';
import { pickFiles } from './image';
import { ImageError } from '../images/process';

export const EXCERPT_MAX = 160;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Tag text → schema-safe kebab-case ("Old Delhi" → "old-delhi"). */
export const tagify = (s: string) => slugify(s);

export interface SidebarHooks {
  /** meta changed here; the session re-derives the slug (unless locked) and saves */
  onChange: () => void;
  onClose: () => void;
  onExport: () => void;
  takenSlugs: Set<string>;
}

/** Post settings (screen 03): a 400px espresso panel beside the canvas. */
export class SettingsSidebar {
  readonly root: HTMLElement;
  private opener: HTMLElement | null = null;

  constructor(private post: PostRecord, private images: ImageStore, private hooks: SidebarHooks) {
    this.root = el(`
      <aside class="sidebar" id="settings" aria-label="Post settings" hidden>
        <div class="sidebar__head">
          <h2 class="sidebar__title">Post settings</h2>
          <button type="button" class="icon-btn sidebar__close" data-act="close" aria-label="Close settings (${MOD} \\)">${icon('close')}</button>
        </div>

        <div class="field field--category">
          <label class="label" for="set-category">Category</label>
          <select id="set-category" class="input">
            <option value="">Choose a category</option>
            ${CATEGORIES.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label class="label" for="set-slug">URL slug</label>
          <div class="input input--affix">
            <span class="input__prefix" aria-hidden="true">/blog/posts/</span>
            <input id="set-slug" spellcheck="false" autocomplete="off" aria-describedby="set-slug-hint">
          </div>
          <span class="field__hint" id="set-slug-hint"></span>
        </div>

        <div class="field">
          <span class="label" id="set-cover-label">Cover image</span>
          <div class="cover" aria-labelledby="set-cover-label"></div>
        </div>

        <div class="field">
          <div class="field__row">
            <label class="label" for="set-excerpt">Excerpt</label>
            <span class="field__count" aria-live="polite"></span>
          </div>
          <textarea id="set-excerpt" class="input input--area" rows="3" maxlength="${EXCERPT_MAX}" placeholder="One or two sentences for the blog index and share previews."></textarea>
        </div>

        <div class="field">
          <label class="label" for="set-tag">Tags</label>
          <div class="input input--tags">
            <ul class="tags" aria-label="Tags"></ul>
            <input id="set-tag" placeholder="Add tag…" autocomplete="off" aria-describedby="set-tag-hint">
          </div>
          <span class="sr-only" id="set-tag-hint">Press Enter or comma to add a tag, Backspace to remove the last one.</span>
        </div>

        <div class="field">
          <label class="label" for="set-sub">Section</label>
          <select id="set-sub" class="input" aria-describedby="set-sub-hint"></select>
          <span class="field__hint" id="set-sub-hint"></span>
        </div>

        <div class="field__pair">
          <div class="field">
            <label class="label" for="set-date">Publish date</label>
            <div class="input input--icon">${icon('calendar')}<input id="set-date" type="date" required></div>
          </div>
          <div class="field">
            <span class="label" id="set-status-label">Status</span>
            <div class="segmented" role="group" aria-labelledby="set-status-label">
              <button type="button" data-draft="true">Draft</button>
              <button type="button" data-draft="false">Published</button>
            </div>
          </div>
        </div>
        <p class="field__hint field__hint--status" aria-live="polite"></p>

        <div class="sidebar__foot">
          <button type="button" class="btn btn--outline btn--lg btn--block" data-act="export">${icon('download')}Export Markdown</button>
          <p class="sidebar__note">Drafts stay private. Publish to list it on /blog.</p>
        </div>
      </aside>`);
    this.bind();
    this.render();
  }

  get open() { return !this.root.hidden; }

  show(opener?: HTMLElement | null) {
    this.opener = opener ?? (document.activeElement as HTMLElement | null);
    this.render();
    this.root.hidden = false;
    $<HTMLElement>('#set-slug', this.root).focus({ preventScroll: true });
  }

  hide() {
    this.root.hidden = true;
    this.opener?.focus?.();
  }

  private changed() {
    this.hooks.onChange();
    this.render();
  }

  private bind() {
    const r = this.root;
    const meta = this.post.meta;

    r.addEventListener('click', async e => {
      const t = e.target as HTMLElement;
      const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'close') this.hooks.onClose();
      else if (act === 'export') this.hooks.onExport();
      else if (act === 'cover-add' || act === 'cover-replace') await this.pickCover();
      else if (act === 'cover-remove') { meta.cover = null; this.changed(); }
      else if (act === 'slug-reset') { meta.slugLocked = false; this.changed(); }
      const draft = t.closest<HTMLElement>('[data-draft]')?.dataset.draft;
      if (draft) { meta.draft = draft === 'true'; this.changed(); }
      const tag = t.closest<HTMLElement>('[data-remove-tag]')?.dataset.removeTag;
      if (tag) { meta.tags = meta.tags.filter(x => x !== tag); this.changed(); $<HTMLInputElement>('#set-tag', r).focus(); }
    });
    r.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).matches('select')) { e.preventDefault(); this.hooks.onClose(); }
    });

    $<HTMLSelectElement>('#set-category', r).addEventListener('change', e => {
      const v = (e.target as HTMLSelectElement).value;
      meta.category = (v || null) as typeof meta.category;
      meta.sub = '';
      this.changed();
    });

    const slug = $<HTMLInputElement>('#set-slug', r);
    slug.addEventListener('input', () => {
      // lowercase and hyphens as you type; leading/trailing hyphens are trimmed on blur
      const v = slug.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-');
      if (v !== slug.value) { const p = slug.selectionStart; slug.value = v; slug.setSelectionRange(p, p); }
      meta.slug = v;
      meta.slugLocked = true;
      this.hooks.onChange();
      this.renderSlugHint();
    });
    slug.addEventListener('blur', () => {
      const v = slugify(slug.value);
      if (!v) { meta.slugLocked = false; } else meta.slug = v;
      this.changed();
    });

    const excerpt = $<HTMLTextAreaElement>('#set-excerpt', r);
    excerpt.addEventListener('input', () => {
      meta.excerpt = excerpt.value.replace(/\s*\n\s*/g, ' ');
      this.hooks.onChange();
      this.renderCount();
    });

    const tagInput = $<HTMLInputElement>('#set-tag', r);
    const addTags = (raw: string) => {
      const add = raw.split(',').map(tagify).filter(Boolean).filter(t => !meta.tags.includes(t));
      if (add.length) { meta.tags = [...meta.tags, ...new Set(add)]; this.changed(); }
    };
    tagInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTags(tagInput.value); tagInput.value = '';
      } else if (e.key === 'Backspace' && !tagInput.value && meta.tags.length) {
        e.preventDefault();
        meta.tags = meta.tags.slice(0, -1); this.changed();
      }
    });
    tagInput.addEventListener('input', () => {
      if (tagInput.value.includes(',')) { addTags(tagInput.value); tagInput.value = ''; }
    });
    tagInput.addEventListener('blur', () => { if (tagInput.value.trim()) { addTags(tagInput.value); tagInput.value = ''; } });

    $<HTMLSelectElement>('#set-sub', r).addEventListener('change', e => {
      meta.sub = (e.target as HTMLSelectElement).value;
      this.changed();
    });

    $<HTMLInputElement>('#set-date', r).addEventListener('change', e => {
      const v = (e.target as HTMLInputElement).value;
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { meta.date = v; this.changed(); }
    });
  }

  async pickCover() {
    const [file] = await pickFiles(false);
    if (!file) return;
    try {
      const old = this.post.meta.cover;
      if (old) this.images.remove(old);
      const { name } = await this.images.addFile(file, { name: 'cover' });
      this.post.meta.cover = name;
      this.changed();
    } catch (err) {
      toast(err instanceof ImageError ? err.message : 'That cover image didn’t work. Try another file.', 'error', 5000);
    }
  }

  /** Re-renders everything from the post (after changes made here or on the canvas). */
  render() {
    const r = this.root;
    const m = this.post.meta;
    const cat = categoryById(m.category);

    $<HTMLSelectElement>('#set-category', r).value = m.category ?? '';
    const slug = $<HTMLInputElement>('#set-slug', r);
    if (document.activeElement !== slug) slug.value = m.slug;
    this.renderSlugHint();

    const cover = $('.cover', r);
    if (m.cover && this.images.has(m.cover)) {
      cover.className = 'cover cover--set';
      cover.innerHTML = `<img src="${this.images.url(m.cover)}" alt="">
        <div class="cover__actions">
          <button type="button" class="cover__btn" data-act="cover-replace">${icon('upload')}Replace</button>
          <button type="button" class="cover__btn" data-act="cover-remove">Remove</button>
        </div>`;
    } else {
      cover.className = 'cover';
      cover.innerHTML = `<button type="button" class="cover__add" data-act="cover-add">${icon('image')}<span>Add a cover image</span><span class="cover__meta">Saved as cover.jpg · shown at the top of the post and in share previews</span></button>`;
    }

    const excerpt = $<HTMLTextAreaElement>('#set-excerpt', r);
    if (document.activeElement !== excerpt) excerpt.value = m.excerpt;
    this.renderCount();

    $('.tags', r).innerHTML = m.tags.map(t =>
      `<li class="chip">${esc(t)}<button type="button" data-remove-tag="${esc(t)}" aria-label="Remove tag ${esc(t)}">×</button></li>`).join('');

    const sub = $<HTMLSelectElement>('#set-sub', r);
    sub.disabled = !cat;
    sub.innerHTML = cat
      ? `<option value="">Choose a section</option>` + cat.subs.map(s => `<option${s === m.sub ? ' selected' : ''}>${esc(s)}</option>`).join('')
      : `<option value="">Pick a category first</option>`;
    $('#set-sub-hint', r).textContent = cat ? `Where it’s filed inside ${cat.label} on /blog.` : '';

    $<HTMLInputElement>('#set-date', r).value = m.date;
    r.querySelectorAll<HTMLButtonElement>('[data-draft]').forEach(b => b.setAttribute('aria-pressed', String(String(m.draft) === b.dataset.draft)));
    const statusHint = $('.field__hint--status', r);
    statusHint.textContent = !m.draft && m.date > new Date().toISOString().slice(0, 10) ? `Scheduled: it goes live on /blog after ${m.date}, the next time the site is built.` : '';
    statusHint.hidden = !statusHint.textContent;
  }

  private renderSlugHint() {
    const m = this.post.meta;
    const hint = $('#set-slug-hint', this.root);
    const input = $<HTMLInputElement>('#set-slug', this.root);
    let error = '';
    if (m.slug && !SLUG_RE.test(m.slug.replace(/-$/, ''))) error = 'Use lowercase letters, numbers and single hyphens.';
    else if (m.slug && this.hooks.takenSlugs.has(m.slug)) error = 'Another post already uses this slug.';
    input.setAttribute('aria-invalid', String(!!error));
    hint.classList.toggle('field__hint--error', !!error);
    hint.innerHTML = error ? esc(error)
      : m.slugLocked ? `Edited by hand. <button type="button" class="link-btn" data-act="slug-reset">Use the title again</button>`
      : 'Generated from the title. Edit to override.';
  }

  private renderCount() {
    const n = this.post.meta.excerpt.length;
    const c = $('.field__count', this.root);
    c.textContent = `${n} / ${EXCERPT_MAX}`;
    c.classList.toggle('is-near', n >= EXCERPT_MAX - 10);
  }
}
