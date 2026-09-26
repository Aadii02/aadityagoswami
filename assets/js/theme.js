/* Apply the saved theme before first paint so pages don't flash when navigating. */
try { var t = localStorage.getItem('theme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) {}
