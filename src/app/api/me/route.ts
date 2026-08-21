import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { probeKonamiApi } from "@/lib/efootball";

export async function GET() {
  const s = await getSession();
  if (!s) return Response.json({ ok: true, user: null });
  const user = await prisma.user.findUnique({
    where: { id: s.id },
    include: { efootball: true }
  });
  const konami = await probeKonamiApi();
  return Response.json({ ok: true, user, konami });
}
