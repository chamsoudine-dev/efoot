import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyOrganizerToken } from "@/lib/organizer";
import { sendFullChatBackupEmail, DEFAULT_ADMIN_EMAIL } from "@/lib/email";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-organizer-token",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * Route sécurisée pour déclencher un export complet et une sauvegarde par email
 * de l'intégralité de l'historique du chat.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("x-organizer-token");
    const token = authHeader?.replace("Bearer ", "").trim() || null;

    const isAuthorized = await verifyOrganizerToken(token);
    if (!isAuthorized) {
      return Response.json(
        { ok: false, error: "Non autorisé. Accès réservé à l'administrateur / organisateur." },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await req.json().catch(() => ({}));
    const tournamentId = body.tournamentId || "all";

    const whereClause = tournamentId === "all" ? {} : { tournamentId };

    const messages = await prisma.chatMessage.findMany({
      where: whereClause,
      orderBy: { createdAt: "asc" }
    });

    const emailResult = await sendFullChatBackupEmail({
      tournamentId: tournamentId === "all" ? "Tous les salons confondus" : tournamentId,
      messages
    });

    return Response.json(
      {
        ok: true,
        message: `Sauvegarde de l'historique (${messages.length} messages) expédiée avec succès à ${DEFAULT_ADMIN_EMAIL}.`,
        count: messages.length,
        emailResult
      },
      { headers: corsHeaders }
    );
  } catch (err: unknown) {
    console.error("Erreur sauvegarde chat backup:", err);
    const msg = err instanceof Error ? err.message : "Erreur interne lors de la sauvegarde";
    return Response.json({ ok: false, error: msg }, { status: 500, headers: corsHeaders });
  }
}

export async function GET(req: NextRequest) {
  // Supporte également le déclenchement via GET avec token dans l'en-tête ou query param
  try {
    const { searchParams } = new URL(req.url);
    const queryToken = searchParams.get("token");
    const authHeader = req.headers.get("authorization") || req.headers.get("x-organizer-token");
    const token = (authHeader?.replace("Bearer ", "") || queryToken || "").trim();

    const isAuthorized = await verifyOrganizerToken(token);
    if (!isAuthorized) {
      return Response.json(
        { ok: false, error: "Non autorisé. Token organisateur invalide." },
        { status: 401, headers: corsHeaders }
      );
    }

    const tournamentId = searchParams.get("tournamentId") || "all";
    const whereClause = tournamentId === "all" ? {} : { tournamentId };

    const messages = await prisma.chatMessage.findMany({
      where: whereClause,
      orderBy: { createdAt: "asc" }
    });

    const emailResult = await sendFullChatBackupEmail({
      tournamentId: tournamentId === "all" ? "Tous les salons confondus" : tournamentId,
      messages
    });

    return Response.json(
      {
        ok: true,
        message: `Sauvegarde de l'historique (${messages.length} messages) expédiée avec succès à ${DEFAULT_ADMIN_EMAIL}.`,
        count: messages.length,
        emailResult
      },
      { headers: corsHeaders }
    );
  } catch (err: unknown) {
    console.error("Erreur sauvegarde chat backup GET:", err);
    return Response.json({ ok: false, error: "Erreur interne" }, { status: 500, headers: corsHeaders });
  }
}
