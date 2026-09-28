import { Extension, type Editor, type Range } from '@tiptap/core';
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { el, esc, icon } from '../lib/dom';
import { focusUploadBlock } from './image';

export interface SlashItem {
  id: string;
  name: string;
  description: string;
  aliases: string[];
  /** Markdown shortcut shown on the right */
  hint: string;
  /** icon tile: a sprite icon name, or literal text such as "H2" */
  tile: { icon?: string; text?: string };
  run: (editor: Editor, range: Range) => void;
}

/** The 8 blocks from screen 02, in grid order (row by row). */
export const SLASH_ITEMS: SlashItem[] = [
  {
    id: 'h2', name: 'Heading', description: 'Section title', aliases: ['h2', 'title', 'section'], hint: '##', tile: { text: 'H2' },
    run: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 2 }).run(),
  },
  {
    id: 'h3', name: 'Subheading', description: 'Smaller section', aliases: ['h3', 'subtitle'], hint: '###', tile: { text: 'H3' },
    run: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 3 }).run(),
  },
  {
    id: 'image', name: 'Image or GIF', description: 'Upload, paste or link', aliases: ['picture', 'photo', 'gif', 'img', 'upload'], hint: '', tile: { icon: 'image' },
    run: (e, r) => {
      if (!e.schema.nodes.imageUpload) return;
      // the upload block replaces the "/" paragraph when that was all it held, else goes after it;
      // then keyboard focus moves to "browse files"
      // (no .focus() in the chain: its delayed editor focus would pull focus back out of the block)
      let at = 0;
      e.chain().deleteRange(r).command(({ tr }) => {
        const $p = tr.doc.resolve(r.from);
        const node = e.schema.nodes.imageUpload.create();
        if ($p.parent.content.size === 0) { at = $p.before(); tr.replaceWith(at, $p.after(), node); }
        else { at = $p.after(); tr.insert(at, node); }
        return true;
      }).run();
      focusUploadBlock(e, at);
    },
  },
  {
    id: 'code', name: 'Code block', description: 'Syntax highlighted', aliases: ['pre', 'snippet', 'fence'], hint: '```', tile: { icon: 'code' },
    run: (e, r) => e.chain().focus().deleteRange(r).setNode('codeBlock').run(),
  },
  {
    id: 'quote', name: 'Blockquote', description: 'Pull a quote', aliases: ['quote', 'cite'], hint: '>', tile: { icon: 'quote' },
    run: (e, r) => e.chain().focus().deleteRange(r).setNode('paragraph').wrapIn('blockquote').run(),
  },
  {
    id: 'divider', name: 'Divider', description: 'Section break', aliases: ['hr', 'rule', 'line', 'separator'], hint: '---', tile: { icon: 'divider' },
    run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
  },
  {
    id: 'list', name: 'Bullet list', description: 'Simple points', aliases: ['ul', 'bullets', 'unordered'], hint: '-', tile: { icon: 'list' },
    run: (e, r) => e.chain().focus().deleteRange(r).setNode('paragraph').toggleBulletList().run(),
  },
  {
    id: 'callout', name: 'Callout', description: 'A note in the margin', aliases: ['note', 'aside', 'tip', 'alert'], hint: '!!', tile: { icon: 'callout' },
    run: (e, r) => e.chain().focus().deleteRange(r).setNode('paragraph').toggleCallout().run(),
  },
];

/** Fuzzy match: every query character appears in order. Prefix and word-start matches rank higher. */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase(), t = target.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 100 - t.length;
  if (t.includes(` ${q}`)) return 80 - t.length;
  let ti = 0, score = 0, streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak;
    ti = found + 1;
  }
  return score;
}

export function filterItems(query: string): SlashItem[] {
  if (!query) return SLASH_ITEMS;
  return SLASH_ITEMS
    .map(item => ({ item, score: Math.max(...[item.name, ...item.aliases].map(n => fuzzyScore(query, n))) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.item);
}

const MENU_WIDTH = 540;
const GAP = 10;

/** The popup (screen 02). One instance per open menu. */
class SlashMenuView {
  readonly dom: HTMLElement;
  private grid: HTMLElement;
  private items: SlashItem[] = [];
  private active = 0;

  constructor(private props: SuggestionProps<SlashItem>) {
    this.dom = el(`
      <div class="slash-menu" role="listbox" id="slash-menu" aria-label="Insert block">
        <div class="slash-menu__head"><span class="slash-menu__label">Insert block</span><span>Keep typing to filter</span></div>
        <div class="slash-menu__grid"></div>
        <div class="slash-menu__foot" aria-hidden="true">
          <span><span class="mono">↑↓</span> navigate</span><span><span class="mono">↵</span> insert</span><span><span class="mono">esc</span> close</span>
        </div>
      </div>`);
    this.grid = this.dom.querySelector('.slash-menu__grid')!;
    // mousedown keeps focus (and the selection) in the editor
    this.dom.addEventListener('mousedown', e => e.preventDefault());
    this.dom.addEventListener('click', e => {
      const opt = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
      if (opt) this.select(Number(opt.dataset.index));
    });
    this.dom.addEventListener('mousemove', e => {
      const opt = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
      if (opt && Number(opt.dataset.index) !== this.active) { this.active = Number(opt.dataset.index); this.paint(); }
    });
    document.body.append(this.dom);
    this.update(props);
  }

  update(props: SuggestionProps<SlashItem>) {
    this.props = props;
    const changed = props.items.map(i => i.id).join() !== this.items.map(i => i.id).join();
    this.items = props.items;
    if (changed) this.active = 0;
    this.render();
    this.position();
    props.editor.view.dom.setAttribute('aria-activedescendant', `slash-opt-${this.items[this.active]?.id ?? ''}`);
  }

  private render() {
    if (!this.items.length) {
      this.grid.innerHTML = `<p class="slash-menu__empty">No blocks match “${esc(this.props.query)}”</p>`;
      return;
    }
    this.grid.innerHTML = this.items.map((it, i) => `
      <button type="button" role="option" tabindex="-1" class="slash-item" id="slash-opt-${it.id}" data-index="${i}" aria-selected="false">
        <span class="slash-item__tile${it.tile.text ? ` slash-item__tile--text slash-item__tile--${it.id}` : ''}" aria-hidden="true">${it.tile.icon ? icon(it.tile.icon) : esc(it.tile.text)}</span>
        <span class="slash-item__text"><span class="slash-item__name">${esc(it.name)}</span><span class="slash-item__desc">${esc(it.description)}</span></span>
        <span class="slash-item__hint" aria-hidden="true" data-hint="${esc(it.hint)}"></span>
      </button>`).join('');
    this.paint();
  }

  /** Marks the active option; its hint turns into ↵ like screen 02. */
  private paint() {
    this.grid.querySelectorAll<HTMLElement>('.slash-item').forEach((b, i) => {
      const on = i === this.active;
      b.setAttribute('aria-selected', String(on));
      const hint = b.querySelector<HTMLElement>('.slash-item__hint')!;
      hint.textContent = on ? '↵' : hint.dataset.hint ?? '';
      if (on) b.scrollIntoView({ block: 'nearest' });
    });
    this.props.editor.view.dom.setAttribute('aria-activedescendant', `slash-opt-${this.items[this.active]?.id ?? ''}`);
  }

  /** Under the caret line, aligned with the text start; flips upward when there's no room below. */
  private position() {
    const rect = this.props.clientRect?.();
    if (!rect) return;
    const w = Math.min(MENU_WIDTH, window.innerWidth - 16);
    this.dom.style.width = `${w}px`;
    const h = this.dom.offsetHeight;
    const left = Math.max(8, Math.min(rect.left - GAP, window.innerWidth - w - 8));
    const below = rect.bottom + GAP;
    const fitsBelow = below + h <= window.innerHeight - 8;
    const top = fitsBelow || rect.top - GAP - h < 8 ? below : rect.top - GAP - h;
    this.dom.style.left = `${left}px`;
    this.dom.style.top = `${Math.max(8, top)}px`;
    this.dom.classList.toggle('is-above', !fitsBelow);
  }

  onKeyDown({ event }: SuggestionKeyDownProps): boolean {
    const n = this.items.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!n) return true;
      this.active = (this.active + (event.key === 'ArrowDown' ? 1 : -1) + n) % n;
      this.paint();
      return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      if (!n) return false;
      this.select(this.active);
      return true;
    }
    return false; // Escape is handled by the suggestion plugin itself
  }

  private select(i: number) {
    const item = this.items[i];
    if (item) this.props.command(item);
  }

  destroy() {
    this.props.editor.view.dom.removeAttribute('aria-activedescendant');
    this.dom.remove();
  }
}

export const slashMenuKey = new PluginKey('slashMenu');

/** `/` opens the block menu at the start of a line or after a space, outside code blocks. */
export const SlashMenu = Extension.create({
  name: 'slashMenu',
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        pluginKey: slashMenuKey,
        char: '/',
        allowSpaces: false,
        allowedPrefixes: [' ', ' '],
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return $from.parent.type.name === 'paragraph' && $from.depth <= 3;
        },
        items: ({ query }) => filterItems(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let view: SlashMenuView | null = null;
          return {
            onStart: props => { view = new SlashMenuView(props); },
            onUpdate: props => view?.update(props),
            // Escape is handled by the plugin: it calls onExit and keeps the menu dismissed for this `/`
            onKeyDown: props => view?.onKeyDown(props) ?? false,
            onExit: () => { view?.destroy(); view = null; },
          };
        },
      }),
    ];
  },
});
