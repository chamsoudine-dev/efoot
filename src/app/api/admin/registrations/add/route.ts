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
  tournamentId: z.string().min(1),
  // Ajouter un User Prisma existant
  userId: z.string().optional(),
  // Ou ajouter un GamerProfile (joueur du systeme HTML) par son ID
  gamerId: z.string().optional(),
  paid: z.boolean().optional().default(false),
});

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
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

  const body = schema.safeParse(await req.json());
  if (!body.success) return Response.json({ ok: false, error: "Donnees invalides." }, { status: 400, headers: corsHeaders });

  const { tournamentId, userId, gamerId, paid } = body.data;

  if (!userId && !gamerId) {
    return Response.json({ ok: false, error: "Fournissez userId ou gamerId." }, { status: 400, headers: corsHeaders });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { _count: { select: { registrations: true } } }
  });
  if (!tournament) return Response.json({ ok: false, error: "Tournoi introuvable." }, { status: 404, headers: corsHeaders });
  if (tournament._count.registrations >= tournament.maxPlayers) {
    return Response.json({ ok: false, error: "Le tournoi est complet." }, { status: 400, headers: corsHeaders });
  }

  let targetUserId = userId;

  // Si on a un gamerId mais pas de userId : chercher ou creer un User lie
  if (!targetUserId && gamerId) {
    const gamer = await prisma.gamerProfile.findUnique({ where: { id: gamerId } });
    if (!gamer) return Response.json({ ok: false, error: "Joueur introuvable." }, { status: 404, headers: corsHeaders });

    // Chercher si un User existe avec le meme email derive du phone
    const derivedEmail = `gamer_${gamer.phone.replace(/\D/g, "")}@efootligue.local`;
    let user = await prisma.user.findUnique({ where: { email: derivedEmail } });

    if (!user) {
      // Creer un User minimal pour ce gamer
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash("efootligue_gamer_auto", 10);
      user = await prisma.user.create({
        data: {
          email: derivedEmail,
          passwordHash: hash,
          name: gamer.name,
          phone: gamer.phone,
          role: "PLAYER",
        }
      });
    }
    targetUserId = user.id;
  }

  try {
    const reg = await prisma.registration.create({
      data: {
        tournamentId,
        userId: targetUserId!,
        paid: paid ?? false,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        tournament: { select: { id: true, name: true } }
      }
    });
    return Response.json({ ok: true, registration: reg }, { headers: corsHeaders });
  } catch {
    return Response.json({ ok: false, error: "Ce joueur est deja inscrit a ce tournoi." }, { status: 409, headers: corsHeaders });
  }
}