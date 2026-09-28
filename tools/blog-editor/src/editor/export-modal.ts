
import { $, el, esc, icon, toast } from '../lib/dom';
import type { ExportResult } from '../markdown/export';

/** Markdown with light syntax colours, one line per row (screen 07). */
function highlight(md: string): string {
  let inFront = false, frontSeen = 0, inFence = false;
  return md.replace(/\n$/, '').split('\n').map((line, i) => {
    let html: string;
    if (line === '---' && frontSeen < 2 && (i === 0 || inFront)) {
      frontSeen++; inFront = frontSeen === 1;
      html = `<span class="md-rule">---</span>`;
    } else if (inFront) {
      const m = /^([\w-]+):(.*)$/.exec(line);
      html = m ? `<span class="md-key">${esc(m[1])}</span>:${esc(m[2])}` : esc(line);
    } else if (/^```/.test(line)) {
      inFence = !inFence;
      html = `<span class="md-mark">${esc(line)}</span>`;
    } else if (inFence) {
      html = `<span class="md-code">${esc(line)}</span>`;
    } else if (/^(#{2,3}|>|-) /.test(line) || line === '>') {
      const [, mark, rest] = /^(#{2,3}|>|-)(.*)$/.exec(line)!;
      html = `<span class="md-mark">${esc(mark)}</span><span class="md-text">${esc(rest)}</span>`;
    } else if (/^\s*<\/?(figure|img|figcaption)/.test(line)) {
      html = `<span class="md-html">${esc(line)}</span>`;
    } else if (line === '---') {
      html = `<span class="md-mark">---</span>`;
    } else {
      html = `<span class="md-text">${esc(line)}</span>`;
    }
    return `<div class="md-line"><span class="md-ln" aria-hidden="true">${i + 1}</span><span class="md-src">${html || ' '}</span></div>`;
  }).join('');
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Export Markdown (screen 07): an espresso dialog over a 74% scrim. */
export class ExportModal {
  readonly root: HTMLElement;
  private result: ExportResult | null = null;
  private opener: HTMLElement | null = null;
  private withFrontmatter = true;
  private zip = true;

  constructor(private build: () => ExportResult) {
    this.root = el(`
      <div class="scrim" hidden>
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="export-title" aria-describedby="export-sub">
          <div class="modal__head">
            <div>
              <h2 class="modal__title" id="export-title">Export Markdown</h2>
              <p class="modal__sub" id="export-sub">Drop this file into your GitHub Pages repo — frontmatter included.</p>
            </div>
            <button type="button" class="icon-btn modal__close" data-act="close" aria-label="Close">${icon('close')}</button>
          </div>
          <div class="filename">${icon('file')}<span class="filename__dir"></span><span class="filename__name"></span></div>
          <ul class="problems" role="alert" hidden></ul>
          <p class="export-warn" hidden></p>
          <div class="md-view" tabindex="0" role="region" aria-label="Markdown"></div>
          <div class="modal__foot">
            <label class="check"><input type="checkbox" data-opt="frontmatter" checked>Include frontmatter</label>
            <label class="check check--zip"><input type="checkbox" data-opt="zip" checked>Bundle images as a .zip</label>
            <span class="topbar__spacer"></span>
            <button type="button" class="btn btn--outline btn--lg" data-act="copy">${icon('copy')}Copy</button>
            <button type="button" class="btn btn--primary btn--lg" data-act="download">${icon('download')}<span class="dl-label">Download .md</span></button>
          </div>
        </section>
      </div>`);
    this.root.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      if (t === this.root) { this.hide(); return; }
      const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'close') this.hide();
      if (act === 'copy') void this.copy();
      if (act === 'download') void this.download();
    });
    this.root.addEventListener('change', e => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.opt === 'frontmatter') this.withFrontmatter = t.checked;
      if (t.dataset.opt === 'zip') this.zip = t.checked;
      this.render();
    });
    this.root.addEventListener('keydown', e => this.trap(e));
  }

  get open() { return !this.root.hidden; }

  show() {
    this.opener = document.activeElement as HTMLElement | null;
    this.result = this.build();
    this.render();
    this.root.hidden = false;
    $<HTMLButtonElement>('[data-act="download"]', this.root).focus();
  }

  hide() {
    this.root.hidden = true;
    this.opener?.focus?.();
  }

  private get text(): string {
    const r = this.result!;
    return this.withFrontmatter ? r.markdown : r.body;
  }

  private get bundling(): boolean {
    return this.zip && this.result!.images.length > 0;
  }

  private render() {
    const r = this.result!;
    const [dir, name] = this.bundling ? ['', `${r.filename.replace(/\.md$/, '')}.zip`] : ['blog/posts/', r.filename];
    $('.filename__dir', this.root).textContent = dir;
    $('.filename__name', this.root).textContent = name;
    $('.md-view', this.root).innerHTML = highlight(this.text);

    const problems = $('.problems', this.root);
    problems.hidden = !r.problems.length;
    problems.innerHTML = r.problems.map(p => `<li>${esc(p.message)}</li>`).join('');
    const warn = $('.export-warn', this.root);
    warn.hidden = !r.missingAlt;
    warn.textContent = r.missingAlt ? `${r.missingAlt} image${r.missingAlt === 1 ? ' has' : 's have'} no alt text. Add a short description so screen-reader users know what’s there.` : '';

    $('.check--zip', this.root).hidden = !r.images.length;
    $('.dl-label', this.root).textContent = this.bundling ? 'Download .zip' : 'Download .md';
    const dl = $<HTMLButtonElement>('[data-act="download"]', this.root);
    dl.disabled = r.problems.length > 0 && this.withFrontmatter;
    dl.title = dl.disabled ? 'Fix the problems above first' : '';
  }

  private async copy() {
    try {
      await navigator.clipboard.writeText(this.text);
      toast('Copied');
    } catch {
      toast('Couldn’t reach the clipboard. Select the text and copy it instead.', 'error');
    }
  }

  /** .md on its own, or a .zip laid out like the repo (unzip at the repo root). */
  private async download() {
    const r = this.result!;
    if (!this.bundling) {
      download(new Blob([this.text], { type: 'text/markdown;charset=utf-8' }), r.filename);
      return;
    }
    // JSZip is only needed here, so it loads on the first .zip download
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const slug = r.filename.replace(/\.md$/, '');
    zip.file(`blog/posts/${r.filename}`, this.text);
    for (const img of r.images) zip.file(`blog/images/${slug}/${img.name}`, img.blob, { binary: true });
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    download(blob, `${slug}.zip`);
  }

  /** Tab stays inside the dialog; Esc closes it. */
  private trap(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); this.hide(); return; }
    if (e.key !== 'Tab') return;
    const items = [...this.root.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]')].filter(x => x.offsetParent !== null);
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}
