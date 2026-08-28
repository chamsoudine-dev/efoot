import { SignJWT, jwtVerify } from "jose";

export function getOrganizerSecret() {
  const s = process.env.ORGANIZER_SECRET || process.env.AUTH_SECRET || "organizer-fallback-dev-only";
  return new TextEncoder().encode(s + ":organizer");
}

export const TOKEN_DURATION = "4h";

export async function createOrganizerToken() {
  return new SignJWT({ role: "organizer", ts: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(TOKEN_DURATION)
    .sign(getOrganizerSecret());
}

export async function verifyOrganizerToken(token: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, getOrganizerSecret());
    return true;
  } catch {
    return false;
  }
}
