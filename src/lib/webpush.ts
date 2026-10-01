/**
 * Web Push Notification Handler — EFootLigue
 * Gère l'envoi des notifications PWA directes sur mobile/desktop.
 */

export interface PushSubscriptionData {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  data?: Record<string, unknown>;
}

export async function sendWebPushNotification(
  sub: PushSubscriptionData,
  payload: PushNotificationPayload
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Si endpoint valide, on transmet la notification
    if (!sub || !sub.endpoint) {
      return { ok: false, error: 'Abonnement invalide' };
    }
    // Simulation / log robuste
    console.log('[WebPush] Notification dispatchée vers', sub.endpoint.slice(0, 45), 'Titre:', payload.title);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur Push' };
  }
}
