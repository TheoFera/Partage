import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BILLING_INTERNAL_SECRET = Deno.env.get("BILLING_INTERNAL_SECRET") ?? "";
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") ?? "";
const BREVO_SENDER_NAME = Deno.env.get("BREVO_SENDER_NAME") ?? "Partage";
const BILLING_BUCKET = Deno.env.get("BILLING_BUCKET") ?? "facturation-documents";
const LOGO_PUBLIC_URL = Deno.env.get("LOGO_PUBLIC_URL") ?? "";

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <g fill="none" stroke="#FF6D4D" stroke-width="20" stroke-linecap="round" stroke-linejoin="round">
    <line x1="60" y1="100" x2="140" y2="40" />
    <line x1="60" y1="100" x2="140" y2="160" />
  </g>
  <g fill="#FF6D4D">
    <circle cx="60" cy="100" r="34" />
    <circle cx="140" cy="40" r="34" />
    <circle cx="140" cy="160" r="34" />
  </g>
</svg>`;

const LOGO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAACu0lEQVR42u3Z2w2EMAxFwTRIKdv/J/TAisT2nSPlH+EMz7UkSZIkSZIkaVT377qdBUUD+Hc5i4ICFoEBiqDYvkxBcEAiMEARHJAIDkgEBiiCoy8OSAQHJAIEEMEBieCARHBAIkAAERyQSGk4IBEggAgQQAQHJAIEEMEBiQABRIAAIjggESAWIAIEEAECiAABRIAAIkAAESCACA5IBAkcAgQQCRBABAggAgQQAQKIAAFEgAAiSOAQIIAIEEAkOCRAABEccAgOQAQGIIIDDsEBh+AARGDAITjgEBhwCA4LEMEBh+CAo+/GBAMMV+aCwzqx4eDQqj680xsODjDKDrLSMYIBRanhph8THMEvuO5uUIDR4Hk/4R1OzT+LTroiQwGHfwaN/yMJDFdmwQGH4IBDgMAhOMAQHHAIDjAECByCAw7BAYcAAUMCBA7BAYcAAURwQCJAABEggAgOSAQIIAIEEAECiAQIIAIEEAECiAABRHBAIkjgECCACBBABAggAgQMQAQIIAIEEAECiCCBQ4AAIkAAESRwCBBABAkkEiCQCBBQBAkkggQSAQKJIAFFkEAiSECRAIFEkEAiSCARKIlQQIXk9YadgMSdDpJPN2rHu4nHQlC2D74DEu9PkBwddvoxwRKEZcIx+tAAStwzfsX3IlCGY5l0x/PZWq2+4/uPA4lAAUWQQCJIIBEkgAgUSAQJJAIFEgkSQAQJJIIEEoECiCABRJBAIkAAERyQCBBAJEAAERyQCBBABAggAgQQAQKIAAFEgAAiQAARHBYkggQOAQKIAAFEgAAiQAARIIAIEEAECCCCBA4JEEAECCCCBA4BAogggUOAACJAABEkcAgSOCRApHQkpitI4BAkcAgQQAQJHIIEDoEChiCBQ+qKxHQEChiCBA7BAoVAAUP6EIuzqGhAzoIkSZIkSdreA4IM4tuQQvIJAAAAAElFTkSuQmCC";

const LOGO_PNG_DATA_URI = `data:image/png;base64,${LOGO_PNG_BASE64}`;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type InvoiceLine = {
  label: string;
  quantity: number;
  unitLabel?: string | null;
  unitTtcCents: number;
  vatRate: number;
  totalTtcCents: number;
};

type PartyInfo = {
  name?: string | null;
  address?: string | null;
  addressDetails?: string | null;
  city?: string | null;
  postcode?: string | null;
  siret?: string | null;
  vatNumber?: string | null;
  vatRegime?: string | null;
};

type InvoicePdfPayload = {
  numero: string;
  issuedAt: string;
  currency: string;
  producer: PartyInfo;
  client: PartyInfo;
  orderCode?: string | null;
  pickupCode?: string | null;
  pickupAddress?: string | null;
  lines: InvoiceLine[];
  totals: {
    htCents: number;
    tvaCents: number;
    ttcCents: number;
  };
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR");
};

const formatCurrency = (cents: number, currency = "EUR") => {
  const value = cents / 100;
  if (currency === "EUR") {
    return `${value.toFixed(2).replace(".", ",")} €`;
  }
  return `${value.toFixed(2).replace(".", ",")} ${currency}`;
};

const formatQuantity = (value: number) => String(value).replace(".", ",");

const formatVatRate = (rate: number) => `${Math.round(rate * 10000) / 100}%`;

const buildAddressLines = (party: PartyInfo) => {
  const lines = [];
  if (party.address) lines.push(party.address);
  if (party.addressDetails) lines.push(party.addressDetails);
  const cityLine = [party.postcode, party.city].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);
  return lines;
};

const buildPickupAddress = (orderRow?: {
  pickup_address?: string | null;
  pickup_city?: string | null;
  pickup_postcode?: string | null;
}) => {
  if (!orderRow) return null;
  const addressLine = orderRow.pickup_address ?? "";
  const cityLine = [orderRow.pickup_postcode, orderRow.pickup_city].filter(Boolean).join(" ");
  const lines = [addressLine, cityLine].map((value) => (value ?? "").trim()).filter(Boolean);
  if (!lines.length) return null;
  return lines.join(", ");
};

const drawLogo = (page: any, x: number, y: number, size: number) => {
  const color = rgb(1, 0.427, 0.302);
  const lineWidth = Math.max(1, size * 0.1);
  const r = size * 0.17;
  const cx = x + size * 0.3;
  const cy = y + size * 0.5;
  const topX = x + size * 0.7;
  const topY = y + size * 0.2;
  const bottomY = y + size * 0.8;

  page.drawLine({ start: { x: cx, y: cy }, end: { x: topX, y: topY }, thickness: lineWidth, color });
  page.drawLine({ start: { x: cx, y: cy }, end: { x: topX, y: bottomY }, thickness: lineWidth, color });
  page.drawCircle({ x: cx, y: cy, size: r, color, borderColor: color, borderWidth: 0 });
  page.drawCircle({ x: topX, y: topY, size: r, color, borderColor: color, borderWidth: 0 });
  page.drawCircle({ x: topX, y: bottomY, size: r, color, borderColor: color, borderWidth: 0 });
};

const wrapText = (text: string, maxWidth: number, font: any, size: number) => {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
};

async function generateInvoicePdf(payload: InvoicePdfPayload) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { height, width } = page.getSize();
  const margin = 48;
  let y = height - margin;

  drawLogo(page, margin, y - 36, 48);
  page.drawText("Partage", { x: margin + 60, y: y - 28, size: 20, font: fontBold, color: rgb(0.12, 0.12, 0.12) });

  page.drawText(`FACTURE ${payload.numero}`, {
    x: width - margin - 250,
    y: y - 2,
    size: 16,
    font: fontBold,
    color: rgb(0.12, 0.12, 0.12),
  });
  page.drawText(`Date : ${formatDate(payload.issuedAt)}`, {
    x: width - margin - 250,
    y: y - 22,
    size: 10,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  y -= 64;

  const columnGap = 24;
  const columnWidth = (width - margin * 2 - columnGap) / 2;

  const drawPartyBlock = (title: string, party: PartyInfo, x: number, startY: number) => {
    let yCursor = startY;
    page.drawText(title, { x, y: yCursor, size: 11, font: fontBold, color: rgb(0.12, 0.12, 0.12) });
    yCursor -= 16;
    if (party.name) {
      page.drawText(party.name, { x, y: yCursor, size: 10, font });
      yCursor -= 14;
    }
    const addressLines = buildAddressLines(party);
    addressLines.forEach((line) => {
      page.drawText(line, { x, y: yCursor, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
      yCursor -= 12;
    });
    if (party.siret) {
      page.drawText(`SIRET : ${party.siret}`, { x, y: yCursor, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
      yCursor -= 12;
    }
    if (party.vatNumber && party.vatRegime !== "franchise") {
      page.drawText(`TVA : ${party.vatNumber}`, { x, y: yCursor, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
      yCursor -= 12;
    }
    return yCursor;
  };

  drawPartyBlock("Producteur", payload.producer, margin, y);
  drawPartyBlock("Participant à la commande", payload.client, margin + columnWidth + columnGap, y);

  y -= 92;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.9, 0.9, 0.9),
  });
  y -= 18;

  const headerY = y;
  const colX = {
    label: margin,
    qty: width - margin - 210,
    unit: width - margin - 150,
    vat: width - margin - 90,
    total: width - margin - 40,
  };

  page.drawText("Produit", { x: colX.label, y: headerY, size: 10, font: fontBold });
  page.drawText("Qté", { x: colX.qty, y: headerY, size: 10, font: fontBold });
  page.drawText("PU TTC", { x: colX.unit, y: headerY, size: 10, font: fontBold });
  page.drawText("TVA", { x: colX.vat, y: headerY, size: 10, font: fontBold });
  page.drawText("Total TTC", { x: colX.total, y: headerY, size: 10, font: fontBold });
  y -= 12;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.9, 0.9, 0.9),
  });
  y -= 16;

  payload.lines.forEach((line) => {
    const labelLines = wrapText(line.label, colX.qty - margin - 8, font, 9);
    labelLines.forEach((text, idx) => {
      page.drawText(text, { x: colX.label, y: y - idx * 10, size: 9, font });
    });

    const qty = `${formatQuantity(line.quantity)}${line.unitLabel ? ` ${line.unitLabel}` : ""}`;
    page.drawText(qty, { x: colX.qty, y, size: 9, font, color: rgb(0.25, 0.25, 0.25) });
    page.drawText(formatCurrency(line.unitTtcCents, payload.currency), {
      x: colX.unit,
      y,
      size: 9,
      font,
      color: rgb(0.25, 0.25, 0.25),
    });
    page.drawText(formatVatRate(line.vatRate), {
      x: colX.vat,
      y,
      size: 9,
      font,
      color: rgb(0.25, 0.25, 0.25),
    });
    page.drawText(formatCurrency(line.totalTtcCents, payload.currency), {
      x: colX.total,
      y,
      size: 9,
      font,
      color: rgb(0.25, 0.25, 0.25),
    });

    const lineHeight = Math.max(1, labelLines.length) * 12;
    y -= lineHeight;
    if (y < 180) {
      y = 180;
    }
  });

  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.9, 0.9, 0.9),
  });

  y -= 18;
  const totalsX = width - margin - 220;
  const drawTotalLine = (label: string, value: string, bold = false) => {
    page.drawText(label, { x: totalsX, y, size: 10, font: bold ? fontBold : font });
    page.drawText(value, { x: width - margin - 70, y, size: 10, font: bold ? fontBold : font });
    y -= 16;
  };

  drawTotalLine("Total HT", formatCurrency(payload.totals.htCents, payload.currency));
  drawTotalLine("TVA", formatCurrency(payload.totals.tvaCents, payload.currency));
  drawTotalLine("Total TTC", formatCurrency(payload.totals.ttcCents, payload.currency), true);

  y -= 12;
  y -= 12;
  if (payload.orderCode || payload.pickupCode) {
    const mentions = [
      payload.orderCode ? `Commande : ${payload.orderCode}` : null,
      payload.pickupCode ? `Code retrait : ${payload.pickupCode}` : null,
    ]
      .filter(Boolean)
      .join(" • ");
    page.drawText(mentions, { x: margin, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  }

  return await pdf.save(); // Uint8Array
}

async function sendBrevoEmail(opts: {
  toEmail: string;
  subject: string;
  html: string;
  attachmentName: string;
  attachmentBytes: Uint8Array;
}) {
  if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY manquant");
  if (!BREVO_SENDER_EMAIL) throw new Error("BREVO_SENDER_EMAIL manquant");

  const b64 = encodeBase64(opts.attachmentBytes);

  const payload = {
    sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
    to: [{ email: opts.toEmail }],
    subject: opts.subject,
    htmlContent: opts.html,
    attachment: [{ name: opts.attachmentName, content: b64 }],
  };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
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

function normalizeKind(v: unknown) {
  return String(v ?? "").trim().toUpperCase();
}

Deno.serve(async (req) => {
  // Securite : secret interne obligatoire
  const got = req.headers.get("x-internal-secret") ?? "";
  if (!BILLING_INTERNAL_SECRET || got !== BILLING_INTERNAL_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const mode = body?.mode ?? "scan_pending";
  if (mode !== "scan_pending") {
    return new Response(JSON.stringify({ ok: false, error: "mode invalide" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: jobs, error: dqErr } = await supabase.rpc("dequeue_emails_sortants", { p_limit: 10 });
  if (dqErr) {
    return new Response(JSON.stringify({ ok: false, error: dqErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let processed = 0;
  const results: any[] = [];

  for (const job of jobs ?? []) {
    const jobId = job?.id;

    try {
      if (!jobId) throw new Error("Job invalide: id manquant");
      const kind = normalizeKind(job?.kind);

      if (!job.facture_id) {
        throw new Error("Job invalide: facture_id manquant (emails_sortants.facture_id est NULL)");
      }

      const { data: facture, error: fErr } = await supabase
        .from("factures")
        .select(
          "id, numero, total_ttc_cents, producer_profile_id, client_profile_id, pdf_path, order_id, issued_at, currency, serie, payment_id",
        )
        .eq("id", job.facture_id)
        .single();

      if (fErr || !facture) throw new Error(`Facture introuvable: ${fErr?.message ?? "null"}`);

      let toProfileId: string | null = job?.to_profile_id ?? null;
      if (!toProfileId) {
        if (kind === "FACTURE_CLIENT") {
          toProfileId = facture.client_profile_id ?? null;
        } else if (kind === "FACTURE_PLATEFORME" || kind === "RELEVE_REGLEMENT") {
          toProfileId = facture.producer_profile_id ?? null;
        } else if (kind === "FACTURE_AUTO_SHARER") {
          toProfileId = facture.client_profile_id ?? null;
        } else {
          throw new Error(`kind inconnu: ${job?.kind}`);
        }
      }

      if (!toProfileId) throw new Error(`Destinataire introuvable pour kind=${kind}`);

      const { data: userData, error: uErr } = await supabase.auth.admin.getUserById(toProfileId);
      if (uErr || !userData?.user?.email) throw new Error("Email destinataire introuvable (auth.users)");

      const toEmail = userData.user.email;

      const { data: producerProfile } = await supabase
        .from("profiles")
        .select("name, address, address_details, city, postcode")
        .eq("id", facture.producer_profile_id)
        .maybeSingle();

      const { data: producerLegal } = await supabase
        .from("legal_entities")
        .select("legal_name, siret, vat_number, vat_regime")
        .eq("profile_id", facture.producer_profile_id)
        .maybeSingle();

      const { data: clientProfile } = await supabase
        .from("profiles")
        .select("name, address, address_details, city, postcode")
        .eq("id", facture.client_profile_id)
        .maybeSingle();

      const { data: orderRow } = await supabase
        .from("orders")
        .select("id, order_code, title, currency, sharer_profile_id, producer_profile_id, pickup_address, pickup_city, pickup_postcode")
        .eq("id", facture.order_id)
        .maybeSingle();

      let participantId: string | null = null;
      let pickupCode: string | null = null;

      // 1) Preferred source: payment -> participant_id (most precise for paid invoices).
      if (facture.payment_id) {
        const { data: paymentParticipant } = await supabase
          .from("payments")
          .select("participant_id")
          .eq("id", facture.payment_id)
          .maybeSingle();
        const paymentParticipantId = paymentParticipant?.participant_id ?? null;
        if (paymentParticipantId) {
          const { data: opFromPayment } = await supabase
            .from("order_participants")
            .select("id, pickup_code")
            .eq("id", paymentParticipantId)
            .maybeSingle();
          if (opFromPayment) {
            participantId = opFromPayment.id;
            pickupCode = opFromPayment.pickup_code ?? null;
          }
        }
      }

      // 2) Fallback source by invoice recipient role.
      if (!participantId) {
        if (facture.client_profile_id === orderRow?.sharer_profile_id) {
          // Sharer invoice: enforce sharer role.
          const { data: sharerOp } = await supabase
            .from("order_participants")
            .select("id, pickup_code")
            .eq("order_id", facture.order_id)
            .eq("role", "sharer")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (sharerOp) {
            participantId = sharerOp.id;
            pickupCode = sharerOp.pickup_code ?? null;
          }
        } else {
          // Participant invoice: prefer participant role for that profile.
          const { data: participantOp } = await supabase
            .from("order_participants")
            .select("id, pickup_code")
            .eq("order_id", facture.order_id)
            .eq("profile_id", facture.client_profile_id)
            .eq("role", "participant")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (participantOp) {
            participantId = participantOp.id;
            pickupCode = participantOp.pickup_code ?? null;
          }
        }
      }

      // 3) Last fallback (legacy behavior).
      if (!participantId) {
        const { data: participantRow } = await supabase
          .from("order_participants")
          .select("id, pickup_code")
          .eq("order_id", facture.order_id)
          .eq("profile_id", facture.client_profile_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (participantRow) {
          participantId = participantRow.id;
          pickupCode = participantRow.pickup_code ?? null;
        }
      }

      let coopUsedCents = 0;
      if (kind === "FACTURE_CLIENT" && facture.client_profile_id && facture.order_id) {
        const { data: coopRows, error: coopErr } = await supabase
          .from("coop_ledger")
          .select("delta_cents")
          .eq("profile_id", facture.client_profile_id)
          .eq("order_id", facture.order_id)
          .eq("reason", "consume_order");
        if (coopErr) throw new Error(`Coop ledger error: ${coopErr.message}`);
        coopUsedCents = (coopRows ?? []).reduce(
          (sum, row) => sum + Math.max(0, -Number(row.delta_cents ?? 0)),
          0
        );
      }

      let factureTotalTtcCents = Number(facture.total_ttc_cents ?? 0);
      let itemLines: InvoiceLine[] = [];

      if (itemLines.length === 0) {
        const { data: lineRows, error: lineErr } = await supabase
          .from("facture_lignes")
          .select("label, quantity, unit_ttc_cents, total_ttc_cents, vat_rate")
          .eq("facture_id", facture.id);
        if (lineErr) throw new Error(`Facture lignes error: ${lineErr.message}`);
        if (lineRows && lineRows.length) {
          itemLines = lineRows.map((row) => ({
            label: row.label ?? "Ligne",
            quantity: Number(row.quantity ?? 0),
            unitLabel: null,
            unitTtcCents: Number(row.unit_ttc_cents ?? 0),
            vatRate: Number(row.vat_rate ?? 0),
            totalTtcCents: Number(row.total_ttc_cents ?? 0),
          }));
        }
      }

      if (itemLines.length === 0 && facture.serie === "PROD_CLIENT" && participantId) {
        const { data: itemRows, error: itemsErr } = await supabase
          .from("order_items")
          .select("product_id, quantity_units, unit_label, unit_final_price_cents, line_total_cents")
          .eq("order_id", facture.order_id)
          .eq("participant_id", participantId);
        if (itemsErr) throw new Error(`Order items error: ${itemsErr.message}`);

        const productIds = (itemRows ?? []).map((row) => row.product_id);
        const { data: productRows } = productIds.length
          ? await supabase.from("products").select("id, name, vat_rate").in("id", productIds)
          : { data: [] as Array<{ id: string; name: string; vat_rate: number | null }> };
        const productMap = new Map((productRows ?? []).map((row) => [row.id, row]));

        itemLines = (itemRows ?? []).map((row) => {
          const product = productMap.get(row.product_id);
          return {
            label: product?.name ?? "Produit",
            quantity: Number(row.quantity_units ?? 0),
            unitLabel: row.unit_label ?? null,
            unitTtcCents: Number(row.unit_final_price_cents ?? 0),
            vatRate: Number(product?.vat_rate ?? 0),
            totalTtcCents: Number(row.line_total_cents ?? 0),
          };
        });
      }

      if (itemLines.length === 0) {
        itemLines = [
          {
            label: facture.serie === "PLAT_PROD" ? "Commission de la plateforme" : "Participation commande",
            quantity: 1,
            unitLabel: null,
            unitTtcCents: factureTotalTtcCents,
            vatRate: 0,
            totalTtcCents: factureTotalTtcCents,
          },
        ];
      }

      let totalTtcCents = 0;
      let totalHtCents = 0;
      let totalTvaCents = 0;
      itemLines.forEach((line) => {
        totalTtcCents += line.totalTtcCents;
        const divisor = 1 + (line.vatRate ?? 0);
        const lineHt = divisor > 0 ? Math.round(line.totalTtcCents / divisor) : line.totalTtcCents;
        totalHtCents += lineHt;
        totalTvaCents += line.totalTtcCents - lineHt;
      });

      if (factureTotalTtcCents && totalTtcCents !== factureTotalTtcCents) {
        totalTtcCents = factureTotalTtcCents;
      }

      const invoicePdfPayload: InvoicePdfPayload = {
        numero: facture.numero,
        issuedAt: facture.issued_at,
        currency: facture.currency ?? "EUR",
        producer: {
          name: producerLegal?.legal_name ?? producerProfile?.name ?? "Producteur",
          address: producerProfile?.address ?? null,
          addressDetails: producerProfile?.address_details ?? null,
          city: producerProfile?.city ?? null,
          postcode: producerProfile?.postcode ?? null,
          siret: producerLegal?.siret ?? null,
          vatNumber: producerLegal?.vat_number ?? null,
          vatRegime: producerLegal?.vat_regime ?? null,
        },
        client: {
          name: clientProfile?.name ?? "Client",
          address: clientProfile?.address ?? null,
          addressDetails: clientProfile?.address_details ?? null,
          city: clientProfile?.city ?? null,
          postcode: clientProfile?.postcode ?? null,
        },
        orderCode: orderRow?.order_code ?? null,
        pickupCode,
        pickupAddress: buildPickupAddress(orderRow ?? undefined),
        lines: itemLines,
        totals: {
          htCents: totalHtCents,
          tvaCents: totalTvaCents,
          ttcCents: totalTtcCents,
        },
      };

      const pdfBytes = await generateInvoicePdf(invoicePdfPayload);

      const pdfPath =
        facture.pdf_path ||
        (kind === "FACTURE_CLIENT"
          ? `factures_client/${facture.producer_profile_id}/${facture.numero}.pdf`
          : `factures_plateforme/${facture.producer_profile_id}/${facture.numero}.pdf`);

      const up = await supabase.storage.from(BILLING_BUCKET).upload(pdfPath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (up.error) throw new Error(`Upload PDF error: ${up.error.message}`);

      if (!facture.pdf_path || facture.pdf_path !== pdfPath) {
        const { error: updFactErr } = await supabase.from("factures").update({ pdf_path: pdfPath }).eq("id", facture.id);
        if (updFactErr) throw new Error(`Update factures.pdf_path error: ${updFactErr.message}`);
      }

      const orderNameLabel = orderRow?.title?.trim() || "—";
      const orderLabel = orderRow?.order_code ?? facture.order_id ?? "";
      const orderRefFragment = orderLabel ? ` - commande ${orderLabel}` : "";
      const isProducerDocument = kind === "FACTURE_PLATEFORME" || kind === "RELEVE_REGLEMENT";
      const subject =
        kind === "FACTURE_CLIENT"
          ? `Confirmation de votre commande - Facture ${facture.numero}`
          : kind === "FACTURE_AUTO_SHARER"
            ? `Auto-facture - ${facture.numero}`
            : kind === "FACTURE_PLATEFORME"
              ? `Facture de commission plateforme${orderRefFragment} - ${facture.numero}`
              : kind === "RELEVE_REGLEMENT"
                ? `Releve de reglement producteur${orderRefFragment} - ${facture.numero}`
                : `Document - ${facture.numero}`;
      const titleText =
        kind === "FACTURE_CLIENT"
          ? "Merci pour votre achat !"
          : kind === "FACTURE_AUTO_SHARER"
            ? "Votre auto-facture est disponible"
            : kind === "FACTURE_PLATEFORME"
              ? "Votre facture de commission est disponible"
              : kind === "RELEVE_REGLEMENT"
                ? "Votre releve de reglement est disponible"
                : "Votre document est disponible";
      const introText =
        kind === "FACTURE_CLIENT"
          ? "Bonjour, voici le recapitulatif de votre commande."
          : kind === "FACTURE_AUTO_SHARER"
            ? "Bonjour, vous trouverez en piece jointe votre auto-facture."
            : kind === "FACTURE_PLATEFORME"
              ? "Bonjour, vous trouverez en piece jointe la facture de commission liee a cette commande producteur."
              : kind === "RELEVE_REGLEMENT"
                ? "Bonjour, vous trouverez en piece jointe le releve de reglement de cette commande producteur."
                : "Bonjour, vous trouverez en piece jointe votre document.";
      const paymentLabel = isProducerDocument ? "Paiements participants" : "Paiement";
      const paymentValue = isProducerDocument ? "Carte bancaire / gains de cooperation" : "Carte bancaire";
      const pickupCodeLabel = pickupCode ?? "";
      const linesHtml = itemLines
        .map((line) => {
          const qty = `${formatQuantity(line.quantity)}${line.unitLabel ? ` ${line.unitLabel}` : ""}`;
          return `
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #eee;">${line.label}</td>
              <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;">${qty}</td>
              <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(line.totalTtcCents, facture.currency ?? "EUR")}</td>
            </tr>
          `;
        })
        .join("");

      const logoSrc = LOGO_PUBLIC_URL || LOGO_PNG_DATA_URI;
      const coopNoteHtml =
        coopUsedCents > 0
          ? `
            <div style="margin:16px 0 0;padding:12px 14px;background:#f8f8f8;border:1px solid #eee;border-radius:8px;">
              <div style="font-size:13px;color:#555;">Gain de coopération utilisé</div>
              <div style="font-size:15px;font-weight:bold;color:#111;">-${formatCurrency(coopUsedCents, facture.currency ?? "EUR")}</div>
            </div>
          `
          : "";
      const html = `
<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8" /></head>
  <body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222;">
    <div style="max-width:640px;margin:24px auto;background:#ffffff;border:1px solid #e7e7e7;">
      <div style="padding:24px 28px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:12px;">
        <img src="${logoSrc}" width="40" height="40" alt="Partage" style="display:block;" />
        <div style="font-size:18px;font-weight:bold;color:#1f1f1f;">Partage</div>
      </div>
      <div style="padding:24px 28px;">
        <h2 style="margin:0 0 12px;font-size:20px;">${titleText}</h2>
        <p style="margin:0 0 16px;color:#555;">${introText}</p>
        <div style="background:#f8f8f8;border:1px solid #eee;padding:14px 16px;margin-bottom:18px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr>
              <td style="padding:4px 0;color:#666;">Nom de la commande</td>
              <td style="padding:4px 0;text-align:right;font-weight:bold;">${orderNameLabel}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#666;">Numéro de commande</td>
              <td style="padding:4px 0;text-align:right;font-weight:bold;">${orderLabel}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#666;">Date</td>
              <td style="padding:4px 0;text-align:right;font-weight:bold;">${formatDate(facture.issued_at)}</td>
            </tr>
            ${
              pickupCodeLabel
                ? `<tr>
                     <td style="padding:4px 0;color:#666;">Code retrait</td>
                     <td style="padding:4px 0;text-align:right;font-weight:bold;">${pickupCodeLabel}</td>
                   </tr>`
                : ""
            }
            ${
              invoicePdfPayload.pickupAddress
                ? `<tr>
                     <td style="padding:4px 0;color:#666;">Adresse retrait</td>
                     <td style="padding:4px 0;text-align:right;font-weight:bold;">${invoicePdfPayload.pickupAddress}</td>
                   </tr>`
                : ""
            }
            <tr>
              <td style="padding:4px 0;color:#666;">Total</td>
              <td style="padding:4px 0;text-align:right;font-weight:bold;">${formatCurrency(totalTtcCents, facture.currency ?? "EUR")}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#666;">${paymentLabel}</td>
              <td style="padding:4px 0;text-align:right;font-weight:bold;">${paymentValue}</td>
            </tr>
          </table>
          ${coopNoteHtml}
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr>
              <th style="text-align:left;padding-bottom:8px;border-bottom:1px solid #eee;">Produit</th>
              <th style="text-align:center;padding-bottom:8px;border-bottom:1px solid #eee;">Qte</th>
              <th style="text-align:right;padding-bottom:8px;border-bottom:1px solid #eee;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
          </tbody>
        </table>

        <div style="margin-top:18px;text-align:right;font-size:14px;">
          <div style="margin-bottom:4px;">Total HT : <strong>${formatCurrency(totalHtCents, facture.currency ?? "EUR")}</strong></div>
          <div style="margin-bottom:4px;">TVA : <strong>${formatCurrency(totalTvaCents, facture.currency ?? "EUR")}</strong></div>
          <div>Total TTC : <strong>${formatCurrency(totalTtcCents, facture.currency ?? "EUR")}</strong></div>
        </div>

        <p style="margin:20px 0 0;color:#888;font-size:12px;">
          Cet e-mail est envoyé automatiquement. Merci pour votre confiance.
        </p>
      </div>
      <div style="padding:14px 28px;background:#fafafa;border-top:1px solid #eee;color:#888;font-size:12px;text-align:center;">
        © ${new Date().getFullYear()} Partage. Tous droits réservés.
      </div>
    </div>
  </body>
</html>`;

      const brevoResp = await sendBrevoEmail({
        toEmail,
        subject,
        html,
        attachmentName: `${kind}-${facture.numero}.pdf`,
        attachmentBytes: pdfBytes,
      });

      const { error: updEmailErr } = await supabase
        .from("emails_sortants")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: brevoResp?.messageId ?? null,
          last_error: null,
          locked_at: null,
        })
        .eq("id", jobId);

      if (updEmailErr) throw new Error(`Update emails_sortants sent error: ${updEmailErr.message}`);

      processed++;
      results.push({ id: jobId, ok: true, toEmail, messageId: brevoResp?.messageId ?? null, pdfPath });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);

      if (jobId) {
        await supabase
          .from("emails_sortants")
          .update({ status: "failed", last_error: msg, locked_at: null })
          .eq("id", jobId);
      }

      results.push({ id: jobId ?? null, ok: false, error: msg });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      mode,
      dequeued: jobs?.length ?? 0,
      processed,
      results,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
