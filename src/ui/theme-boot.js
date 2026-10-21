/**
 * Light and dark theme for the practice, quiz and report pages, as a classic (non-module) script loaded from the page head: it applies the
 * saved choice ('pft-theme') to <html data-theme> before first paint and owns the toggle button, so the button works while the module graph
 * is still loading and when the page cannot build its case. The page modules do not touch the theme.
 * With no saved choice the system preference applies through the media query in src/styles/tokens.css.
 */
(function () {
  var KEY = 'pft-theme';
  var root = document.documentElement;
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  function valid(v) { return v === 'light' || v === 'dark' ? v : null; }
  function current() { return valid(root.dataset.theme) || (mq.matches ? 'dark' : 'light'); }
  function sync() {
    var b = document.getElementById('theme-toggle');
    if (b) b.textContent = current() === 'dark' ? 'Light mode' : 'Dark mode';
  }
  try { var saved = valid(localStorage.getItem(KEY)); if (saved) root.dataset.theme = saved; } catch (e) { /* storage may be unavailable */ }
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#theme-toggle')) return;
    var next = current() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch (err) { /* the choice then lasts for this page only */ }
    sync();
  });
  // The button is not parsed yet when this script runs.
  document.addEventListener('DOMContentLoaded', sync);
  sync();
  if (mq.addEventListener) mq.addEventListener('change', sync);
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    if (valid(e.newValue)) root.dataset.theme = e.newValue; else delete root.dataset.theme;
    sync();
  });
})();
