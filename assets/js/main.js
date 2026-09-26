(function () {
  var root = document.documentElement;
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(function () { document.body.classList.add('loaded'); });

  /* ---- theme (stored value is applied early by theme.js) ---- */
  var themeBtn = document.getElementById('theme');
  function current() {
    var set = root.getAttribute('data-theme');
    if (set) return set;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function label() { themeBtn.setAttribute('aria-label', current() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'); }
  label();
  themeBtn.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    label();
  });


  /* ---- reveal on scroll ---- */
  var reveals = document.querySelectorAll('.reveal');
  function revealAll() {
    Array.prototype.forEach.call(reveals, function (el) { el.classList.add('in-view'); });
  }
  if ('IntersectionObserver' in window) {
    var groupSeen = new WeakMap();
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        var parent = el.parentNode;
        var n = groupSeen.get(parent) || 0;
        groupSeen.set(parent, n + 1);
        el.style.setProperty('--d', Math.min(n, 5) * 70 + 'ms');
        el.classList.add('in-view');
        ro.unobserve(el);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    Array.prototype.forEach.call(reveals, function (el) { ro.observe(el); });
  } else {
    revealAll();
  }

  /* ---- scroll: progress, altitude, parallax ---- */
  var alt = document.getElementById('alt');
  var sky = document.querySelector('.hero__sky svg');
  var shown = 0, target = 0, ticking = false;
  function paint() {
    var max = root.scrollHeight - window.innerHeight;
    var scrollY = window.scrollY;
    /* a page too short to scroll is already "at the top"; the last pixel always reads 100 */
    var atEnd = max <= 0 || scrollY >= max - 1;
    target = atEnd ? 100 : Math.min(1, Math.max(0, scrollY / max)) * 100;
    root.style.setProperty('--p', target.toFixed(2));
    if (sky) sky.style.setProperty('--sky', (scrollY * 0.12).toFixed(1) + 'px');
    /* anything the observer's bottom margin kept hidden becomes visible at the bottom */
    if (atEnd && max > 0) revealAll();
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(paint); }
  }, { passive: true });
  window.addEventListener('resize', paint);
  window.addEventListener('load', paint);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint);
  paint();

  /* altitude number eases toward the true value */
  (function tick() {
    shown += (target - shown) * 0.16;
    if (Math.abs(target - shown) < 0.5) shown = target;
    if (alt) alt.textContent = Math.round(shown) + ' km';
    requestAnimationFrame(tick);
  })();

  /* ---- nav pill on the current page ---- */
  var nav = document.querySelector('.nav');
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav a'));
  var pill = document.querySelector('.nav__pill');
  function currentLink() { return document.querySelector('.nav a[aria-current="page"]'); }
  function movePill(a) {
    if (!pill || !a) return;
    pill.style.width = a.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + a.offsetLeft + 'px)';
    pill.style.opacity = '1';
  }
  function restPill() {
    var cur = currentLink();
    if (cur) movePill(cur); else if (pill) pill.style.opacity = '0';
  }
  (function placePill() {
    var cur = currentLink();
    if (!cur || !pill) return;
    /* land on the current link without sliding in from the left edge */
    pill.style.transition = 'none';
    movePill(cur);
    void pill.offsetWidth;
    pill.style.transition = '';
    /* on narrow screens the nav scrolls sideways; bring the current page into view */
    if (nav.scrollWidth > nav.clientWidth) {
      nav.scrollLeft = cur.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2;
    }
  })();
  links.forEach(function (a) {
    a.addEventListener('mouseenter', function () { movePill(a); });
  });
  nav.addEventListener('mouseleave', restPill);
  window.addEventListener('resize', restPill);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(restPill);

  /* ---- pointer glow on blog cards ---- */
  document.querySelectorAll('.post').forEach(function (card) {
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  /* ---- project filters (projects.html) ---- */
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var projects = Array.prototype.slice.call(document.querySelectorAll('.proj'));
  var countEl = document.getElementById('proj-count');
  var emptyEl = document.getElementById('empty');

  function applyFilter(cat) {
    var shownCount = 0, order = 0;
    projects.forEach(function (el) {
      var cats = (el.getAttribute('data-cat') || '').split(/\s+/);
      var match = cat === 'all' || cats.indexOf(cat) !== -1;
      el.classList.remove('filtering-in', 'filtering-out');
      if (match) {
        shownCount++;
        if (el.hidden) {
          el.hidden = false;
          el.classList.add('filtering-in');
          el.style.animationDelay = (order * 45) + 'ms';
        }
        order++;
      } else if (!el.hidden) {
        el.classList.add('filtering-out');
        var node = el;
        window.setTimeout(function () {
          if (node.classList.contains('filtering-out')) { node.hidden = true; node.classList.remove('filtering-out'); }
        }, 340);
      }
    });
    if (countEl) countEl.textContent = shownCount + (cat === 'all' ? ' total' : ' shown');
    if (emptyEl) emptyEl.hidden = shownCount > 0;
    window.setTimeout(paint, 400);
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c === chip)); });
      applyFilter(chip.getAttribute('data-cat'));
    });
  });
  if (countEl && projects.length) countEl.textContent = projects.length + ' total';

  function showProject(el) {
    var wasHidden = el.hidden;
    if (wasHidden && chips[0]) chips[0].click();
    setTimeout(function () {
      el.classList.add('in-view');
      el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }, wasHidden ? 380 : 0);
  }
  /* arriving from another page via projects.html#some-project */
  if (projects.length && location.hash.length > 1) {
    var linked = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (linked && linked.classList.contains('proj')) setTimeout(function () { showProject(linked); }, 250);
  }

  /* ---- toast + copy ---- */
  var toastEl = document.getElementById('toast'), toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  }
  function copyText(txt) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Email copied'); } catch (e) { toast(txt); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { toast('Email copied'); }, fallback);
    } else { fallback(); }
  }
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () { copyText(b.getAttribute('data-copy')); });
  });

  /* ---- command menu ---- */
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var modKey = document.getElementById('mod-key');
  if (!isMac && modKey) modKey.textContent = 'Ctrl';
  var cmd = document.getElementById('cmd');
  var cmdInput = document.getElementById('cmd-input');
  var cmdList = document.getElementById('cmd-list');
  var opener = document.getElementById('open-cmd');
  var lastFocus = null, sel = 0, visible = [];

  function page(u) { window.location.href = u; }
  function openUrl(u) { window.open(u, '_blank', 'noopener'); }

  var items = [];
  [['index.html','Home'],['index.html#featured','LX-1 thrust chamber'],['about.html','About'],['experience.html','Experience'],['projects.html','Projects'],['blog.html','Blog'],['skills.html','Skills'],['contact.html','Contact']]
    .forEach(function (x) { items.push({ group: 'Pages', label: x[1], hint: 'page', run: function () { page(x[0]); } }); });
  /* kept in step with the ids on projects.html so the menu works from every page */
  [['lx-1-engine','LX-1 engine','Propulsion'],['knso-review','KNSO propellant review paper','Research'],['pla-annealing-review','PLA thermal annealing review paper','Research'],
   ['engine-failure-prediction','Engine failure prediction','ML'],['launch-analysis','Launch-analysis','ML'],['propulsionlab','PropulsionLab','Software'],
   ['simcore','SimCore','Software'],['skylx-avionics','SKYLX avionics','Avionics'],['mission-control','Mission Control','Ground'],
   ['web-tools','Web tools suite','Software'],['cansat','CanSat','Hardware'],['skylakes-space','skylakes.space','Web'],['what-i-ate','What I Ate','Personal']]
    .forEach(function (x) { items.push({ group: 'Projects', label: x[1], hint: x[2], run: function () {
      var el = document.getElementById(x[0]);
      if (el && el.classList.contains('proj')) showProject(el); else page('projects.html#' + x[0]);
    } }); });
  [['SkyLakes Aerospace','https://skylakes.space'],['LinkedIn','https://www.linkedin.com/in/aaditya-goswami-908a98303'],['GitHub','https://github.com/Aadii02'],['Substack','https://aadityagoswami.substack.com'],['X','https://x.com/aadiii_g02'],['Instagram','https://instagram.com/aadiii_g02']]
    .forEach(function (x) { items.push({ group: 'Links', label: x[0], hint: 'opens in new tab', run: function () { openUrl(x[1]); } }); });
  items.push({ group: 'Actions', label: 'Copy email address', hint: 'aaditya@skylakes.space', run: function () { copyText('aaditya@skylakes.space'); } });
  items.push({ group: 'Actions', label: 'Toggle light / dark theme', hint: 'theme', run: function () { themeBtn.click(); } });
  items.push({ group: 'Actions', label: 'Send an email', hint: 'mailto', run: function () { window.location.href = 'mailto:aaditya@skylakes.space'; } });

  function render() {
    var q = cmdInput.value.trim().toLowerCase();
    visible = items.filter(function (it) { return !q || (it.label + ' ' + it.group + ' ' + it.hint).toLowerCase().indexOf(q) !== -1; });
    if (sel >= visible.length) sel = Math.max(0, visible.length - 1);
    cmdList.innerHTML = '';
    if (!visible.length) {
      var none = document.createElement('div'); none.className = 'cmd__none'; none.textContent = 'No matches.';
      cmdList.appendChild(none); cmdInput.removeAttribute('aria-activedescendant'); return;
    }
    var lastGroup = '';
    visible.forEach(function (it, i) {
      if (it.group !== lastGroup) {
        var g = document.createElement('div'); g.className = 'cmd__group'; g.textContent = it.group; g.setAttribute('role', 'presentation');
        cmdList.appendChild(g); lastGroup = it.group;
      }
      var row = document.createElement('div');
      row.className = 'cmd__item'; row.id = 'cmd-opt-' + i; row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(i === sel));
      var a = document.createElement('span'); a.textContent = it.label;
      var b = document.createElement('small'); b.textContent = it.hint;
      row.appendChild(a); row.appendChild(b);
      row.addEventListener('mousemove', function () { if (sel !== i) { sel = i; mark(); } });
      row.addEventListener('click', function () { choose(i); });
      cmdList.appendChild(row);
    });
    mark();
  }
  function mark() {
    var rows = cmdList.querySelectorAll('.cmd__item');
    rows.forEach(function (r, i) { r.setAttribute('aria-selected', String(i === sel)); });
    var cur = rows[sel];
    if (cur) { cmdInput.setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView({ block: 'nearest' }); }
  }
  function openCmd() {
    lastFocus = document.activeElement;
    cmd.hidden = false; cmdInput.value = ''; sel = 0; render();
    setTimeout(function () { cmdInput.focus(); }, 10);
    document.body.style.overflow = 'hidden';
  }
  function closeCmd() {
    cmd.hidden = true; document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function choose(i) { var it = visible[i]; if (!it) return; closeCmd(); setTimeout(it.run, 30); }

  opener.addEventListener('click', openCmd);
  cmd.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) closeCmd(); });
  cmdInput.addEventListener('input', function () { sel = 0; render(); });
  cmdInput.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (visible.length) { sel = (sel + 1) % visible.length; mark(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (visible.length) { sel = (sel - 1 + visible.length) % visible.length; mark(); } }
    else if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); closeCmd(); }
    else if (e.key === 'Tab') { e.preventDefault(); }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault(); if (cmd.hidden) openCmd(); else closeCmd();
    } else if (e.key === '/' && cmd.hidden && !/input|textarea/i.test((document.activeElement || {}).tagName || '')) {
      e.preventDefault(); openCmd();
    }
  });
  /* a page restored from the back/forward cache must never come back scroll-locked */
  window.addEventListener('pageshow', function () {
    cmd.hidden = true; document.body.style.overflow = '';
    try { var t = localStorage.getItem('theme'); if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); } catch (e) {}
    label(); paint(); restPill();
  });
})();
