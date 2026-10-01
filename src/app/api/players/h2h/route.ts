import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const p1 = searchParams.get('p1');
  const p2 = searchParams.get('p2');
  if (!p1 || !p2) return Response.json({ ok: false, error: 'p1 et p2 requis' }, { status: 400 });

  const matches = await prisma.match.findMany({
    where: {
      status: 'PLAYED',
      OR: [
        { p1Id: p1, p2Id: p2 },
        { p1Id: p2, p2Id: p1 }
      ]
    },
    include: {
      p1: { select: { id: true, name: true, elo: true } },
      p2: { select: { id: true, name: true, elo: true } },
      winner: { select: { id: true, name: true } },
      tournament: { select: { name: true, slug: true } }
    },
    orderBy: { id: 'desc' }
  });

  const p1Wins = matches.filter(m => m.winnerId === p1).length;
  const p2Wins = matches.filter(m => m.winnerId === p2).length;
  const draws = matches.filter(m => m.score1 === m.score2).length;

  return Response.json({
    ok: true,
    h2h: { played: matches.length, p1Wins, p2Wins, draws, matches }
  }, { headers: { 'Access-Control-Allow-Origin': '*' } });
}
