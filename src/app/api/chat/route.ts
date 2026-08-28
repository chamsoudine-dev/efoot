import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyOrganizerToken } from "@/lib/organizer";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-organizer-token",
};

const FIREBASE_DB_URL = "https://efoot-ba3de-default-rtdb.firebaseio.com";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tournamentId = searchParams.get("tournamentId") || "global";

    const messages = await prisma.chatMessage.findMany({
      where: { tournamentId },
      orderBy: { createdAt: "asc" },
      take: 100
    });

    return Response.json({ ok: true, messages }, { headers: corsHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erreur récupération chat";
    return Response.json({ ok: false, error: msg, messages: [] }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tournamentId = "global",
      senderName,
      senderPhone = "",
      senderGameId = "",
      text = "",
      imageUrl = "",
      isAdmin = false
    } = body;

    const trimmedText = (text || "").trim();
    const cleanImageUrl = (imageUrl || "").trim();

    if (!trimmedText && !cleanImageUrl) {
      return Response.json({ ok: false, error: "Veuillez saisir un message ou sélectionner une photo." }, { status: 400, headers: corsHeaders });
    }

    if (trimmedText.length > 800) {
      return Response.json({ ok: false, error: "Message trop long (max 800 caractères)." }, { status: 400, headers: corsHeaders });
    }

    // Vérifier si le rôle admin est légitime via token JWT
    const token = req.headers.get("x-organizer-token") || req.headers.get("authorization")?.replace("Bearer ", "") || null;
    const isVerifiedAdmin = isAdmin ? await verifyOrganizerToken(token) : false;

    // Rate limiting basique : max 5 messages par 5 secondes pour un même numéro
    if (senderPhone && !isVerifiedAdmin) {
      const fiveSecondsAgo = new Date(Date.now() - 5000);
      const recentCount = await prisma.chatMessage.count({
        where: {
          senderPhone: senderPhone.trim(),
          createdAt: { gte: fiveSecondsAgo }
        }
      });
      if (recentCount >= 5) {
        return Response.json({ ok: false, error: "Veuillez patienter quelques secondes avant d'envoyer un autre message." }, { status: 429, headers: corsHeaders });
      }
    }

    const cleanSender = (senderName || (isVerifiedAdmin ? "Organisateur 👑" : "Joueur")).trim();

    const newMsg = await prisma.chatMessage.create({
      data: {
        tournamentId,
        senderName: cleanSender,
        senderPhone: senderPhone.trim(),
        senderGameId: senderGameId.trim(),
        text: trimmedText,
        imageUrl: cleanImageUrl,
        isAdmin: isVerifiedAdmin
      }
    });

    // Pousser sur Firebase RTDB pour le live instantané (WhatsApp style)
    try {
      await fetch(`${FIREBASE_DB_URL}/chat/${tournamentId}/${newMsg.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newMsg.id,
          tournamentId: newMsg.tournamentId,
          senderName: newMsg.senderName,
          senderGameId: newMsg.senderGameId,
          senderPhone: newMsg.senderPhone,
          text: newMsg.text,
          imageUrl: newMsg.imageUrl,
          isAdmin: newMsg.isAdmin,
          createdAt: newMsg.createdAt.getTime()
        })
      });
    } catch (e) {
      console.warn("[Firebase] chat push error:", e);
    }

    return Response.json({ ok: true, message: newMsg }, { headers: corsHeaders });
  } catch (err: unknown) {
    console.error("POST /api/chat error:", err);
    const msg = err instanceof Error ? err.message : "Erreur envoi message";
    return Response.json({ ok: false, error: msg }, { status: 500, headers: corsHeaders });
  }
}
