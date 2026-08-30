import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, jsonError, requireOrganizer } from "@/lib/auth";
import { slugify } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");   // OPEN | LIVE | ENDED
  const mine = searchParams.get("mine");       // true → tournois de l'utilisateur connecté

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (status) where.status = status;
  if (mine === "true") {
    const session = await getSession();
    if (session) where.organizerId = session.id;
  }

  const list = await prisma.tournament.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      organizer: { select: { name: true } },
      _count: { select: { registrations: true } },
      registrations: { where: { paid: true }, select: { id: true } }
    }
  });
  return Response.json({
    ok: true,
    tournaments: list.map((t) => ({
      ...t,
      paidCount: t.registrations.length,
      playerCount: t._count.registrations,
      pot: t.fee * t.registrations.length
    }))
  });
}

const schema = z.object({
  name: z.string().min(3),
  description: z.string().min(8),
  fee: z.number().int().min(0),
  maxPlayers: z.number().int().min(2).max(128),
  p1Pct: z.number().int().min(0).max(100),
  p2Pct: z.number().int().min(0).max(100),
  orgPct: z.number().int().min(0).max(100),
  type: z.enum(["KNOCKOUT", "GROUPS", "LEAGUE"]).optional(),
  drawDate: z.string().optional(),
  payNum: z.string().optional(),
  wa: z.string().optional(),
  rules: z.string().optional()
});

export async function POST(req: NextRequest) {
  try {
    await requireOrganizer();
  } catch {
    return jsonError("Réservé à l'organisateur.", 403);
  }
  const s = await getSession();
  if (!s) return jsonError("Session invalide ou expirée.", 401);

  const body = schema.safeParse(await req.json());
  if (!body.success) return jsonError("Formulaire tournoi invalide.");
  if (body.data.p1Pct + body.data.p2Pct + body.data.orgPct !== 100) {
    return jsonError("Les pourcentages doivent faire 100%.");
  }
  let slug = slugify(body.data.name);
  const clash = await prisma.tournament.findUnique({ where: { slug } });
  if (clash) slug = `${slug}-${Date.now().toString(36)}`;
  const t = await prisma.tournament.create({
    data: {
      slug,
      name: body.data.name,
      description: body.data.description,
      fee: body.data.fee,
      maxPlayers: body.data.maxPlayers,
      p1Pct: body.data.p1Pct,
      p2Pct: body.data.p2Pct,
      orgPct: body.data.orgPct,
      type: body.data.type || "KNOCKOUT",
      drawDate: body.data.drawDate || "",
      payNum: body.data.payNum || "",
      wa: body.data.wa || "",
      rules: body.data.rules || "Match eFootball, 2x6 min, TAB si égalité.",
      organizerId: s.id
    }
  });
  return Response.json({ ok: true, tournament: t });
}

