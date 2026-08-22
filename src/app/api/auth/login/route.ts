import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, signToken } from "@/lib/auth";
import { cookies } from "next/headers";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json());
  if (!body.success) return jsonError("Email ou mot de passe invalide.");
  const user = await prisma.user.findUnique({
    where: { email: body.data.email.toLowerCase() }
  });
  if (!user || !(await bcrypt.compare(body.data.password, user.passwordHash))) {
    return jsonError("Identifiants incorrects.", 401);
  }
  const token = await signToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  });
  (await cookies()).set("efl_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  });
  return Response.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
}
