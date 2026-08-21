import { jsonError, requireOrganizer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { launchDraw } from "@/lib/bracket";

export async function POST(
  _: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  try {
    await requireOrganizer();
  } catch {
    return jsonError("Réservé à l'organisateur.", 403);
  }
  const { slug } = await ctx.params;
  const t = await prisma.tournament.findUnique({ where: { slug } });
  if (!t) return jsonError("Tournoi introuvable.", 404);
  try {
    await launchDraw(t.id);
    await prisma.livePulse.upsert({
      where: { id: "main" },
      update: { message: `Tirage lancé — ${t.name}` },
      create: { id: "main", message: `Tirage lancé — ${t.name}` }
    });
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Tirage impossible.");
  }
}
