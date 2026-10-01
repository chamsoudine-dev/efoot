/**
 * Connecteur compétition eFootball
 *
 * Konami n'expose PAS d'API publique pour lire les scores, le rating
 * Dream Team, ou les résultats de matchs custom. Les circuits officiels
 * (eFootball Championship Open / Toornament) collectent les IDs de jeu
 * (Konami ID, PSN, Xbox, Steam) puis valident les scores par preuve
 * (replay / capture) et décision d'arbitre.
 *
 * Ce module est le contrat interne. Le jour où Konami ouvre un endpoint,
 * on branche `OfficialKonamiAdapter` sans changer le reste du site.
 */

export type Platform = "MOBILE" | "PS5" | "XBOX" | "PC";

export type IdentityPayload = {
  konamiId: string;
  gameId: string;
  platform: Platform;
  psnId?: string;
  xboxId?: string;
  steamId?: string;
};

export type LinkResult = {
  ok: boolean;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  source: "INTERNAL" | "KONAMI";
  note: string;
};

const KONAMI_ID = /^[A-Za-z0-9_-]{4,32}$/;
const GAME_ID = /^[\p{L}\p{N} ._\-]{2,24}$/u;

export function validateIdentity(p: IdentityPayload): string | null {
  if (!KONAMI_ID.test(p.konamiId.trim())) {
    return "Konami ID invalide (4-32 caractères alphanumériques).";
  }
  if (!GAME_ID.test(p.gameId.trim())) {
    return "Pseudo eFootball invalide.";
  }
  if (!["MOBILE", "PS5", "XBOX", "PC"].includes(p.platform)) {
    return "Plateforme inconnue.";
  }
  if (p.platform === "PS5" && !(p.psnId || "").trim()) {
    return "Le PSN ID est obligatoire sur PlayStation.";
  }
  if (p.platform === "XBOX" && !(p.xboxId || "").trim()) {
    return "Le gamertag Xbox est obligatoire.";
  }
  if (p.platform === "PC" && !(p.steamId || "").trim()) {
    return "Le Steam ID / nom Steam est obligatoire sur PC.";
  }
  return null;
}

export async function probeKonamiApi(): Promise<{
  available: boolean;
  code: string;
  message: string;
}> {
  return {
    available: false,
    code: "KONAMI_NO_PUBLIC_API",
    message:
      "Konami ne publie pas d'API match/tournoi pour les organisateurs tiers. EFOOTLIGUE relie les compétitions via Konami ID + IDs plateforme, codes salon, et validation des scores."
  };
}

export function buildLobbyBrief(opts: {
  tournamentName: string;
  roundLabel: string;
  hostGameId: string;
  opponentGameId: string;
  lobbyCode?: string;
}) {
  return {
    game: "eFootball",
    mode: "Match amical / Invitation",
    duration: "2 x 6 minutes (réglage tournoi)",
    extraTime: true,
    penalties: true,
    host: opts.hostGameId,
    opponent: opts.opponentGameId,
    lobbyCode: opts.lobbyCode || "À générer dans le salon",
    notes: [
      `${opts.tournamentName} — ${opts.roundLabel}`,
      "Même plateforme obligatoire.",
      "Envoie une capture du score final si désaccord."
    ]
  };
}

export function applyElo(winnerElo: number, loserElo: number, k = 24) {
  const expected = 1 / (1 + 10 ** ((loserElo - winnerElo) / 400));
  const w = Math.round(winnerElo + k * (1 - expected));
  const l = Math.round(loserElo + k * (0 - (1 - expected)));
  return { winner: w, loser: Math.max(100, l) };
}

export type EloRank = {
  name: string;
  label: string;
  minElo: number;
  maxElo: number;
  color: string;
  emoji: string;
  badge: string;
};

export const ELO_RANKS: EloRank[] = [
  { name: 'MASTER',   label: 'Maître',   minElo: 1800, maxElo: 9999, color: '#FFD700', emoji: '👑', badge: 'rank-master' },
  { name: 'DIAMOND',  label: 'Diamant',  minElo: 1600, maxElo: 1799, color: '#00BFFF', emoji: '💠', badge: 'rank-diamond' },
  { name: 'PLATINUM', label: 'Platine',  minElo: 1400, maxElo: 1599, color: '#E5E4E2', emoji: '💎', badge: 'rank-platinum' },
  { name: 'GOLD',     label: 'Or',       minElo: 1200, maxElo: 1399, color: '#F2A83C', emoji: '🥇', badge: 'rank-gold' },
  { name: 'SILVER',   label: 'Argent',   minElo: 1000, maxElo: 1199, color: '#C0C0C0', emoji: '🥈', badge: 'rank-silver' },
  { name: 'BRONZE',   label: 'Bronze',   minElo:    0, maxElo:  999, color: '#CD7F32', emoji: '🥉', badge: 'rank-bronze' },
];

export function getEloRank(elo: number): EloRank {
  return ELO_RANKS.find(r => elo >= r.minElo && elo <= r.maxElo) || ELO_RANKS[ELO_RANKS.length - 1];
}

export function getEloProgress(elo: number): number {
  const rank = getEloRank(elo);
  if (rank.maxElo === 9999) return 100;
  return Math.round(((elo - rank.minElo) / (rank.maxElo - rank.minElo)) * 100);
}
