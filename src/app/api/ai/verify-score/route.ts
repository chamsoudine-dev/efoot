import { NextResponse } from 'next/server';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imageBase64, mimeType, matchId, p1Name, p2Name } = body;

    if (!imageBase64 || !mimeType) {
      return NextResponse.json(
        { ok: false, error: 'Missing image data' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `Analyse cette capture d'écran du jeu eFootball. 
Tu dois extraire le score final du match entre ces deux joueurs potentiels (si fournis) : Joueur 1: ${p1Name || 'Inconnu'}, Joueur 2: ${p2Name || 'Inconnu'}.
Si tu trouves les scores, donne le score du joueur 1, le score du joueur 2, les noms d'utilisateurs détectés, et un niveau de confiance de 0 à 100.
Donne aussi un verdict (VALID, DISPUTED, UNREADABLE) et un résumé bref.`;

    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        score1: { type: Type.INTEGER, description: 'Score du joueur 1' },
        score2: { type: Type.INTEGER, description: 'Score du joueur 2' },
        p1Detected: { type: Type.STRING, description: 'Nom détecté pour le joueur 1' },
        p2Detected: { type: Type.STRING, description: 'Nom détecté pour le joueur 2' },
        confidence: { type: Type.INTEGER, description: 'Niveau de confiance de 0 à 100' },
        verdict: { type: Type.STRING, description: 'VALID, DISPUTED, ou UNREADABLE', enum: ['VALID', 'DISPUTED', 'UNREADABLE'] },
        summary: { type: Type.STRING, description: 'Bref résumé de la lecture' },
      },
      required: ['score1', 'score2', 'p1Detected', 'p2Detected', 'confidence', 'verdict', 'summary'],
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: imageBase64,
                mimeType: mimeType,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
      },
    });

    const result = JSON.parse(response.text || '{}');
    let dbUpdated = false;

    if (result.confidence >= 80 && matchId && result.verdict === 'VALID') {
      // Auto-validate match
      await prisma.match.update({
        where: { id: matchId },
        data: {
          score1: result.score1,
          score2: result.score2,
          status: 'PLAYED',
        },
      });
      dbUpdated = true;
    }

    return NextResponse.json(
      {
        ok: true,
        ...result,
        dbUpdated,
      },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (error) {
    console.error('OCR Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
