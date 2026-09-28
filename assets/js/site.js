/* Site behaviour: theme toggle, mobile menu, grid layout and the filters on Projects and the blog index.
   The saved theme is applied earlier, by the inline script in each page's <head>, so there's no flash. */
(function () {
  var root = document.documentElement;
  var KEY = 'ag-theme';
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  var systemLight = window.matchMedia('(prefers-color-scheme: light)');

  /* ---------- theme ---------- */
  function stored() {
    try { var t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : null; } catch (e) { return null; }
  }
  function theme() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  var toggles = Array.prototype.slice.call(document.querySelectorAll('.theme-toggle'));
  function label() {
    var next = theme() === 'dark' ? 'light' : 'dark';
    toggles.forEach(function (b) { b.setAttribute('aria-label', 'Switch to ' + next + ' theme'); });
  }
  toggles.forEach(function (b) {
    b.addEventListener('click', function () {
      var next = theme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
      label();
    });
  });
  /* until someone picks a theme, follow the system setting */
  function followSystem() {
    if (stored()) return;
    try { if (localStorage.getItem('theme')) return; } catch (e) {}
    root.setAttribute('data-theme', systemLight.matches ? 'light' : 'dark');
    label();
  }
  if (systemLight.addEventListener) systemLight.addEventListener('change', followSystem);
  /* a page restored from the back/forward cache picks up a theme chosen on another page */
  window.addEventListener('pageshow', function () {
    var t = stored();
    if (t) root.setAttribute('data-theme', t);
    label();
  });
  label();

  /* ---------- mobile menu (≤640px) ---------- */
  var nav = document.querySelector('.site-nav');
  var menuBtn = nav && nav.querySelector('.nav-menu');
  if (menuBtn) {
    var setOpen = function (open) {
      nav.classList.toggle('is-open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
    };
    menuBtn.addEventListener('click', function () { setOpen(!nav.classList.contains('is-open')); });
    document.addEventListener('click', function (e) { if (!nav.contains(e.target)) setOpen(false); });
    nav.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); menuBtn.focus(); }
    });
    nav.addEventListener('focusout', function (e) { if (e.relatedTarget && !nav.contains(e.relatedTarget)) setOpen(false); });
  }

  /* ---------- grids: the first item spans two columns, the last one fills its row ---------- */
  function columns(grid) {
    return getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
  }
  function fillRows(grid) {
    var items = Array.prototype.filter.call(grid.children, function (el) { return el.hasAttribute('data-item') && !el.hidden; });
    Array.prototype.forEach.call(grid.children, function (el) { el.style.gridColumn = ''; el.classList.remove('is-wide'); });
    if (!items.length) return;
    var cols = columns(grid);
    var spans = items.map(function (el, i) { return i === 0 && items.length > 1 ? Math.min(2, cols) : 1; });
    if (items.length === 1) spans[0] = cols;
    var total = spans.reduce(function (a, b) { return a + b; }, 0);
    var rest = total % cols;
    if (rest) spans[spans.length - 1] = Math.min(cols, spans[spans.length - 1] + cols - rest);
    items.forEach(function (el, i) {
      if (spans[i] > 1) { el.style.gridColumn = 'span ' + spans[i]; el.classList.add('is-wide'); }
      var card = el.querySelector('.post-card, .proj-card');
      if (card) card.classList.toggle('is-wide', spans[i] > 1);
    });
  }
  var grids = Array.prototype.slice.call(document.querySelectorAll('[data-fill-rows]'));
  grids.forEach(fillRows);
  var resizeQueued = false;
  window.addEventListener('resize', function () {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(function () { resizeQueued = false; grids.forEach(fillRows); });
  });
  window.AG = { fillRows: fillRows };

  function scrollToEl(el) {
    el.scrollIntoView({ behavior: calm.matches ? 'auto' : 'smooth', block: 'start' });
  }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  /* ---------- Projects: category chips ---------- */
  var projGrid = document.getElementById('project-grid');
  if (projGrid) {
    var projChips = Array.prototype.slice.call(document.querySelectorAll('#project-filters .chip'));
    var projItems = Array.prototype.slice.call(projGrid.querySelectorAll('[data-item]'));
    var projStatus = document.getElementById('project-status');
    var showCat = function (cat, announce) {
      var n = 0;
      projChips.forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-cat') === cat)); });
      projItems.forEach(function (el) {
        var on = cat === 'all' || el.getAttribute('data-cat') === cat;
        el.hidden = !on;
        if (on) n++;
      });
      fillRows(projGrid);
      if (announce && projStatus) projStatus.textContent = 'Showing ' + plural(n, 'project');
    };
    projChips.forEach(function (c) {
      c.addEventListener('click', function () { showCat(c.getAttribute('data-cat'), true); });
    });
    /* direct links to a project (projects.html#cansat) still land on its card */
    var linked = location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (linked && projGrid.contains(linked)) { showCat('all', false); setTimeout(function () { scrollToEl(linked); }, 60); }
  }

  /* ---------- Notebook pages: subtopic chips + search scoped to this notebook ---------- */
  var postGrid = document.getElementById('post-grid');
  var searchInput = document.getElementById('nb-search');
  if (postGrid && searchInput) {
    var subChips = Array.prototype.slice.call(document.querySelectorAll('.sub-chips .chip'));
    var postItems = Array.prototype.slice.call(postGrid.querySelectorAll('[data-item]'));
    var empty = document.getElementById('post-empty');
    var postStatus = document.getElementById('post-status');
    var sub = 'all';
    var statusTimer;
    var apply = function (announce) {
      var words = searchInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      var n = 0;
      subChips.forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-sub') === sub)); });
      postItems.forEach(function (el) {
        var hay = el.getAttribute('data-search') || '';
        var on = (sub === 'all' || el.getAttribute('data-sub') === sub) &&
          words.every(function (w) { return hay.indexOf(w) !== -1; });
        el.hidden = !on;
        if (on) n++;
      });
      /* the no-match message is only for an actual search or filter, never for the plain list */
      empty.hidden = n > 0 || (!words.length && sub === 'all');
      empty.querySelector('strong').textContent = words.length ? 'Nothing in orbit for that search.' : 'No posts in this subtopic yet.';
      fillRows(postGrid);
      if (announce && postStatus) {
        clearTimeout(statusTimer);
        /* wait for a pause in typing so screen readers aren't flooded */
        statusTimer = setTimeout(function () {
          postStatus.textContent = n ? 'Showing ' + plural(n, 'post') : 'No posts match. Clear filters to see every post.';
        }, 400);
      }
    };
    var validSub = function (s) { return subChips.some(function (c) { return c.getAttribute('data-sub') === s; }); };
    /* #ai on the URL keeps a subtopic filter shareable */
    var fromHash = function (announce) {
      var h = decodeURIComponent(location.hash.slice(1)).toLowerCase();
      sub = h && validSub(h) ? h : 'all';
      apply(announce);
    };
    subChips.forEach(function (c) {
      c.addEventListener('click', function () {
        sub = c.getAttribute('data-sub');
        history.replaceState(null, '', sub === 'all' ? location.pathname + location.search : '#' + sub);
        apply(true);
      });
    });
    window.addEventListener('hashchange', function () { fromHash(true); });
    searchInput.addEventListener('input', function () { apply(true); });
    document.getElementById('post-reset').addEventListener('click', function () {
      sub = 'all';
      searchInput.value = '';
      history.replaceState(null, '', location.pathname + location.search);
      apply(true);
      searchInput.focus();
    });
    /* "/" jumps to the search box, as it opens search on the other blog pages */
    document.addEventListener('keydown', function (e) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      var t = document.activeElement || {};
      if (/^(input|textarea|select)$/i.test(t.tagName || '') || t.isContentEditable) return;
      e.preventDefault();
      searchInput.focus();
    });
    /* a subtopic in the URL, or a search restored by the browser (back button), is applied straight away */
    fromHash(false);
  }
})();
