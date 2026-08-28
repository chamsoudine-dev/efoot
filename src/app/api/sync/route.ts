import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyOrganizerToken } from "@/lib/organizer";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ──────────────────────────────────────────────────────
// Firebase RTDB REST — ecriture serveur vers clients
// Pousse les donnees pour declencher les .on("value")
// des utilisateurs instantanement (sans polling)
// ──────────────────────────────────────────────────────
const FIREBASE_DB_URL = "https://efoot-ba3de-default-rtdb.firebaseio.com";

async function pushToFirebase(path: string, data: unknown): Promise<void> {
  try {
    await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (e) {
    console.warn("[Firebase] push error:", e);
  }
}

async function deleteFromFirebase(path: string): Promise<void> {
  try {
    await fetch(`${FIREBASE_DB_URL}/${path}.json`, { method: "DELETE" });
  } catch (e) {
    console.warn("[Firebase] delete error:", e);
  }
}

async function notifyUpdate(compId?: string): Promise<void> {
  try {
    await fetch(`${FIREBASE_DB_URL}/syncSignal.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: Date.now(), compId: compId || null }),
    });
  } catch (e) {
    console.warn("[Firebase] notify error:", e);
  }
}

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────
function parseDeviceFromUa(ua: string) {
  let brand = "Inconnu";
  let model = "Appareil";
  if (/iPhone/i.test(ua)) { brand = "Apple"; model = "iPhone"; }
  else if (/iPad/i.test(ua)) { brand = "Apple"; model = "iPad"; }
  else if (/SM-[A-Za-z0-9]+/i.test(ua) || /SAMSUNG/i.test(ua)) {
    brand = "Samsung";
    const match = ua.match(/SM-([A-Za-z0-9]+)/i);
    model = match ? "Galaxy SM-" + match[1] : "Galaxy";
  } else if (/TECNO[ -]?([A-Za-z0-9_-]+)/i.test(ua)) {
    brand = "Tecno";
    const match = ua.match(/TECNO[ -]?([A-Za-z0-9_-]+)/i);
    model = match ? "Tecno " + match[1] : "Tecno Mobile";
  } else if (/Infinix[ -]?([A-Za-z0-9_-]+)/i.test(ua) || /X[0-9]{3,4}/i.test(ua)) {
    brand = "Infinix";
    const match = ua.match(/Infinix[ -]?([A-Za-z0-9_-]+)/i) || ua.match(/(X[0-9]{3,4})/i);
    model = match ? "Infinix " + match[1] : "Infinix Mobile";
  } else if (/Redmi/i.test(ua) || /POCO/i.test(ua) || /Xiaomi/i.test(ua)) {
    brand = "Xiaomi";
    model = /Redmi/i.test(ua) ? "Redmi" : /POCO/i.test(ua) ? "POCO" : "Xiaomi";
  } else if (/CPH[0-9]{4}/i.test(ua) || /OPPO/i.test(ua)) { brand = "Oppo"; model = "Oppo"; }
  else if (/RMX[0-9]{4}/i.test(ua) || /realme/i.test(ua)) { brand = "Realme"; model = "Realme"; }
  else if (/vivo/i.test(ua)) { brand = "Vivo"; model = "Vivo"; }
  else if (/HUAWEI|HONOR/i.test(ua)) { brand = /HONOR/i.test(ua) ? "Honor" : "Huawei"; model = brand; }
  else if (/Pixel/i.test(ua)) { brand = "Google"; model = "Google Pixel"; }
  else if (/itel/i.test(ua)) { brand = "Itel"; model = "Itel Mobile"; }
  else if (/Windows NT/i.test(ua)) { brand = "PC Windows"; model = "Ordinateur PC"; }
  else if (/Macintosh/i.test(ua)) { brand = "Apple Mac"; model = "MacBook / iMac"; }
  else if (/Linux/i.test(ua)) { brand = "Linux"; model = "Linux PC / Device"; }
  return { brand, model };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  try {
    const comps = await prisma.competitionStore.findMany({ orderBy: { updatedAt: "desc" } });
    const announcements = await prisma.announcementStore.findMany();
    const players = await prisma.gamerProfile.findMany({ orderBy: { createdAt: "desc" } });

    const compsMap: Record<string, unknown> = {};
    comps.forEach((c) => { compsMap[c.id] = c.data; });

    const annMap: Record<string, unknown> = {};
    announcements.forEach((a) => { annMap[a.id] = { text: a.text, at: a.at.getTime() }; });

    return Response.json(
      { ok: true, competitions: compsMap, announcements: annMap, players },
      { headers: corsHeaders }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erreur base de donnees";
    console.error("GET /api/sync error:", err);
    return Response.json(
      { ok: false, error: msg, competitions: {}, announcements: {}, players: [] },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, data, announcement, removeId, player, removePlayerId } = body;

    if (removePlayerId) {
      await prisma.gamerProfile.deleteMany({ where: { id: removePlayerId } });
      await deleteFromFirebase(`gamers/${removePlayerId}`);
      await notifyUpdate();
      return Response.json({ ok: true, message: "Joueur supprime" }, { headers: corsHeaders });
    }

    if (removeId) {
      await prisma.competitionStore.deleteMany({ where: { id: removeId } });
      await prisma.announcementStore.deleteMany({ where: { id: removeId } });
      await deleteFromFirebase(`competitions/${removeId}`);
      await deleteFromFirebase(`announcements/${removeId}`);
      await notifyUpdate(removeId);
      return Response.json({ ok: true, message: "Supprime" }, { headers: corsHeaders });
    }

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || (player?.ipAddress ?? "");
    const city = req.headers.get("x-vercel-ip-city") || (player?.city ?? "");
    const country = req.headers.get("x-vercel-ip-country") || (player?.country ?? "");
    const countryCode = req.headers.get("x-vercel-ip-country-region") || req.headers.get("x-vercel-ip-country") || (player?.countryCode ?? "");
    const userAgent = req.headers.get("user-agent") || (player?.userAgent ?? "");
    const detected = parseDeviceFromUa(userAgent);

    const token = req.headers.get("x-organizer-token") || req.headers.get("authorization")?.replace("Bearer ", "") || null;
    const isOrg = await verifyOrganizerToken(token);

    if (removePlayerId) {
      if (!isOrg) {
        return Response.json({ ok: false, error: "Action réservée à l'administrateur." }, { status: 403, headers: corsHeaders });
      }
      await prisma.gamerProfile.deleteMany({ where: { id: removePlayerId } });
      await deleteFromFirebase(`gamers/${removePlayerId}`);
      await notifyUpdate();
      return Response.json({ ok: true, message: "Joueur supprime" }, { headers: corsHeaders });
    }

    if (removeId) {
      if (!isOrg) {
        return Response.json({ ok: false, error: "Action réservée à l'administrateur." }, { status: 403, headers: corsHeaders });
      }
      await prisma.competitionStore.deleteMany({ where: { id: removeId } });
      await prisma.announcementStore.deleteMany({ where: { id: removeId } });
      await deleteFromFirebase(`competitions/${removeId}`);
      await deleteFromFirebase(`announcements/${removeId}`);
      await notifyUpdate(removeId);
      return Response.json({ ok: true, message: "Supprime" }, { headers: corsHeaders });
    }

    if (player && (player.id || player.name)) {
      const pId = player.id || `p_${Date.now().toString(36)}`;
      const pBrand = player.deviceBrand || detected.brand;
      const pModel = player.deviceModel || detected.model;

      const savedPlayer = await prisma.gamerProfile.upsert({
        where: { id: pId },
        create: {
          id: pId, name: player.name || "Joueur", phone: player.phone || "",
          gameId: player.gameId || player.name || "", platform: player.platform || "Mobile",
          deviceBrand: pBrand, deviceModel: pModel,
          ipAddress: player.ipAddress || ipAddress, city: player.city || city,
          country: player.country || country, countryCode: player.countryCode || countryCode,
          userAgent: userAgent, tournaments: player.tournaments || [],
        },
        update: {
          name: player.name, phone: player.phone || undefined, gameId: player.gameId || undefined,
          platform: player.platform || undefined, deviceBrand: pBrand, deviceModel: pModel,
          ipAddress: player.ipAddress || ipAddress || undefined, city: player.city || city || undefined,
          country: player.country || country || undefined, countryCode: player.countryCode || countryCode || undefined,
          userAgent: userAgent || undefined, tournaments: player.tournaments || undefined,
        },
      });

      await pushToFirebase(`gamers/${pId}`, { id: pId, name: savedPlayer.name, gameId: savedPlayer.gameId, platform: savedPlayer.platform });
      await notifyUpdate();
      return Response.json({ ok: true, player: savedPlayer }, { headers: corsHeaders });
    }

    if (announcement && id) {
      if (!isOrg) {
        return Response.json({ ok: false, error: "Seul l'organisateur peut publier des annonces officielles." }, { status: 403, headers: corsHeaders });
      }
      if (announcement.text) {
        await prisma.announcementStore.upsert({
          where: { id },
          create: { id, text: announcement.text },
          update: { text: announcement.text, at: new Date() },
        });
        await pushToFirebase(`announcements/${id}`, { text: announcement.text, at: Date.now() });
      } else {
        await prisma.announcementStore.deleteMany({ where: { id } });
        await deleteFromFirebase(`announcements/${id}`);
      }
      await notifyUpdate(id);
      return Response.json({ ok: true, message: "Annonce enregistree" }, { headers: corsHeaders });
    }

    if (id && data) {
      // Pour les modifications de matchs, scores, standings ou bracket : vérification requise
      // Si ce n'est pas l'organisateur, on vérifie que l'opération est une inscription de joueur
      const existingComp = await prisma.competitionStore.findUnique({ where: { id } });
      if (!isOrg && existingComp) {
        const oldData = existingComp.data as Record<string, unknown> | null;
        // Si tentative de modifier la config ou les matchs sans être organisateur
        const oldMatches = JSON.stringify(oldData?.leagueMatches || []);
        const newMatches = JSON.stringify(data.leagueMatches || []);
        const oldBracket = JSON.stringify(oldData?.bracket || null);
        const newBracket = JSON.stringify(data.bracket || null);
        if (oldMatches !== newMatches || oldBracket !== newBracket) {
          return Response.json({ ok: false, error: "Seul l'organisateur peut modifier les matchs et scores." }, { status: 403, headers: corsHeaders });
        }
      }

      await prisma.competitionStore.upsert({
        where: { id },
        create: { id, data },
        update: { data, updatedAt: new Date() },
      });

      // Pousser dans Firebase RTDB -> declenche .on("value") sur tous les clients instantanement
      await pushToFirebase(`competitions/${id}`, data);
      await notifyUpdate(id);

      if (Array.isArray(data.registrations) && data.registrations.length > 0) {
        for (const reg of data.registrations) {
          if (reg && reg.id && reg.name) {
            const rBrand = reg.deviceBrand || detected.brand;
            const rModel = reg.deviceModel || detected.model;
            await prisma.gamerProfile.upsert({
              where: { id: reg.id },
              create: {
                id: reg.id, name: reg.name, phone: reg.phone || "", gameId: reg.gameId || reg.name,
                platform: reg.platform || "Mobile", deviceBrand: rBrand, deviceModel: rModel,
                ipAddress: reg.ipAddress || ipAddress, city: reg.city || city,
                country: reg.country || country, countryCode: reg.countryCode || countryCode,
                userAgent: reg.userAgent || userAgent, tournaments: [data.config?.name || id],
              },
              update: {
                name: reg.name, phone: reg.phone || undefined, gameId: reg.gameId || undefined,
                platform: reg.platform || undefined, deviceBrand: rBrand, deviceModel: rModel,
                ipAddress: reg.ipAddress || ipAddress || undefined, city: reg.city || city || undefined,
                country: reg.country || country || undefined, countryCode: reg.countryCode || countryCode || undefined,
              },
            }).catch(() => {});
          }
        }
      }

      return Response.json({ ok: true, message: "Competition synchronisee" }, { headers: corsHeaders });
    }

    return Response.json({ ok: false, error: "Parametres manquants" }, { status: 400, headers: corsHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erreur ecriture base de donnees";
    console.error("POST /api/sync error:", err);
    return Response.json({ ok: false, error: msg }, { status: 500, headers: corsHeaders });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = req.headers.get("x-organizer-token") || req.headers.get("authorization")?.replace("Bearer ", "") || null;
    const isOrg = await verifyOrganizerToken(token);
    if (!isOrg) {
      return Response.json({ ok: false, error: "Action réservée à l'administrateur." }, { status: 403, headers: corsHeaders });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const playerId = searchParams.get("playerId");

    if (playerId) {
      await prisma.gamerProfile.deleteMany({ where: { id: playerId } });
      await deleteFromFirebase(`gamers/${playerId}`);
      await notifyUpdate();
      return Response.json({ ok: true, message: "Joueur supprime" }, { headers: corsHeaders });
    }

    if (!id) {
      return Response.json({ ok: false, error: "ID manquant" }, { status: 400, headers: corsHeaders });
    }

    await prisma.competitionStore.deleteMany({ where: { id } });
    await prisma.announcementStore.deleteMany({ where: { id } });
    await deleteFromFirebase(`competitions/${id}`);
    await deleteFromFirebase(`announcements/${id}`);
    await notifyUpdate(id);

    return Response.json({ ok: true, message: "Competition supprimee avec succes" }, { headers: corsHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erreur";
    return Response.json({ ok: false, error: msg }, { status: 500, headers: corsHeaders });
  }
}
