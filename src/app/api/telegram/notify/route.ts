import { NextRequest } from 'next/server';
import { verifyOrganizerToken } from '@/lib/organizer';
import { broadcastToChannel, sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-organizer-token',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-organizer-token');
  const isOrg = await verifyOrganizerToken(token);
  if (!isOrg) {
    return Response.json({ ok: false, error: 'Accès organisateur requis' }, { status: 403, headers: CORS });
  }

  try {
    const { message, channelId, chatId } = await req.json();
    if (!message) {
      return Response.json({ ok: false, error: 'Message requis' }, { status: 400, headers: CORS });
    }

    let sent = false;
    if (chatId) {
      sent = await sendTelegramMessage({ chat_id: chatId, text: message, parse_mode: 'HTML' });
    } else {
      sent = await broadcastToChannel(message, channelId);
    }

    return Response.json({ ok: true, sent }, { headers: CORS });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur de transmission' },
      { status: 500, headers: CORS }
    );
  }
}
