import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyOrganizerToken } from '@/lib/organizer';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-organizer-token',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('x-organizer-token');
  const isOrg = await verifyOrganizerToken(token);
  if (!isOrg) {
    return Response.json({ ok: false, error: 'Accès organisateur refusé' }, { status: 403, headers: CORS });
  }

  const transactions = await prisma.competitionStore.findMany({
    where: { id: { startsWith: 'tx_' } },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });

  return Response.json(
    {
      ok: true,
      transactions: transactions.map((t) => ({
        id: t.id.replace('tx_', ''),
        ...((t.data as Record<string, unknown>)),
      })),
    },
    { headers: CORS }
  );
}
