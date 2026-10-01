import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function parseUserAgent(ua: string) {
  let browser = "Inconnu";
  let os = "Inconnu";
  let device = "Desktop";

  if (ua.includes("Chrome") && !ua.includes("Chromium") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("OPR") || ua.includes("Opera")) browser = "Opera";
  else if (ua.includes("SamsungBrowser")) browser = "Samsung Browser";

  if (ua.includes("Windows NT 10")) os = "Windows 10/11";
  else if (ua.includes("Windows NT 6.3")) os = "Windows 8.1";
  else if (ua.includes("Windows NT 6.1")) os = "Windows 7";
  else if (ua.includes("Mac OS X")) os = "macOS";
  else if (ua.includes("Android")) {
    const m = ua.match(/Android\s([\d.]+)/);
    os = "Android " + (m ? m[1] : "");
  } else if (ua.includes("iPhone") || ua.includes("iPad")) {
    const m = ua.match(/OS\s([\d_]+)/);
    os = "iOS " + (m ? m[1].replace(/_/g, ".") : "");
  } else if (ua.includes("Linux")) os = "Linux";

  if (ua.includes("Mobile") || ua.includes("Android") || ua.includes("iPhone")) device = "Mobile";
  else if (ua.includes("iPad") || ua.includes("Tablet")) device = "Tablette";

  return { browser, os, device };
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") || "";
    const referer = req.headers.get("referer") || "";

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* body vide ok */ }

    const { browser, os, device } = parseUserAgent(userAgent);

    let ipGeoData = {
      city: "", region: "", country: "", countryCode: "",
      lat: null as number | null, lon: null as number | null,
      isp: "", timezone: "",
    };

    const isLocal = ip === "unknown" || ip.startsWith("127.") || ip.startsWith("192.168.") || ip.startsWith("10.") || ip === "::1";

    if (!isLocal) {
      try {
        const geoRes = await fetch(
          `http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,city,lat,lon,isp,timezone`,
          { cache: "no-store" }
        );
        if (geoRes.ok) {
          const geo = await geoRes.json();
          if (geo.status === "success") {
            ipGeoData = {
              city: geo.city || "", region: geo.region || "",
              country: geo.country || "", countryCode: geo.countryCode || "",
              lat: geo.lat ?? null, lon: geo.lon ?? null,
              isp: geo.isp || "", timezone: geo.timezone || "",
            };
          }
        }
      } catch (geoErr) {
        console.warn("[Track] Geoloc IP failed:", geoErr);
      }
    }

    await prisma.visitorLog.create({
      data: {
        ip,
        city: ipGeoData.city, region: ipGeoData.region,
        country: ipGeoData.country, countryCode: ipGeoData.countryCode,
        lat: ipGeoData.lat, lon: ipGeoData.lon,
        isp: ipGeoData.isp, timezone: ipGeoData.timezone,
        gpsLat: typeof body.gpsLat === "number" ? body.gpsLat : null,
        gpsLon: typeof body.gpsLon === "number" ? body.gpsLon : null,
        gpsAccuracy: typeof body.gpsAccuracy === "number" ? body.gpsAccuracy : null,
        userAgent, browser, os, device,
        screen: typeof body.screen === "string" ? body.screen : "",
        language: typeof body.language === "string" ? body.language : "",
        battery: typeof body.battery === "string" ? body.battery : "",
        network: typeof body.network === "string" ? body.network : "",
        page: typeof body.page === "string" ? body.page : "",
        referer,
      },
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[Track] Error:", err);
    return Response.json({ ok: true });
  }
}
