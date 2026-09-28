import type { NodeViewRenderer } from '@tiptap/core';
import { icon, toast } from '../lib/dom';

/** Languages offered in the picker (fence names). Anything else typed after ``` is kept as-is. */
export const LANGUAGES = [
  'bash', 'c', 'cpp', 'css', 'go', 'html', 'java', 'js', 'json', 'kotlin', 'markdown', 'python',
  'rust', 'sql', 'swift', 'ts', 'yaml',
];

/* Code block (screen 02): espresso card, header with language picker + copy button, highlighted <pre>. */
export const codeBlockView: NodeViewRenderer = ({ node, editor, getPos }) => {
  let current = node;
  const dom = document.createElement('div');
  dom.className = 'code-block';

  const head = document.createElement('div');
  head.className = 'code-block__head';
  head.contentEditable = 'false';

  const select = document.createElement('select');
  select.className = 'code-block__lang';
  select.setAttribute('aria-label', 'Code language');
  const fill = (lang: string | null) => {
    const langs = lang && !LANGUAGES.includes(lang) ? [lang, ...LANGUAGES] : LANGUAGES;
    select.innerHTML = `<option value="">plain text</option>` + langs.map(l => `<option value="${l}">${l}</option>`).join('');
    select.value = lang ?? '';
  };
  fill(node.attrs.language);
  select.addEventListener('change', () => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (pos == null) return;
    editor.chain().command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, { ...current.attrs, language: select.value || null });
      return true;
    }).run();
  });

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'code-block__copy';
  copy.setAttribute('aria-label', 'Copy code');
  copy.innerHTML = icon('copy');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(current.textContent);
      toast('Copied');
    } catch {
      toast('Couldn’t reach the clipboard', 'error');
    }
  });
  head.append(select, copy);

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  pre.append(code);
  dom.append(head, pre);

  return {
    dom,
    contentDOM: code,
    update(updated) {
      if (updated.type !== current.type) return false;
      if (updated.attrs.language !== current.attrs.language) fill(updated.attrs.language);
      current = updated;
      return true;
    },
    // keep ProseMirror from handling events inside the header (select, button)
    stopEvent(e) { return head.contains(e.target as Node); },
    ignoreMutation(m) { return head.contains(m.target); },
  };
};
