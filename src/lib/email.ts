import nodemailer from "nodemailer";

export const DEFAULT_ADMIN_EMAIL =
  process.env.ADMIN_NOTIFICATION_EMAIL ||
  process.env.ADMIN_RECEIPT_EMAIL ||
  "chamsoudineanaroua00@gmail.com";

interface EmailOptions {
  to?: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/**
 * Envoie un email en utilisant soit :
 * 1. Resend API (si RESEND_API_KEY est défini)
 * 2. Nodemailer / Gmail SMTP (si SMTP_PASS ou GMAIL_APP_PASSWORD est défini)
 * 3. Mode simulation (journalisé dans la console si aucun identifiant n'est encore renseigné)
 */
export async function sendEmail({
  to = DEFAULT_ADMIN_EMAIL,
  subject,
  html,
  text
}: EmailOptions): Promise<{ ok: boolean; provider?: string; error?: string }> {
  const recipients = Array.isArray(to) ? to : [to];

  // 1. Priorité Resend API si clé configurée
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "EFootLigue <onboarding@resend.dev>",
          to: recipients,
          subject,
          html,
          text: text || ""
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("[Email:Resend] Erreur API Resend:", errorData);
        return { ok: false, provider: "resend", error: JSON.stringify(errorData) };
      }

      return { ok: true, provider: "resend" };
    } catch (err: unknown) {
      console.error("[Email:Resend] Exception lors de l'envoi:", err);
      return { ok: false, provider: "resend", error: String(err) };
    }
  }

  // 2. Transport SMTP / Gmail via nodemailer
  const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER || DEFAULT_ADMIN_EMAIL;

  if (smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      await transporter.sendMail({
        from: `"EFootLigue" <${smtpUser}>`,
        to: recipients.join(", "),
        subject,
        html,
        text: text || ""
      });

      return { ok: true, provider: "smtp" };
    } catch (err: unknown) {
      console.error("[Email:SMTP] Erreur envoi SMTP:", err);
      return { ok: false, provider: "smtp", error: String(err) };
    }
  }

  // 3. Fallback en développement (aucun service configuré)
  console.log(`[Email:DevSimulation] À: ${recipients.join(", ")} | Sujet: "${subject}"`);
  return {
    ok: true,
    provider: "simulation",
    error: "Aucun service d'email (RESEND_API_KEY ou GMAIL_APP_PASSWORD) configuré dans .env. Email simulé avec succès."
  };
}

/**
 * Formate et envoie une preuve / reçu de paiement vers l'email administrateur.
 */
export async function sendReceiptNotification({
  playerName,
  phone,
  gameId,
  tournamentName,
  amount,
  receiptImageUrl
}: {
  playerName: string;
  phone?: string;
  gameId?: string;
  tournamentName: string;
  amount?: string | number;
  receiptImageUrl: string;
}) {
  const subject = `📸 Reçu de paiement — ${playerName} (${tournamentName})`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0b132b; color: #ffffff; padding: 24px; border-radius: 12px; border: 1px solid #1c2541;">
      <div style="text-align: center; border-bottom: 1px solid #1c2541; padding-bottom: 16px; margin-bottom: 20px;">
        <h1 style="color: #00f2fe; margin: 0; font-size: 24px;">⚽ EFootLigue — Nouveau Reçu</h1>
        <p style="color: #a0aec0; margin: 6px 0 0 0; font-size: 14px;">Notification de paiement soumise par un joueur</p>
      </div>

      <div style="background: #1c2541; padding: 18px; border-radius: 8px; margin-bottom: 20px;">
        <p style="margin: 6px 0;"><strong style="color: #4facfe;">Nom du joueur :</strong> ${playerName}</p>
        <p style="margin: 6px 0;"><strong style="color: #4facfe;">Téléphone :</strong> ${phone || "Non renseigné"}</p>
        <p style="margin: 6px 0;"><strong style="color: #4facfe;">ID eFootball :</strong> ${gameId || "Non renseigné"}</p>
        <p style="margin: 6px 0;"><strong style="color: #4facfe;">Tournoi visé :</strong> ${tournamentName}</p>
        <p style="margin: 6px 0;"><strong style="color: #4facfe;">Montant :</strong> ${amount ? `${amount} FCFA` : "Non spécifié"}</p>
        <p style="margin: 6px 0;"><strong style="color: #4facfe;">Date d'envoi :</strong> ${new Date().toLocaleString("fr-FR")}</p>
      </div>

      <div style="text-align: center;">
        <h3 style="color: #ffffff; margin-bottom: 12px;">Capture d'écran du reçu :</h3>
        <a href="${receiptImageUrl}" target="_blank" style="display: inline-block;">
          <img src="${receiptImageUrl}" alt="Reçu de paiement" style="max-width: 100%; border-radius: 8px; border: 2px solid #00f2fe; box-shadow: 0 4px 15px rgba(0,0,0,0.5);" />
        </a>
        <p style="font-size: 12px; color: #a0aec0; margin-top: 8px;">(Cliquez sur l'image pour l'agrandir en taille originale)</p>
      </div>

      <div style="margin-top: 24px; text-align: center; border-top: 1px solid #1c2541; padding-top: 14px;">
        <span style="background: #00c853; color: #ffffff; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 12px;">
          ✓ Envoyé automatiquement à ${DEFAULT_ADMIN_EMAIL}
        </span>
      </div>
    </div>
  `;

  return sendEmail({
    to: DEFAULT_ADMIN_EMAIL,
    subject,
    html
  });
}

/**
 * Envoie une copie de sauvegarde d'un message du chat.
 */
export async function sendChatMessageBackup({
  senderName,
  senderPhone,
  senderGameId,
  tournamentId,
  text,
  imageUrl
}: {
  senderName: string;
  senderPhone?: string;
  senderGameId?: string;
  tournamentId: string;
  text?: string;
  imageUrl?: string;
}) {
  const subject = `💬 [Sauvegarde Chat] Message de ${senderName} (${tournamentId})`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0d1117; color: #c9d1d9; padding: 20px; border-radius: 8px; border: 1px solid #30363d;">
      <h3 style="color: #58a6ff; margin-top: 0;">Sauvegarde d'un message du chat eFootLigue</h3>
      <p><strong>Salon / Tournoi :</strong> ${tournamentId}</p>
      <p><strong>Expéditeur :</strong> ${senderName} ${senderPhone ? `(${senderPhone})` : ""} ${senderGameId ? `[ID: ${senderGameId}]` : ""}</p>
      <p><strong>Heure :</strong> ${new Date().toLocaleString("fr-FR")}</p>
      <div style="background: #161b22; padding: 14px; border-radius: 6px; border-left: 4px solid #238636; margin: 16px 0;">
        ${text ? `<p style="margin: 0; white-space: pre-wrap; color: #f0f6fc;">${text}</p>` : "<em>(Aucun texte)</em>"}
        ${imageUrl ? `<div style="margin-top: 12px;"><img src="${imageUrl}" alt="Image chat" style="max-width: 100%; border-radius: 6px;" /></div>` : ""}
      </div>
      <p style="font-size: 11px; color: #8b949e; margin-bottom: 0;">Archive de sécurité générée pour ${DEFAULT_ADMIN_EMAIL}</p>
    </div>
  `;

  return sendEmail({
    to: DEFAULT_ADMIN_EMAIL,
    subject,
    html
  });
}

/**
 * Envoie une archive complète de l'historique du chat par email.
 */
export async function sendFullChatBackupEmail({
  tournamentId,
  messages
}: {
  tournamentId: string;
  messages: Array<{
    id: string;
    senderName: string;
    senderPhone?: string | null;
    senderGameId?: string | null;
    text?: string | null;
    imageUrl?: string | null;
    createdAt: Date | string;
    isAdmin?: boolean;
  }>;
}) {
  const count = messages.length;
  const subject = `📦 [Archive Complète Chat] ${count} message(s) - Salon: ${tournamentId}`;

  const rows = messages
    .map((m) => {
      const dateStr = new Date(m.createdAt).toLocaleString("fr-FR");
      const badge = m.isAdmin ? "👑 Admin" : "Joueur";
      return `
      <tr style="border-bottom: 1px solid #30363d;">
        <td style="padding: 10px; font-size: 12px; color: #8b949e; white-space: nowrap;">${dateStr}</td>
        <td style="padding: 10px; font-weight: bold; color: #58a6ff;">${m.senderName} <span style="font-size: 11px; font-weight: normal; color: #8b949e;">(${badge})</span></td>
        <td style="padding: 10px; color: #f0f6fc;">
          ${m.text || ""}
          ${m.imageUrl ? `<br><a href="${m.imageUrl}" target="_blank" style="color: #79c0ff; font-size: 12px;">[Voir image jointe]</a>` : ""}
        </td>
      </tr>
    `;
    })
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; background: #0d1117; color: #c9d1d9; padding: 24px; border-radius: 10px; border: 1px solid #30363d;">
      <h2 style="color: #58a6ff; margin-top: 0;">📦 Archive de Sécurité — Historique Complet du Chat</h2>
      <p>Cette sauvegarde contient l'ensemble des échanges pour le salon : <strong>${tournamentId}</strong>.</p>
      <p><strong>Total des messages archivés :</strong> ${count}</p>
      <p><strong>Date de génération de l'archive :</strong> ${new Date().toLocaleString("fr-FR")}</p>
      
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; text-align: left;">
        <thead>
          <tr style="background: #161b22; border-bottom: 2px solid #30363d; color: #8b949e;">
            <th style="padding: 10px;">Date & Heure</th>
            <th style="padding: 10px;">Expéditeur</th>
            <th style="padding: 10px;">Message</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : `<tr><td colspan="3" style="padding: 16px; text-align: center; color: #8b949e;">Aucun message trouvé dans ce salon.</td></tr>`}
        </tbody>
      </table>

      <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #30363d; font-size: 12px; color: #8b949e; text-align: center;">
        Archive de récupération automatique eFootLigue pour <strong>${DEFAULT_ADMIN_EMAIL}</strong>.
      </div>
    </div>
  `;

  return sendEmail({
    to: DEFAULT_ADMIN_EMAIL,
    subject,
    html
  });
}
