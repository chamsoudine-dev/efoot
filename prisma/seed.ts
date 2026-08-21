import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";

async function main() {
  const passwordHash = await bcrypt.hash("admin1234", 10);
  const organizer = await prisma.user.upsert({
    where: { email: "orga@efootligue.local" },
    update: {},
    create: {
      email: "orga@efootligue.local",
      passwordHash,
      name: "Organisateur",
      role: "ORGANIZER",
      phone: "22700000000",
      elo: 1200,
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

  const demoHash = await bcrypt.hash("joueur1234", 10);
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

  await prisma.livePulse.upsert({
    where: { id: "main" },
    update: { message: "Inscriptions ouvertes — Coupe Niamey Open" },
    create: { id: "main", message: "Inscriptions ouvertes — Coupe Niamey Open" }
  });

  console.log("Seed OK");
  console.log("Organisateur: orga@efootligue.local / admin1234");
  console.log("Joueur démo: amina@efootligue.local / joueur1234");
}

main().finally(() => prisma.$disconnect());
