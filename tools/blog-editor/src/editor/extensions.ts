import { Extension, Node, mergeAttributes, textblockTypeInputRule, wrappingInputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import BulletList from '@tiptap/extension-bullet-list';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Typography from '@tiptap/extension-typography';
import { CharacterCount } from '@tiptap/extensions';
import { lowlight } from './languages';
import { codeBlockView } from './code-block-view';
import { SlashMenu } from './slash-menu';
import { SelectionToolbarExtension } from './selection-toolbar';
import { CurrentBlock } from './focus-mode';

export { lowlight };

/* The title is the only H1, so the body has H2 and H3. `# ` and `## ` both give H2; `### ` gives H3.
   Pasted h1 becomes H2 and h4–h6 become H3. */
const BlogHeading = Heading.extend({
  parseHTML() {
    return [
      { tag: 'h1', attrs: { level: 2 } }, { tag: 'h2', attrs: { level: 2 } },
      { tag: 'h3', attrs: { level: 3 } }, { tag: 'h4', attrs: { level: 3 } },
      { tag: 'h5', attrs: { level: 3 } }, { tag: 'h6', attrs: { level: 3 } },
    ];
  },
  addInputRules() {
    return [
      textblockTypeInputRule({ find: /^#{1,2}\s$/, type: this.type, getAttributes: { level: 2 } }),
      textblockTypeInputRule({ find: /^###\s$/, type: this.type, getAttributes: { level: 3 } }),
    ];
  },
}).configure({ levels: [2, 3] });

/* There is no ordered list block: pasted <ol> becomes a bullet list. */
const BlogBulletList = BulletList.extend({
  parseHTML() { return [{ tag: 'ul' }, { tag: 'ol' }]; },
});

/* Callout (`!! `). Exports as a GitHub alert: `> [!NOTE]`. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  parseHTML() {
    return [{ tag: 'aside[data-callout]' }, { tag: 'div.callout' }, { tag: 'div.markdown-alert' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { 'data-callout': '', class: 'callout' }), 0];
  },
  addInputRules() {
    return [wrappingInputRule({ find: /^!!\s$/, type: this.type })];
  },
  addCommands() {
    return {
      toggleCallout: () => ({ commands }) => commands.toggleWrap(this.name),
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: { toggleCallout: () => ReturnType };
  }
}

/* Code block with a language picker and copy button (screen 02), highlighted by lowlight. */
const BlogCodeBlock = CodeBlockLowlight.extend({
  addNodeView() { return codeBlockView; },
  addInputRules() {
    // ``` + optional language + space. Enter is handled in BlogKeys, because input rules only see typed text.
    return [textblockTypeInputRule({
      find: /^```([\w+#-]+)?\s$/, type: this.type,
      getAttributes: m => ({ language: normaliseLang(m[1]) }),
    })];
  },
}).configure({ lowlight, defaultLanguage: null, enableTabIndentation: true, tabSize: 2 });

/** The fence language is kept as typed (`js` stays `js`, so export round-trips); lowlight resolves aliases itself. */
export function normaliseLang(l?: string | null): string | null {
  if (!l) return null;
  const x = l.toLowerCase();
  return x === 'c++' ? 'cpp' : x === 'c#' ? 'csharp' : x;
}

/* Editor-level keys that aren't marks or nodes. */
const BlogKeys = Extension.create({
  name: 'blogKeys',
  addKeyboardShortcuts() {
    return {
      // ```lang + Enter → code block
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parent.type.name !== 'paragraph') return false;
        const m = /^```([\w+#-]*)$/.exec($from.parent.textContent);
        if (!m || $from.parentOffset !== $from.parent.content.size) return false;
        return editor.chain()
          .command(({ tr }) => { tr.delete($from.start(), $from.end()); return true; })
          .setNode('codeBlock', { language: normaliseLang(m[1]) })
          .run();
      },
      'Mod-Alt-2': ({ editor }) => editor.commands.toggleHeading({ level: 2 }),
      'Mod-Alt-3': ({ editor }) => editor.commands.toggleHeading({ level: 3 }),
    };
  },
});

export function baseExtensions() {
  return [
    StarterKit.configure({
      heading: false,
      bulletList: false,
      codeBlock: false,
      orderedList: false,
      strike: false,
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        HTMLAttributes: { rel: null, target: null },
      },
      dropcursor: { color: '#E8A33D', width: 2 },
    }),
    BlogHeading,
    BlogBulletList,
    BlogCodeBlock,
    Callout,
    Typography.configure({ oneHalf: false, oneQuarter: false, threeQuarters: false, plusMinus: false, notEqual: false, laquo: false, raquo: false, multiplication: false, superscriptTwo: false, superscriptThree: false }),
    CharacterCount,
    BlogKeys,
    SlashMenu,
    SelectionToolbarExtension,
    CurrentBlock,
  ];
}
