import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { verifyOrganizerToken } from "@/lib/organizer";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-organizer-token",
};

const schema = z.object({
  scheduledAt: z.string().optional(),
  hostNote: z.string().max(500).optional(),
  lobbyCode: z.string().max(100).optional(),
  p1Id: z.string().optional(),
  p2Id: z.string().optional(),
  p1Name: z.string().max(80).optional(),
  p2Name: z.string().max(80).optional(),
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

  const body = schema.safeParse(await req.json());
  if (!body.success) return Response.json({ ok: false, error: "Donnees invalides." }, { status: 400, headers: corsHeaders });

  const { scheduledAt, hostNote, lobbyCode, p1Id, p2Id, p1Name, p2Name } = body.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};
  if (scheduledAt !== undefined) updateData.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
  if (hostNote !== undefined) updateData.hostNote = hostNote;
  if (lobbyCode !== undefined) updateData.lobbyCode = lobbyCode;
  if (p1Id !== undefined) updateData.p1Id = p1Id || null;
  if (p2Id !== undefined) updateData.p2Id = p2Id || null;
  if (p1Name !== undefined) updateData.p1Name = p1Name;
  if (p2Name !== undefined) updateData.p2Name = p2Name;

  if (Object.keys(updateData).length === 0) {
    return Response.json({ ok: false, error: "Aucune donnee a mettre a jour." }, { status: 400, headers: corsHeaders });
  }

  const updated = await prisma.match.update({
    where: { id },
    data: updateData,
    include: {
      p1: { select: { id: true, name: true } },
      p2: { select: { id: true, name: true } },
    }
  });

  return Response.json({ ok: true, match: updated }, { headers: corsHeaders });
}