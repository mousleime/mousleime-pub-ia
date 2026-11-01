// Configuration publique du site.
// La clé "anon" Supabase est conçue pour être publique : la sécurité des données
// est assurée par les règles RLS et les fonctions SQL (voir supabase/migrations).
// NE JAMAIS mettre ici une clé secrète (service_role, Gemini, etc.).
window.APP_CONFIG = {
  SUPABASE_URL: 'https://thdcbdcevwjvfwiwnabb.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZGNiZGNldndqdmZ3aXduYWJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyODA2MDMsImV4cCI6MjEwODg1NjYwM30.A5lNxHviZ5kw47J_Ds1_mWcAvrRNJvWgaI6qESPf77U',

  // Informations légales affichées sur les pages « Mentions légales » et « Contact ».
  // Renseignez-les : un champ vide est simplement masqué sur le site.
  LEGAL: {
    publisher: 'MOUSSA Souléimane',      // Nom de l'éditeur (personne ou société)
    status: 'Personne physique (exploitation à titre individuel)',         // Ex. « Entreprise individuelle », « SARL »
    registration: '',   // Ex. IFU / RCCM
    address: '',        // Adresse postale
    email: 'moussasouleimane@gmail.com',          // Email de contact public
    phone: '+229 01 95 48 61 53'           // Téléphone / WhatsApp
  }
};
