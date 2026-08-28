import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";

async function main() {
  const defaultSeedPass = process.env.SEED_PASSWORD || "AdminPass@2026";
  // ─── Compte ADMIN ──────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash(defaultSeedPass, 10);
  await prisma.user.upsert({
    where: { email: "admin@efootligue.local" },
    update: { passwordHash: adminHash },
    create: {
      email: "admin@efootligue.local",
      passwordHash: adminHash,
      name: "Administrateur",
      role: "ADMIN",
      phone: "",
      elo: 1000,
      isActive: true
    }
  });

  // ─── Compte ORGANISATEUR ───────────────────────────────────────────────────
  const orgaHash = await bcrypt.hash(defaultSeedPass, 10);
  const organizer = await prisma.user.upsert({
    where: { email: "orga@efootligue.local" },
    update: { passwordHash: orgaHash },
    create: {
      email: "orga@efootligue.local",
      passwordHash: orgaHash,
      name: "Organisateur",
      role: "ORGANIZER",
      phone: "22700000000",
      elo: 1200,
      isActive: true,
      efootball: {
        create: {
          konamiId: "EFOOT-ORGA-001",
          gameId: "Orga_Niger",
          platform: "MOBILE",
          status: "VERIFIED",
          syncNote: "Compte seed organisateur"
        }
      }
    }
  });

  // ─── Joueurs démo ──────────────────────────────────────────────────────────
  const demoHash = await bcrypt.hash("1234", 10);
  const names = [
    ["Amina", "Amina_EF"],
    ["Issa", "IssaPS"],
    ["Rahila", "Rahila9"],
    ["Boubacar", "Bouc_DT"],
    ["Zeinab", "ZeeMobile"],
    ["Moussa", "MoussaPro"]
  ];
  const users = [];
  for (const [name, gameId] of names) {
    const u = await prisma.user.upsert({
      where: { email: `${name.toLowerCase()}@efootligue.local` },
      update: {},
      create: {
        email: `${name.toLowerCase()}@efootligue.local`,
        passwordHash: demoHash,
        name,
        role: "PLAYER",
        elo: 980 + Math.floor(Math.random() * 120),
        isActive: true,
        efootball: {
          create: {
            konamiId: `KN-${gameId}`,
            gameId,
            platform: "MOBILE",
            status: "VERIFIED"
          }
        }
      }
    });
    users.push(u);
  }

  // ─── Tournois démo ─────────────────────────────────────────────────────────
  const existing = await prisma.tournament.findUnique({
    where: { slug: "coupe-niamey-open" }
  });
  if (!existing) {
    const t = await prisma.tournament.create({
      data: {
        slug: "coupe-niamey-open",
        name: "Coupe Niamey Open",
        description: "Élimination directe eFootball. Dream Team, 2x6 min, TAB.",
        fee: 500,
        maxPlayers: 16,
        p1Pct: 50,
        p2Pct: 20,
        orgPct: 30,
        type: "KNOCKOUT",
        drawDate: "Samedi 18h",
        payNum: "96 00 00 00",
        wa: "22796000000",
        status: "OPEN",
        organizerId: organizer.id
      }
    });
    for (const u of users.slice(0, 4)) {
      await prisma.registration.create({
        data: { tournamentId: t.id, userId: u.id, paid: true }
      });
    }
  }

  // Deuxième tournoi pour démontrer le multi-compétitions
  const existing2 = await prisma.tournament.findUnique({
    where: { slug: "ligue-niger-saison1" }
  });
  if (!existing2) {
    const t2 = await prisma.tournament.create({
      data: {
        slug: "ligue-niger-saison1",
        name: "Ligue Niger — Saison 1",
        description: "Championnat par poules. Meilleur bilan qualifié en finale.",
        fee: 1000,
        maxPlayers: 8,
        p1Pct: 60,
        p2Pct: 25,
        orgPct: 15,
        type: "GROUPS",
        drawDate: "Dimanche 16h",
        payNum: "97 00 00 00",
        wa: "22797000000",
        status: "OPEN",
        organizerId: organizer.id
      }
    });
    for (const u of users.slice(2, 6)) {
      await prisma.registration.create({
        data: { tournamentId: t2.id, userId: u.id, paid: false }
      });
    }
  }

  await prisma.livePulse.upsert({
    where: { id: "main" },
    update: { message: "2 compétitions ouvertes — Coupe Niamey Open & Ligue Niger Saison 1" },
    create: { id: "main", message: "2 compétitions ouvertes — Coupe Niamey Open & Ligue Niger Saison 1" }
  });

  console.log("✅ Seed OK");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("👑 Admin     : admin@efootligue.local / " + defaultSeedPass);
  console.log("🗂️  Organisateur: orga@efootligue.local / " + defaultSeedPass);
  console.log("🎮 Joueur démo : amina@efootligue.local / joueur1234");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().finally(() => prisma.$disconnect());

