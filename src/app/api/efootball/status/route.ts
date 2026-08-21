import { probeKonamiApi } from "@/lib/efootball";
import { prisma } from "@/lib/db";

export async function GET() {
  const probe = await probeKonamiApi();
  const linked = await prisma.efootballLink.count();
  const verified = await prisma.efootballLink.count({ where: { status: "VERIFIED" } });
  return Response.json({
    ok: true,
    officialApi: probe,
    connector: {
      name: "EFOOTLIGUE Competition Adapter v1",
      mode: "identity + lobby + referee",
      linked,
      verified
    }
  });
}
