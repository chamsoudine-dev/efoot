import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { verifyOrganizerToken } from "@/lib/organizer";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-organizer-token",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
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

  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");

  const gamerProfiles = await prisma.gamerProfile.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      phone: true,
      gameId: true,
      platform: true,
      deviceBrand: true,
      city: true,
      country: true,
      tournaments: true,
      createdAt: true,
    }
  });

  const registrationWhere = tournamentId ? { tournamentId } : {};
  const registrations = await prisma.registration.findMany({
    where: registrationWhere,
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          elo: true,
          efootball: {
            select: { gameId: true, platform: true, status: true }
          }
        }
      },
      tournament: {
        select: { id: true, name: true, slug: true, status: true }
      }
    }
  });

  const tournaments = await prisma.tournament.findMany({
    where: { status: { in: ["OPEN", "LIVE"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, slug: true, status: true, maxPlayers: true, _count: { select: { registrations: true } } }
  });

  return Response.json(
    { ok: true, gamerProfiles, registrations, tournaments },
    { headers: corsHeaders }
  );
}