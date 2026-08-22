import { prisma } from "@/lib/db";
import { jsonError, requireAdmin } from "@/lib/auth";

// GET /api/admin/tournaments — vue globale de tous les tournois
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Accès réservé à l'administrateur.", 403);
  }
  const tournaments = await prisma.tournament.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      organizer: { select: { id: true, name: true, email: true } },
      _count: { select: { registrations: true, matches: true } },
      registrations: { where: { paid: true }, select: { id: true } }
    }
  });
  return Response.json({
    ok: true,
    tournaments: tournaments.map((t) => ({
      ...t,
      paidCount: t.registrations.length,
      playerCount: t._count.registrations,
      matchCount: t._count.matches,
      pot: t.fee * t.registrations.length
    }))
  });
}
