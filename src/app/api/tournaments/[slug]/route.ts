import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/auth";
import { roundLabel } from "@/lib/bracket";

export async function GET(
  _: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const t = await prisma.tournament.findUnique({
    where: { slug },
    include: {
      organizer: { select: { name: true } },
      registrations: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              elo: true,
              efootball: true
            }
          }
        },
        orderBy: { createdAt: "asc" }
      },
      matches: {
        include: {
          p1: { include: { efootball: true } },
          p2: { include: { efootball: true } },
          winner: { include: { efootball: true } }
        },
        orderBy: [{ round: "asc" }, { index: "asc" }]
      }
    }
  });
  if (!t) return jsonError("Tournoi introuvable.", 404);
  const paid = t.registrations.filter((r) => r.paid).length;
  const rounds = new Map<number, typeof t.matches>();
  for (const m of t.matches) {
    const arr = rounds.get(m.round) || [];
    arr.push(m);
    rounds.set(m.round, arr);
  }
  const roundCount = rounds.size;
  return Response.json({
    ok: true,
    tournament: {
      ...t,
      paidCount: paid,
      pot: t.fee * paid,
      bracket: [...rounds.entries()].map(([round, matches]) => ({
        round,
        label: roundLabel(Math.max(roundCount, 1), round),
        matches
      }))
    }
  });
}
