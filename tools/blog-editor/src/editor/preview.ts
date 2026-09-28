import { renderPostPage } from '../../../../blog/tools/post-page.mjs';
import type { PostRecord } from '../model';
import type { ImageStore } from '../images/store';
import { buildExport } from '../markdown/export';
import type { JSONContent } from '@tiptap/core';
import { $, el, esc, icon, modKey } from '../lib/dom';

/** Where the live blog's posts are: the preview page resolves the site's CSS, JS and images against this. */
function postsBase(): string {
  // dev: vite serves the repo at /site/; built: the editor lives in blog/editor/, next to blog/posts/
  return import.meta.env.DEV ? `${location.origin}/site/blog/posts/` : new URL('../posts/', location.href).href;
}

/** The post as blog/tools/build.mjs will write it, with the post's images shown from blob: URLs. */
export function renderPreviewHtml(post: PostRecord, doc: JSONContent, store: ImageStore): string {
  const exp = buildExport(post, doc, store);
  const prefix = `/blog/images/${post.meta.slug || 'untitled'}/`;
  const resolveSrc = (src: string) => (src.startsWith(prefix) && store.has(src.slice(prefix.length)) ? store.url(src.slice(prefix.length)) : src);
  const data = { ...exp.frontmatter, title: exp.frontmatter.title || 'Untitled post', slug: post.meta.slug || 'untitled' };
  const html = renderPostPage(data, exp.body, { resolveSrc, preview: true });
  return html.replace('<head>', `<head>\n<base href="${esc(postsBase())}">`);
}

type Mode = 'desktop' | 'mobile';

/** Preview (screen 04): an espresso bar over the real post page. */
export class PreviewView {
  readonly root: HTMLElement;
  private frame: HTMLIFrameElement;
  private opener: HTMLElement | null = null;
  onBack: () => void = () => {};
  onPublish: () => void = () => {};

  constructor() {
    this.root = el(`
      <div class="preview" role="region" aria-label="Preview" hidden>
        <div class="preview-bar">
          <span class="preview-bar__label">${icon('eye')}Preview</span>
          <span class="preview-bar__path"></span>
          <span class="topbar__spacer"></span>
          <div class="segmented segmented--bar" role="group" aria-label="Viewport">
            <button type="button" data-mode="desktop" aria-pressed="true">Desktop</button>
            <button type="button" data-mode="mobile" aria-pressed="false">Mobile</button>
          </div>
          <span class="topbar__spacer"></span>
          <button type="button" class="btn btn--outline" data-act="back" title="Back to editing (Esc)">${icon('edit')}Back to editing</button>
          <button type="button" class="btn btn--primary" data-act="publish">Publish</button>
        </div>
        <div class="preview-stage">
          <iframe class="preview-frame" title="Post preview"></iframe>
        </div>
      </div>`);
    this.frame = $('iframe', this.root);
    this.root.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      const mode = t.closest<HTMLElement>('[data-mode]')?.dataset.mode as Mode | undefined;
      if (mode) this.setMode(mode);
      const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'back') this.onBack();
      if (act === 'publish') this.onPublish();
    });
    this.root.addEventListener('keydown', e => this.onKey(e));
    // keys pressed while the page inside the frame has focus
    this.frame.addEventListener('load', () => {
      this.frame.contentDocument?.addEventListener('keydown', e => this.onKey(e));
    });
  }

  get open() { return !this.root.hidden; }

  show(html: string, path: string) {
    this.opener = document.activeElement as HTMLElement | null;
    $('.preview-bar__path', this.root).textContent = path;
    this.frame.srcdoc = html;
    this.root.hidden = false;
    $<HTMLButtonElement>('[data-act="back"]', this.root).focus();
  }

  hide() {
    this.root.hidden = true;
    this.frame.srcdoc = '';
    this.opener?.focus?.();
  }

  private setMode(mode: Mode) {

    this.root.classList.toggle('is-mobile', mode === 'mobile');
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' || (modKey(e) && e.shiftKey && e.key.toLowerCase() === 'p')) {
      e.preventDefault();
      this.onBack();
    }
  }
}

