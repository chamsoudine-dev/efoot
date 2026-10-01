import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { checkPaymentStatus } from '@/lib/payment';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const transactionId = body.cpm_trans_id || body.transaction_id || body.cpm_payment_id;

    if (!transactionId) {
      return Response.json({ ok: false, error: 'transaction_id requis' });
    }

    const status = await checkPaymentStatus(transactionId);
    const txStore = await prisma.competitionStore.findUnique({ where: { id: `tx_${transactionId}` } });

    if (!txStore) {
      return Response.json({ ok: false, error: 'Transaction introuvable' });
    }

    const txData = txStore.data as Record<string, string>;

    if (status.status === 'PAID') {
      await prisma.competitionStore.update({
        where: { id: `tx_${transactionId}` },
        data: {
          data: {
            ...txData,
            status: 'PAID',
            paidAt: new Date().toISOString(),
            operator: status.operator || txData.operator,
          },
        },
      });

      // Si le joueur a déjà une inscription en base, la marquer comme payée automatiquement !
      if (txData.tournamentSlug && txData.playerPhone) {
        const tournament = await prisma.tournament.findUnique({ where: { slug: txData.tournamentSlug } });
        const user = await prisma.user.findFirst({ where: { phone: txData.playerPhone } });
        if (tournament && user) {
          await prisma.registration.upsert({
            where: {
              tournamentId_userId: {
                tournamentId: tournament.id,
                userId: user.id,
              },
            },
            create: {
              tournamentId: tournament.id,
              userId: user.id,
              paid: true,
            },
            update: {
              paid: true,
            },
          });
        }
      }
    }

    return Response.json({ ok: true, status: status.status });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur callback' });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tx = searchParams.get('tx');
  if (!tx) return Response.json({ ok: false, error: 'tx requis' }, { status: 400 });
  const status = await checkPaymentStatus(tx);
  return Response.json(status);
}
