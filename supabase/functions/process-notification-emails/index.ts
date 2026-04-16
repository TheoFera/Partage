import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("NOTIFICATION_EMAIL_INTERNAL_SECRET") ?? "";
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") ?? "nepasrepondre@partagetonpanier.fr";
const FROM_NAME = Deno.env.get("BREVO_SENDER_NAME") ?? "Partage ton panier";
const APP_PUBLIC_URL = (Deno.env.get("APP_BASE_URL") ?? "").trim().replace(/\/+$/, "");
const LOGO_URL = (Deno.env.get("LOGO_PUBLIC_URL") ?? "").trim();
const FUNCTION_VERSION = "process_notification_emails_2026_04_16_v1";

const LOGO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAACu0lEQVR42u3Z2w2EMAxFwTRIKdv/J/TAisT2nSPlH+EMz7UkSZIkSZIkaVT377qdBUUD+Hc5i4ICFoEBiqDYvkxBcEAiMEARHJAIDkgEBiiCoy8OSAQHJAIEEMEBieCARHBAIkAAERyQSGk4IBEggAgQQAQHJAIEEMEBiQABRIAAIjggESAWIAIEEAECiAABRIAAIkAAESCACA5IBAkcAgQQCRBABAggAgQQAQKIAAFEgAAiSOAQIIAIEEAkOCRAABEccAgOQAQGIIIDDsEBh+AARGDAITjgEBhwCA4LEMEBh+CAo+/GBAMMV+aCwzqx4eDQqj680xsODjDKDrLSMYIBRanhph8THMEvuO5uUIDR4Hk/4R1OzT+LTroiQwGHfwaN/yMJDFdmwQGH4IBDgMAhOMAQHHAIDjAECByCAw7BAYcAAUMCBA7BAYcAAURwQCJAABEggAgOSAQIIAIEEAECiAQIIAIEEAECiAABRHBAIkjgECCACBBABAggAgQMQAQIIAIEEAECiCCBQ4AAIkAAESRwCBBABAkkEiCQCBBQBAkkggQSAQKJIAFFkEAiSECRAIFEkEAiSCARKIlQQIXk9YadgMSdDpJPN2rHu4nHQlC2D74DEu9PkBwddvoxwRKEZcIx+tAAStwzfsX3IlCGY5l0x/PZWq2+4/uPA4lAAUWQQCJIIBEkgAgUSAQJJAIFEgkSQAQJJIIEEoECiCABRJBAIkAAERyQCBBAJEAAERyQCBBABAggAgQQAQKIAAFEgAAiQAARHBYkggQOAQKIAAFEgAAiQAARIIAIEEAECCCCBA4JEEAECCCCBA4BAogggUOAACJAABEkcAgSOCRApHQkpitI4BAkcAgQQAQJHIIEDoEChiCBQ+qKxHQEChiCBA7BAoVAAUP6EIuzqGhAzoIkSZIkSdreA4IM4tuQQvIJAAAAAElFTkSuQmCC";

const LOGO_PNG_DATA_URI = `data:image/png;base64,${LOGO_PNG_BASE64}`;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type NotificationEmailType =
  | "order_created_producer"
  | "order_locked_participant"
  | "order_locked_producer"
  | "order_delivered_participant"
  | "order_delivered_producer"
  | "order_confirmed_sharer"
  | "order_prepared_sharer"
  | "order_min_reached_sharer"
  | "order_max_reached_sharer"
  | "order_auto_locked_deadline_sharer";

type OutboxJob = {
  id: string;
  notification_id: string;
  profile_id: string;
  notification_type: NotificationEmailType;
  status: string;
  payload: Record<string, unknown> | null;
};

type NotificationRow = {
  id: string;
  profile_id: string;
  order_id: string | null;
  title: string;
  message: string;
  notification_type: NotificationEmailType;
  data: Record<string, unknown> | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  order_code: string | null;
  title: string | null;
};

type TemplateContext = {
  notification: NotificationRow;
  order: OrderRow | null;
};

type TemplateDefinition = {
  subject: (ctx: TemplateContext) => string;
  preheader: (ctx: TemplateContext) => string;
  headline: (ctx: TemplateContext) => string;
  body: (ctx: TemplateContext) => string;
  ctaLabel: string;
};

const TEMPLATE_MAP: Record<NotificationEmailType, TemplateDefinition> = {
  order_created_producer: {
    subject: ({ order }) => `Nouvelle commande ouverte${order?.title ? ` : ${order.title}` : ""}`,
    preheader: ({ order }) =>
      order?.title
        ? `Une nouvelle commande contenant vos produits est ouverte : ${order.title}.`
        : "Une nouvelle commande contenant vos produits est ouverte.",
    headline: () => "Une nouvelle commande vient d'ouvrir",
    body: ({ notification }) =>
      `${notification.message} Consultez la commande pour suivre son évolution et préparer la suite.`,
    ctaLabel: "Voir la commande",
  },
  order_locked_participant: {
    subject: ({ order }) => `Commande clôturée${order?.title ? ` : ${order.title}` : ""}`,
    preheader: () => "Votre commande est maintenant clôturée.",
    headline: () => "La commande est clôturée",
    body: ({ notification }) =>
      `${notification.message} Vous pouvez ouvrir la commande pour relire les détails et les prochaines étapes.`,
    ctaLabel: "Ouvrir la commande",
  },
  order_locked_producer: {
    subject: ({ order }) => `Commande clôturée${order?.title ? ` : ${order.title}` : ""}`,
    preheader: () => "Une commande avec vos produits vient d'être clôturée.",
    headline: () => "La commande est clôturée",
    body: ({ notification }) =>
      `${notification.message} Ouvrez la commande pour vérifier son contenu et la suite logistique.`,
    ctaLabel: "Voir la commande",
  },
  order_delivered_participant: {
    subject: ({ order }) => `Commande recue${order?.title ? ` : ${order.title}` : ""}`,
    preheader: () => "La recéption des produits a été confirmée.",
    headline: () => "Les produits ont été réceptionnés",
    body: ({ notification }) =>
      `${notification.message} Ouvrez la commande pour retrouver toutes les informations utiles.`,
    ctaLabel: "Consulter la commande",
  },
  order_delivered_producer: {
    subject: ({ order }) => `Réception confirmée${order?.title ? ` : ${order.title}` : ""}`,
    preheader: () => "Le partageur a confirmé la reception des produits.",
    headline: () => "La réception a été confirmée",
    body: ({ notification }) =>
      `${notification.message} Vous pouvez consulter la commande pour garder une vue complète de son avancement.`,
    ctaLabel: "Voir la commande",
  },
  order_confirmed_sharer: {
    subject: ({ order }) => `Commande confirmée${order?.title ? ` : ${order.title}` : ""}`,
    preheader: () => "Le producteur a confirmé votre commande.",
    headline: () => "La commande est confirmée",
    body: ({ notification }) =>
      `${notification.message} Ouvrez la commande pour suivre la préparation et la suite des opérations.`,
    ctaLabel: "Ouvrir la commande",
  },
  order_prepared_sharer: {
    subject: ({ order }) => `Commande preparée${order?.title ? ` : ${order.title}` : ""}`,
    preheader: () => "La commande est prête pour la prochaine étape.",
    headline: () => "La commande est préparée",
    body: ({ notification }) =>
      `${notification.message} Consultez la commande pour retrouver toutes les informations de retrait ou de livraison.`,
    ctaLabel: "Voir la commande",
  },
  order_min_reached_sharer: {
    subject: ({ order }) => `Seuil minimum atteint${order?.title ? ` : ${order.title}` : ""}`,
    preheader: () => "La commande a atteint son seuil minimum.",
    headline: () => "Le seuil minimum est atteint",
    body: ({ notification }) =>
      `${notification.message} Ouvrez la commande pour suivre son remplissage et informer vos participants.`,
    ctaLabel: "Suivre la commande",
  },
  order_max_reached_sharer: {
    subject: ({ order }) => `Seuil maximum atteint${order?.title ? ` : ${order.title}` : ""}`,
    preheader: () => "La commande a atteint son seuil maximum.",
    headline: () => "Le seuil maximum est atteint",
    body: ({ notification }) =>
      `${notification.message} Ouvrez la commande pour vérifier son état et les suites à donner.`,
    ctaLabel: "Voir la commande",
  },
  order_auto_locked_deadline_sharer: {
    subject: ({ order }) => `Commande clôturée automatiquement${order?.title ? ` : ${order.title}` : ""}`,
    preheader: () => "La date limite a été atteinte et la commande est maintenant clôturée.",
    headline: () => "Date limite atteinte. La commande a été clôturée automatiquement",
    body: ({ notification }) =>
      `${notification.message} Ouvrez la commande pour consulter son récapitulatif complet.`,
    ctaLabel: "Consulter la commande",
  },
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const normalizeType = (value: unknown): NotificationEmailType | null => {
  const normalized = String(value ?? "").trim() as NotificationEmailType;
  return normalized in TEMPLATE_MAP ? normalized : null;
};

const buildOrderUrl = (orderCode?: string | null) => {
  if (!APP_PUBLIC_URL) throw new Error("APP_BASE_URL manquant");
  if (!orderCode) return `${APP_PUBLIC_URL}/profil`;
  return `${APP_PUBLIC_URL}/cmd/${encodeURIComponent(orderCode)}`;
};

async function sendBrevoEmail(opts: {
  toEmail: string;
  subject: string;
  html: string;
}) {
  if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY manquant");
  if (!FROM_EMAIL) throw new Error("BREVO_SENDER_EMAIL manquant");

  const payload = {
    sender: { email: FROM_EMAIL, name: FROM_NAME },
    to: [{ email: opts.toEmail }],
    subject: opts.subject,
    htmlContent: opts.html,
  };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Brevo error ${res.status}: ${text}`);

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const buildEmailHtml = (ctx: TemplateContext, ctaUrl: string) => {
  const notificationType = normalizeType(ctx.notification.notification_type);
  if (!notificationType) throw new Error(`notification_type inconnu: ${ctx.notification.notification_type}`);
  const template = TEMPLATE_MAP[notificationType];
  const logoSrc = LOGO_URL || LOGO_PNG_DATA_URI;
  const preheader = template.preheader(ctx);
  const headline = template.headline(ctx);
  const body = template.body(ctx);
  const orderTitle = ctx.order?.title?.trim() || null;
  const orderCode = ctx.order?.order_code?.trim() || null;

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(template.subject(ctx))}</title>
  </head>
  <body style="margin:0;padding:0;background:#FFF6F0;font-family:Arial,Helvetica,sans-serif;color:#1F2937;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
      ${escapeHtml(preheader)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FFF6F0;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#FFFFFF;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 18px;background:linear-gradient(135deg,#FFF3EB 0%,#FFFFFF 100%);border-bottom:1px solid #F3E2D8;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${logoSrc}" width="44" height="44" alt="Partage ton panier" style="display:block;border:0;" />
                    </td>
                    <td style="vertical-align:middle;padding-left:12px;">
                      <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#B45309;">Partage ton panier</div>
                      <div style="font-size:22px;font-weight:700;color:#1F2937;">Notification</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="display:inline-block;background:#FFF1E6;color:#C2410C;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:700;">
                  ${escapeHtml(ctx.notification.title)}
                </div>
                <h1 style="margin:18px 0 12px;font-size:28px;line-height:1.2;color:#1F2937;">${escapeHtml(headline)}</h1>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#4B5563;">${escapeHtml(body)}</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;background:#FFF8F3;border:1px solid #FFE0D1;border-radius:18px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      ${orderTitle ? `<div style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#9A3412;margin-bottom:8px;">Commande</div>
                      <div style="font-size:18px;font-weight:700;color:#1F2937;margin-bottom:6px;">${escapeHtml(orderTitle)}</div>` : ""}
                      ${orderCode ? `<div style="font-size:14px;color:#6B7280;">Code : <strong style="color:#1F2937;">${escapeHtml(orderCode)}</strong></div>` : ""}
                      <div style="font-size:14px;color:#6B7280;margin-top:${orderTitle || orderCode ? "10px" : "0"};">Envoye le ${escapeHtml(formatDateTime(ctx.notification.created_at))}</div>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 18px;">
                  <tr>
                    <td align="center" bgcolor="#FF6B4A" style="border-radius:14px;">
                      <a
                        href="${ctaUrl}"
                        style="display:inline-block;padding:14px 22px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;"
                      >${escapeHtml(template.ctaLabel)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 24px;border-top:1px solid #F3E2D8;background:#FFFCFA;font-size:12px;line-height:1.6;color:#9CA3AF;">
                Cet e-mail est envoyé automatiquement. Merci de ne pas y repondre.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

Deno.serve(async (req) => {
  const gotSecret = req.headers.get("x-internal-secret") ?? "";
  if (!INTERNAL_SECRET || gotSecret !== INTERNAL_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const mode = body.mode ?? "scan_pending";
  if (mode !== "scan_pending") {
    return Response.json({ ok: false, error: "mode invalide" }, { status: 400 });
  }

  console.log(
    "[process-notification-emails]",
    JSON.stringify({ version: FUNCTION_VERSION, mode, timestamp: new Date().toISOString() }),
  );

  const { data: jobs, error: dequeueError } = await supabase.rpc("dequeue_notification_emails", { p_limit: 10 });
  if (dequeueError) {
    console.error(
      "[process-notification-emails][dequeue-error]",
      JSON.stringify({ message: dequeueError.message }),
    );
    return Response.json({ ok: false, error: dequeueError.message }, { status: 500 });
  }

  console.log(
    "[process-notification-emails][dequeued]",
    JSON.stringify({ count: jobs?.length ?? 0 }),
  );

  const results: Array<Record<string, unknown>> = [];
  let processed = 0;

  for (const rawJob of (jobs ?? []) as OutboxJob[]) {
    const jobId = rawJob.id;
    try {
      const notificationType = normalizeType(rawJob.notification_type);
      if (!jobId) throw new Error("Job invalide: id manquant");
      if (!notificationType) throw new Error(`notification_type inconnu: ${rawJob.notification_type}`);
      if (!rawJob.notification_id) throw new Error("Job invalide: notification_id manquant");

      const { data: notification, error: notificationError } = await supabase
        .from("notifications")
        .select("id, profile_id, order_id, title, message, notification_type, data, created_at")
        .eq("id", rawJob.notification_id)
        .single();

      if (notificationError || !notification) {
        throw new Error(`Notification introuvable: ${notificationError?.message ?? "null"}`);
      }

      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(rawJob.profile_id);
      if (userError || !userData?.user?.email) {
        throw new Error("Email destinataire introuvable");
      }
      if (!userData.user.email_confirmed_at) {
        throw new Error("Email destinataire non verifie");
      }

      let order: OrderRow | null = null;
      if (notification.order_id) {
        const { data: orderData, error: orderError } = await supabase
          .from("orders")
          .select("id, order_code, title")
          .eq("id", notification.order_id)
          .maybeSingle();
        if (orderError) throw new Error(`Commande introuvable: ${orderError.message}`);
        order = (orderData as OrderRow | null) ?? null;
      }

      const payloadOrderCode =
        typeof rawJob.payload?.order_code === "string" && rawJob.payload.order_code.trim()
          ? rawJob.payload.order_code.trim()
          : null;
      const orderCode = order?.order_code?.trim() || payloadOrderCode;
      const ctaUrl = buildOrderUrl(orderCode);
      const templateCtx: TemplateContext = {
        notification: notification as NotificationRow,
        order,
      };
      const template = TEMPLATE_MAP[notificationType];
      const html = buildEmailHtml(templateCtx, ctaUrl);
      const brevoResponse = await sendBrevoEmail({
        toEmail: userData.user.email,
        subject: template.subject(templateCtx),
        html,
      });

      const { error: updateError } = await supabase
        .from("notification_emails_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: brevoResponse?.messageId ?? null,
          last_error: null,
          locked_at: null,
        })
        .eq("id", jobId);

      if (updateError) throw new Error(`Update notification_emails_outbox sent error: ${updateError.message}`);

      processed++;
      console.log(
        "[process-notification-emails][sent]",
        JSON.stringify({
          jobId,
          notificationType,
          toEmail: userData.user.email,
          orderCode,
          messageId: brevoResponse?.messageId ?? null,
        }),
      );
      results.push({
        id: jobId,
        ok: true,
        toEmail: userData.user.email,
        notificationType,
        orderCode,
        messageId: brevoResponse?.messageId ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        "[process-notification-emails][job-error]",
        JSON.stringify({ jobId: jobId ?? null, error: message }),
      );
      if (jobId) {
        await supabase
          .from("notification_emails_outbox")
          .update({
            status: "failed",
            last_error: message,
            locked_at: null,
          })
          .eq("id", jobId);
      }
      results.push({ id: jobId ?? null, ok: false, error: message });
    }
  }

  console.log(
    "[process-notification-emails][completed]",
    JSON.stringify({ processed, dequeued: jobs?.length ?? 0, results }),
  );

  return Response.json({
    ok: true,
    version: FUNCTION_VERSION,
    mode,
    dequeued: jobs?.length ?? 0,
    processed,
    results,
  });
});
