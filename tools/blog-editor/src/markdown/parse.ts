import type { JSONContent } from '@tiptap/core';

/* Markdown (as the editor exports it) → TipTap JSON. The inverse of serialize.ts, so import → export is identical. */

type Mark = { type: string; attrs?: Record<string, unknown> };

const unescHtml = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (tag: string, name: string) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? unescHtml(m[1]) : null; };

/* ---------- inline ---------- */

function findClose(s: string, from: number, ch: string): number {
  const open = ch === ']' ? '[' : '(';
  let depth = 0;
  for (let j = from; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '`') { const e = s.indexOf('`', j + 1); if (e > -1) { j = e; continue; } }
    if (s[j] === open) depth++;
    else if (s[j] === ch) { if (depth === 0) return j; depth--; }
  }
  return -1;
}

function findMark(s: string, from: number, mark: string): number {
  for (let j = from; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '`') { const e = s.indexOf('`', j + 1); if (e > -1) { j = e; continue; } }
    if (s.startsWith(mark, j) && !/\s/.test(s[j - 1])) {
      if (mark.length === 1 && s[j + 1] === mark) {
        const e = findMark(s, j + 2, mark + mark);
        if (e > -1) { j = e + 1; continue; }
      }
      return j;
    }
  }
  return -1;
}

/** One line of inline Markdown → text nodes with marks. */
export function parseInline(src: string, marks: Mark[] = []): JSONContent[] {
  const out: JSONContent[] = [];
  let buf = '';
  const flush = () => {
    if (!buf) return;
    out.push(marks.length ? { type: 'text', text: buf, marks: marks.map(m => ({ ...m })) } : { type: 'text', text: buf });
    buf = '';
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\' && i + 1 < src.length && /[!-/:-@[-`{-~]/.test(src[i + 1])) { buf += src[i + 1]; i += 2; continue; }
    if (c === '`') {
      const ticks = /^`+/.exec(src.slice(i))![0];
      const end = src.indexOf(ticks, i + ticks.length);
      if (end > -1) {
        let code = src.slice(i + ticks.length, end);
        if (code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
        flush();
        out.push({ type: 'text', text: code, marks: [...marks.map(m => ({ ...m })), { type: 'code' }] });
        i = end + ticks.length; continue;
      }
    }
    if (c === '[') {
      const close = findClose(src, i + 1, ']');
      if (close > -1 && src[close + 1] === '(') {
        const paren = findClose(src, close + 2, ')');
        if (paren > -1) {
          flush();
          const href = src.slice(close + 2, paren).replace(/\\(.)/g, '$1');
          out.push(...parseInline(src.slice(i + 1, close), [{ type: 'link', attrs: { href } }, ...marks]));
          i = paren + 1; continue;
        }
      }
    }
    if (c === '*' || c === '_') {
      const strong = src[i + 1] === c;
      const mark = strong ? c + c : c;
      const end = findMark(src, i + mark.length, mark);
      if (end > -1 && !/\s/.test(src[i + mark.length] ?? ' ')) {
        flush();
        out.push(...parseInline(src.slice(i + mark.length, end), [...marks, { type: strong ? 'bold' : 'italic' }]));
        i = end + mark.length; continue;
      }
    }
    buf += c;
    i++;
  }
  flush();
  return mergeText(out);
}

const sameMarks = (a?: Mark[], b?: Mark[]) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
function mergeText(nodes: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (prev && prev.type === 'text' && n.type === 'text' && sameMarks(prev.marks as Mark[], n.marks as Mark[])) prev.text += n.text!;
    else out.push(n);
  }
  // ProseMirror sorts marks by schema rank; keep a stable order so JSON compares cleanly
  return out;
}

/** A paragraph's lines: trailing "\" is a hard break, other newlines become spaces. */
function paragraph(lines: string[]): JSONContent {
  const content: JSONContent[] = [];
  lines.forEach((l, idx) => {
    const hard = l.endsWith('\\') && idx < lines.length - 1;
    content.push(...parseInline(hard ? l.slice(0, -1) : l));
    if (hard) content.push({ type: 'hardBreak' });
    else if (idx < lines.length - 1) content.push({ type: 'text', text: ' ' });
  });
  const merged = mergeText(content);
  return merged.length ? { type: 'paragraph', content: merged } : { type: 'paragraph' };
}

/* ---------- blocks ---------- */

export interface ParseOptions {
  /** export path → image store name ("/blog/images/<slug>/rotis.gif" → "rotis.gif"), or null to keep the URL */
  imageName?: (src: string) => string | null;
}

export function parseBody(md: string, opts: ParseOptions = {}): JSONContent {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const content: JSONContent[] = [];
  const isBlockStart = (l: string) => /^(#{2,3} |```|>|[-*] |---\s*$|<figure\b)/.test(l);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = /^```([\w+#-]*)\s*$/.exec(line);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
      i++;
      const text = code.join('\n');
      content.push({ type: 'codeBlock', attrs: { language: fence[1] || null }, ...(text ? { content: [{ type: 'text', text }] } : {}) });
      continue;
    }

    if (/^<figure\b/.test(line)) {
      const html: string[] = [];
      while (i < lines.length) { html.push(lines[i]); if (/<\/figure>/.test(lines[i++])) break; }
      const src = html.join('\n');
      const img = /<img\b[^>]*>/.exec(src)?.[0] ?? '';
      const path = attr(img, 'src') ?? '';
      const size = /img--(wide|full)/.exec(src.split('\n')[0])?.[1] ?? 'normal';
      const w = attr(img, 'width'), h = attr(img, 'height');
      content.push({
        type: 'image',
        attrs: {
          src: opts.imageName?.(path) ?? path,
          alt: attr(img, 'alt') ?? '',
          caption: unescHtml(/<figcaption>([\s\S]*?)<\/figcaption>/.exec(src)?.[1]?.trim() ?? ''),
          width: w ? Number(w) : null, height: h ? Number(h) : null,
          size, gif: /\.gif(\?|#|$)/i.test(path),
        },
      });
      continue;
    }

    const heading = /^(#{2,3}) (.*)$/.exec(line);
    if (heading) {
      const inl = parseInline(heading[2]);
      content.push({ type: 'heading', attrs: { level: heading[1].length }, ...(inl.length ? { content: inl } : {}) });
      i++; continue;
    }

    if (/^---\s*$/.test(line)) { content.push({ type: 'horizontalRule' }); i++; continue; }

    if (line.startsWith('>')) {
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^> ?/, ''));
      if (/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i.test(q[0])) {
        // callout: paragraphs separated by a bare ">" line
        const paras: string[][] = [[]];
        for (const l of q.slice(1)) { if (!l.trim()) paras.push([]); else paras[paras.length - 1].push(l); }
        const ps = paras.filter(p => p.length).map(paragraph);
        content.push({ type: 'callout', content: ps.length ? ps : [{ type: 'paragraph' }] });
      } else {
        // blockquote: one paragraph per quoted line
        const ps = q.filter(l => l.trim()).map(l => paragraph([l]));
        content.push({ type: 'blockquote', content: ps.length ? ps : [{ type: 'paragraph' }] });
      }
      continue;
    }

    if (/^[-*] /.test(line)) {
      const items: string[][] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (/^[-*] /.test(l)) items.push([l.slice(2)]);
        else if (/^ {2}\S/.test(l) && items.length) items[items.length - 1].push(l.slice(2));
        else if (!l.trim() && /^ {2}\S/.test(lines[i + 1] ?? '') && items.length) items[items.length - 1].push('');
        else break;
        i++;
      }
      content.push({
        type: 'bulletList',
        content: items.map(itemLines => {
          const paras: string[][] = [[]];
          for (const l of itemLines) { if (!l) paras.push([]); else paras[paras.length - 1].push(l); }
          return { type: 'listItem', content: paras.filter(p => p.length).map(paragraph) };
        }),
      });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines[i]))) para.push(lines[i++]);
    content.push(paragraph(para));
  }

  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
