import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./db";

const secret = () => {
  const s = process.env.AUTH_SECRET || "jvZ6m8gFiVO!5K>\\(:Aop4@-v9T9+!N(7!QR$>7brTIe(G,%o(nG<>#4Oge}|n@X";
  return new TextEncoder().encode(s);
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export async function signToken(user: SessionUser) {
  return new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("14d")
    .sign(secret());
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get("efl_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: String(payload.id),
      email: String(payload.email),
      name: String(payload.name),
      role: String(payload.role)
    };
  } catch {
    return null;
  }
}

export async function requireUser() {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHENTICATED");
  // Vérifier que le compte est toujours actif en base
  const db = await prisma.user.findUnique({ where: { id: s.id }, select: { isActive: true } });
  if (!db || !db.isActive) throw new Error("ACCOUNT_DISABLED");
  return s;
}

export async function requireOrganizer() {
  const s = await requireUser();
  if (s.role !== "ORGANIZER" && s.role !== "ADMIN") throw new Error("FORBIDDEN");
  return s;
}

export async function requireAdmin() {
  const s = await requireUser();
  if (s.role !== "ADMIN") throw new Error("FORBIDDEN");
  return s;
}

export async function dbUser(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { efootball: true }
  });
}

export function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

