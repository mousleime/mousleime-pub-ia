// Pages légales : année du pied de page + champs renseignés dans config.js (les champs vides sont masqués).
(function () {
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
  var legal = (window.APP_CONFIG && window.APP_CONFIG.LEGAL) || {};
  document.querySelectorAll('[data-legal]').forEach(function (el) {
    var key = el.getAttribute('data-legal');
    var v = legal[key];
    var row = el.closest('[data-legal-row]') || el;
    if (!v) { row.classList.add('hidden'); return; }
    if (key === 'email') el.setAttribute('href', 'mailto:' + v);
    el.textContent = v;
  });
  if (window.lucide) window.lucide.createIcons();
})();
