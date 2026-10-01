import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subscription, userId, phone } = body;

    if (!subscription?.endpoint) {
      return Response.json({ ok: false, error: 'Abonnement manquant ou invalide' }, { status: 400, headers: CORS });
    }

    const key = 'push_sub_' + Buffer.from(subscription.endpoint).toString('base64').substring(0, 32);

    await prisma.competitionStore.upsert({
      where: { id: key },
      create: {
        id: key,
        data: {
          subscription,
          userId: userId || null,
          phone: phone || null,
          createdAt: new Date().toISOString(),
        },
      },
      update: {
        data: {
          subscription,
          userId: userId || null,
          phone: phone || null,
          updatedAt: new Date().toISOString(),
        },
      },
    });

    return Response.json({ ok: true, message: 'Abonnement aux notifications Push validé !' }, { headers: CORS });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur interne' },
      { status: 500, headers: CORS }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { endpoint } = body;
    if (!endpoint) {
      return Response.json({ ok: false, error: 'Endpoint requis' }, { status: 400, headers: CORS });
    }
    const key = 'push_sub_' + Buffer.from(endpoint).toString('base64').substring(0, 32);
    await prisma.competitionStore.deleteMany({ where: { id: key } });
    return Response.json({ ok: true }, { headers: CORS });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500, headers: CORS }
    );
  }
}
