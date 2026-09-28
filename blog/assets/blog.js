/* Blog behaviour on post pages and "About this blog". assets/js/site.js already handles the theme
   toggle, menu and grid layout; this file adds the search dialog, code copy and the table of contents.
   (Notebook pages have their own search and subtopic filters, in site.js.) */
(function () {
  var body = document.body;
  var root = body.getAttribute('data-root') || '';   /* path from this page back to /blog/ */

  /* ---- toast (reuses the portfolio's #toast element) ---- */
  var toastEl = document.getElementById('toast'), toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  }

  /* ---- search overlay ---- */
  var search = document.getElementById('search');
  var sInput = document.getElementById('search-input');
  var sList = document.getElementById('search-results');
  var sCount = document.getElementById('search-count');
  var sEmpty = document.getElementById('search-empty');
  var sChips = search ? Array.prototype.slice.call(search.querySelectorAll('.schip')) : [];
  var index = null, loading = null, hits = [], sel = 0, cat = 'all', lastFocus = null;

  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (!loading) {
      loading = fetch(root + 'search-index.json')
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (data) { index = data.posts || []; return index; })
        .catch(function () { loading = null; index = null; throw new Error('index'); });
    }
    return loading;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function render() {
    if (!index) return;
    var q = sInput.value.trim().toLowerCase();
    var words = q.split(/\s+/).filter(Boolean);
    hits = index.filter(function (p) {
      if (cat !== 'all' && p.cat !== cat) return false;
      var hay = (p.title + ' ' + p.excerpt + ' ' + p.catLabel + ' ' + p.sub + ' ' + (p.place || '') + ' ' + p.tags.join(' ') + ' ' + p.words).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    });
    if (sel >= hits.length) sel = Math.max(0, hits.length - 1);
    sList.innerHTML = hits.map(function (p, i) {
      return '<a class="res" data-nb="' + p.cat + '" id="sr-' + i + '" role="option" aria-selected="' + (i === sel) + '" href="' + esc(root + p.url) + '">' +
        '<span class="res__s"><span class="clab"><i aria-hidden="true"></i>' + esc(p.catLabel + ' · ' + p.sub) + '</span><span class="res__t">' + esc(p.title) + '</span></span>' +
        '<span class="res__m mono">' + esc(p.dateShort + ' · ' + p.read) + '</span></a>';
    }).join('');
    sEmpty.hidden = hits.length > 0;
    sCount.textContent = hits.length + (hits.length === 1 ? ' result' : ' results') + (q ? ' for “' + sInput.value.trim() + '”' : '');
    mark();
  }
  function mark() {
    var rows = sList.querySelectorAll('.res');
    Array.prototype.forEach.call(rows, function (r, i) { r.setAttribute('aria-selected', String(i === sel)); });
    if (rows[sel]) { sInput.setAttribute('aria-activedescendant', rows[sel].id); rows[sel].scrollIntoView({ block: 'nearest' }); }
    else sInput.removeAttribute('aria-activedescendant');
  }
  function openSearch() {
    if (!search || !search.hidden) return;
    lastFocus = document.activeElement;
    search.hidden = false;
    document.body.style.overflow = 'hidden';
    sInput.value = ''; sel = 0;
    sCount.textContent = 'Loading…';
    setTimeout(function () { sInput.focus(); }, 10);
    loadIndex().then(render, function () {
      sCount.textContent = '';
      sEmpty.hidden = false;
      sEmpty.textContent = 'Search needs the site to be served over http(s). It can’t load the index from a local file.';
    });
  }
  function closeSearch() {
    if (!search || search.hidden) return;
    search.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  if (search) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-open-search]'), function (b) {
      b.addEventListener('click', openSearch);
    });
    search.addEventListener('click', function (e) { if (e.target.closest('[data-close-search]')) closeSearch(); });
    sInput.addEventListener('input', function () { sel = 0; render(); });
    sChips.forEach(function (c) {
      c.addEventListener('click', function () {
        cat = c.getAttribute('data-cat');
        sChips.forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); });
        sel = 0; render();
      });
    });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeSearch(); return; }
      if (e.target === sInput && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        if (hits.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length; mark(); }
        return;
      }
      if (e.target === sInput && e.key === 'Enter') {
        e.preventDefault();
        var row = sList.querySelectorAll('.res')[sel];
        if (row) window.location.href = row.getAttribute('href');
        return;
      }
      /* keep focus inside the dialog while it's open */
      if (e.key === 'Tab') {
        var f = Array.prototype.filter.call(search.querySelectorAll('input, button, a[href]'), function (el) { return el.offsetParent !== null; });
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      var t = document.activeElement || {};
      if (/^(input|textarea|select)$/i.test(t.tagName || '') || t.isContentEditable) return;
      e.preventDefault(); openSearch();
    });
    /* a page restored from the back/forward cache must never come back scroll-locked */
    window.addEventListener('pageshow', function () { search.hidden = true; document.body.style.overflow = ''; });
  }

  /* ---- code blocks: copy button ---- */
  Array.prototype.forEach.call(document.querySelectorAll('.code'), function (block) {
    var btn = block.querySelector('.copy');
    if (!btn) return;
    var label = btn.querySelector('.copy__label'), t;
    btn.addEventListener('click', function () {
      var text = Array.prototype.map.call(block.querySelectorAll('.ln'), function (l) { return l.textContent; }).join('\n');
      function done() {
        btn.classList.add('copied'); if (label) label.textContent = 'Copied';
        toast('Copied to clipboard');
        clearTimeout(t);
        t = setTimeout(function () { btn.classList.remove('copied'); if (label) label.textContent = 'Copy'; }, 1800);
      }
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); }
        document.body.removeChild(ta);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    });
  });

  /* ---- table of contents: highlight the section being read ---- */
  var toc = document.querySelector('.toc');
  if (toc) {
    var tocLinks = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
    var heads = tocLinks.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); }).filter(Boolean);
    var pct = toc.querySelector('.toc__pct');
    function setCurrent(id) {
      tocLinks.forEach(function (a) {
        if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    }
    if ('IntersectionObserver' in window && heads.length) {
      var visibleIds = {};
      var tio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { visibleIds[e.target.id] = e.isIntersecting; });
        /* the first heading in the reading band wins; otherwise keep the last one scrolled past */
        var inBand = heads.filter(function (h) { return visibleIds[h.id]; });
        if (inBand.length) { setCurrent(inBand[0].id); return; }
        var passed = heads.filter(function (h) { return h.getBoundingClientRect().top < 120; });
        setCurrent(passed.length ? passed[passed.length - 1].id : heads[0].id);
      }, { rootMargin: '-90px 0px -55% 0px' });
      heads.forEach(function (h) { tio.observe(h); });
    }
    if (pct) {
      var ticking = false;
      function readPct() {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        pct.textContent = (max > 0 ? Math.round(Math.min(1, Math.max(0, window.scrollY / max)) * 100) : 100) + '%';
        ticking = false;
      }
      window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(readPct); } }, { passive: true });
      readPct();
    }
  }
})();
