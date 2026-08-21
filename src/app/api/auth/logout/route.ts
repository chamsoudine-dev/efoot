import { cookies } from "next/headers";

export async function POST() {
  (await cookies()).set("efl_session", "", { httpOnly: true, path: "/", maxAge: 0 });
  return Response.json({ ok: true });
}
