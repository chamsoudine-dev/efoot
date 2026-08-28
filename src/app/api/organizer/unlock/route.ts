import { NextRequest } from "next/server";
import { createOrganizerToken } from "@/lib/organizer";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    if (!password || typeof password !== "string") {
      return Response.json({ ok: false, error: "Mot de passe requis." }, { status: 400, headers: corsHeaders });
    }

    const adminPassword = process.env.ORGANIZER_PASSWORD;
    if (!adminPassword) {
      return Response.json({ ok: false, error: "Configuration serveur manquante. Définissez ORGANIZER_PASSWORD dans .env." }, { status: 503, headers: corsHeaders });
    }

    // Comparaison à temps constant pour éviter les timing attacks
    const encoder = new TextEncoder();
    const a = encoder.encode(password);
    const b = encoder.encode(adminPassword);
    let match = a.length === b.length;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) match = false;
    }

    if (!match) {
      return Response.json({ ok: false, error: "Mot de passe incorrect." }, { status: 401, headers: corsHeaders });
    }

    // Générer un JWT signé côté serveur, durée 4h
    const token = await createOrganizerToken();

    return Response.json({ ok: true, token }, { headers: corsHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return Response.json({ ok: false, error: msg }, { status: 500, headers: corsHeaders });
  }
}
