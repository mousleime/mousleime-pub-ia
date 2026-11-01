/* MOUSLEIME PUB IA — socle commun (client Supabase, contrôle d'accès, interface partagée).
   Doit être chargé après assets/vendor/supabase.js, assets/vendor/lucide.min.js et config.js. */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};
  var sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage }
  });

  /* ---------- Utilitaires ---------- */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmt(n) { return Number(n || 0).toLocaleString('fr-FR'); }
  function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }
  function fmtDateTime(d) {
    if (!d) return '—';
    var x = new Date(d);
    return x.toLocaleDateString('fr-FR') + ' à ' + x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  function icons() { if (window.lucide) window.lucide.createIcons(); }

  var ERRORS = [
    ['insufficient_credits', 'Crédits insuffisants. Rechargez votre compte pour continuer.'],
    ['account_suspended', 'Votre compte est suspendu. Contactez-nous pour plus d’informations.'],
    ['not_authenticated', 'Votre session a expiré. Reconnectez-vous.'],
    ['invalid_pack', 'Ce pack de crédits n’est pas disponible.'],
    ['invalid_method', 'Méthode de paiement invalide.'],
    ['invalid_phone', 'Numéro de téléphone invalide.'],
    ['too_many_pending', 'Vous avez déjà 3 demandes d’achat en attente. Attendez leur traitement ou annulez-en une.'],
    ['invalid_prompt', 'La description doit contenir entre 3 et 2000 caractères.'],
    ['service_not_configured', 'La génération de texte n’est pas encore activée. Réessayez plus tard.'],
    ['generation_failed', 'La génération a échoué. Votre crédit a été remboursé, réessayez dans un instant.'],
    ['creation_not_found', 'Création introuvable.'],
    ['forbidden', 'Action non autorisée.'],
    ['cannot_change_self', 'Vous ne pouvez pas modifier votre propre compte.'],
    ['cannot_delete_admin', 'Un compte administrateur ne peut pas être supprimé.'],
    ['invalid_adjustment', 'Ajustement invalide (le solde ne peut pas devenir négatif).'],
    ['Invalid login credentials', 'Email ou mot de passe incorrect.'],
    ['Email not confirmed', 'Veuillez confirmer votre adresse email avant de vous connecter (vérifiez votre boîte de réception).'],
    ['User already registered', 'Un compte existe déjà avec cette adresse email.'],
    ['Password should be at least', 'Le mot de passe est trop court.'],
    ['weak_password', 'Mot de passe trop faible ou déjà compromis. Choisissez-en un plus robuste.'],
    ['same_password', 'Le nouveau mot de passe doit être différent de l’ancien.'],
    ['rate limit', 'Trop de tentatives. Réessayez dans quelques minutes.'],
    ['over_email_send_rate_limit', 'Trop d’emails envoyés. Réessayez dans quelques minutes.'],
    ['Failed to fetch', 'Connexion impossible. Vérifiez votre réseau et réessayez.'],
    ['NetworkError', 'Connexion impossible. Vérifiez votre réseau et réessayez.']
  ];
  function errMsg(err) {
    var raw = '';
    if (err) raw = (err.message || err.error_description || err.code || String(err));
    if (err && err.code && !raw) raw = err.code;
    for (var i = 0; i < ERRORS.length; i++) {
      if (raw.indexOf(ERRORS[i][0]) !== -1 || (err && err.code === ERRORS[i][0])) return ERRORS[i][1];
    }
    return 'Une erreur est survenue. Réessayez dans un instant.';
  }

  /* ---------- Notifications (toasts) ---------- */
  function toast(message, type) {
    var box = document.getElementById('toast-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toast-box';
      box.setAttribute('aria-live', 'polite');
      box.className = 'fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:w-96';
      document.body.appendChild(box);
    }
    var colors = {
      success: 'bg-green-600', error: 'bg-red-600', info: 'bg-gray-900'
    };
    var el = document.createElement('div');
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.className = 'px-4 py-3 rounded-xl text-white text-sm font-medium shadow-lg ' + (colors[type] || colors.info);
    el.textContent = message;
    box.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 4200);
    setTimeout(function () { el.remove(); }, 4600);
  }

  /* ---------- Boîte de confirmation ---------- */
  function confirmDialog(message, okLabel, danger) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50';
      overlay.innerHTML =
        '<div role="dialog" aria-modal="true" class="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">' +
        '<p class="text-gray-800 whitespace-pre-line">' + esc(message) + '</p>' +
        '<div class="mt-6 flex gap-3 justify-end">' +
        '<button type="button" data-act="no" class="btn-secondary">Annuler</button>' +
        '<button type="button" data-act="yes" class="' + (danger ? 'btn-danger' : 'btn-primary') + '">' + esc(okLabel || 'Confirmer') + '</button>' +
        '</div></div>';
      function done(v) { document.removeEventListener('keydown', onKey); overlay.remove(); resolve(v); }
      function onKey(e) { if (e.key === 'Escape') done(false); }
      overlay.addEventListener('click', function (e) {
        var act = e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'yes') done(true); else if (act === 'no' || e.target === overlay) done(false);
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(overlay);
      overlay.querySelector('[data-act="yes"]').focus();
    });
  }

  /* ---------- Crédits ---------- */
  var state = { user: null, profile: null, credits: 0 };

  function setCredits(n) {
    state.credits = n;
    document.querySelectorAll('[data-credits]').forEach(function (el) { el.textContent = fmt(n); });
    document.querySelectorAll('[data-credits-card]').forEach(function (el) {
      el.classList.toggle('from-amber-500', n <= 2);
      el.classList.toggle('to-amber-600', n <= 2);
      el.classList.toggle('from-brand-600', n > 2);
      el.classList.toggle('to-brand-700', n > 2);
    });
  }
  async function refreshCredits(silent) {
    if (!state.user) return state.credits;
    var before = state.credits;
    var r = await sb.from('credits').select('amount').eq('user_id', state.user.id).maybeSingle();
    if (r.error) return state.credits;
    var now = r.data ? r.data.amount : 0;
    setCredits(now);
    if (!silent && now > before) toast('Vos crédits ont été mis à jour : +' + fmt(now - before) + ' (solde : ' + fmt(now) + ').', 'success');
    return state.credits;
  }
  /* Le solde peut changer côté serveur (achat validé, ajustement admin) : on le relit régulièrement. */
  function watchCredits() {
    setInterval(function () { if (!document.hidden) refreshCredits(); }, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshCredits(); });
    window.addEventListener('focus', function () { refreshCredits(); });
  }

  /* ---------- Authentification ---------- */
  async function logout() {
    try { await sb.auth.signOut(); } catch (e) { /* on redirige quand même */ }
    window.location.href = 'index.html';
  }

  function safeNext(value, isAdmin) {
    if (!/^[a-z-]+\.html$/.test(value || '')) return null;
    if (value === 'admin.html' && !isAdmin) return null;
    return value;
  }

  /* ---------- Interface partagée ---------- */
  var NAV = [
    { id: 'dashboard', href: 'dashboard.html', icon: 'layout-dashboard', label: 'Tableau de bord' },
    { id: 'studio', href: 'studio.html', icon: 'wand-sparkles', label: 'Studio de création', badge: 'IA' },
    { id: 'campagnes', href: 'campagnes.html', icon: 'megaphone', label: 'Campagnes' },
    { id: 'analyses', href: 'analyses.html', icon: 'chart-line', label: 'Analyses' },
    { group: 'Compte' },
    { id: 'facturation', href: 'facturation.html', icon: 'credit-card', label: 'Facturation' },
    { id: 'parametres', href: 'parametres.html', icon: 'settings', label: 'Paramètres' }
  ];

  function navHtml(active, isAdmin) {
    var items = NAV.slice();
    if (isAdmin) items.push({ id: 'admin', href: 'admin.html', icon: 'shield-check', label: 'Administration' });
    var html = '<p class="px-3 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Principal</p>';
    items.forEach(function (it) {
      if (it.group) {
        html += '<p class="px-3 pt-6 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">' + esc(it.group) + '</p>';
        return;
      }
      var cls = it.id === active ? 'nav-link-active' : 'nav-link';
      html += '<a href="' + it.href + '" class="' + cls + '"' + (it.id === active ? ' aria-current="page"' : '') + '>' +
        '<i data-lucide="' + it.icon + '" class="w-5 h-5" aria-hidden="true"></i><span>' + esc(it.label) + '</span>' +
        (it.badge ? '<span class="ml-auto px-2 py-0.5 text-xs rounded-full bg-accent-500 text-white font-bold">' + esc(it.badge) + '</span>' : '') +
        '</a>';
    });
    return html;
  }

  function buildShell(active) {
    var main = document.getElementById('page-content');
    var boot = document.getElementById('boot');
    var p = state.profile;
    var displayName = p.full_name || (p.email || '').split('@')[0] || 'Utilisateur';
    var initial = displayName.charAt(0).toUpperCase();
    var isAdmin = p.role === 'super_admin';

    var wrap = document.createElement('div');
    wrap.className = 'flex min-h-screen';
    wrap.innerHTML =
      '<aside id="sidebar" class="fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform -translate-x-full lg:translate-x-0" aria-label="Navigation principale">' +
        '<a href="dashboard.html" class="h-16 flex items-center gap-2 px-6 border-b border-gray-100">' +
          '<span class="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-600 to-accent-500 flex items-center justify-center"><i data-lucide="sparkles" class="w-5 h-5 text-white" aria-hidden="true"></i></span>' +
          '<span class="font-bold text-gray-900">MOUSLEIME <span class="text-brand-600">PUB IA</span></span>' +
        '</a>' +
        '<nav class="flex-1 overflow-y-auto p-4 space-y-1">' + navHtml(active, isAdmin) + '</nav>' +
        '<div class="p-4 border-t border-gray-100 space-y-3">' +
          '<div data-credits-card class="p-4 rounded-xl bg-gradient-to-br from-brand-600 to-brand-700 text-white">' +
            '<div class="flex items-center justify-between mb-1"><span class="text-xs font-medium text-white/80">Crédits restants</span><i data-lucide="coins" class="w-4 h-4 text-accent-400" aria-hidden="true"></i></div>' +
            '<p class="text-3xl font-bold" data-credits>0</p>' +
            '<a href="facturation.html" class="mt-3 block text-center py-2 rounded-lg bg-white text-brand-700 text-xs font-semibold hover:bg-gray-100 transition">Acheter des crédits</a>' +
          '</div>' +
          '<button type="button" id="logout-btn" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-gray-900 text-sm transition">' +
            '<i data-lucide="log-out" class="w-4 h-4" aria-hidden="true"></i><span>Déconnexion</span></button>' +
        '</div>' +
      '</aside>' +
      '<div id="sidebar-overlay" class="lg:hidden fixed inset-0 bg-black/50 z-30 hidden"></div>' +
      '<div class="flex-1 lg:ml-64 flex flex-col min-w-0">' +
        '<header class="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">' +
          '<div class="flex items-center gap-2">' +
            '<button type="button" id="menu-btn" class="lg:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100" aria-label="Ouvrir le menu" aria-controls="sidebar"><i data-lucide="menu" class="w-5 h-5" aria-hidden="true"></i></button>' +
            '<span class="lg:hidden font-bold text-gray-900 text-sm">MOUSLEIME <span class="text-brand-600">PUB IA</span></span>' +
          '</div>' +
          '<div class="flex items-center gap-3">' +
            '<a href="facturation.html" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-sm font-semibold" title="Mes crédits"><i data-lucide="coins" class="w-4 h-4" aria-hidden="true"></i><span data-credits>0</span><span class="hidden sm:inline">crédits</span></a>' +
            '<a href="parametres.html" class="flex items-center gap-2 pl-3 border-l border-gray-200" title="Mon profil">' +
              '<span class="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-white text-sm font-bold" aria-hidden="true">' + esc(initial) + '</span>' +
              '<span class="hidden sm:block text-sm font-semibold text-gray-900 max-w-[10rem] truncate">' + esc(displayName) + '</span>' +
            '</a>' +
          '</div>' +
        '</header>' +
        '<div id="main-slot" class="flex-1"></div>' +
      '</div>';

    document.body.insertBefore(wrap, main);
    document.getElementById('main-slot').appendChild(main);
    main.classList.remove('hidden');
    if (boot) boot.remove();

    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebar-overlay');
    function openMenu() { sidebar.classList.remove('-translate-x-full'); overlay.classList.remove('hidden'); }
    function closeMenu() { sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden'); }
    document.getElementById('menu-btn').addEventListener('click', openMenu);
    overlay.addEventListener('click', closeMenu);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    document.getElementById('logout-btn').addEventListener('click', logout);

    setCredits(state.credits);
    icons();
  }

  /* Point d'entrée des pages protégées. Retourne { user, profile, credits } ou null (redirection). */
  async function init(opts) {
    opts = opts || {};
    var current = (window.location.pathname.split('/').pop() || 'dashboard.html');
    var u = await sb.auth.getUser();
    if (u.error || !u.data || !u.data.user) {
      window.location.replace('connexion.html?next=' + encodeURIComponent(current));
      return null;
    }
    state.user = u.data.user;

    var res = await Promise.all([
      sb.from('profiles').select('id, email, full_name, phone, company_name, role, is_active').eq('id', state.user.id).maybeSingle(),
      sb.from('credits').select('amount').eq('user_id', state.user.id).maybeSingle()
    ]);
    state.profile = res[0].data;
    state.credits = res[1].data ? res[1].data.amount : 0;

    if (!state.profile) {
      await sb.auth.signOut();
      window.location.replace('connexion.html');
      return null;
    }
    if (state.profile.is_active === false) {
      await sb.auth.signOut();
      window.location.replace('connexion.html?suspended=1');
      return null;
    }
    if (opts.adminOnly && state.profile.role !== 'super_admin') {
      window.location.replace('dashboard.html');
      return null;
    }

    buildShell(opts.active);
    watchCredits();
    return state;
  }

  /* Pour les pages publiques (connexion / inscription) : redirige si déjà connecté. */
  async function redirectIfLoggedIn() {
    var s = await sb.auth.getSession();
    if (s.data && s.data.session) {
      var p = await sb.from('profiles').select('role, is_active').eq('id', s.data.session.user.id).maybeSingle();
      if (p.data && p.data.is_active !== false) {
        var params = new URLSearchParams(window.location.search);
        var isAdmin = p.data.role === 'super_admin';
        window.location.replace(safeNext(params.get('next'), isAdmin) || (isAdmin ? 'admin.html' : 'dashboard.html'));
        return true;
      }
    }
    return false;
  }

  /* Remplit les champs légaux (data-legal="publisher", etc.) et masque les vides. */
  function fillLegal() {
    var legal = CFG.LEGAL || {};
    document.querySelectorAll('[data-legal]').forEach(function (el) {
      var v = legal[el.getAttribute('data-legal')];
      var holder = el.closest('[data-legal-row]') || el;
      if (!v) { holder.classList.add('hidden'); return; }
      if (el.getAttribute('data-legal') === 'email') { el.setAttribute('href', 'mailto:' + v); }
      el.textContent = v;
    });
  }


  /* Boutons « afficher / masquer le mot de passe » : <button data-toggle-password="idDuChamp"> */
  function bindPasswordToggles() {
    document.querySelectorAll('[data-toggle-password]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = document.getElementById(btn.getAttribute('data-toggle-password'));
        if (!input) return;
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
        btn.innerHTML = '<i data-lucide="' + (show ? 'eye-off' : 'eye') + '" class="w-5 h-5" aria-hidden="true"></i>';
        icons();
      });
    });
  }

  window.App = {
    sb: sb, cfg: CFG, state: state,
    esc: esc, fmt: fmt, fmtDate: fmtDate, fmtDateTime: fmtDateTime, icons: icons,
    toast: toast, confirm: confirmDialog, errMsg: errMsg,
    init: init, logout: logout, setCredits: setCredits, refreshCredits: refreshCredits,
    redirectIfLoggedIn: redirectIfLoggedIn, safeNext: safeNext, fillLegal: fillLegal,
    bindPasswordToggles: bindPasswordToggles
  };
})();
