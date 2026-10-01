import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getEloRank } from '@/lib/efootball';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  
  const players = await prisma.user.findMany({
    where: { isActive: true, role: { not: 'ADMIN' } },
    orderBy: { elo: 'desc' },
    take: Math.min(limit, 200),
    select: {
      id: true, name: true, elo: true,
      matchesAsP1: { where: { status: 'PLAYED' }, select: { winnerId: true, p1Id: true, score1: true, score2: true } },
      matchesAsP2: { where: { status: 'PLAYED' }, select: { winnerId: true, p2Id: true, score1: true, score2: true } },
      efootball: { select: { gameId: true, platform: true } }
    }
  });

  const result = players.map((p, idx) => {
    const allMatches = [
      ...p.matchesAsP1.map(m => ({ won: m.winnerId === p.id, scored: m.score1 ?? 0, conceded: m.score2 ?? 0 })),
      ...p.matchesAsP2.map(m => ({ won: m.winnerId === p.id, scored: m.score2 ?? 0, conceded: m.score1 ?? 0 }))
    ];
    const wins = allMatches.filter(m => m.won).length;
    const played = allMatches.length;
    const goalsFor = allMatches.reduce((s, m) => s + m.scored, 0);
    const rank = getEloRank(p.elo);
    
    return {
      position: idx + 1,
      id: p.id,
      name: p.name,
      gameId: p.efootball?.gameId || p.name,
      platform: p.efootball?.platform || 'Mobile',
      elo: p.elo,
      rank: rank.name,
      rankLabel: rank.label,
      rankEmoji: rank.emoji,
      rankColor: rank.color,
      played,
      wins,
      winRate: played > 0 ? Math.round((wins / played) * 100) : 0,
      goalsFor
    };
  });

  return Response.json({ ok: true, leaderboard: result }, {
    headers: { 'Access-Control-Allow-Origin': '*' }
  });
}
