import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { initiatePayment, generateTransactionId } from '@/lib/payment';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tournamentSlug, playerName, playerPhone, gameId, platform, operator } = body;

    if (!tournamentSlug || !playerName || !playerPhone) {
      return Response.json(
        { ok: false, error: 'Informations obligatoires manquantes' },
        { status: 400, headers: CORS }
      );
    }

    const tournament = await prisma.tournament.findUnique({ where: { slug: tournamentSlug } });
    if (!tournament) {
      return Response.json({ ok: false, error: 'Tournoi introuvable' }, { status: 404, headers: CORS });
    }

    const transactionId = generateTransactionId('EFL');
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://efootligue.vercel.app';

    const result = await initiatePayment({
      amount: tournament.fee,
      transactionId,
      description: `Inscription ${tournament.name} — ${playerName}`,
      customerName: playerName,
      customerPhone: playerPhone,
      returnUrl: `${baseUrl}/index.html?payment=success&tx=${transactionId}`,
      notifyUrl: `${baseUrl}/api/payment/callback`,
      operator: operator || 'MANUAL',
      metadata: {
        tournamentSlug,
        playerName,
        playerPhone,
        gameId: gameId || '',
        platform: platform || 'Mobile',
      },
    });

    // Enregistrement de la transaction
    await prisma.competitionStore.upsert({
      where: { id: `tx_${transactionId}` },
      create: {
        id: `tx_${transactionId}`,
        data: {
          transactionId,
          tournamentSlug,
          tournamentName: tournament.name,
          playerName,
          playerPhone,
          gameId: gameId || '',
          platform: platform || 'Mobile',
          amount: tournament.fee,
          operator: operator || 'MANUAL',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        },
      },
      update: {
        data: {
          status: 'PENDING',
          updatedAt: new Date().toISOString(),
        },
      },
    });

    return Response.json(
      {
        ok: true,
        transactionId,
        paymentUrl: result.paymentUrl,
        provider: result.provider,
        fallback: result.fallback,
        tournament: {
          name: tournament.name,
          fee: tournament.fee,
          payNum: tournament.payNum,
          wa: tournament.wa,
        },
      },
      { headers: CORS }
    );
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500, headers: CORS }
    );
  }
}
