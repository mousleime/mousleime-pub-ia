# MOUSLEIME PUB IA

Plateforme de création de publicités par IA pour l'Afrique francophone : génération de textes (Gemini) et d'images (Pollinations), gestion de campagnes, analyses, crédits payés par Mobile Money (validation manuelle par l'administrateur).

Site statique (HTML + Tailwind compilé + JS) + Supabase (auth, base, Edge Function).

## Mise en route

1. `npm install && npm run build:css` (le CSS compilé `assets/css/styles.css` est versionné ; relancez après toute modification de classes).
2. **Base de données** : exécuter `supabase/migrations/20261101_securite_credits_paiements.sql` dans le SQL Editor Supabase.
3. **Edge Function** : `supabase functions deploy generate-text` puis `supabase secrets set GEMINI_API_KEY=...`.
4. **Config** : renseigner `config.js` (bloc `LEGAL` : éditeur, email, etc. ; ne jamais y mettre de clé secrète).
5. **Admin** : dans Supabase, `update profiles set role = 'super_admin' where email = 'vous@exemple.com';`
6. Déployer le dossier tel quel (Vercel : aucun build requis).

## Sécurité
Toutes les opérations sensibles (crédits, achats, administration) passent par des fonctions SQL `SECURITY DEFINER` ; les droits et politiques RLS sont définis dans la migration. Dans Supabase > Auth, activez la protection contre les mots de passe compromis et configurez l'URL du site et les redirections.

## Paiement automatique (FedaPay)
Par défaut les achats de crédits sont validés à la main depuis la page Administration. Pour les automatiser :
1. Créer un compte marchand FedaPay, récupérer la clé secrète (`sk_sandbox_…` pour les tests, `sk_live_…` en production).
2. Supabase > Edge Functions > Secrets : `FEDAPAY_SECRET_KEY` (clé secrète), `FEDAPAY_ENV` (`sandbox` ou `live`), optionnel `SITE_URL`.
3. FedaPay > Webhooks : ajouter l'URL `https://<projet>.supabase.co/functions/v1/fedapay-webhook` avec les événements `transaction.approved`, `transaction.declined`, `transaction.canceled`.
4. Administration > « Paiement automatique » : cocher la case.

Sécurité : le webhook ne fait jamais confiance au contenu reçu ; il relit la transaction chez FedaPay avec la clé secrète et compare le statut et le montant à la base avant d'ajouter les crédits (une seule fois par paiement).
