// Edge Function : démarre un paiement FedaPay pour un pack de crédits.
// Secrets : FEDAPAY_SECRET_KEY (obligatoire), FEDAPAY_ENV = "sandbox" (défaut) ou "live", SITE_URL (optionnel).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
// FedaPay enveloppe parfois l'objet sous une clé du type "v1/transaction".
function unwrap(res: any, ...keys: string[]) {
  for (const k of keys) if (res?.[k]) return res[k];
  return res;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const secret = Deno.env.get("FEDAPAY_SECRET_KEY");
  if (!secret) return json(503, { error: "payments_not_configured" });
  const base = (Deno.env.get("FEDAPAY_ENV") ?? "sandbox") === "live"
    ? "https://api.fedapay.com/v1" : "https://sandbox-api.fedapay.com/v1";
  const siteUrl = (Deno.env.get("SITE_URL") ?? "https://mousleime-pub-ia.vercel.app").replace(/\/$/, "");

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return json(401, { error: "not_authenticated" });

  let credits = 0;
  try { credits = Number((await req.json()).credits); } catch { return json(400, { error: "invalid_json" }); }
  if (!Number.isInteger(credits) || credits <= 0) return json(400, { error: "invalid_pack" });

  // 1. Demande d'achat en attente (prix lu côté serveur, jamais fourni par le navigateur).
  const { data: purchase, error: purchaseError } = await supabase.rpc("request_online_purchase", { p_credits: credits });
  if (purchaseError) {
    const msg = purchaseError.message ?? "";
    for (const code of ["invalid_pack", "too_many_pending", "account_suspended", "not_authenticated"]) {
      if (msg.includes(code)) return json(400, { error: code });
    }
    return json(400, { error: "start_failed" });
  }

  const cancel = () => supabase.rpc("cancel_purchase_request", { p_id: purchase.id });
  const auth = { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };

  try {
    const { data: profile } = await supabase.from("profiles").select("email, full_name").eq("id", user.id).maybeSingle();
    const fullName = (profile?.full_name ?? "").trim();
    const [first, ...rest] = fullName.split(/\s+/).filter(Boolean);

    // 2. Transaction FedaPay
    const created = await fetch(`${base}/transactions`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        description: `Achat de ${credits} crédits MOUSLEIME PUB IA (${purchase.reference})`,
        amount: purchase.amount_fcfa,
        currency: { iso: "XOF" },
        callback_url: `${siteUrl}/facturation.html?paiement=retour`,
        customer: {
          firstname: first ?? "Client",
          lastname: rest.join(" ") || "MOUSLEIME",
          email: profile?.email ?? user.email,
        },
      }),
    });
    const createdJson = await created.json();
    const tx = unwrap(createdJson, "v1/transaction", "transaction");
    if (!created.ok || !tx?.id) throw new Error("create_failed");

    // 3. On mémorise l'identifiant FedaPay (rôle service : le client ne peut pas écrire cette colonne).
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error: updError } = await admin.from("transactions")
      .update({ provider_ref: String(tx.id) }).eq("id", purchase.id).eq("user_id", user.id);
    if (updError) throw updError;

    // 4. Lien de paiement
    const tokenRes = await fetch(`${base}/transactions/${tx.id}/token`, { method: "POST", headers: auth });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson?.url) throw new Error("token_failed");

    return json(200, { url: tokenJson.url, reference: purchase.reference });
  } catch (_err) {
    await cancel();
    return json(502, { error: "checkout_failed" });
  }
});
