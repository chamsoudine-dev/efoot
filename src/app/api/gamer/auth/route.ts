import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { verifyOrganizerToken } from "@/lib/organizer";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const FIREBASE_DB_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://efoot-ba3de-default-rtdb.firebaseio.com";

function cleanPhone(raw: string): string {
  return raw.replace(/[\s\-\.\(\)]/g, "").trim();
}

function parseDevice(ua: string) {
  let brand = "Inconnu";
  let model = "Appareil";
  if (/iPhone/i.test(ua)) { brand = "Apple"; model = "iPhone"; }
  else if (/iPad/i.test(ua)) { brand = "Apple"; model = "iPad"; }
  else if (/SM-[A-Za-z0-9]+/i.test(ua) || /SAMSUNG/i.test(ua)) {
    brand = "Samsung";
    const m = ua.match(/SM-([A-Za-z0-9]+)/i);
    model = m ? "Galaxy SM-" + m[1] : "Galaxy";
  } else if (/TECNO[ -]?([A-Za-z0-9_-]+)/i.test(ua)) {
    brand = "Tecno";
    const m = ua.match(/TECNO[ -]?([A-Za-z0-9_-]+)/i);
    model = m ? "Tecno " + m[1] : "Tecno";
  } else if (/Infinix[ -]?([A-Za-z0-9_-]+)/i.test(ua) || /X[0-9]{3,4}/i.test(ua)) {
    brand = "Infinix";
    const m = ua.match(/Infinix[ -]?([A-Za-z0-9_-]+)/i) || ua.match(/(X[0-9]{3,4})/i);
    model = m ? "Infinix " + m[1] : "Infinix";
  } else if (/Redmi/i.test(ua) || /POCO/i.test(ua) || /Xiaomi/i.test(ua)) {
    brand = "Xiaomi";
    model = /Redmi/i.test(ua) ? "Redmi" : /POCO/i.test(ua) ? "POCO" : "Xiaomi";
  } else if (/CPH[0-9]{4}/i.test(ua) || /OPPO/i.test(ua)) { brand = "Oppo"; model = "Oppo"; }
  else if (/RMX[0-9]{4}/i.test(ua) || /realme/i.test(ua)) { brand = "Realme"; model = "Realme"; }
  else if (/vivo/i.test(ua)) { brand = "Vivo"; model = "Vivo"; }
  else if (/HUAWEI|HONOR/i.test(ua)) { brand = /HONOR/i.test(ua) ? "Honor" : "Huawei"; model = brand; }
  else if (/Windows NT/i.test(ua)) { brand = "PC Windows"; model = "Ordinateur PC"; }
  else if (/Macintosh/i.test(ua)) { brand = "Apple Mac"; model = "MacBook / iMac"; }
  return { brand, model };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, phone, password, name, gameId, platform, newPassword, adminSecret } = body;

    const sanitizedPhone = cleanPhone(phone || "");
    if (!sanitizedPhone) {
      return Response.json({ ok: false, error: "Numéro de téléphone requis." }, { status: 400, headers: corsHeaders });
    }

    const ua = req.headers.get("user-agent") || "";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "";
    const city = req.headers.get("x-vercel-ip-city") || "";
    const country = req.headers.get("x-vercel-ip-country") || "";
    const device = parseDevice(ua);

    // ──────────────────────────────────────────
    // 1. INSCRIPTION DU JOUEUR (REGISTER)
    // ──────────────────────────────────────────
    if (action === "register") {
      const finalPassword = (password && password.trim().length >= 4) ? password.trim() : "1234";
      if (!name || !gameId) {
        return Response.json({ ok: false, error: "Nom et ID eFootball obligatoires." }, { status: 400, headers: corsHeaders });
      }

      // Vérifier si un compte existe déjà avec ce numéro
      const existing = await prisma.gamerProfile.findFirst({
        where: {
          OR: [
            { phone: sanitizedPhone },
            { phone: phone }
          ]
        }
      });

      if (existing) {
        return Response.json({
          ok: false,
          error: "Un compte joueur existe déjà avec ce numéro. Connectez-vous ou réinitialisez votre mot de passe."
        }, { status: 409, headers: corsHeaders });
      }

      const passwordHash = await bcrypt.hash(finalPassword, 10);
      const gamerId = `gamer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      const newGamer = await prisma.gamerProfile.create({
        data: {
          id: gamerId,
          name: name.trim(),
          phone: sanitizedPhone,
          passwordHash,
          gameId: gameId.trim(),
          platform: platform || "Mobile",
          deviceBrand: device.brand,
          deviceModel: device.model,
          ipAddress: ip,
          city,
          country,
          userAgent: ua,
        }
      });

      // Sauvegarde Firebase en secours
      try {
        await fetch(`${FIREBASE_DB_URL}/gamers/${newGamer.id}.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: newGamer.id,
            name: newGamer.name,
            phone: newGamer.phone,
            gameId: newGamer.gameId,
            platform: newGamer.platform,
            createdAt: Date.now()
          })
        });
      } catch (e) {
        console.warn("[Firebase] register sync warning:", e);
      }

      return Response.json({ ok: true, gamer: newGamer }, { headers: corsHeaders });
    }

    // ──────────────────────────────────────────
    // 2. CONNEXION DU JOUEUR (LOGIN)
    // ──────────────────────────────────────────
    if (action === "login") {
      const finalPassword = (password && password.trim()) ? password.trim() : "1234";

      // Recherche par numéro nettoyé ou numéro brut
      const gamer = await prisma.gamerProfile.findFirst({
        where: {
          OR: [
            { phone: sanitizedPhone },
            { phone: phone }
          ]
        }
      });

      if (!gamer) {
        return Response.json({
          ok: false,
          error: "Aucun compte trouvé avec ce numéro de téléphone. Veuillez créer un compte."
        }, { status: 404, headers: corsHeaders });
      }

      // Si le joueur n'a pas encore de mot de passe, on lui attribue '1234'
      if (!gamer.passwordHash) {
        const defaultHash = await bcrypt.hash("1234", 10);
        await prisma.gamerProfile.update({
          where: { id: gamer.id },
          data: { passwordHash: defaultHash }
        });
        gamer.passwordHash = defaultHash;
      }

      const isMatch = await bcrypt.compare(finalPassword, gamer.passwordHash);

      if (!isMatch) {
        return Response.json({
          ok: false,
          error: "Mot de passe incorrect. Si vous l'avez oublié, contactez l'administrateur pour le réinitialiser."
        }, { status: 401, headers: corsHeaders });
      }

      // Mettre à jour les informations du dernier appareil utilisé
      await prisma.gamerProfile.update({
        where: { id: gamer.id },
        data: {
          deviceBrand: device.brand,
          deviceModel: device.model,
          ipAddress: ip || gamer.ipAddress,
          city: city || gamer.city,
          country: country || gamer.country,
          userAgent: ua || gamer.userAgent,
          updatedAt: new Date()
        }
      }).catch(() => {});

      return Response.json({
        ok: true,
        message: "Connexion réussie !",
        gamer: {
          id: gamer.id,
          name: gamer.name,
          phone: gamer.phone,
          gameId: gamer.gameId,
          platform: gamer.platform
        }
      }, { headers: corsHeaders });
    }

    // ──────────────────────────────────────────
    // 3. RÉINITIALISATION MOT DE PASSE (RESET / ADMIN ASSIST)
    // ──────────────────────────────────────────
    if (action === "reset-password") {
      const token = req.headers.get("x-organizer-token") || req.headers.get("authorization")?.replace("Bearer ", "") || null;
      const isOrg = await verifyOrganizerToken(token);
      const isSecretValid = adminSecret && process.env.ADMIN_RESET_SECRET && adminSecret === process.env.ADMIN_RESET_SECRET;

      if (!isOrg && !isSecretValid) {
        return Response.json({ ok: false, error: "Action non autorisée. Réservé à l'administrateur." }, { status: 403, headers: corsHeaders });
      }

      if (!newPassword || newPassword.length < 6) {
        return Response.json({ ok: false, error: "Nouveau mot de passe invalide (min 6 caractères)." }, { status: 400, headers: corsHeaders });
      }

      const gamer = await prisma.gamerProfile.findFirst({
        where: {
          OR: [
            { phone: sanitizedPhone },
            { phone: phone }
          ]
        }
      });

      if (!gamer) {
        return Response.json({ ok: false, error: "Joueur introuvable." }, { status: 404, headers: corsHeaders });
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      await prisma.gamerProfile.update({
        where: { id: gamer.id },
        data: { passwordHash: newHash, updatedAt: new Date() }
      });

      return Response.json({
        ok: true,
        message: `Mot de passe du joueur ${gamer.name} mis à jour avec succès.`
      }, { headers: corsHeaders });
    }

    return Response.json({ ok: false, error: "Action inconnue." }, { status: 400, headers: corsHeaders });
  } catch (err: unknown) {
    console.error("API /api/gamer/auth error:", err);
    const msg = err instanceof Error ? err.message : "Erreur interne serveur";
    return Response.json({ ok: false, error: msg }, { status: 500, headers: corsHeaders });
  }
}
