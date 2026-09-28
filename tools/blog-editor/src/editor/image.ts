import { Extension, Node, type Editor, type NodeViewRendererProps } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView, NodeView } from '@tiptap/pm/view';
import type { ImageSize } from '../model';
import { ImageStore } from '../images/store';
import { ACCEPT, ImageError, isAcceptedImage, probeUrl } from '../images/process';
import { el, icon, prefersReducedMotion, toast } from '../lib/dom';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blogImage: {
      /** Processes files and inserts one image block per file at `pos` (or the selection). */
      insertImageFiles: (files: File[], pos?: number) => ReturnType;
    };
  }
}

const int = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);
const isHttp = (s: string) => /^https?:\/\//i.test(s);

/** Opens the system file picker. */
export function pickFiles(multiple = true): Promise<File[]> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.multiple = multiple;
    input.addEventListener('change', () => resolve([...(input.files ?? [])]));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

function reportError(err: unknown) {
  toast(err instanceof ImageError ? err.message : 'Something went wrong with that image. Try another file.', 'error', 5000);
  if (!(err instanceof ImageError)) console.error(err);
}

let pendingSeq = 0;

/** Finds the pending upload placeholder with this id. */
function findPending(editor: Editor, id: string): number | null {
  let found: number | null = null;
  editor.state.doc.descendants((n, pos) => {
    if (found !== null) return false;
    if (n.type.name === 'imageUpload' && n.attrs.pending === id) found = pos;
    return true;
  });
  return found;
}

/* ============================== image ============================== */

export const BlogImage = Node.create<{ store: ImageStore | null }>({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() { return { store: null }; },

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      caption: { default: '' },
      width: { default: null },
      height: { default: null },
      size: { default: 'normal' as ImageSize },
      gif: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure',
        getAttrs: node => {
          const img = (node as HTMLElement).querySelector('img');
          const src = img?.getAttribute('src');
          if (!img || !src || src.startsWith('data:')) return false;
          const cls = (node as HTMLElement).className;
          return {
            src, alt: img.getAttribute('alt') ?? '',
            caption: (node as HTMLElement).querySelector('figcaption')?.textContent?.trim() ?? '',
            width: int(img.getAttribute('width')), height: int(img.getAttribute('height')),
            size: /\bimg--wide\b/.test(cls) ? 'wide' : /\bimg--full\b/.test(cls) ? 'full' : 'normal',
            gif: /\.gif(\?|#|$)/i.test(src),
          };
        },
      },
      {
        // pasted images from other pages: only real web URLs (never inline base64)
        tag: 'img[src]',
        getAttrs: node => {
          const img = node as HTMLImageElement;
          const src = img.getAttribute('src') ?? '';
          if (!isHttp(src)) return false;
          return { src, alt: img.getAttribute('alt') ?? '', width: int(img.getAttribute('width')), height: int(img.getAttribute('height')), gif: /\.gif(\?|#|$)/i.test(src) };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { src, alt, width, height, size, caption } = node.attrs;
    return ['figure', { class: `img img--${size}` },
      ['img', { src, alt, width, height, loading: 'lazy' }],
      ...(caption ? [['figcaption', caption]] : [])];
  },

  addNodeView() {
    return props => new ImageView(props, this.options.store!);
  },

  addKeyboardShortcuts() {
    const figureOf = (editor: Editor) => {
      const sel = editor.state.selection;
      if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'image') return null;
      return editor.view.nodeDOM(sel.from) as HTMLElement | null;
    };
    return {
      // Tab on a selected image moves into its toolbar; Enter goes to the caption
      Tab: ({ editor }) => {
        const fig = figureOf(editor);
        fig?.querySelector<HTMLButtonElement>('.figure__toolbar button')?.focus();
        return !!fig;
      },
      Enter: ({ editor }) => {
        const fig = figureOf(editor);
        fig?.querySelector<HTMLInputElement>('.figure__caption')?.focus();
        return !!fig;
      },
    };
  },
});

class ImageView implements NodeView {
  dom: HTMLElement;
  private img: HTMLImageElement;
  private caption: HTMLInputElement;
  private alt: HTMLInputElement;
  private toolbar: HTMLElement;
  private paused = false;

  constructor(private props: NodeViewRendererProps, private store: ImageStore) {
    this.dom = el(`
      <figure class="figure">
        <div class="figure__toolbar" role="toolbar" aria-label="Image options">
          <button type="button" data-size="normal" aria-label="Normal width" aria-pressed="false">${icon('width-normal')}</button>
          <button type="button" data-size="wide" aria-label="Wide" aria-pressed="false">${icon('width-wide')}</button>
          <button type="button" data-size="full" aria-label="Full bleed" aria-pressed="false">${icon('width-full')}</button>
          <span class="figure__sep" aria-hidden="true"></span>
          <button type="button" class="figure__text-btn" data-act="alt">Alt text<span class="figure__dot" aria-hidden="true"></span><span class="sr-only figure__alt-missing"> (missing)</span></button>
          <button type="button" class="figure__text-btn" data-act="replace">Replace</button>
          <button type="button" class="figure__delete" data-act="delete" aria-label="Delete image">${icon('trash')}</button>
        </div>
        <div class="figure__frame" data-drag-handle>
          <img alt="" draggable="false">
          <span class="figure__badge" aria-hidden="true">GIF</span>
          <button type="button" class="figure__play" aria-label="Pause animation">${icon('pause')}</button>
        </div>
        <input class="figure__caption" type="text" placeholder="Add a caption…" aria-label="Caption">
        <div class="figure__alt">
          <label>Alt</label>
          <input type="text" placeholder="Describe the image for people who can’t see it">
        </div>
      </figure>`);
    this.img = this.dom.querySelector('img')!;
    this.caption = this.dom.querySelector('.figure__caption')!;
    this.alt = this.dom.querySelector('.figure__alt input')!;
    this.toolbar = this.dom.querySelector('.figure__toolbar')!;
    const altId = `alt-${Math.random().toString(36).slice(2, 8)}`;
    this.alt.id = altId;
    this.dom.querySelector('.figure__alt label')!.setAttribute('for', altId);

    this.paused = props.node.attrs.gif && prefersReducedMotion();
    this.render(props.node);
    this.bind();
  }

  private get node(): PMNode { return this.props.node as PMNode; }
  private pos(): number | undefined {
    return typeof this.props.getPos === 'function' ? this.props.getPos() : undefined;
  }

  private setAttrs(attrs: Record<string, unknown>) {
    const pos = this.pos();
    if (pos == null) return;
    const { view } = this.props.editor;
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...attrs }));
  }

  private bind() {
    const editor = this.props.editor;

    this.toolbar.addEventListener('mousedown', e => e.preventDefault());
    this.toolbar.addEventListener('click', async e => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b) return;
      if (b.dataset.size) { this.setAttrs({ size: b.dataset.size }); this.reselect(); return; }
      switch (b.dataset.act) {
        case 'alt': this.alt.focus(); break;
        case 'replace': {
          const [file] = await pickFiles(false);
          if (!file) return;
          try {
            const { name, image } = await this.store.addFile(file);
            this.setAttrs({ src: name, width: image.width, height: image.height, gif: image.gif });
            this.reselect();
          } catch (err) { reportError(err); }
          break;
        }
        case 'delete': {
          const pos = this.pos();
          if (pos != null) editor.chain().focus().deleteRange({ from: pos, to: pos + this.node.nodeSize }).run();
          break;
        }
      }
    });
    this.toolbar.addEventListener('keydown', e => {
      const btns = [...this.toolbar.querySelectorAll('button')];
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length].focus();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        e.preventDefault(); this.reselect();
      }
    });

    this.dom.querySelector('.figure__play')!.addEventListener('click', () => { this.paused = !this.paused; this.renderPlayback(); });

    this.caption.addEventListener('input', () => this.setAttrs({ caption: this.caption.value }));
    this.alt.addEventListener('input', () => this.setAttrs({ alt: this.alt.value }));
    for (const input of [this.caption, this.alt]) {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          if (e.key === 'Enter' && input === this.caption) this.caretAfter(); else this.reselect();
        }
      });
      input.addEventListener('focus', () => this.dom.classList.add('is-editing'));
      input.addEventListener('blur', () => this.dom.classList.remove('is-editing'));
    }
  }

  /** Back to the editor with this image selected. */
  private reselect() {
    const pos = this.pos();
    if (pos == null) return;
    const { view } = this.props.editor;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.focus();
  }

  /** Enter in the caption: continue writing in a paragraph after the image. */
  private caretAfter() {
    const pos = this.pos();
    if (pos == null) return;
    const after = pos + this.node.nodeSize;
    const next = this.props.editor.state.doc.nodeAt(after);
    const chain = this.props.editor.chain();
    if (!next || next.type.name !== 'paragraph' || next.content.size) chain.insertContentAt(after, { type: 'paragraph' });
    chain.setTextSelection(after + 1).run();
    this.props.editor.view.focus();
  }

  private render(node: PMNode) {
    const { src, alt, caption, width, height, size, gif } = node.attrs;
    this.dom.className = `figure figure--${size}${gif ? ' is-gif' : ''}${alt ? '' : ' no-alt'}`;
    if (width && height) {
      this.img.width = width; this.img.height = height;
      this.img.style.aspectRatio = `${width} / ${height}`;
    }
    this.img.alt = alt;
    this.dom.dataset.src = src;
    this.renderPlayback();
    for (const b of this.toolbar.querySelectorAll<HTMLButtonElement>('[data-size]')) b.setAttribute('aria-pressed', String(b.dataset.size === size));
    if (document.activeElement !== this.caption && this.caption.value !== caption) this.caption.value = caption;
    if (document.activeElement !== this.alt && this.alt.value !== alt) this.alt.value = alt;
    this.dom.querySelector('.figure__alt-missing')!.toggleAttribute('hidden', !!alt);
    // external GIFs can't be frozen (the canvas would be tainted), so they have no pause button
    this.dom.querySelector<HTMLElement>('.figure__play')!.hidden = !(gif && this.store.has(src));
    this.dom.querySelector<HTMLElement>('.figure__badge')!.hidden = !gif;
  }

  private async renderPlayback() {
    const { src, gif } = this.node.attrs;
    const btn = this.dom.querySelector<HTMLButtonElement>('.figure__play')!;
    btn.innerHTML = icon(this.paused ? 'play' : 'pause');
    btn.setAttribute('aria-label', this.paused ? 'Play animation' : 'Pause animation');
    const live = this.store.url(src);
    if (gif && this.paused) {
      const still = await this.store.still(src);
      if (this.paused) this.img.src = still ?? live;
    } else if (this.img.getAttribute('src') !== live) {
      this.img.src = live;
    }
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    const srcChanged = node.attrs.src !== this.node.attrs.src;
    this.props = { ...this.props, node } as NodeViewRendererProps;
    if (srcChanged) this.paused = node.attrs.gif && prefersReducedMotion();
    this.render(node);
    return true;
  }

  selectNode() { this.dom.classList.add('is-selected'); }
  deselectNode() { this.dom.classList.remove('is-selected'); }

  // the toolbar, caption and alt field handle their own events
  stopEvent(e: Event) {
    const t = e.target as HTMLElement;
    if (t.closest('.figure__frame') && !t.closest('button')) return false;
    return !!t.closest('input, button, .figure__toolbar');
  }
  ignoreMutation() { return true; }
}

/* ============================== upload placeholder (screen 08) ============================== */

export const ImageUpload = Node.create<{ store: ImageStore | null }>({
  name: 'imageUpload',
  group: 'block',
  atom: true,
  selectable: true,
  addOptions() { return { store: null }; },
  addAttributes() { return { pending: { default: null, rendered: false } }; },
  // never exported or pasted: it only exists while choosing a file
  parseHTML() { return []; },
  renderHTML() { return ['div']; },
  addNodeView() { return props => new UploadView(props); },
  addKeyboardShortcuts() {
    // Enter or Tab on a selected upload block moves into it
    const enter = ({ editor }: { editor: Editor }) => {
      const sel = editor.state.selection;
      if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'imageUpload') return false;
      return focusUploadBlock(editor, sel.from);
    };
    return { Enter: enter, Tab: enter };
  },
});

/** Puts keyboard focus on the upload block's "browse files" (or its URL field). The view updates synchronously. */
export function focusUploadBlock(editor: Editor, pos: number): boolean {
  const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
  const target = dom?.querySelector<HTMLElement>('.upload__browse, .upload input');
  target?.focus();
  return !!target;
}

class UploadView implements NodeView {
  dom: HTMLElement;
  private tab: 'upload' | 'url' = 'upload';

  constructor(private props: NodeViewRendererProps) {
    this.dom = el(`<div class="upload" contenteditable="false"></div>`);
    this.render();
    this.dom.addEventListener('click', e => this.onClick(e));
    this.dom.addEventListener('dragover', e => { e.preventDefault(); this.dom.classList.add('is-over'); });
    this.dom.addEventListener('dragleave', () => this.dom.classList.remove('is-over'));
    this.dom.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      this.dom.classList.remove('is-over');
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) this.replaceWithFiles(files);
    });
    this.dom.addEventListener('keydown', e => this.onKeyDown(e));
  }

  private get pending() { return this.props.node.attrs.pending as string | null; }
  private pos() { return typeof this.props.getPos === 'function' ? this.props.getPos() : undefined; }

  private render() {
    if (this.pending) {
      this.dom.innerHTML = `<div class="upload__body upload__body--busy" role="status">${icon('spinner', 'icon--spin')}<span>Processing image…</span></div>`;
      return;
    }
    const upload = this.tab === 'upload';
    this.dom.innerHTML = `
      <div class="upload__tabs" role="tablist" aria-label="Image source">
        <button type="button" role="tab" data-tab="upload" aria-selected="${upload}" tabindex="${upload ? 0 : -1}">Upload</button>
        <button type="button" role="tab" data-tab="url" aria-selected="${!upload}" tabindex="${upload ? -1 : 0}">Embed from URL</button>
        <button type="button" class="upload__close" data-act="remove" aria-label="Remove image block">${icon('close')}</button>
      </div>
      ${upload ? `
      <div class="upload__body" role="tabpanel">
        ${icon('upload', 'upload__icon')}
        <span class="upload__lead">Drop an image or GIF, paste from clipboard, or <button type="button" class="upload__browse" data-act="browse">browse files</button></span>
        <span class="upload__meta">JPG · PNG · WebP · GIF · SVG — up to 10 MB. GIFs keep their animation.</span>
      </div>` : `
      <form class="upload__body upload__body--url" role="tabpanel">
        <div class="upload__url-row">
          <label class="sr-only" for="embed-url">Image URL</label>
          <input id="embed-url" type="url" placeholder="https://…/image.jpg" autocomplete="off" required>
          <button type="submit" class="btn btn--primary">Embed</button>
        </div>
        <span class="upload__meta upload__warn">Hot-linked images live on someone else’s server and can disappear. Upload a copy when you can.</span>
      </form>`}`;
    this.dom.querySelector('form')?.addEventListener('submit', e => { e.preventDefault(); this.embed(); });
  }

  private async onClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLElement>('[data-tab]')?.dataset.tab as 'upload' | 'url' | undefined;
    if (tab && tab !== this.tab) {
      this.tab = tab; this.render();
      (this.dom.querySelector(tab === 'url' ? 'input' : '[data-tab="upload"]') as HTMLElement | null)?.focus();
      return;
    }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'browse') {
      const files = await pickFiles();
      if (files.length) this.replaceWithFiles(files);
    } else if (act === 'remove') {
      this.remove();
    }
  }

  private onKeyDown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.getAttribute('role') === 'tab' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      this.tab = this.tab === 'upload' ? 'url' : 'upload';
      this.render();
      this.dom.querySelector<HTMLElement>(`[data-tab="${this.tab}"]`)?.focus();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      e.preventDefault(); this.remove();
    }
  }

  private remove() {
    const pos = this.pos();
    if (pos == null) return;
    this.props.editor.chain().focus().deleteRange({ from: pos, to: pos + this.props.node.nodeSize }).run();
  }

  private replaceWithFiles(files: File[]) {
    const pos = this.pos();
    if (pos == null) return;
    this.props.editor.chain()
      .deleteRange({ from: pos, to: pos + this.props.node.nodeSize })
      .insertImageFiles(files, pos)
      .run();
  }

  private async embed() {
    const input = this.dom.querySelector('input')!;
    const url = input.value.trim();
    if (!isHttp(url)) { toast('Use a full web address that starts with https://', 'error'); return; }
    try {
      const { width, height, gif } = await probeUrl(url);
      const pos = this.pos();
      if (pos == null) return;
      this.props.editor.chain().focus()
        .insertContentAt({ from: pos, to: pos + this.props.node.nodeSize }, { type: 'image', attrs: { src: url, width, height, gif } })
        .setNodeSelection(pos)
        .run();
    } catch (err) { reportError(err); }
  }

  update(node: PMNode) {
    if (node.type !== this.props.node.type) return false;
    const was = this.pending;
    this.props = { ...this.props, node } as NodeViewRendererProps;
    if (was !== this.pending) this.render();
    return true;
  }
  selectNode() { this.dom.classList.add('is-selected'); }
  deselectNode() { this.dom.classList.remove('is-selected'); }
  stopEvent() { return true; }
  ignoreMutation() { return true; }
}

/* ============================== drop / paste / command ============================== */

export const ImageInput = Extension.create<{ store: ImageStore | null }>({
  name: 'imageInput',
  addOptions() { return { store: null }; },

  addCommands() {
    return {
      insertImageFiles: (files: File[], at?: number) => ({ editor, tr, dispatch }) => {
        const images = files.filter(isAcceptedImage);
        const rejected = files.filter(f => !isAcceptedImage(f));
        if (rejected.length) reportError(new ImageError(`“${rejected[0].name}” isn’t an image the blog can use. Try JPG, PNG, WebP, GIF or SVG.`));
        if (!images.length) return false;
        if (!dispatch) return true;
        const store = this.options.store!;
        let pos = at ?? tr.selection.to;
        // a placeholder per file keeps its place in the document while it's processed
        const ids = images.map(() => `p${++pendingSeq}`);
        const $pos = tr.doc.resolve(Math.min(pos, tr.doc.content.size));
        // at the top level, insert between blocks; inside a block, after it
        pos = $pos.depth === 0 ? $pos.pos : $pos.after(1);
        tr.insert(pos, ids.map(id => editor.schema.nodes.imageUpload.create({ pending: id })));
        images.forEach(async (file, i) => {
          try {
            const { name, image } = await store.addFile(file);
            const p = findPending(editor, ids[i]);
            if (p == null) { store.remove(name); return; }
            editor.chain().command(({ tr }) => {
              tr.replaceWith(p, p + 1, editor.schema.nodes.image.create({ src: name, width: image.width, height: image.height, gif: image.gif }));
              return true;
            }).run();
          } catch (err) {
            reportError(err);
            const p = findPending(editor, ids[i]);
            if (p != null) editor.chain().command(({ tr }) => { tr.delete(p, p + 1); return true; }).run();
          }
        });
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const imageFiles = (dt: DataTransfer | null) => [...(dt?.files ?? [])];
    return [new Plugin({
      key: new PluginKey('imageInput'),
      props: {
        handlePaste(_view, event) {
          const files = imageFiles(event.clipboardData);
          if (!files.length) return false;
          event.preventDefault();
          return editor.commands.insertImageFiles(files);
        },
        handleDrop(view: EditorView, event, _slice, moved) {
          if (moved) return false;
          const files = imageFiles(event.dataTransfer);
          if (!files.length) return false;
          event.preventDefault();
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
          return editor.commands.insertImageFiles(files, at?.pos);
        },
      },
    })];
  },
});

export const imageExtensions = (store: ImageStore) => [
  BlogImage.configure({ store }),
  ImageUpload.configure({ store }),
  ImageInput.configure({ store }),
];

/** Every image file name the document refers to (for export and clean-up). */
export function referencedImages(doc: PMNode): string[] {
  const out: string[] = [];
  doc.descendants(n => { if (n.type.name === 'image' && n.attrs.src) out.push(n.attrs.src); });
  return out;
}
