import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "month"; // week | month | year

    const now = new Date();
    let since: Date;

    if (period === "week") {
      since = new Date(now);
      since.setDate(now.getDate() - 7);
    } else if (period === "year") {
      since = new Date(now);
      since.setFullYear(now.getFullYear() - 1);
    } else {
      // month (default)
      since = new Date(now);
      since.setMonth(now.getMonth() - 1);
    }

    // Chercher les tournois terminés avec un vainqueur connu
    const tournaments = await prisma.tournament.findMany({
      where: {
        status: "ENDED",
        // Utiliser finishedAt si présent, sinon fallback sur createdAt
        OR: [
          { finishedAt: { gte: since } },
          { AND: [{ finishedAt: null }, { createdAt: { gte: since } }] },
        ],
        winnerName: { not: "" },
      },
      orderBy: [
        { finishedAt: "desc" },
        { createdAt: "desc" },
      ],
      include: {
        organizer: { select: { name: true } },
        registrations: { where: { paid: true }, select: { id: true } },
      },
      take: 20,
    });

    // Si aucun vainqueur sur winnerName, essayer de le déduire depuis le bracket (Match)
    const enriched = await Promise.all(
      tournaments.map(async (t) => {
        let winnerName = t.winnerName;
        let winnerGameId = t.winnerGameId;

        if (!winnerName) {
          // Chercher le vainqueur du dernier match de la finale
          const finalMatch = await prisma.match.findFirst({
            where: { tournamentId: t.id, winner: { isNot: null } },
            orderBy: { round: "desc" },
            include: { winner: { include: { efootball: true } } },
          });
          if (finalMatch?.winner) {
            winnerName = finalMatch.winner.name;
            winnerGameId = finalMatch.winner.efootball?.gameId || "";
          }
        }

        const paidCount = t.registrations.length;
        const prize = Math.floor((t.fee * paidCount * t.p1Pct) / 100);

        return {
          id: t.id,
          slug: t.slug,
          name: t.name,
          winnerName,
          winnerGameId,
          prize,
          fee: t.fee,
          paidCount,
          p1Pct: t.p1Pct,
          organizer: t.organizer.name,
          finishedAt: t.finishedAt ?? t.createdAt,
        };
      })
    );

    return Response.json({ ok: true, winners: enriched, period }, { headers: corsHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erreur récupération vainqueurs";
    return Response.json({ ok: false, error: msg, winners: [] }, { status: 500, headers: corsHeaders });
  }
}
