import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/admin/users — liste tous les utilisateurs
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Accès réservé à l'administrateur.", 403);
  }
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      elo: true,
      isActive: true,
      createdAt: true,
      efootball: { select: { konamiId: true, gameId: true, platform: true, status: true } },
      _count: { select: { registrations: true, wins: true } }
    }
  });
  return Response.json({ ok: true, users });
}

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(["PLAYER", "ORGANIZER", "ADMIN"]).optional()
});

// PATCH /api/admin/users/[id] — activer/désactiver ou changer le rôle
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Accès réservé à l'administrateur.", 403);
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonError("Paramètre id manquant.");

  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return jsonError("Données invalides.");

  const user = await prisma.user.update({
    where: { id },
    data: body.data,
    select: { id: true, name: true, role: true, isActive: true }
  });
  return Response.json({ ok: true, user });
}

// DELETE /api/admin/users?id=... — supprimer un utilisateur
export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Accès réservé à l'administrateur.", 403);
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonError("Paramètre id manquant.");

  try {
    await prisma.user.delete({ where: { id } });
    return Response.json({ ok: true, message: "Utilisateur supprimé avec succès." });
  } catch (err: unknown) {
    console.error("DELETE /api/admin/users error:", err);
    return jsonError("Erreur lors de la suppression de l'utilisateur.", 500);
  }
}

