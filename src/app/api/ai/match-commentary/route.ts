import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { matchId } = body;

    if (!matchId) {
      return NextResponse.json({ ok: false, error: 'Missing matchId' }, { status: 400 });
    }

    // Retrieve match from Prisma
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { 
        // Including relations if they exist in schema, fallback to scalar fields otherwise
        // Usually schema defines p1, p2, winner, tournament if it has those relation fields.
        // If not, we will rely on the standard fields (p1Name, p2Name, tournamentId).
      },
    });

    if (!match) {
      return NextResponse.json({ ok: false, error: 'Match not found' }, { status: 404 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const p1 = match.p1Name || 'Joueur 1';
    const p2 = match.p2Name || 'Joueur 2';
    const s1 = match.score1 ?? 0;
    const s2 = match.score2 ?? 0;

    const prompt = `Tu es un commentateur sportif eSport spécialisé sur eFootball. 
Rédige un commentaire percutant (3-4 phrases en français) pour le résultat de ce match :
Le joueur "${p1}" a marqué ${s1} buts.
Le joueur "${p2}" a marqué ${s2} buts.
Mets de l'ambiance, parle de victoire écrasante, de match serré, de remontada ou de domination selon le score.
Exemple: "Victoire écrasante de [Joueur] X-Y contre [Adversaire]! Prestation dominante..."`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const commentary = response.text?.trim() || 'Quel match incroyable !';

    // Store in Firebase RTDB
    const tournamentId = match.tournamentId || 'unknown_tournament';
    const firebaseUrl = `https://efoot-ba3de-default-rtdb.firebaseio.com/ligue/commentary/${tournamentId}/${matchId}.json`;
    
    const firebaseData = {
      text: commentary,
      matchId: matchId,
      p1: p1,
      p2: p2,
      score: `${s1}-${s2}`,
      generatedAt: new Date().toISOString()
    };

    const fbRes = await fetch(firebaseUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(firebaseData),
    });

    if (!fbRes.ok) {
      console.error('Failed to save to Firebase RTDB', await fbRes.text());
    }

    return NextResponse.json({
      ok: true,
      commentary,
      matchId
    });

  } catch (error) {
    console.error('Commentary Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
