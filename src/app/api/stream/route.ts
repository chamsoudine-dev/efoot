import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyOrganizerToken } from '@/lib/organizer';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get('tournamentId');
  
  // Récupère la config stream depuis CompetitionStore
  let streamConfig = null;
  if (tournamentId) {
    const store = await prisma.competitionStore.findUnique({ where: { id: `stream_${tournamentId}` } });
    if (store) streamConfig = store.data;
  }
  
  return Response.json({ ok: true, stream: streamConfig }, {
    headers: { 'Access-Control-Allow-Origin': '*' }
  });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-organizer-token');
  const isOrg = await verifyOrganizerToken(token);
  if (!isOrg) return Response.json({ ok: false, error: 'Accès refusé' }, { status: 403 });
  
  const body = await req.json();
  const { tournamentId, platform, url, title, isLive } = body;
  if (!tournamentId) return Response.json({ ok: false, error: 'tournamentId requis' }, { status: 400 });
  
  await prisma.competitionStore.upsert({
    where: { id: `stream_${tournamentId}` },
    create: { id: `stream_${tournamentId}`, data: { platform, url, title, isLive, updatedAt: new Date().toISOString() } },
    update: { data: { platform, url, title, isLive, updatedAt: new Date().toISOString() } }
  });
  
  return Response.json({ ok: true }, { headers: { 'Access-Control-Allow-Origin': '*' } });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, x-organizer-token' } });
}
