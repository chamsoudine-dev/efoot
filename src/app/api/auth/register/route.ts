import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, signToken } from "@/lib/auth";
import { cookies } from "next/headers";

const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(6).max(80),
  phone: z.string().max(24).optional()
});

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json());
  if (!body.success) return jsonError("Données invalides.");
  const exists = await prisma.user.findUnique({ where: { email: body.data.email.toLowerCase() } });
  if (exists) return jsonError("Cet email est déjà utilisé.");
  const count = await prisma.user.count();
  const user = await prisma.user.create({
    data: {
      name: body.data.name.trim(),
      email: body.data.email.toLowerCase(),
      phone: body.data.phone || "",
      passwordHash: await bcrypt.hash(body.data.password, 10),
      role: count === 0 ? "ORGANIZER" : "PLAYER"
    }
  });
  const token = await signToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  });
  (await cookies()).set("efl_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  });
  return Response.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
}
