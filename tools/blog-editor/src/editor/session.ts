import type { Editor } from '@tiptap/core';
import { slugify, type PostRecord } from '../model';
import { EditorScreen } from './screen';
import { createBody, countWords, focusBodyStart } from './body';
import { imageExtensions, referencedImages } from './image';
import { ImageStore } from '../images/store';
import { savePost, uniqueSlug } from '../store/db';
import { modKey, toast } from '../lib/dom';
import { SettingsSidebar } from './sidebar';
import { PreviewView, renderPreviewHtml } from './preview';
import { ExportModal } from './export-modal';
import { buildExport } from '../markdown/export';

const SAVE_DELAY = 800;
/** "Saving…" stays up at least this long so it can be read. */
const MIN_SAVING_MS = 350;

export interface SessionOptions {
  /** true when the post isn't in IndexedDB yet (nothing is written until the first edit) */
  isNew: boolean;
  /** slugs used by other posts, for keeping this one unique */
  takenSlugs: Set<string>;
}

/** One open post: the screen chrome, the TipTap body, the post's images and autosave. */
export class EditorSession {
  readonly screen: EditorScreen;
  readonly editor: Editor;
  readonly images: ImageStore;
  readonly sidebar: SettingsSidebar;
  readonly preview: PreviewView;
  readonly exporter: ExportModal;
  private timer = 0;
  private dirty = false;
  private saving: Promise<void> | null = null;
  private stored: boolean;
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);
  private readonly onHide = () => { if (document.visibilityState === 'hidden') void this.flush(); };

  /** hook for the router and the later panels (settings, preview, export, focus) */
  onAction: (action: string) => void = () => {};

  constructor(readonly post: PostRecord, host: HTMLElement, private opts: SessionOptions) {
    this.stored = !opts.isNew;
    this.images = new ImageStore(post.images);
    this.screen = new EditorScreen(post);
    this.screen.mount(host);

    this.editor = createBody({
      host: this.screen.bodyHost,
      doc: post.doc,
      extensions: imageExtensions(this.images),
      onChange: e => {
        post.doc = e.getJSON();
        post.words = countWords(e);
        this.screen.setWords(post.words);
        this.refreshEmpty();
        this.markDirty();
      },
    });
    post.words = countWords(this.editor);
    this.screen.setWords(post.words);
    this.sidebar = new SettingsSidebar(post, this.images, {
      takenSlugs: opts.takenSlugs,
      onChange: () => this.metaChanged(),
      onClose: () => this.toggleSettings(false),
      onExport: () => this.action('export'),
    });
    this.screen.workspace().append(this.sidebar.root);
    this.renderCover();

    this.preview = new PreviewView();
    this.preview.onBack = () => this.togglePreview(false);
    this.preview.onPublish = () => { this.togglePreview(false); this.publish(); };
    this.screen.root.append(this.preview.root);

    this.exporter = new ExportModal(() => buildExport(this.post, this.editor.getJSON(), this.images));
    this.screen.root.append(this.exporter.root);

    this.screen.onFocusBody = () => focusBodyStart(this.editor);
    this.screen.onMetaChange = () => this.metaChanged();
    this.screen.onAction = a => this.action(a);
    this.images.onBusyChange = n => this.screen.setUploading(n);
    this.images.onChange = () => this.markDirty();
    this.refreshEmpty();
    this.bindCanvasDrop();
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keydown', this.onFocusKey);
    window.addEventListener('mousemove', this.onFocusMove, { passive: true });
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('pagehide', this.onHide);
  }

  /** After any meta edit: keep the slug following the title (until edited by hand), then save. */
  metaChanged() {
    const m = this.post.meta;
    if (!m.slugLocked) m.slug = uniqueSlug(slugify(m.title), this.opts.takenSlugs);
    document.title = `${m.title.trim() || 'New post'} — Blog studio`;
    this.screen.syncFromMeta();
    if (this.sidebar.open) this.sidebar.render();
    this.renderCover();
    this.refreshEmpty();
    this.markDirty();
  }

  private renderCover() {
    const c = this.post.meta.cover;
    const url = c && this.images.has(c) ? this.images.url(c) : null;
    if (url !== this.coverUrl) { this.coverUrl = url; this.screen.renderCover(url); }
  }
  private coverUrl: string | null | undefined = undefined;

  toggleSettings(open = !this.sidebar.open) {
    if (open === this.sidebar.open) return;
    const opener = this.screen.root.querySelector<HTMLElement>('[data-action="settings"]');
    if (open) this.sidebar.show(opener); else this.sidebar.hide();
    this.screen.setSidebarOpen(open);
  }

  /** Publish: needs a title and a category; marks the post published and opens the export. */
  publish() {
    const m = this.post.meta;
    if (!m.category) { this.screen.flagMissingCategory(); return; }
    if (!m.title.trim()) { toast('Give the post a title before publishing.', 'error'); this.screen.focusTitle(); return; }
    if (m.draft) { m.draft = false; this.metaChanged(); }
    void this.flush();
    this.action('export');
  }

  get takenSlugs() { return this.opts.takenSlugs; }

  private refreshEmpty() {
    this.screen.setEmpty(this.editor.isEmpty && !this.post.meta.title.trim());
  }

  /* ---------------- autosave ---------------- */

  markDirty() {
    this.dirty = true;
    this.post.updatedAt = Date.now();
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.save(), SAVE_DELAY);
  }

  /** Writes the post now if anything changed (⌘S, leaving the editor, hiding the tab). */
  async flush() {
    clearTimeout(this.timer);
    if (this.saving) await this.saving;
    if (this.dirty) await this.save();
  }

  private async save() {
    if (this.saving) { await this.saving; if (!this.dirty) return; }
    this.dirty = false;
    // a brand-new post with nothing in it isn't worth a record yet
    if (!this.stored && this.editor.isEmpty && !this.post.meta.title.trim() && !this.post.meta.cover) return;
    this.screen.setSaveState({ kind: 'saving' });
    const started = Date.now();
    this.saving = (async () => {
      try {
        this.post.status = this.post.meta.draft ? 'draft' : 'published';
        await savePost(this.post);
        this.stored = true;
        await new Promise(r => setTimeout(r, Math.max(0, MIN_SAVING_MS - (Date.now() - started))));
        this.screen.setSaveState({ kind: 'saved', at: Date.now() });
      } catch (err) {
        console.error(err);
        this.dirty = true;
        this.screen.setSaveState({ kind: 'error', message: 'Couldn’t save. Your browser storage may be full.' });
        toast('Couldn’t save this draft. Export it now so nothing is lost.', 'error', 6000);
      } finally {
        this.saving = null;
      }
    })();
    await this.saving;
  }

  /* ---------------- shortcuts ---------------- */

  private handleKey(e: KeyboardEvent) {
    if (!modKey(e) || e.defaultPrevented) return;
    const k = e.key.toLowerCase();
    let action: string | null = null;
    if (k === 's' && !e.shiftKey && !e.altKey) action = 'save';
    else if (k === '.' && !e.shiftKey) action = 'focus';
    else if (k === 'p' && e.shiftKey) action = 'preview';
    else if ((k === '\\' || e.code === 'Backslash') && !e.shiftKey) action = 'settings';
    else if (k === 'e' && e.shiftKey) action = 'export';
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    this.action(action);
  }

  /** ⌘. — everything but the text goes away; Esc or ⌘. brings it back. */
  toggleFocus(on = !this.focusing) {
    if (on === this.focusing) return;
    this.focusing = on;
    if (on) this.toggleSettings(false);
    this.screen.setFocusMode(on);
    if (on && !this.screen.root.contains(document.activeElement)) this.editor.view.focus();
  }
  private focusing = false;
  // Esc listens in the bubble phase, after the slash menu, toolbars and dialogs have had their turn
  private readonly onFocusKey = (e: KeyboardEvent) => {
    if (this.focusing && e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); this.toggleFocus(false); }
  };
  private readonly onFocusMove = () => { if (this.focusing) this.screen.pokeFocusHint(); };

  /** ⌘⇧P: the post rendered with the live blog's template and CSS. */
  togglePreview(open = !this.preview.open) {
    if (!open) { this.preview.hide(); return; }
    this.preview.show(renderPreviewHtml(this.post, this.editor.getJSON(), this.images), `/blog/posts/${this.post.meta.slug || 'untitled'}.html`);
  }

  action(a: string) {
    // while previewing, the editor's own shortcuts are off; ⌘⇧P / Esc go back
    if (this.preview.open && a !== 'preview' && a !== 'publish' && a !== 'save') return;
    // likewise inside the export dialog
    if (this.exporter?.open && a !== 'save') return;
    switch (a) {
      case 'save': this.dirty = true; void this.flush(); return;
      case 'focus': this.toggleFocus(); return;
      case 'preview': this.toggleFocus(false); this.togglePreview(); return;
      case 'export': if (this.preview.open) this.togglePreview(false); void this.flush(); this.exporter.show(); return;
      case 'settings': this.toggleSettings(); return;
      case 'cover': void this.sidebar.pickCover(); return;
      case 'publish': this.publish(); return;
      default: this.onAction(a);
    }
  }

  /* ---------------- drop anywhere ---------------- */

  /** Files dropped anywhere on the canvas (not just on the text) become image blocks at the nearest spot. */
  private bindCanvasDrop() {
    const area = this.screen.canvasScroll;
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    area.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
    area.addEventListener('drop', e => {
      if (!hasFiles(e) || e.defaultPrevented) return;
      if (this.editor.view.dom.contains(e.target as Node)) return; // the editor's own drop handler runs
      e.preventDefault();
      const view = this.editor.view;
      const box = view.dom.getBoundingClientRect();
      // clamp into the text column, so a drop in the margin lands on the line beside it
      const hit = view.posAtCoords({
        left: Math.min(Math.max(e.clientX, box.left + 1), box.right - 1),
        top: Math.min(Math.max(e.clientY, box.top + 1), box.bottom - 1),
      });
      const files = [...(e.dataTransfer?.files ?? [])];
      const pos = e.clientY < box.top ? 0 : hit?.pos ?? view.state.doc.content.size;
      this.editor.commands.insertImageFiles(files, pos);
    });
  }

  /** Image file names still in use: body images plus the cover. */
  referenced(): Set<string> {
    const names = new Set(referencedImages(this.editor.state.doc));
    if (this.post.meta.cover) names.add(this.post.meta.cover);
    return names;
  }

  async destroy() {
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keydown', this.onFocusKey);
    window.removeEventListener('mousemove', this.onFocusMove);
    document.removeEventListener('visibilitychange', this.onHide);
    window.removeEventListener('pagehide', this.onHide);
    // undo history ends here, so images nothing refers to any more can go
    this.images.collect(this.referenced());
    await this.flush();
    this.editor.destroy();
    this.images.destroy();
    this.screen.destroy();
  }
}
