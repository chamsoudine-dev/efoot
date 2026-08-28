import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { confirmMatch, maybeAdvance } from "@/lib/bracket";
import { verifyOrganizerToken } from "@/lib/organizer";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-organizer-token",
};

const schema = z.object({
  score1: z.number().int().min(0),
  score2: z.number().int().min(0),
  winnerId: z.string().optional(),
});

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const token = req.headers.get("x-organizer-token") || req.headers.get("authorization")?.replace("Bearer ", "") || null;
  const isOrg = await verifyOrganizerToken(token);

  if (!isOrg) {
    try {
      await requireAdmin();
    } catch {
      return Response.json(
        { ok: false, error: "Acces reserve a l administrateur." },
        { status: 403, headers: corsHeaders }
      );
    }
  }

  const { id } = await ctx.params;
  const match = await prisma.match.findUnique({ where: { id } });
  if (!match) return Response.json({ ok: false, error: "Match introuvable." }, { status: 404, headers: corsHeaders });
  if (match.status === "PLAYED") return Response.json({ ok: false, error: "Ce match a deja ete valide." }, { status: 400, headers: corsHeaders });

  const body = schema.safeParse(await req.json());
  if (!body.success) return Response.json({ ok: false, error: "Donnees invalides." }, { status: 400, headers: corsHeaders });

  const { score1, score2, winnerId } = body.data;

  try {
    if (score1 === score2) {
      if (!winnerId) {
        return Response.json(
          { ok: false, error: "Egalite - indiquez le vainqueur (TAB) via winnerId." },
          { status: 400, headers: corsHeaders }
        );
      }
      await prisma.match.update({
        where: { id },
        data: { score1, score2, winnerId, status: "PLAYED" }
      });
      await maybeAdvance(match.tournamentId, match.round);
    } else {
      await confirmMatch(id, score1, score2);
    }

    const updated = await prisma.match.findUnique({
      where: { id },
      include: {
        p1: { select: { id: true, name: true, elo: true } },
        p2: { select: { id: true, name: true, elo: true } },
        winner: { select: { id: true, name: true } },
      }
    });

    return Response.json({ ok: true, match: updated }, { headers: corsHeaders });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Erreur lors de la validation du match." },
      { status: 500, headers: corsHeaders }
    );
  }
}