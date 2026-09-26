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
  var rail = document.querySelector('.rail');
  var sky = document.querySelector('.hero__sky svg');
  var shown = 0, target = 0, ticking = false;
  function paint() {
    var max = root.scrollHeight - window.innerHeight;
    var scrollY = window.scrollY;
    /* a page too short to scroll is already "at the top"; the last pixel always reads 100 */
    var atEnd = max <= 0 || scrollY >= max - 1;
    target = atEnd ? 100 : Math.min(1, Math.max(0, scrollY / max)) * 100;
    root.style.setProperty('--p', target.toFixed(2));
    /* the live reading rides the rail; hide the fixed end label it's about to cross */
    if (rail) { rail.classList.toggle('rail--low', target < 8); rail.classList.toggle('rail--high', target > 92); }
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
  function currentLink() { return document.querySelector('.nav a[aria-current="page"], .nav a[aria-current="true"]'); }
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
    a.addEventListener('focus', function () { movePill(a); });
  });
  nav.addEventListener('mouseleave', restPill);
  nav.addEventListener('focusout', function (e) { if (!nav.contains(e.relatedTarget)) restPill(); });
  window.addEventListener('resize', restPill);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(restPill);

  /* ---- pointer glow on cards ---- */
  document.querySelectorAll('.post, .card').forEach(function (card) {
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  /* ---- project filters (projects.html) ---- */
  var chips = Array.prototype.slice.call(document.querySelectorAll('.filters .chip'));
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
  /* direct links to a project: projects.html#some-project */
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

  /* a page restored from the back/forward cache picks up a theme changed on another page */
  window.addEventListener('pageshow', function () {
    try { var t = localStorage.getItem('theme'); if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); } catch (e) {}
    label(); paint(); restPill();
  });
})();
