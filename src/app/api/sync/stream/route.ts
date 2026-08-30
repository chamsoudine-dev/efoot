import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// ──────────────────────────────────────────────────────
// GET /api/sync/stream — Server-Sent Events (SSE)
//
// Maintient une connexion persistante avec le client.
// Des que des donnees changent en base (detecte via
// Firebase syncSignal ou polling leger), pousse un
// evenement "update" au client → rendu immediat.
//
// Avantage : remplace le setInterval cote client,
// reduit la latence a < 1 seconde.
// ──────────────────────────────────────────────────────

const FIREBASE_DB_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://efoot-ba3de-default-rtdb.firebaseio.com";
const POLL_INTERVAL_MS = 4000; // Verification toutes les 4s
const MAX_DURATION_MS = 25000; // 25s max (limite Vercel serverless)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const since = parseInt(searchParams.get("since") || "0", 10);

  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      function send(event: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      }

      // Ping initial pour confirmer la connexion
      send("connected", { ok: true, ts: Date.now() });

      let lastSyncAt = since || Date.now();
      let iterations = 0;
      const maxIterations = Math.floor(MAX_DURATION_MS / POLL_INTERVAL_MS);

      // Verifier Firebase syncSignal pour detecter les changements admin
      async function checkForUpdates() {
        if (closed) return;
        try {
          const res = await fetch(`${FIREBASE_DB_URL}/syncSignal.json`, {
            headers: { Accept: "application/json" },
          });
          if (res.ok) {
            const signal = await res.json();
            if (signal && signal.at && signal.at > lastSyncAt) {
              lastSyncAt = signal.at;

              // Charger les donnees fraiches depuis PostgreSQL
              const comps = await prisma.competitionStore.findMany({
                orderBy: { updatedAt: "desc" },
              });
              const announcements = await prisma.announcementStore.findMany();

              const compsMap: Record<string, unknown> = {};
              comps.forEach((c) => { compsMap[c.id] = c.data; });

              const annMap: Record<string, unknown> = {};
              announcements.forEach((a) => {
                annMap[a.id] = { text: a.text, at: a.at.getTime() };
              });

              send("update", {
                competitions: compsMap,
                announcements: annMap,
                ts: lastSyncAt,
                compId: signal.compId || null,
              });
            }
          }
        } catch (e) {
          console.warn("[SSE] check error:", e);
        }
      }

      // Boucle de polling legere
      while (!closed && iterations < maxIterations) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        iterations++;
        await checkForUpdates();

        // Heartbeat pour garder la connexion vivante
        if (!closed && iterations % 3 === 0) {
          send("heartbeat", { ts: Date.now() });
        }
      }

      // Fin du stream -> le client reconnectera automatiquement
      if (!closed) {
        send("end", { ts: Date.now() });
        try { controller.close(); } catch {}
      }
    },
    cancel() {
      closed = true;
    },
  });

  req.signal.addEventListener("abort", () => { closed = true; });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    },
  });
}
