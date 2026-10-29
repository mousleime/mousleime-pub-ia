// Configuration Supabase centralisée
var SUPABASE_URL = 'https://thdcbdcevwjvfwiwnabb.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZGNiZGNldndqdmZ3aXduYWJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyODA2MDMsImV4cCI6MjEwODg1NjYwM30.A5lNxHviZ5kw47J_Ds1_mWcAvrRNJvWgaI6qESPf77U';

// Créer le client Supabase une seule fois
var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: localStorage
  }
});

// Fonction pour vérifier si l'utilisateur est connecté
async function getCurrentUser() {
  try {
    var result = await supabaseClient.auth.getUser();
    return result.data.user;
  } catch (err) {
    console.error('Erreur getUser:', err);
    return null;
  }
}

// Fonction pour obtenir le profil utilisateur
async function getUserProfile(userId) {
  try {
    var result = await supabaseClient
      .from('profiles')
      .select('role, is_active, full_name, email')
      .eq('id', userId)
      .single();
    return result.data;
  } catch (err) {
    console.error('Erreur getUserProfile:', err);
    return null;
  }
}

// Fonction pour se connecter
async function login(email, password) {
  try {
    var result = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });
    return result;
  } catch (err) {
    console.error('Erreur login:', err);
    return { error: err };
  }
}

// Fonction pour se déconnecter
async function logout() {
  try {
    await supabaseClient.auth.signOut();
    localStorage.clear();
    window.location.href = 'index.html';
  } catch (err) {
    console.error('Erreur logout:', err);
  }
}

// Fonction pour vérifier le rôle Super Admin
async function checkSuperAdmin(redirectIfNotAdmin = true) {
  var user = await getCurrentUser();
  
  if (!user) {
    if (redirectIfNotAdmin) {
      window.location.href = 'connexion.html';
    }
    return false;
  }
  
  var profile = await getUserProfile(user.id);
  
  if (!profile) {
    if (redirectIfNotAdmin) {
      window.location.href = 'dashboard.html';
    }
    return false;
  }
  
  if (profile.role !== 'super_admin') {
    if (redirectIfNotAdmin) {
      window.location.href = 'dashboard.html';
    }
    return false;
  }
  
  return true;
}