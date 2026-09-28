import { Editor, type Extensions, type JSONContent } from '@tiptap/core';
import { Selection } from '@tiptap/pm/state';
import { baseExtensions } from './extensions';
import { el, MOD } from '../lib/dom';

export interface BodyOptions {
  host: HTMLElement;
  doc: JSONContent;
  extensions?: Extensions;
  onChange: (editor: Editor) => void;
}

/** Counts words in the body only (the title and subtitle are separate fields). */
export const countWords = (editor: Editor) => editor.storage.characterCount.words();

/** Creates the TipTap editor for the post body, with the "Start writing…" overlay for an empty post. */
export function createBody({ host, doc, extensions = [], onChange }: BodyOptions): Editor {
  const placeholder = el(`<p class="body-placeholder" aria-hidden="true">Start writing, or press <kbd>/</kbd> for blocks…</p>`);
  const mount = document.createElement('div');
  host.replaceChildren(placeholder, mount);

  const editor = new Editor({
    element: mount,
    content: doc,
    extensions: [...baseExtensions(), ...extensions],
    editorProps: {
      attributes: {
        class: 'prose',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': `Post body. Press / for blocks, ${MOD} . for focus mode.`,
        spellcheck: 'true',
      },
    },
    onCreate: ({ editor }) => { sync(editor); },
    onUpdate: ({ editor }) => { sync(editor); onChange(editor); },
  });

  function sync(e: Editor) {
    placeholder.hidden = !e.isEmpty;
  }

  return editor;
}

/** Moves the caret to the start of the body right away (TipTap's focus() waits a frame, and fast typing gets lost). */
export function focusBodyStart(editor: Editor) {
  const { state, view } = editor;
  view.dispatch(state.tr.setSelection(Selection.atStart(state.doc)).scrollIntoView());
  view.focus();
}
