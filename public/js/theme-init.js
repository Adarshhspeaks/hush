// Theme initialization: classic synchronous script loaded in <head> before CSS
// Sets data-theme immediately on <html> to prevent dark-mode flash on page load.
(function () {
  try {
    var saved = localStorage.getItem('hush-theme');
    var theme = (saved === 'dark' || saved === 'light')
      ? saved
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
