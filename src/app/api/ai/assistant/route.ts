import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getSession, jsonError } from "@/lib/auth";

export async function POST(req: NextRequest) {
  // Vérification de session — seuls les utilisateurs connectés peuvent utiliser l'IA
  const session = await getSession();
  if (!session) return jsonError("Connectez-vous pour utiliser l'assistant IA.", 401);

  try {
    const body = await req.json();
    const { action, prompt, tournamentData } = body;

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const systemPrompt = `Tu es l'Assistant IA officiel d'EFootLigue, expert dans l'organisation de compétitions eFootball Dream Team au Niger et en Afrique de l'Ouest.
Numéro officiel de l'organisateur : 91 03 80 61 (WhatsApp / Dépôt Mynita & Amana).

Données actuelles du tournoi :
${JSON.stringify(tournamentData || {}, null, 2)}

Action demandée : ${action || "Assistance générale"}
Demande : ${prompt}

Réponds de manière concise, percutante, professionnelle et prête à l'emploi (avec emojis appropriés).`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: systemPrompt }] }]
        });

        return Response.json({
          ok: true,
          provider: "gemini-2.5-flash",
          response: response.text
        });
      } catch (err) {
        console.warn("Gemini Assistant error:", err instanceof Error ? err.message : String(err));
      }
    }

    // Fallback templates automatiques
    if (action === "whatsapp_reminder") {
      const fee = tournamentData?.fee || 500;
      const tname = tournamentData?.name || "Coupe eFootball";
      return Response.json({
        ok: true,
        provider: "template",
        response: `📢 *RAPPEL EFOOTLIGUE — ${tname}* 🎮\n\nSalut les champions ! N'oubliez pas de confirmer vos frais d'inscription de *${fee} FCFA* avant le tirage au sort.\n\n💳 *Modes de paiement acceptés :*\n👉 *Mynita* ou *Amana Transfert* au *91 03 80 61*\n\n📸 Envoyez la capture de votre reçu sur ce groupe dès que le dépôt est fait ! Que le meilleur gagne 🏆🔥`
      });
    }

    if (action === "planning") {
      return Response.json({
        ok: true,
        provider: "template",
        response: `📅 *PLANNING SUGGÉRÉ DES MATCHS (2x6 min + TAB)* :\n\n🔹 *1er Tour (Huitièmes)* : 18h00 - 19h00 (4 salons simultanés)\n🔹 *Quarts de finale* : 19h15 - 19h45\n🔹 *Demi-finales* : 20h00 - 20h30\n🔹 *GRANDE FINALE & 3e Place* : 20h45\n\n⏱ *Durée estimée* : environ 2h30 pour un tournoi fluide.`
      });
    }

    if (action === "rules") {
      return Response.json({
        ok: true,
        provider: "template",
        response: `📜 *RÈGLEMENT OFFICIEL EFOOTBALL* ⚽\n\n1. Mode : *Match Invitation / Salon Ami*\n2. Durée : *2 x 6 minutes* (Réglage Standard)\n3. Prolongation : *Activée (Oui)*\n4. Tirs au but (TAB) : *Activés (Oui)*\n5. Condition des joueurs : *Excellente / Normale*\n6. En cas de déconnexion avant la 70e minute : Rejouer le temps restant.\n7. Le vainqueur doit envoyer une capture nette de l'écran des scores final.`
      });
    }

    return Response.json({
      ok: true,
      provider: "template",
      response: "Assistant IA EFootLigue prêt. Vous pouvez générer les rappels WhatsApp, le planning des matchs et les règles du salon ami."
    });

  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Erreur assistant IA.");
  }
}
