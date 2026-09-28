import { gifStill, processImage, uniqueName, type ProcessedImage } from './process';

/**
 * A post's images: Blobs keyed by their export file name ("rotis.gif", "cover.jpg").
 * The editor shows them through blob: URLs created here; the Markdown export uses /blog/images/<slug>/<name>.
 */
export class ImageStore {
  private urls = new Map<string, string>();
  private stills = new Map<string, Promise<string | null>>();
  private busy = 0;
  onBusyChange: (count: number) => void = () => {};
  onChange: () => void = () => {};

  constructor(private images: Record<string, Blob>) {}

  has(name: string) { return name in this.images; }
  names() { return Object.keys(this.images); }
  get(name: string): Blob | undefined { return this.images[name]; }

  /** blob: URL for a stored file, or the value unchanged when it is an external URL. */
  url(src: string): string {
    if (!this.has(src)) return src;
    let u = this.urls.get(src);
    if (!u) { u = URL.createObjectURL(this.images[src]); this.urls.set(src, u); }
    return u;
  }

  /** A still first frame for a stored GIF, made once per session. */
  still(name: string): Promise<string | null> {
    if (!this.has(name)) return Promise.resolve(null);
    let p = this.stills.get(name);
    if (!p) {
      p = gifStill(this.images[name]).then(b => (b ? URL.createObjectURL(b) : null));
      this.stills.set(name, p);
    }
    return p;
  }

  /** Runs the pipeline on a file and stores the result under a unique name. Reports progress through onBusyChange. */
  async addFile(file: File, opts: { name?: string } = {}): Promise<{ name: string; image: ProcessedImage }> {
    this.setBusy(+1);
    try {
      const image = await processImage(file);
      // "cover.<ext>" is reserved for the cover image
      const base = image.base === 'cover' ? 'cover-image' : image.base;
      const name = opts.name ? `${opts.name}.${image.ext}` : uniqueName(base, image.ext, this.names());
      this.put(name, image.blob);
      return { name, image };
    } finally {
      this.setBusy(-1);
    }
  }

  put(name: string, blob: Blob) {
    this.drop(name);
    this.images[name] = blob;
    this.onChange();
  }

  remove(name: string) {
    if (!this.has(name)) return;
    this.drop(name);
    delete this.images[name];
    this.onChange();
  }

  /** Deletes stored files nothing refers to any more (removed or replaced images). */
  collect(referenced: Set<string>) {
    for (const name of this.names()) if (!referenced.has(name)) this.remove(name);
  }

  private drop(name: string) {
    const u = this.urls.get(name);
    if (u) URL.revokeObjectURL(u);
    this.urls.delete(name);
    this.stills.get(name)?.then(s => s && URL.revokeObjectURL(s));
    this.stills.delete(name);
  }

  private setBusy(d: number) {
    this.busy = Math.max(0, this.busy + d);
    this.onBusyChange(this.busy);
  }

  destroy() {
    for (const name of [...this.urls.keys(), ...this.stills.keys()]) this.drop(name);
  }
}
