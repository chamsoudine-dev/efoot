import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// GET /api/sync — Récupère toutes les compétitions et annonces depuis PostgreSQL
export async function GET() {
  try {
    const comps = await prisma.competitionStore.findMany({
      orderBy: { updatedAt: "desc" }
    });

    const announcements = await prisma.announcementStore.findMany();

    const compsMap: Record<string, any> = {};
    comps.forEach((c) => {
      compsMap[c.id] = c.data;
    });

    const annMap: Record<string, any> = {};
    announcements.forEach((a) => {
      annMap[a.id] = { text: a.text, at: a.at.getTime() };
    });

    return Response.json(
      { ok: true, competitions: compsMap, announcements: annMap },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    console.error("GET /api/sync error:", err);
    return Response.json(
      { ok: false, error: err?.message || "Erreur base de données", competitions: {}, announcements: {} },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST /api/sync — Sauvegarde / Met à jour une compétition ou une annonce dans PostgreSQL
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, data, announcement, removeId } = body;

    // Suppression d'une compétition
    if (removeId) {
      await prisma.competitionStore.deleteMany({ where: { id: removeId } });
      await prisma.announcementStore.deleteMany({ where: { id: removeId } });
      return Response.json({ ok: true, message: "Supprimé" }, { headers: corsHeaders });
    }

    // Sauvegarde d'une annonce
    if (announcement && id) {
      if (announcement.text) {
        await prisma.announcementStore.upsert({
          where: { id },
          create: { id, text: announcement.text },
          update: { text: announcement.text, at: new Date() }
        });
      } else {
        await prisma.announcementStore.deleteMany({ where: { id } });
      }
      return Response.json({ ok: true, message: "Annonce enregistrée" }, { headers: corsHeaders });
    }

    // Sauvegarde d'une compétition
    if (id && data) {
      await prisma.competitionStore.upsert({
        where: { id },
        create: { id, data },
        update: { data, updatedAt: new Date() }
      });
      return Response.json({ ok: true, message: "Compétition synchronisée" }, { headers: corsHeaders });
    }

    return Response.json({ ok: false, error: "Paramètres manquants (id, data requis)" }, { status: 400, headers: corsHeaders });
  } catch (err: any) {
    console.error("POST /api/sync error:", err);
    return Response.json(
      { ok: false, error: err?.message || "Erreur écriture base de données" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// DELETE /api/sync — Supprime une compétition par ID
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return Response.json({ ok: false, error: "ID manquant" }, { status: 400, headers: corsHeaders });
    }
    await prisma.competitionStore.deleteMany({ where: { id } });
    await prisma.announcementStore.deleteMany({ where: { id } });
    return Response.json({ ok: true, message: "Compétition supprimée avec succès" }, { headers: corsHeaders });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message }, { status: 500, headers: corsHeaders });
  }
}
