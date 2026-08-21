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
