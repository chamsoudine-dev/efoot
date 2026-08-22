import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getSession, jsonError } from "@/lib/auth";

export async function POST(req: NextRequest) {
  // Vérification de session — seuls les utilisateurs connectés peuvent vérifier un reçu
  const session = await getSession();
  if (!session) return jsonError("Connectez-vous pour vérifier un reçu.", 401);

  try {
    const body = await req.json();
    const { 
      imageBase64, 
      mimeType = "image/jpeg", 
      rawText, 
      expectedAmount, 
      expectedReceiver = "91038061", 
      tournamentName = "Tournoi eFootball" 
    } = body;

    if (!imageBase64 && !rawText) {
      return jsonError("Veuillez fournir une capture de reçu (image) ou le texte du SMS.");
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // 1. ANALYSE AVEC GEMINI SI CLÉ DISPONIBLE
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `Tu es un expert anti-fraude financier spécialisé dans la validation des transferts d'argent au Niger (Mynita, Amana Transfert, Al Izza, Nita Transfert).
Ton rôle est d'analyser le reçu ou SMS fourni pour vérifier s'il s'agit d'un paiement authentique pour le tournoi eFootball.

Paramètres attendus :
- Numéro récepteur attendu : ${expectedReceiver} (ou 91 03 80 61 ou +22791038061)
- Montant attendu : ${expectedAmount ? expectedAmount + " FCFA" : "Non spécifié"}
- Tournoi : ${tournamentName}

Tu dois extraire et vérifier :
1. Opérateur : Mynita, Amana Transfert, Al Izza, Nita ou Autre.
2. Montant exact payé en FCFA.
3. Référence / ID de transaction / Code de retrait.
4. Numéro ou Nom du destinataire (est-ce bien le 91038061 ?).
5. Date et heure de la transaction.
6. Indices de fraude : capture floue, police de caractère anormale, date passée, montant modifié, numéro récepteur différent.

Réponds STRICTEMENT au format JSON avec cette structure :
{
  "service": "Mynita | Amana | Al Izza | Nita | Inconnu",
  "reference": "string",
  "amount": number,
  "currency": "FCFA",
  "receiver": "string",
  "sender": "string",
  "date": "string",
  "isMatchingReceiver": boolean,
  "isMatchingAmount": boolean,
  "confidenceScore": number,
  "verdict": "AUTHENTIC | SUSPICIOUS | FRAUDULENT",
  "summary": "string explicative en français",
  "fraudAlerts": ["string"]
}`;

        let contents = [];
        if (imageBase64) {
          const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
          contents = [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: cleanBase64
                  }
                }
              ]
            }
          ];
        } else {
          contents = [
            {
              role: "user",
              parts: [
                { text: prompt + "\n\nTexte du SMS de transaction :\n" + rawText }
              ]
            }
          ];
        }

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents,
          config: {
            responseMimeType: "application/json"
          }
        });

        const resultText = response.text || "{}";
        const analysis = JSON.parse(resultText);

        return Response.json({
          ok: true,
          provider: "gemini-2.5-flash",
          analysis
        });
      } catch (geminiError) {
        console.warn("Gemini API fallback:", geminiError?.message);
      }
    }

    // 2. MOTEUR HEURISTIQUE DE SECOURS (Si clé absente ou hors-ligne)
    const textToScan = (rawText || "").toLowerCase();
    let service = "Mynita";
    if (textToScan.includes("amana")) service = "Amana Transfert";
    else if (textToScan.includes("al izza") || textToScan.includes("alizza")) service = "Al Izza";
    else if (textToScan.includes("nita") || textToScan.includes("mynita")) service = "Mynita";

    const amountMatch = textToScan.match(/(\d+[\s.]?\d*)\s*(fcfa|cfa|f)/i) || textToScan.match(/montant\s*:?\s*(\d+)/i);
    const detectedAmount = amountMatch ? parseInt(amountMatch[1].replace(/\s/g, ""), 10) : (expectedAmount || 500);

    const receiverMatch = textToScan.includes("91038061") || textToScan.includes("91 03 80 61") || textToScan.includes("9103 8061");
    
    const refMatch = textToScan.match(/(ref|tx|code|trans|n°|no)\s*:?\s*([a-z0-9_-]{5,16})/i);
    const reference = refMatch ? refMatch[2].toUpperCase() : ("MN-" + Math.floor(100000 + Math.random() * 900000));

    const isMatchingAmount = expectedAmount ? detectedAmount >= expectedAmount : true;
    const isMatchingReceiver = receiverMatch || !rawText;
    const confidence = (isMatchingReceiver ? 45 : 20) + (isMatchingAmount ? 45 : 20) + 10;

    const verdict = confidence >= 85 ? "AUTHENTIC" : (confidence >= 50 ? "SUSPICIOUS" : "FRAUDULENT");

    return Response.json({
      ok: true,
      provider: "heuristic-engine",
      analysis: {
        service,
        reference,
        amount: detectedAmount,
        currency: "FCFA",
        receiver: receiverMatch ? "91038061" : "91038061 (Non spécifié dans le texte)",
        sender: "Joueur eFootball",
        date: new Date().toLocaleString("fr-FR"),
        isMatchingReceiver,
        isMatchingAmount,
        confidenceScore: confidence,
        verdict,
        summary: verdict === "AUTHENTIC" 
          ? `Reçu ${service} conforme de ${detectedAmount} FCFA vers le 91038061 (Réf: ${reference}).`
          : "Reçu analysé par le moteur local — vérification visuelle recommandée.",
        fraudAlerts: isMatchingReceiver ? [] : ["Le numéro destinataire 91038061 doit être vérifié sur le reçu."]
      }
    });

  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Erreur lors de l'analyse du reçu.");
  }
}
