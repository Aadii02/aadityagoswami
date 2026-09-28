/* In-browser image pipeline (brief §5). GIFs are never re-encoded; large JPG/PNG/WebP are downscaled to 1600px;
   SVGs are sanitised. Everything returns the natural width/height so the export can avoid layout shift. */

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_EDGE = 1600;
export const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
};

export interface ProcessedImage {
  blob: Blob;
  /** base file name without extension, lowercase-hyphenated from the original */
  base: string;
  ext: string;
  width: number;
  height: number;
  gif: boolean;
}

export class ImageError extends Error {}

/** Guess a type from the name when the browser leaves File.type empty (happens with some drag sources). */
function typeOf(file: File): string {
  if (file.type) return file.type === 'image/jpg' ? 'image/jpeg' : file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return Object.entries(EXT).find(([, e]) => e === ext || (ext === 'jpeg' && e === 'jpg'))?.[0] ?? '';
}

export function isAcceptedImage(file: File) {
  return typeOf(file) in EXT;
}

/** "My Photo (2).JPG" → "my-photo-2" */
export function baseName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, '');
  const clean = stem.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return clean || 'image';
}

/** Picks "name.ext", then "name-2.ext", "name-3.ext"… avoiding names already taken. */
export function uniqueName(base: string, ext: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let name = `${base}.${ext}`;
  for (let i = 2; used.has(name); i++) name = `${base}-${i}.${ext}`;
  return name;
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;

export async function processImage(file: File): Promise<ProcessedImage> {
  const type = typeOf(file);
  const ext = EXT[type];
  if (!ext) throw new ImageError(`“${file.name}” isn’t an image the blog can use. Try JPG, PNG, WebP, GIF or SVG.`);
  if (file.size > MAX_BYTES) throw new ImageError(`“${file.name}” is ${mb(file.size)}. The limit is 10 MB, so try exporting a smaller version.`);
  const base = baseName(file.name);

  if (type === 'image/svg+xml') {
    const { blob, width, height } = await sanitiseSvg(file);
    return { blob, base, ext, width, height, gif: false };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError(`“${file.name}” couldn’t be read. It may be damaged or in a format this browser can’t open.`);
  }
  const { width, height } = bitmap;

  // GIFs keep their original bytes so the animation survives
  if (type === 'image/gif') {
    bitmap.close();
    return { blob: file, base, ext, width, height, gif: true };
  }

  const long = Math.max(width, height);
  if (long <= MAX_EDGE) {
    bitmap.close();
    return { blob: file, base, ext, width, height, gif: false };
  }
  const scale = MAX_EDGE / long;
  const w = Math.round(width * scale), h = Math.round(height * scale);
  const blob = await drawToBlob(bitmap, w, h, type, 0.85);
  bitmap.close();
  return { blob, base, ext, width: w, height: h, gif: false };
}

async function drawToBlob(src: CanvasImageSource, w: number, h: number, type: string, quality?: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return c.convertToBlob({ type, quality });
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new ImageError('Couldn’t resize the image.'))), type, quality));
}

/** First frame of a GIF as a PNG, used while the animation is paused. */
export async function gifStill(blob: Blob): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const out = await drawToBlob(bmp, bmp.width, bmp.height, 'image/png');
    bmp.close();
    return out;
  } catch {
    return null;
  }
}

/** Strips scripts, foreignObject, event handlers and javascript: links from an SVG. */
export async function sanitiseSvg(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    throw new ImageError('That SVG couldn’t be read.');
  }
  doc.querySelectorAll('script, foreignObject, iframe, embed, object').forEach(n => n.remove());
  for (const node of [svg, ...svg.querySelectorAll('*')]) {
    for (const attr of [...node.attributes]) {
      const n = attr.name.toLowerCase();
      if (n.startsWith('on')) node.removeAttribute(attr.name);
      else if ((n === 'href' || n === 'xlink:href') && /^\s*(javascript|data:text\/html)/i.test(attr.value)) node.removeAttribute(attr.name);
    }
  }
  const vb = svg.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
  const num = (v: string | null) => (v && !v.endsWith('%') ? parseFloat(v) : NaN);
  let width = num(svg.getAttribute('width')), height = num(svg.getAttribute('height'));
  if (!(width > 0 && height > 0) && vb?.length === 4) { width = vb[2]; height = vb[3]; }
  if (!(width > 0 && height > 0)) { width = 1200; height = 800; }
  const out = new XMLSerializer().serializeToString(doc);
  return { blob: new Blob([out], { type: 'image/svg+xml' }), width: Math.round(width), height: Math.round(height) };
}

/** Loads an external URL just to learn its natural size. */
export function probeUrl(url: string): Promise<{ width: number; height: number; gif: boolean }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, gif: /\.gif(\?|#|$)/i.test(url) });
    img.onerror = () => reject(new ImageError('That link didn’t load as an image. Check that it points straight at the image file.'));
    img.src = url;
  });
}
