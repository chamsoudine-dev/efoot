import { getSession, jsonError } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const s = await getSession();
  if (!s) return jsonError("Connecte-toi pour t'inscrire.", 401);
  const { slug } = await ctx.params;
  const t = await prisma.tournament.findUnique({
    where: { slug },
    include: { _count: { select: { registrations: true } } }
  });
  if (!t) return jsonError("Tournoi introuvable.", 404);
  if (t.status !== "OPEN") return jsonError("Inscriptions closes.");
  if (t._count.registrations >= t.maxPlayers) return jsonError("Complet.");
  const link = await prisma.efootballLink.findUnique({ where: { userId: s.id } });
  if (!link) return jsonError("Lie d'abord ton compte eFootball (Konami ID).");
  try {
    await prisma.registration.create({
      data: { tournamentId: t.id, userId: s.id }
    });
  } catch {
    return jsonError("Tu es déjà inscrit.");
  }
  return Response.json({ ok: true });
}
