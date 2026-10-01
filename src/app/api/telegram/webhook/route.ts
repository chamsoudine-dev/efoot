import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    const message = update.message || update.channel_post;
    if (!message) return Response.json({ ok: true });

    const chatId = message.chat.id;
    const text = (message.text || '').trim();
    const cmd = text.split(' ')[0].toLowerCase().replace('@efootliguebot', '');

    switch (cmd) {
      case '/start':
      case '/aide':
      case '/help': {
        await sendTelegramMessage({
          chat_id: chatId,
          parse_mode: 'HTML',
          text: [
            '🏆 <b>Bienvenue sur EFootLigue Bot Officiel !</b>',
            '',
            'Voici les commandes disponibles :',
            '📊 <b>/scores</b> — Voir les 5 derniers scores validés',
            '🏅 <b>/classement</b> — Top 10 mondial ELO',
            '🏆 <b>/tournois</b> — Tournois actifs et inscriptions ouvertes',
            '❓ <b>/aide</b> — Afficher ce message',
            '',
            '👉 Accédez à la plateforme : <a href="https://efootligue.vercel.app">EFootLigue Web App</a>'
          ].join('\n')
        });
        break;
      }

      case '/scores': {
        const matches = await prisma.match.findMany({
          where: { status: 'PLAYED' },
          orderBy: { id: 'desc' },
          take: 5,
          include: { tournament: { select: { name: true } } }
        });
        if (!matches.length) {
          await sendTelegramMessage({ chat_id: chatId, text: '📭 Aucun match joué pour le moment.' });
        } else {
          const lines = ['⚽ <b>Derniers scores EFootLigue :</b>', ''];
          matches.forEach(m => {
            lines.push(`• <b>${m.p1Name} ${m.score1 ?? '?'} - ${m.score2 ?? '?'} ${m.p2Name}</b>`);
            lines.push(`  🏆 <i>${m.tournament.name}</i>`);
          });
          await sendTelegramMessage({ chat_id: chatId, parse_mode: 'HTML', text: lines.join('\n') });
        }
        break;
      }

      case '/classement': {
        const players = await prisma.user.findMany({
          where: { isActive: true, role: { not: 'ADMIN' } },
          orderBy: { elo: 'desc' },
          take: 10,
          select: { name: true, elo: true }
        });
        const rankEmoji = ['👑', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        const lines = ['🏅 <b>Top 10 — Classement ELO EFootLigue :</b>', ''];
        players.forEach((p, i) => {
          lines.push(`${rankEmoji[i] || `${i + 1}.`} <b>${p.name}</b> — <code>${p.elo} ELO</code>`);
        });
        await sendTelegramMessage({ chat_id: chatId, parse_mode: 'HTML', text: lines.join('\n') });
        break;
      }

      case '/tournois': {
        const tournois = await prisma.tournament.findMany({
          where: { status: { in: ['OPEN', 'LIVE'] } },
          take: 5,
          select: { name: true, status: true, fee: true, _count: { select: { registrations: true } } }
        });
        if (!tournois.length) {
          await sendTelegramMessage({ chat_id: chatId, text: '📭 Aucun tournoi actif pour le moment.' });
        } else {
          const lines = ['🏆 <b>Tournois actifs EFootLigue :</b>', ''];
          tournois.forEach(t => {
            const status = t.status === 'LIVE' ? '🔴 En cours' : '🟢 Inscriptions ouvertes';
            lines.push(`• <b>${t.name}</b>`);
            lines.push(`  ${status} · ${t._count.registrations} inscrits · ${t.fee} FCFA`);
          });
          lines.push('');
          lines.push('👉 Inscrivez-vous : <a href="https://efootligue.vercel.app">efootligue.vercel.app</a>');
          await sendTelegramMessage({ chat_id: chatId, parse_mode: 'HTML', text: lines.join('\n') });
        }
        break;
      }

      default:
        if (text.startsWith('/')) {
          await sendTelegramMessage({
            chat_id: chatId,
            text: '❓ Commande non reconnue. Tapez /aide pour voir les options.'
          });
        }
    }

    return Response.json({ ok: true });
  } catch (e) {
    console.error('[Telegram Webhook Error]', e);
    return Response.json({ ok: false });
  }
}

export async function GET() {
  return Response.json({ ok: true, service: 'EFootLigue Telegram Bot', status: 'online' });
}
