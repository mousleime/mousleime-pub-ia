// Edge Function : génération de texte publicitaire (Google Gemini).
// La clé API reste côté serveur (secret GEMINI_API_KEY) et n'est jamais envoyée au navigateur.
// Déploiement : supabase functions deploy generate-text
// Secret      : supabase secrets set GEMINI_API_KEY=... (optionnel : GEMINI_MODEL)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return json(401, { error: "not_authenticated" });

  // On vérifie la configuration AVANT de débiter des crédits.
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json(503, { error: "service_not_configured" });
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

  let payload: { prompt?: string; project?: string; platform?: string };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const prompt = String(payload.prompt ?? "").trim();
  const project = String(payload.project ?? "").trim();
  const platform = String(payload.platform ?? "").trim();
  if (prompt.length < 3 || prompt.length > 2000) return json(400, { error: "invalid_prompt" });

  // Débit atomique + création de l'enregistrement (échoue si crédits insuffisants).
  const { data: creationId, error: startError } = await supabase.rpc("start_creation", {
    p_type: "texte",
    p_prompt: prompt,
    p_project: project,
    p_platform: platform,
  });
  if (startError) {
    const msg = startError.message ?? "";
    if (msg.includes("insufficient_credits")) return json(402, { error: "insufficient_credits" });
    if (msg.includes("account_suspended")) return json(403, { error: "account_suspended" });
    return json(400, { error: "start_failed" });
  }

  try {
    const instruction =
      `Agis comme un expert en copywriting publicitaire pour le marché africain francophone. ` +
      `Rédige un texte publicitaire percutant pour : "${prompt}". ` +
      `Plateforme cible : ${platform || "réseaux sociaux"}. ` +
      `Format : un titre accrocheur, un corps de texte persuasif, puis un appel à l'action clair. ` +
      `Utilise quelques émojis de façon professionnelle. Réponds uniquement avec le texte publicitaire.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: instruction }] }] }),
      },
    );
    const data = await response.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!response.ok || !text) throw new Error(data?.error?.message ?? "empty_response");

    const { error: completeError } = await supabase.rpc("complete_creation", {
      p_id: creationId,
      p_result: text.slice(0, 15000),
    });
    if (completeError) throw completeError;

    return json(200, { id: creationId, text });
  } catch (_err) {
    // Rembourse automatiquement le crédit débité.
    await supabase.rpc("fail_creation", { p_id: creationId });
    return json(502, { error: "generation_failed" });
  }
});
