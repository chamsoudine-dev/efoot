import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, requireOrganizer, getSession } from "@/lib/auth";
import { roundLabel } from "@/lib/bracket";
import { verifyOrganizerToken } from "@/lib/organizer";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-organizer-token",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

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
  }, { headers: corsHeaders });
}

const patchSchema = z.object({
  name: z.string().min(3).optional(),
  description: z.string().optional(),
  rules: z.string().optional(),
  payNum: z.string().optional(),
  wa: z.string().optional(),
  drawDate: z.string().optional(),
  status: z.enum(["OPEN", "LIVE", "ENDED"]).optional(),
  fee: z.number().int().min(0).optional(),
  maxPlayers: z.number().int().min(2).max(128).optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const token = req.headers.get("x-organizer-token") || req.headers.get("authorization")?.replace("Bearer ", "") || null;
  const isOrg = await verifyOrganizerToken(token);

  if (!isOrg) {
    try {
      await requireOrganizer();
    } catch {
      return jsonError("Réservé à l'organisateur.", 403);
    }
  }

  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return jsonError("Données de modification invalides.");

  try {
    const updated = await prisma.tournament.update({
      where: { slug },
      data: body.data
    });
    return Response.json({ ok: true, tournament: updated }, { headers: corsHeaders });
  } catch (err: unknown) {
    console.error("PATCH tournament error:", err);
    return jsonError("Tournoi introuvable ou erreur de mise à jour.", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const token = req.headers.get("x-organizer-token") || req.headers.get("authorization")?.replace("Bearer ", "") || null;
  const isOrg = await verifyOrganizerToken(token);

  if (!isOrg) {
    try {
      await requireOrganizer();
    } catch {
      return jsonError("Réservé à l'organisateur.", 403);
    }
  }

  try {
    const tournament = await prisma.tournament.findUnique({ where: { slug } });
    if (!tournament) return jsonError("Tournoi introuvable.", 404);

    // Supprimer les enregistrements dépendants
    await prisma.match.deleteMany({ where: { tournamentId: tournament.id } });
    await prisma.registration.deleteMany({ where: { tournamentId: tournament.id } });
    await prisma.standing.deleteMany({ where: { tournamentId: tournament.id } });
    await prisma.tournament.delete({ where: { id: tournament.id } });

    return Response.json({ ok: true, message: "Tournoi supprimé avec succès." }, { headers: corsHeaders });
  } catch (err: unknown) {
    console.error("DELETE tournament error:", err);
    return jsonError("Erreur lors de la suppression du tournoi.", 500);
  }
}
