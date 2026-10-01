import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sendReceiptNotification } from "@/lib/email";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-organizer-token",
};

const schema = z.object({
  playerName: z.string().min(1),
  phone: z.string().default(""),
  gameId: z.string().default(""),
  tournamentName: z.string().default("Tournoi Général"),
  amount: z.string().default(""),
  receiptImageUrl: z.string().min(1), // Base64 ou URL de la photo
});

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("x-organizer-token") || req.headers.get("authorization")?.replace("Bearer ", "") || null;
    const isOrg = token ? await (await import("@/lib/organizer")).verifyOrganizerToken(token) : false;

    if (!isOrg) {
      try {
        const { requireAdmin } = await import("@/lib/auth");
        await requireAdmin();
      } catch {
        return Response.json({ ok: false, error: "Accès réservé à l'administrateur." }, { status: 403, headers: corsHeaders });
      }
    }

    const receipts = await prisma.chatMessage.findMany({
      where: { tournamentId: "receipts" },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    return Response.json({ ok: true, receipts }, { headers: corsHeaders });
  } catch (err: unknown) {
    console.error("GET /api/receipts error:", err);
    return Response.json({ ok: false, error: "Erreur récupération reçus" }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return Response.json({ ok: false, error: "Données du reçu incomplètes (image requise)." }, { status: 400, headers: corsHeaders });
    }

    const { playerName, phone, gameId, tournamentName, amount, receiptImageUrl } = body.data;

    const receiptId = `rcpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    
    // 1. Sauvegarde du reçu dans la base de données
    await prisma.chatMessage.create({
      data: {
        id: receiptId,
        tournamentId: "receipts",
        senderName: playerName,
        senderPhone: phone,
        senderGameId: gameId,
        text: `Reçu pour ${tournamentName} — Montant: ${amount || "Non spécifié"} FCFA`,
        imageUrl: receiptImageUrl,
        isAdmin: false
      }
    });

    // 2. Envoi automatique de l'email de notification et redirection du reçu
    await sendReceiptNotification({
      playerName,
      phone,
      gameId,
      tournamentName,
      amount,
      receiptImageUrl
    }).catch((err) => {
      console.warn("[Email] Erreur envoi notification reçu:", err);
    });

    return Response.json({
      ok: true,
      receiptId,
      message: "Reçu enregistré avec succès dans le système.",
    }, { headers: corsHeaders });

  } catch (err: unknown) {
    console.error("API /api/receipts error:", err);
    return Response.json({ ok: false, error: "Erreur serveur lors de la réception du reçu." }, { status: 500, headers: corsHeaders });
  }
}