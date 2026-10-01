/**
 * Telegram Bot Integration — EFootLigue
 * Bot Telegram officiel pour la gestion des championnats eFootball.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const BASE_URL = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : '';

export type TelegramMessage = {
  chat_id: string | number;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  reply_markup?: object;
};

export async function sendTelegramMessage(message: TelegramMessage): Promise<boolean> {
  if (!BOT_TOKEN) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN non configuré. Message en attente:', message.text.substring(0, 80));
    return false;
  }
  try {
    const res = await fetch(`${BASE_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    const data = await res.json();
    if (!data.ok) console.error('[Telegram] Erreur API:', data.description);
    return data.ok === true;
  } catch (err) {
    console.error('[Telegram] Erreur réseau:', err);
    return false;
  }
}

export async function broadcastToChannel(text: string, channelId?: string): Promise<boolean> {
  const id = channelId || process.env.TELEGRAM_CHANNEL_ID || '';
  if (!id) return false;
  return sendTelegramMessage({ chat_id: id, text, parse_mode: 'HTML' });
}

export function formatMatchNotification(opts: {
  p1Name: string;
  p2Name: string;
  tournamentName: string;
  scheduledAt?: Date | null;
  lobbyCode?: string;
}): string {
  const time = opts.scheduledAt
    ? new Date(opts.scheduledAt).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : 'À déterminer';
  return [
    `⚽ <b>MATCH PROGRAMMÉ — EFootLigue</b>`,
    ``,
    `🎮 <b>${opts.p1Name}</b> 🆚 <b>${opts.p2Name}</b>`,
    `🏆 Tournoi : ${opts.tournamentName}`,
    `⏰ Heure : ${time}`,
    opts.lobbyCode ? `🔑 Code Salon : <code>${opts.lobbyCode}</code>` : '',
    ``,
    `👉 <a href="https://efootligue.vercel.app">Rejoindre la salle sur EFootLigue</a>`
  ].filter(Boolean).join('\n');
}

export function formatScoreNotification(opts: {
  p1Name: string;
  p2Name: string;
  score1: number;
  score2: number;
  tournamentName: string;
  commentary?: string;
}): string {
  const winner = opts.score1 > opts.score2 ? opts.p1Name : opts.score2 > opts.score1 ? opts.p2Name : null;
  return [
    `🏁 <b>RÉSULTAT OFFICIEL VALIDÉ</b>`,
    ``,
    `⚽ <b>${opts.p1Name} ${opts.score1} - ${opts.score2} ${opts.p2Name}</b>`,
    winner ? `🏆 Vainqueur : <b>${winner}</b>` : `🤝 Match nul`,
    `📋 ${opts.tournamentName}`,
    opts.commentary ? `\n🎙️ <i>${opts.commentary}</i>` : '',
    ``,
    `👉 <a href="https://efootligue.vercel.app">Classement actualisé en direct</a>`
  ].filter(Boolean).join('\n');
}
