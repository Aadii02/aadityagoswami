import { CATEGORIES, type PostRecord, readingMinutes } from '../model';
import { $, $$, autoGrow, el, esc, formatNumber, icon, MOD, SHIFT } from '../lib/dom';

export type SaveState =
  | { kind: 'new' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'uploading'; count: number }
  | { kind: 'error'; message: string };

/* Decorative Da Vinci-style construction sketch (screen 01, bottom right). */
const SKETCH = `<svg class="sketch" viewBox="0 0 400 400" fill="none" stroke="var(--copper)" stroke-width="1" aria-hidden="true" focusable="false"><circle cx="200" cy="200" r="170"/><rect x="60" y="60" width="280" height="280"/><path d="M60 60L340 340M340 60L60 340M200 30V370M30 200H370"/><circle cx="200" cy="200" r="99"/><path d="M60 200a140 140 0 0 1 280 0" stroke-dasharray="4 6"/><circle cx="200" cy="200" r="3"/><path d="M120 360c30-20 60-24 80-24s50 4 80 24" stroke-dasharray="2 5"/></svg>`;

export function relativeTime(at: number, now = Date.now()): string {
  const s = Math.round((now - at) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/**
 * The editor screen's chrome. It owns the DOM and the post's meta fields that live on the canvas
 * (title, subtitle, category); the TipTap body mounts into `bodyHost`.
 */
export class EditorScreen {
  readonly root: HTMLElement;
  readonly bodyHost: HTMLElement;
  readonly canvasScroll: HTMLElement;
  private title: HTMLTextAreaElement;
  private subtitle: HTMLTextAreaElement;
  private saveState: SaveState = { kind: 'new' };
  private ticker = 0;

  /** called after any meta change made from the canvas or top bar */
  onMetaChange: () => void = () => {};
  /** Enter / ↓ at the end of the subtitle moves into the body */
  onFocusBody: () => void = () => {};
  onAction: (action: string) => void = () => {};

  constructor(private post: PostRecord) {
    this.root = el(`
      <div class="editor-screen is-empty">
        <header class="topbar">
          <a class="topbar__back" href="#/">${icon('chevron-left')}<span>Drafts</span></a>
          <span class="topbar__rule" aria-hidden="true"></span>
          <div class="topbar__cats">
            <span class="label" id="cat-label">Category</span>
            <div class="pills" role="group" aria-labelledby="cat-label">
              ${CATEGORIES.map(c => `<button type="button" class="pill" data-cat="${c.id}" aria-pressed="false">${esc(c.label)}</button>`).join('')}
            </div>
            <span class="cat-hint" role="alert" hidden>Pick a category to publish</span>
          </div>
          <div class="topbar__spacer"></div>
          <span class="topbar__stats" aria-live="off"></span>
          <span class="save-status" role="status"></span>
          <div class="topbar__tools">
            <button type="button" class="icon-btn" data-action="preview" aria-label="Preview (${MOD} ${SHIFT} P)" title="Preview (${MOD} ${SHIFT} P)">${icon('eye')}</button>
            <button type="button" class="icon-btn" data-action="focus" aria-label="Focus mode (${MOD} .)" title="Focus mode (${MOD} .)">${icon('focus')}</button>
            <button type="button" class="icon-btn" data-action="settings" aria-label="Post settings (${MOD} \\)" title="Post settings (${MOD} \\)" aria-expanded="false" aria-controls="settings">${icon('sidebar')}</button>
          </div>
          <button type="button" class="btn btn--primary btn--publish" data-action="publish">Publish</button>
        </header>
        <div class="workspace">
          <main class="canvas-scroll" id="main">
            <div class="canvas-frame">
            <div class="canvas">
              <button type="button" class="cover-btn" data-action="cover">${icon('image')}Add cover image</button>
              <textarea class="title-input" rows="1" aria-label="Post title" placeholder="Title" spellcheck="true"></textarea>
              <textarea class="subtitle-input" rows="1" aria-label="Subtitle (optional)" placeholder="Add a subtitle — optional"></textarea>
              <div class="canvas__rule" aria-hidden="true"></div>
              <div class="body-host"></div>
            </div>
            </div>
          </main>
        </div>
        <div class="hints" aria-hidden="true">
          <span><kbd>/</kbd>blocks</span>
          <span><kbd>#</kbd>heading</span>
          <span><kbd>&gt;</kbd>quote</span>
          <span><kbd>\`\`\`</kbd>code</span>
          <span><kbd>${MOD} .</kbd>focus</span>
          <span><kbd>${MOD} ${SHIFT} P</kbd>preview</span>
        </div>
        ${SKETCH}
        <div class="focus-hint" aria-hidden="true"><kbd>esc</kbd>exit focus<span class="focus-hint__dot">·</span><span class="focus-hint__words"></span></div>
        <p class="sr-only focus-announce" role="status"></p>
      </div>`);

    this.bodyHost = $('.body-host', this.root);
    this.canvasScroll = $('.canvas-scroll', this.root);
    this.title = $('.title-input', this.root);
    this.subtitle = $('.subtitle-input', this.root);

    this.title.value = post.meta.title;
    this.subtitle.value = post.meta.subtitle;
    this.bindCanvasFields();
    this.bindTopbar();
    this.renderCategory();
    this.setWords(post.words);
    this.setSaveState(post.updatedAt > post.createdAt ? { kind: 'saved', at: post.updatedAt } : { kind: 'new' });
    this.ticker = window.setInterval(() => this.renderSaveState(), 30_000);
  }

  mount(host: HTMLElement) {
    host.replaceChildren(this.root);
    requestAnimationFrame(() => { autoGrow(this.title); autoGrow(this.subtitle); });
  }

  destroy() {
    clearInterval(this.ticker);
    this.root.remove();
  }

  focusTitle() { this.title.focus(); }

  private bindCanvasFields() {
    const { title, subtitle } = this;
    title.addEventListener('input', () => {
      // titles are one line: pasted newlines become spaces
      if (title.value.includes('\n')) title.value = title.value.replace(/\s*\n\s*/g, ' ');
      this.post.meta.title = title.value;
      autoGrow(title);
      this.onMetaChange();
    });
    subtitle.addEventListener('input', () => {
      if (subtitle.value.includes('\n')) subtitle.value = subtitle.value.replace(/\s*\n\s*/g, ' ');
      this.post.meta.subtitle = subtitle.value;
      autoGrow(subtitle);
      this.onMetaChange();
    });
    title.addEventListener('keydown', e => {
      if (e.key === 'Enter' || (e.key === 'ArrowDown' && title.selectionStart === title.value.length)) {
        e.preventDefault(); subtitle.focus(); subtitle.setSelectionRange(0, 0);
      }
    });
    subtitle.addEventListener('keydown', e => {
      if (e.key === 'Enter' || (e.key === 'ArrowDown' && subtitle.selectionStart === subtitle.value.length)) {
        e.preventDefault(); this.onFocusBody();
      } else if ((e.key === 'ArrowUp' && subtitle.selectionStart === 0) || (e.key === 'Backspace' && !subtitle.value)) {
        e.preventDefault(); title.focus(); title.setSelectionRange(title.value.length, title.value.length);
      }
    });
    window.addEventListener('resize', () => { autoGrow(title); autoGrow(subtitle); });
  }

  private bindTopbar() {
    this.root.addEventListener('click', e => {
      const target = e.target as HTMLElement;
      const pill = target.closest<HTMLButtonElement>('.pill[data-cat]');
      if (pill) {
        const id = pill.dataset.cat as PostRecord['meta']['category'];
        const meta = this.post.meta;
        if (meta.category !== id) { meta.category = id; meta.sub = ''; }
        this.renderCategory();
        this.onMetaChange();
        return;
      }
      const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action) this.onAction(action);
    });
  }

  /** Called when the post's meta changes elsewhere (e.g. the settings sidebar). */
  syncFromMeta() {
    if (this.title.value !== this.post.meta.title) { this.title.value = this.post.meta.title; autoGrow(this.title); }
    if (this.subtitle.value !== this.post.meta.subtitle) { this.subtitle.value = this.post.meta.subtitle; autoGrow(this.subtitle); }
    this.renderCategory();
  }

  renderCategory() {
    const cat = this.post.meta.category;
    for (const p of $$<HTMLButtonElement>('.pill[data-cat]', this.root)) p.setAttribute('aria-pressed', String(p.dataset.cat === cat));
    // the "Category" label only shows until one is picked (screens 01 vs 02)
    $('#cat-label', this.root).classList.toggle('sr-only', !!cat);
    if (cat) $('.cat-hint', this.root).hidden = true;
  }

  readonly workspace = () => $('.workspace', this.root);

  setSidebarOpen(open: boolean) {
    this.root.classList.toggle('has-sidebar', open);
    const btn = $<HTMLButtonElement>('[data-action="settings"]', this.root);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} post settings (${MOD} \\)`);
  }

  /** The canvas shows "Add cover image", or a small thumbnail once a cover is set. */
  renderCover(url: string | null) {
    const slot = $('.cover-btn, .cover-thumb', this.root);
    const next = url
      ? el(`<button type="button" class="cover-thumb" data-action="cover"><img src="${esc(url)}" alt="">Change cover image</button>`)
      : el(`<button type="button" class="cover-btn" data-action="cover">${icon('image')}Add cover image</button>`);
    slot.replaceWith(next);
  }

  /** Publish with no category: shake the pills and show a hint. */
  flagMissingCategory() {
    const pills = $('.pills', this.root);
    pills.classList.remove('is-shaking');
    void pills.offsetWidth;
    pills.classList.add('is-shaking');
    $('.cat-hint', this.root).hidden = false;
    (pills.querySelector('.pill') as HTMLButtonElement | null)?.focus();
  }

  /** Focus mode (screen 06): no chrome, other blocks dimmed, a hint that fades after 3 s idle. */
  setFocusMode(on: boolean) {
    this.root.classList.toggle('focus-mode', on);
    $('.focus-announce', this.root).textContent = on ? `Focus mode on. Press Escape or ${MOD} . to leave it.` : 'Focus mode off.';
    if (on) this.pokeFocusHint(); else clearTimeout(this.hintTimer);
  }

  private hintTimer = 0;
  /** Shows the focus hint again; it fades after 3 s without mouse movement. */
  pokeFocusHint() {
    const hint = $('.focus-hint', this.root);
    hint.classList.add('is-visible');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => hint.classList.remove('is-visible'), 3000);
  }

  setWords(words: number) {
    $('.focus-hint__words', this.root).textContent = `${formatNumber(words)} word${words === 1 ? '' : 's'}`;
    $('.topbar__stats', this.root).textContent =
      `${formatNumber(words)} words · ${words ? readingMinutes(words) : 0} min read`;
  }

  /** Empty post: show the shortcut hints and the sketch; disable Publish. */
  setEmpty(empty: boolean) {
    this.root.classList.toggle('is-empty', empty);
    $<HTMLButtonElement>('.btn--publish', this.root).disabled = empty && !this.post.meta.title.trim();
  }

  setSaveState(s: SaveState) {
    this.saveState = s;
    this.renderSaveState();
  }

  /** "Uploading N images…" takes over the status while images are processed, then the save state returns. */
  setUploading(count: number) {
    this.uploading = count;
    this.renderSaveState();
  }
  private uploading = 0;

  private renderSaveState() {
    const s: SaveState = this.uploading ? { kind: 'uploading', count: this.uploading } : this.saveState;
    const node = $('.save-status', this.root);
    const text = (t: string) => `<span class="save-status__text">${esc(t)}</span>`;
    switch (s.kind) {
      case 'new': node.innerHTML = `<span class="save-status__dot" aria-hidden="true"></span>${text('New draft · not saved yet')}`; break;
      case 'saving': node.innerHTML = `${icon('spinner', 'icon--spin')}${text('Saving…')}`; break;
      case 'saved': node.innerHTML = `${icon('check')}${text(`Saved · ${relativeTime(s.at)}`)}`; break;
      case 'uploading': node.innerHTML = `${icon('spinner', 'icon--spin')}${text(`Uploading ${s.count} image${s.count === 1 ? '' : 's'}…`)}`; break;
      case 'error': node.innerHTML = text(s.message); break;
    }
  }
}
