import { prisma } from "./db";
import { applyElo } from "./efootball";

export function nextPow2(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function roundLabel(totalRounds: number, idx: number) {
  const remaining = totalRounds - idx;
  if (remaining === 1) return "Finale";
  if (remaining === 2) return "Demi-finales";
  if (remaining === 3) return "Quarts";
  return `Tour ${idx + 1}`;
}

export async function launchDraw(tournamentId: string) {
  const paid = await prisma.registration.findMany({
    where: { tournamentId, paid: true },
    include: { user: true }
  });
  if (paid.length < 2) throw new Error("Il faut au moins 2 joueurs payés.");

  await prisma.match.deleteMany({ where: { tournamentId } });

  const players = shuffle(paid.map((r) => r.user));
  const size = nextPow2(players.length);
  const byeCount = size - players.length;
  const first: { p1Id: string | null; p2Id: string | null; winnerId: string | null; status: string }[] = [];

  let i = 0;
  for (let b = 0; b < byeCount; b++) {
    const p1Id = players[i++].id;
    first.push({ p1Id, p2Id: null, winnerId: p1Id, status: "BYE" });
  }
  while (i < players.length) {
    first.push({
      p1Id: players[i++].id,
      p2Id: players[i++].id,
      winnerId: null,
      status: "PENDING"
    });
  }

  await prisma.match.createMany({
    data: first.map((m, index) => ({
      tournamentId,
      round: 0,
      index,
      ...m
    }))
  });

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "LIVE" }
  });

  await maybeAdvance(tournamentId, 0);
}

export async function maybeAdvance(tournamentId: string, round: number) {
  const matches = await prisma.match.findMany({
    where: { tournamentId, round },
    orderBy: { index: "asc" }
  });
  if (matches.length <= 1) return;
  if (!matches.every((m) => m.winnerId)) return;

  const existing = await prisma.match.count({
    where: { tournamentId, round: round + 1 }
  });
  if (existing) return;

  const winners = matches.map((m) => m.winnerId!);
  const next = [];
  for (let i = 0; i < winners.length; i += 2) {
    const p1Id = winners[i];
    const p2Id = winners[i + 1] ?? null;
    next.push({
      tournamentId,
      round: round + 1,
      index: next.length,
      p1Id,
      p2Id,
      winnerId: p2Id ? null : p1Id,
      status: p2Id ? "PENDING" : "BYE"
    });
  }
  await prisma.match.createMany({ data: next });
  await maybeAdvance(tournamentId, round + 1);

  const last = await prisma.match.findMany({
    where: { tournamentId },
    orderBy: [{ round: "desc" }, { index: "asc" }]
  });
  const maxRound = Math.max(...last.map((m) => m.round));
  const finals = last.filter((m) => m.round === maxRound);
  if (finals.length === 1 && finals[0].winnerId) {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: "ENDED" }
    });
  }
}

export async function confirmMatch(
  matchId: string,
  score1: number,
  score2: number
) {
  if (score1 === score2) throw new Error("Pas d'égalité : TAB obligatoire.");
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || !match.p1Id || !match.p2Id) throw new Error("Match incomplet.");
  if (match.winnerId) throw new Error("Match déjà validé.");

  const winnerId = score1 > score2 ? match.p1Id : match.p2Id;
  const loserId = winnerId === match.p1Id ? match.p2Id : match.p1Id;

  await prisma.match.update({
    where: { id: matchId },
    data: { score1, score2, winnerId, status: "PLAYED" }
  });

  const [w, l] = await Promise.all([
    prisma.user.findUnique({ where: { id: winnerId } }),
    prisma.user.findUnique({ where: { id: loserId } })
  ]);
  if (w && l) {
    const next = applyElo(w.elo, l.elo);
    await prisma.user.update({ where: { id: w.id }, data: { elo: next.winner } });
    await prisma.user.update({ where: { id: l.id }, data: { elo: next.loser } });
  }

  await maybeAdvance(match.tournamentId, match.round);
}
