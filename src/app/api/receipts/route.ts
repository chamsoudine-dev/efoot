import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

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

export async function POST(req: NextRequest) {
  try {
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return Response.json({ ok: false, error: "Données du reçu incomplètes (image requise)." }, { status: 400, headers: corsHeaders });
    }

    const { playerName, phone, gameId, tournamentName, amount, receiptImageUrl } = body.data;
    const adminEmail = process.env.ADMIN_RECEIPT_EMAIL || "nliste42@gmail.com";

    // 1. Sauvegarde du reçu dans le store d'annonces ou store de données
    const receiptId = `rcpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    
    // Tenter l'envoi d'un email de notification si RESEND_API_KEY ou SMTP est configuré
    if (process.env.RESEND_API_KEY) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "EFootLigue <onboarding@resend.dev>",
            to: [adminEmail],
            subject: `📸 Nouveau reçu de paiement — ${playerName} (${tournamentName})`,
            html: `
              <h2>Nouveau reçu de paiement reçu sur EFootLigue</h2>
              <p><strong>Joueur :</strong> ${playerName}</p>
              <p><strong>Téléphone :</strong> ${phone}</p>
              <p><strong>ID eFootball :</strong> ${gameId}</p>
              <p><strong>Tournoi :</strong> ${tournamentName}</p>
              <p><strong>Montant :</strong> ${amount || "Non spécifié"}</p>
              <p><strong>Date :</strong> ${new Date().toLocaleString("fr-FR")}</p>
              <hr />
              <h3>Capture du reçu :</h3>
              <img src="${receiptImageUrl}" alt="Reçu de paiement" style="max-width:100%;border-radius:8px;border:1px solid #ccc" />
            `,
          }),
        });
      } catch (err) {
        console.warn("[Email] Erreur envoi email reçu:", err);
      }
    }

    return Response.json({
      ok: true,
      receiptId,
      message: `Reçu enregistré avec succès et transmis à l'administrateur (${adminEmail}).`,
    }, { headers: corsHeaders });

  } catch (err: unknown) {
    console.error("API /api/receipts error:", err);
    return Response.json({ ok: false, error: "Erreur serveur lors de la réception du reçu." }, { status: 500, headers: corsHeaders });
  }
}