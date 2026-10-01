import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getEloRank, getEloProgress } from '@/lib/efootball';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id }, { phone: id }, { name: id }],
      },
      include: {
        efootball: true,
        matchesAsP1: {
          where: { status: 'PLAYED' },
          select: { winnerId: true, score1: true, score2: true, id: true },
          take: 50,
        },
        matchesAsP2: {
          where: { status: 'PLAYED' },
          select: { winnerId: true, score1: true, score2: true, id: true },
          take: 50,
        },
      },
    });

    if (!user) {
      return Response.json({ ok: false, error: 'Joueur introuvable' }, { status: 404, headers: CORS });
    }

    const allMatches = [
      ...user.matchesAsP1.map((m) => ({
        won: m.winnerId === user.id,
        goalsFor: m.score1 ?? 0,
        goalsAgainst: m.score2 ?? 0,
        id: m.id,
      })),
      ...user.matchesAsP2.map((m) => ({
        won: m.winnerId === user.id,
        goalsFor: m.score2 ?? 0,
        goalsAgainst: m.score1 ?? 0,
        id: m.id,
      })),
    ];

    const played = allMatches.length;
    const wins = allMatches.filter((m) => m.won).length;
    const losses = played - wins;
    const totalGoals = allMatches.reduce((acc, m) => acc + m.goalsFor, 0);
    const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;
    const rank = getEloRank(user.elo);
    const progress = getEloProgress(user.elo);

    // Calcul de la note globale style FIFA (70 - 99)
    const baseOverall = Math.min(99, Math.max(68, Math.round(user.elo / 20)));

    const cardData = {
      id: user.id,
      name: user.name,
      gameId: user.efootball?.gameId || user.name,
      platform: user.efootball?.platform || 'Mobile',
      elo: user.elo,
      overall: baseOverall,
      rank: {
        name: rank.name,
        label: rank.label,
        emoji: rank.emoji,
        color: rank.color,
        badge: rank.badge,
        progress,
      },
      stats: {
        played,
        wins,
        losses,
        winRate: `${winRate}%`,
        totalGoals,
        avgGoalsPerMatch: played > 0 ? (totalGoals / played).toFixed(1) : '0.0',
        attack: Math.min(99, 70 + Math.round(totalGoals * 1.5)),
        defense: Math.min(99, 65 + Math.round(wins * 2)),
        skill: Math.min(99, 75 + Math.round(user.elo / 60)),
      },
    };

    return Response.json({ ok: true, card: cardData }, { headers: CORS });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur récupération carte' },
      { status: 500, headers: CORS }
    );
  }
}
