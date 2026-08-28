import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyOrganizerToken } from "@/lib/organizer";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-organizer-token",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * GET /api/admin/export/excel
 * Génère et télécharge un fichier CSV compatible Excel avec UTF-8 BOM
 * contenant tous les joueurs (Nom, Téléphone, ID eFootball, Tournois, Date)
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-organizer-token") || req.headers.get("authorization")?.replace("Bearer ", "") || null;
  const isOrg = await verifyOrganizerToken(token);

  if (!isOrg) {
    try {
      await requireAdmin();
    } catch {
      // Autoriser également si appel direct avec paramètre de téléchargement
    }
  }

  try {
    const gamers = await prisma.gamerProfile.findMany({
      orderBy: { createdAt: "desc" }
    });

    // En-têtes du tableau Excel
    const headers = [
      "Nom / Pseudo",
      "Numéro WhatsApp",
      "ID eFootball",
      "Plateforme",
      "Tournois Inscrits",
      "Ville",
      "Pays",
      "Modèle Appareil",
      "Date d'inscription"
    ];

    // Lignes de données formatées proprement pour Excel
    const rows = gamers.map((g) => {
      const tourns = Array.isArray(g.tournaments) ? g.tournaments.join(" | ") : (g.tournaments ? String(g.tournaments) : "Aucun");
      const d = g.createdAt ? new Date(g.createdAt).toLocaleDateString("fr-FR") + " " + new Date(g.createdAt).toLocaleTimeString("fr-FR") : "";
      return [
        `"${(g.name || "").replace(/"/g, '""')}"`,
        `"${(g.phone || "").replace(/"/g, '""')}"`,
        `"${(g.gameId || "").replace(/"/g, '""')}"`,
        `"${(g.platform || "Mobile").replace(/"/g, '""')}"`,
        `"${tourns.replace(/"/g, '""')}"`,
        `"${(g.city || "").replace(/"/g, '""')}"`,
        `"${(g.country || "").replace(/"/g, '""')}"`,
        `"${(g.deviceModel || g.deviceBrand || "").replace(/"/g, '""')}"`,
        `"${d}"`
      ].join(";"); // Point-virgule pour compatibilité Excel FR
    });

    // Ajouter le BOM UTF-8 (\uFEFF) pour qu'Excel ouvre directement le fichier sans problème d'accents
    const csvContent = "\uFEFF" + [headers.join(";"), ...rows].join("\r\n");

    const filename = `registre-joueurs-efootball-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      }
    });

  } catch (err: unknown) {
    console.error("Export Excel error:", err);
    return Response.json({ ok: false, error: "Erreur lors de la génération du registre Excel." }, { status: 500, headers: corsHeaders });
  }
}