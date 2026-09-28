import { Extension, type Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { el, icon, MOD, ALT } from '../lib/dom';

type ButtonId = 'bold' | 'italic' | 'link' | 'h2' | 'h3' | 'quote' | 'code';

const BUTTONS: { id: ButtonId; label: string; content: string }[] = [
  { id: 'bold', label: `Bold (${MOD} B)`, content: 'B' },
  { id: 'italic', label: `Italic (${MOD} I)`, content: 'I' },
  { id: 'link', label: `Link (${MOD} K)`, content: icon('link') },
  { id: 'h2', label: `Heading 2 (${MOD} ${ALT} 2)`, content: 'H2' },
  { id: 'h3', label: `Heading 3 (${MOD} ${ALT} 3)`, content: 'H3' },
  { id: 'quote', label: 'Quote', content: icon('quote') },
  { id: 'code', label: `Inline code (${MOD} E)`, content: icon('code') },
];

/** Normalises what the user types into a link href. Returns null for things that aren't safe links. */
export function normaliseHref(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^(javascript|data|vbscript):/i.test(v)) return null;
  if (/^(https?:|mailto:|#|\/|\.\.?\/)/i.test(v)) return v;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  return `https://${v}`;
}

/**
 * Floating toolbar above any non-empty text selection, centred on it (screen 06).
 * Keyboard: Alt+F10 (or F10) moves focus into it, ←/→ move between buttons, Esc returns to the text.
 */
export class SelectionToolbar {
  readonly dom: HTMLElement;
  private linkForm: HTMLFormElement;
  private linkInput: HTMLInputElement;
  private linkMode = false;
  private raf = 0;

  constructor(private editor: Editor) {
    this.dom = el(`
      <div class="sel-toolbar" role="toolbar" aria-label="Format selection" hidden>
        <div class="sel-toolbar__buttons">
          ${BUTTONS.map((b, i) => `${i === 3 ? '<span class="sel-toolbar__sep" aria-hidden="true"></span>' : ''}<button type="button" class="sel-toolbar__btn sel-toolbar__btn--${b.id}" data-cmd="${b.id}" aria-label="${b.label}" title="${b.label}" aria-pressed="false" tabindex="-1">${b.content}</button>`).join('')}
        </div>
        <form class="sel-toolbar__link" hidden>
          <label class="sr-only" for="sel-link-input">Link URL</label>
          <input id="sel-link-input" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Paste or type a link…">
          <button type="submit" class="sel-toolbar__btn" aria-label="Apply link">${icon('check')}</button>
          <button type="button" class="sel-toolbar__btn" data-unlink aria-label="Remove link">${icon('close')}</button>
        </form>
      </div>`);
    this.linkForm = this.dom.querySelector('form')!;
    this.linkInput = this.dom.querySelector('input')!;
    document.body.append(this.dom);

    // buttons act on mousedown-free clicks without stealing the selection
    this.dom.addEventListener('mousedown', e => { if (!(e.target as HTMLElement).closest('input')) e.preventDefault(); });
    this.dom.addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-cmd]');
      if (btn) this.run(btn.dataset.cmd as ButtonId);
      if ((e.target as HTMLElement).closest('[data-unlink]')) {
        this.editor.chain().focus().extendMarkRange('link').unsetLink().run();
        this.closeLink();
      }
    });
    this.linkForm.addEventListener('submit', e => { e.preventDefault(); this.applyLink(); });
    this.dom.addEventListener('keydown', e => this.onKeyDown(e));
    this.dom.addEventListener('focusout', e => {
      // leaving the toolbar for somewhere other than the editor closes link mode
      const to = e.relatedTarget as Node | null;
      if (to && !this.dom.contains(to) && !this.editor.view.dom.contains(to)) { this.closeLink(); this.hide(); }
    });

    const schedule = () => { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.update()); };
    editor.on('selectionUpdate', schedule);
    editor.on('transaction', schedule);
    editor.on('focus', schedule);
    editor.on('blur', ({ event }) => {
      if (event.relatedTarget && this.dom.contains(event.relatedTarget as Node)) return;
      if (!this.linkMode) this.hide();
    });
    window.addEventListener('resize', schedule);
    editor.view.dom.closest('.canvas-scroll')?.addEventListener('scroll', schedule, { passive: true });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.dom.remove();
  }

  /** Is there a text selection the toolbar should show for? */
  private shouldShow(): boolean {
    const { state, isEditable } = this.editor;
    const { selection } = state;
    if (!isEditable || selection.empty || selection instanceof NodeSelection) return false;
    if (!state.doc.textBetween(selection.from, selection.to, ' ').trim()) return false;
    const $from = selection.$from;
    if ($from.parent.type.name === 'codeBlock') return false;
    return this.editor.view.hasFocus() || this.dom.contains(document.activeElement);
  }

  update() {
    if (!this.linkMode && !this.shouldShow()) { this.hide(); return; }
    this.paintActive();
    this.dom.hidden = false;
    this.position();
  }

  private hide() { this.dom.hidden = true; }

  private paintActive() {
    const e = this.editor;
    const active: Record<ButtonId, boolean> = {
      bold: e.isActive('bold'), italic: e.isActive('italic'), link: e.isActive('link'),
      h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }),
      quote: e.isActive('blockquote'), code: e.isActive('code'),
    };
    this.dom.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach(b =>
      b.setAttribute('aria-pressed', String(active[b.dataset.cmd as ButtonId])));
  }

  /** Centred above the selection; below it when there's no room above. */
  private position() {
    const { view, state } = this.editor;
    const { from, to } = state.selection;
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to, -1);
    const top = Math.min(start.top, end.top);
    const bottom = Math.max(start.bottom, end.bottom);
    // a selection spanning lines is centred on the text column
    const col = view.dom.getBoundingClientRect();
    const mid = start.top === end.top ? (start.left + end.right) / 2 : col.left + col.width / 2;
    const w = this.dom.offsetWidth, h = this.dom.offsetHeight;
    const left = Math.max(8, Math.min(mid - w / 2, window.innerWidth - w - 8));
    const above = top - h - 12;
    this.dom.style.left = `${left}px`;
    this.dom.style.top = `${above > 72 ? above : bottom + 12}px`;
  }

  run(cmd: ButtonId) {
    const c = this.editor.chain().focus();
    switch (cmd) {
      case 'bold': c.toggleBold().run(); break;
      case 'italic': c.toggleItalic().run(); break;
      case 'code': c.toggleCode().run(); break;
      case 'h2': c.toggleHeading({ level: 2 }).run(); break;
      case 'h3': c.toggleHeading({ level: 3 }).run(); break;
      case 'quote': c.toggleBlockquote().run(); break;
      case 'link': this.openLink(); break;
    }
  }

  /** Link: an inline URL field inside the toolbar. Empty selection inside a link edits that link. */
  openLink() {
    const e = this.editor;
    if (e.state.selection.empty) {
      if (!e.isActive('link')) return;
      e.commands.extendMarkRange('link');
    }
    this.linkMode = true;
    this.linkInput.value = e.getAttributes('link').href ?? '';
    this.dom.querySelector<HTMLElement>('.sel-toolbar__buttons')!.hidden = true;
    this.linkForm.hidden = false;
    this.dom.hidden = false;
    this.position();
    this.linkInput.focus();
    this.linkInput.select();
  }

  private applyLink() {
    const href = normaliseHref(this.linkInput.value);
    const chain = this.editor.chain().focus().extendMarkRange('link');
    if (href) chain.setLink({ href }).run(); else chain.unsetLink().run();
    this.closeLink();
  }

  private closeLink() {
    if (!this.linkMode) return;
    this.linkMode = false;
    this.linkForm.hidden = true;
    this.dom.querySelector<HTMLElement>('.sel-toolbar__buttons')!.hidden = false;
    // hiding the focused input drops focus to <body>; put it back in the text now, not a frame later
    this.editor.view.focus();
    this.update();
  }

  /** Alt+F10 / F10 from the editor. */
  focusToolbar(): boolean {
    if (this.dom.hidden) return false;
    this.dom.querySelector<HTMLButtonElement>('[data-cmd]')?.focus();
    return true;
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.linkMode) this.closeLink();
      this.editor.view.focus();
      return;
    }
    if (this.linkMode) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
      const btns = [...this.dom.querySelectorAll<HTMLButtonElement>('[data-cmd]')];
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1
        : (i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length;
      btns[next]?.focus();
      e.preventDefault();
    }
  }
}

/** Wires the toolbar into the editor and adds ⌘K / Alt+F10. */
export const SelectionToolbarExtension = Extension.create<{ toolbar: SelectionToolbar | null }>({
  name: 'selectionToolbar',
  addStorage() { return { toolbar: null as SelectionToolbar | null }; },
  onCreate() { this.storage.toolbar = new SelectionToolbar(this.editor); },
  onDestroy() { this.storage.toolbar?.destroy(); },
  addKeyboardShortcuts() {
    return {
      'Mod-k': () => {
        const tb = this.storage.toolbar;
        if (!tb) return false;
        if (this.editor.state.selection.empty && !this.editor.isActive('link')) {
          // no selection: select the word under the caret so ⌘K always does something
          const { $from } = this.editor.state.selection;
          const text = $from.parent.textContent;
          let a = $from.parentOffset, b = a;
          while (a > 0 && /\S/.test(text[a - 1])) a--;
          while (b < text.length && /\S/.test(text[b])) b++;
          if (a === b) return true;
          this.editor.commands.setTextSelection({ from: $from.start() + a, to: $from.start() + b });
        }
        tb.openLink();
        return true;
      },
      'Alt-F10': () => this.storage.toolbar?.focusToolbar() ?? false,
      F10: () => this.storage.toolbar?.focusToolbar() ?? false,
    };
  },
});
