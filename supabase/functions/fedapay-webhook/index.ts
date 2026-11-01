// Edge Function : reçoit les notifications FedaPay (webhook) et crédite le compte après paiement confirmé.
// Déployée SANS vérification JWT (FedaPay n'en envoie pas). La sécurité repose sur la revérification :
// on ne croit jamais le contenu reçu ; on relit la transaction directement auprès de l'API FedaPay
// avec notre clé secrète, puis on compare statut et montant avec notre base.
// Secrets : FEDAPAY_SECRET_KEY, FEDAPAY_ENV ("sandbox" par défaut ou "live").
import { createClient } from "npm:@supabase/supabase-js@2";

function unwrap(res: any, ...keys: string[]) {
  for (const k of keys) if (res?.[k]) return res[k];
  return res;
}
function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const secret = Deno.env.get("FEDAPAY_SECRET_KEY");
  if (!secret) return reply(503, { error: "payments_not_configured" });
  const base = (Deno.env.get("FEDAPAY_ENV") ?? "sandbox") === "live"
    ? "https://api.fedapay.com/v1" : "https://sandbox-api.fedapay.com/v1";

  let payload: any;
  try { payload = JSON.parse(await req.text()); } catch { return reply(400, { error: "invalid_json" }); }

  const entity = payload?.entity ?? payload?.object ?? payload?.data ?? {};
  const id = entity?.id ?? payload?.transaction?.id;
  if (!id || !/^\d+$/.test(String(id))) return reply(400, { error: "missing_transaction_id" });

  // Revérification auprès de FedaPay (source de vérité)
  const res = await fetch(`${base}/transactions/${id}`, { headers: { Authorization: `Bearer ${secret}` } });
  if (!res.ok) return reply(502, { error: "verification_failed" });
  const tx = unwrap(await res.json(), "v1/transaction", "transaction");
  const status = String(tx?.status ?? "");
  const amount = Math.round(Number(tx?.amount));

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (status === "approved" || status === "transferred") {
    const { data, error } = await admin.rpc("service_complete_purchase", { p_provider_ref: String(id), p_amount: amount });
    if (error) return reply(500, { error: "complete_failed" }); // FedaPay réessaiera
    return reply(200, { ok: true, result: data });
  }
  if (status === "declined" || status === "canceled") {
    await admin.rpc("service_fail_purchase", { p_provider_ref: String(id), p_status: status });
    return reply(200, { ok: true, result: status });
  }
  return reply(200, { ok: true, result: "ignored", status });
});
