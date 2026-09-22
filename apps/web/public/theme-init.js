/* Only a non-sensitive device preference is stored. Runs before the application/styles. */
(function () {
  var preference = 'system';
  try { var saved=localStorage.getItem('ieum.theme'); if(['light','dark','system'].includes(saved))preference=saved; } catch (_) {}
  var dark = preference==='dark'||preference==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.ieumTheme=dark?'paper-dark':'paper-light';
})();
