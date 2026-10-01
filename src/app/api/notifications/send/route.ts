import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyOrganizerToken } from '@/lib/organizer';
import { sendWebPushNotification, type PushNotificationPayload, type PushSubscriptionData } from '@/lib/webpush';

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
    return Response.json({ ok: false, error: 'Accès organisateur refusé' }, { status: 403, headers: CORS });
  }

  try {
    const body = await req.json();
    const { title, message, url, tag, targetPhone } = body;

    if (!title || !message) {
      return Response.json({ ok: false, error: 'Titre et message requis' }, { status: 400, headers: CORS });
    }

    const subs = await prisma.competitionStore.findMany({
      where: { id: { startsWith: 'push_sub_' } },
    });

    const payload: PushNotificationPayload = {
      title,
      body: message,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      url: url || '/',
      tag: tag || 'efootligue-alert',
    };

    let sent = 0;
    let failed = 0;

    for (const subRecord of subs) {
      const data = subRecord.data as Record<string, unknown>;
      if (targetPhone && data.phone !== targetPhone) continue;

      if (data.subscription) {
        const res = await sendWebPushNotification(
          data.subscription as PushSubscriptionData,
          payload
        );
        if (res.ok) sent++;
        else failed++;
      }
    }

    return Response.json({ ok: true, sent, failed, total: subs.length }, { headers: CORS });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur interne' },
      { status: 500, headers: CORS }
    );
  }
}
