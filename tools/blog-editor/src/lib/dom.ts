/** Small DOM helpers. The UI is built from template strings; everything user-provided goes through esc(). */

export const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Parse one root element from an HTML string. */
export function el<T extends HTMLElement = HTMLElement>(html: string): T {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

/** `<svg><use href="#i-name"></svg>` from the inline sprite in index.html. */
export const icon = (name: string, cls = '') =>
  `<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** The modifier key as shown in hints: ⌘ on Apple devices, Ctrl elsewhere. */
export const MOD = isMac ? '⌘' : 'Ctrl';
export const SHIFT = isMac ? '⇧' : 'Shift';
export const ALT = isMac ? '⌥' : 'Alt';
/** Ctrl on Windows/Linux, ⌘ on Mac. */
export const modKey = (e: KeyboardEvent | MouseEvent) => (isMac ? e.metaKey : e.ctrlKey);

/** Resize a textarea to fit its content. */
export function autoGrow(t: HTMLTextAreaElement) {
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight}px`;
}

export function toast(message: string, kind: 'info' | 'error' = 'info', ms = 2400) {
  const host = $('.toasts');
  if (!host) return;
  const node = el(`<div class="toast${kind === 'error' ? ' toast--error' : ''}">${esc(message)}</div>`);
  host.append(node);
  setTimeout(() => node.remove(), ms);
}

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const formatNumber = (n: number) => n.toLocaleString('en-US');
