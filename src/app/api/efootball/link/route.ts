import { NextRequest } from "next/server";
import { z } from "zod";
import { getSession, jsonError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { probeKonamiApi, validateIdentity, type Platform } from "@/lib/efootball";

const schema = z.object({
  konamiId: z.string(),
  gameId: z.string(),
  platform: z.enum(["MOBILE", "PS5", "XBOX", "PC"]),
  psnId: z.string().optional(),
  xboxId: z.string().optional(),
  steamId: z.string().optional()
});

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return jsonError("Connecte-toi.", 401);
  const body = schema.safeParse(await req.json());
  if (!body.success) return jsonError("Champs eFootball incomplets.");
  const err = validateIdentity({
    ...body.data,
    platform: body.data.platform as Platform
  });
  if (err) return jsonError(err);
  const probe = await probeKonamiApi();
  const link = await prisma.efootballLink.upsert({
    where: { userId: s.id },
    update: {
      konamiId: body.data.konamiId.trim(),
      gameId: body.data.gameId.trim(),
      platform: body.data.platform,
      psnId: body.data.psnId?.trim() || "",
      xboxId: body.data.xboxId?.trim() || "",
      steamId: body.data.steamId?.trim() || "",
      status: "PENDING",
      lastSyncAt: new Date(),
      syncNote: probe.message
    },
    create: {
      userId: s.id,
      konamiId: body.data.konamiId.trim(),
      gameId: body.data.gameId.trim(),
      platform: body.data.platform,
      psnId: body.data.psnId?.trim() || "",
      xboxId: body.data.xboxId?.trim() || "",
      steamId: body.data.steamId?.trim() || "",
      status: "PENDING",
      lastSyncAt: new Date(),
      syncNote: probe.message
    }
  });
  return Response.json({ ok: true, link, konami: probe });
}
