import type { JSONContent } from '@tiptap/core';

/* TipTap JSON → Markdown, written to match docs/blog-editor/spec/sample-post.md exactly:
   one blank line between blocks, no trailing whitespace, images as <figure> HTML, callouts as > [!NOTE]. */

export interface SerializeOptions {
  /** file name in the post's image store → path in the export, e.g. "/blog/images/<slug>/rotis.gif" */
  imagePath: (src: string) => string;
}

type Mark = { type: string; attrs?: Record<string, any> };

/* ---------- inline ---------- */

// markdown punctuation that would otherwise change meaning inside text; "<" only where it could open a tag
const escapeText = (s: string) => s.replace(/([\\`*_[\]])/g, '\\$1').replace(/<(?=[A-Za-z/!?])/g, '\\<');

/** Escapes a paragraph's first characters when they'd read as a block marker (# , > , - , 1. , ---). */
const escapeLineStart = (s: string) =>
  s.replace(/^(\s*)(#{1,6}\s|>|[-+]\s|\d+[.)]\s|---+\s*$|!!\s|<)/, (_m, sp, marker) => `${sp}\\${marker}`);

const MARK_ORDER = ['link', 'bold', 'italic', 'code'];
const open = (m: Mark) => (m.type === 'link' ? '[' : m.type === 'bold' ? '**' : m.type === 'italic' ? '*' : '');
const close = (m: Mark) => (m.type === 'link' ? `](${m.attrs?.href ?? ''})` : m.type === 'bold' ? '**' : m.type === 'italic' ? '*' : '');
const sameMark = (a: Mark, b: Mark) => a.type === b.type && (a.type !== 'link' || a.attrs?.href === b.attrs?.href);

function codeSpan(text: string) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map(r => r.length));
  const ticks = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${ticks}${pad}${text}${pad}${ticks}`;
}

/** Inline content of a textblock. Marks open and close across text nodes like nested brackets. */
export function serializeInline(nodes: JSONContent[] = []): string {
  let out = '';
  const stack: Mark[] = [];
  const closeTo = (depth: number) => { while (stack.length > depth) out += close(stack.pop()!); };

  for (const node of nodes) {
    if (node.type === 'hardBreak') { closeTo(0); out += '\\\n'; continue; }
    if (node.type !== 'text' || !node.text) continue;
    const marks = ((node.marks ?? []) as Mark[]).filter(m => MARK_ORDER.includes(m.type))
      .sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
    const code = marks.find(m => m.type === 'code');
    const wrap = marks.filter(m => m.type !== 'code');

    // keep marks that are still active; close the rest (and everything opened after them)
    let keep = 0;
    while (keep < stack.length && keep < wrap.length && sameMark(stack[keep], wrap[keep])) keep++;

    // emphasis can't start or end on whitespace, so spaces move outside the marks
    let text = node.text;
    const lead = stack.length > keep || wrap.length > keep ? /^\s*/.exec(text)![0] : '';
    text = text.slice(lead.length);
    closeTo(keep);
    out += lead;
    for (const m of wrap.slice(keep)) { stack.push(m); out += open(m); }
    const trail = /\s*$/.exec(text)![0];
    const core = text.slice(0, text.length - trail.length);
    out += code ? codeSpan(core) : escapeText(core);
    if (trail) {
      // trailing spaces go after the marks close; the next node reopens any marks it shares
      closeTo(0);
      out += trail;
    }
  }
  closeTo(0);
  return out;
}

/* ---------- blocks ---------- */

const escAttr = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escHtmlText = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function paragraphText(node: JSONContent): string {
  return escapeLineStart(serializeInline(node.content));
}

function block(node: JSONContent, opts: SerializeOptions): string | null {
  switch (node.type) {
    case 'paragraph': {
      const t = paragraphText(node);
      return t.trim() ? t : null;
    }
    case 'heading':
      return `${node.attrs?.level === 3 ? '###' : '##'} ${serializeInline(node.content)}`;
    case 'horizontalRule':
      return '---';
    case 'codeBlock': {
      const lang = node.attrs?.language ?? '';
      const text = (node.content ?? []).map(t => t.text ?? '').join('');
      return `\`\`\`${lang}\n${text}\n\`\`\``;
    }
    case 'blockquote': {
      // each paragraph is one quoted line; the sample's attribution ("— Leonardo da Vinci") is its own paragraph
      const lines = (node.content ?? []).map(n => block(n, opts)).filter((x): x is string => x !== null);
      return lines.flatMap(l => l.split('\n')).map(l => `> ${l}`.trimEnd()).join('\n');
    }
    case 'callout': {
      const paras = (node.content ?? []).map(n => block(n, opts)).filter((x): x is string => x !== null);
      return ['> [!NOTE]', ...paras.join('\n>\n').split('\n').map(l => (l === '>' ? '>' : `> ${l}`.trimEnd()))].join('\n');
    }
    case 'bulletList':
      return (node.content ?? []).map(item => {
        const parts = (item.content ?? []).map(n => block(n, opts)).filter((x): x is string => x !== null);
        const [first = '', ...rest] = parts.join('\n\n').split('\n');
        return [`- ${first}`, ...rest.map(l => (l ? `  ${l}` : ''))].join('\n');
      }).join('\n');
    case 'image': {
      const a = node.attrs ?? {};
      if (!a.src) return null;
      const src = /^https?:\/\//i.test(a.src) ? a.src : opts.imagePath(a.src);
      const dims = a.width && a.height ? ` width="${a.width}" height="${a.height}"` : '';
      return [
        `<figure class="img img--${a.size ?? 'normal'}">`,
        `  <img src="${escAttr(src)}" alt="${escAttr(a.alt ?? '')}"${dims} loading="lazy">`,
        ...(a.caption?.trim() ? [`  <figcaption>${escHtmlText(a.caption.trim())}</figcaption>`] : []),
        '</figure>',
      ].join('\n');
    }
    case 'imageUpload':
      return null; // an unfinished upload placeholder isn't content
    default:
      return node.content ? (node.content.map(n => block(n, opts)).filter(Boolean).join('\n\n') || null) : null;
  }
}

/** The Markdown body (no frontmatter). Ends with exactly one newline; empty doc → "". */
export function serializeBody(doc: JSONContent, opts: SerializeOptions): string {
  const blocks = (doc.content ?? []).map(n => block(n, opts)).filter((x): x is string => x !== null && x !== '');
  const text = blocks.join('\n\n').split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n');
  return text ? `${text}\n` : '';
}
