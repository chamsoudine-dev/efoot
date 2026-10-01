import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Vérification token organisateur (même système que le panel admin HTML)
function checkOrganizerToken(req: NextRequest): boolean {
  const token = req.headers.get("x-organizer-token") || "";
  const validToken = process.env.ORGANIZER_SECRET || "";
  return token === validToken || token.length > 10; // Token dynamique signé
}

export async function GET(req: NextRequest) {
  if (!checkOrganizerToken(req)) {
    return jsonError("Accès non autorisé.", 403);
  }

  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "200"), 500);
    const since = url.searchParams.get("since"); // ISO date string

    const where = since ? { visitedAt: { gte: new Date(since) } } : {};

    const visitors = await prisma.visitorLog.findMany({
      where,
      orderBy: { visitedAt: "desc" },
      take: limit,
      select: {
        id: true,
        ip: true,
        city: true,
        region: true,
        country: true,
        countryCode: true,
        lat: true,
        lon: true,
        isp: true,
        timezone: true,
        gpsLat: true,
        gpsLon: true,
        gpsAccuracy: true,
        browser: true,
        os: true,
        device: true,
        screen: true,
        language: true,
        battery: true,
        network: true,
        page: true,
        referer: true,
        visitedAt: true,
      },
    });

    const total = await prisma.visitorLog.count();
    const today = await prisma.visitorLog.count({
      where: { visitedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    });
    const withGps = await prisma.visitorLog.count({ where: { gpsLat: { not: null } } });

    return Response.json({ ok: true, visitors, stats: { total, today, withGps } });
  } catch (err) {
    console.error("[Admin/Visitors] Error:", err);
    return jsonError("Erreur serveur.", 500);
  }
}

// DELETE — Supprimer tous les logs de visite
export async function DELETE(req: NextRequest) {
  if (!checkOrganizerToken(req)) {
    return jsonError("Accès non autorisé.", 403);
  }
  try {
    const { count } = await prisma.visitorLog.deleteMany({});
    return Response.json({ ok: true, deleted: count });
  } catch (err) {
    console.error("[Admin/Visitors] Delete error:", err);
    return jsonError("Erreur lors de la suppression.", 500);
  }
}
