import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "npm:pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PARTAGE_PLATFORM_PROFILE_ID = "d1d67cf6-0d41-4a05-95a0-335c15b15a05";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type LegalDocumentType =
  | "producer_mandat"
  | "sharer_autofacturation";

type ProfileContactRow = {
  id: string;
  account_type?: string | null;
  address?: string | null;
  address_details?: string | null;
  city?: string | null;
  postcode?: string | null;
  contact_email_public?: string | null;
  phone?: string | null;
  phone_public?: string | null;
};

const DOC_TYPE_LABELS: Record<LegalDocumentType, string> = {
  producer_mandat: "MANDAT PRODUCTEUR DE FACTURATION ET D'ENCAISSEMENT DES PAIEMENTS",
  sharer_autofacturation: "ACCORD D'AUTOFACTURATION - PARTAGEUR PROFESSIONNEL",
};

const isLegalDocumentType = (value: unknown): value is LegalDocumentType =>
  value === "producer_mandat" || value === "sharer_autofacturation";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const safeText = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "........................................";
  }
  if (value === null || value === undefined) {
    return "........................................";
  }
  return String(value);
};

const buildAddressFromProfile = (profile: ProfileContactRow | null | undefined) => {
  const parts = [
    profile?.address,
    profile?.address_details,
    [profile?.postcode, profile?.city].filter(Boolean).join(" ").trim(),
  ]
    .map((item) => (item ?? "").trim())
    .filter(Boolean);
  return parts.join(", ");
};

const buildEmailFromProfile = (profile: ProfileContactRow | null | undefined) =>
  (profile?.contact_email_public ?? "").trim();

const buildPhoneFromProfile = (profile: ProfileContactRow | null | undefined) =>
  (profile?.phone_public ?? profile?.phone ?? "").trim();

const wrapText = (params: {
  text: string;
  font: PDFFont;
  size: number;
  maxWidth: number;
}) => {
  const paragraphs = params.text.split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = words[0] ?? "";
    for (let i = 1; i < words.length; i += 1) {
      const next = `${current} ${words[i]}`;
      const width = params.font.widthOfTextAtSize(next, params.size);
      if (width <= params.maxWidth) {
        current = next;
      } else {
        lines.push(current);
        current = words[i] ?? "";
      }
    }
    if (current) lines.push(current);
  }

  return lines;
};

type Drawer = {
  drawTitle: (text: string) => void;
  drawSubtitle: (text: string) => void;
  drawParagraph: (text: string) => void;
  drawBullet: (text: string) => void;
  drawRule: () => void;
  drawSpacer: (height?: number) => void;
};

async function createDrawer(pdf: PDFDocument): Promise<Drawer> {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginLeft = 42;
  const marginRight = 42;
  const marginTop = 796;
  const marginBottom = 48;

  let currentPage = pdf.addPage([pageWidth, pageHeight]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const color = rgb(0.1, 0.13, 0.18);
  let y = marginTop;

  const ensureSpace = (required: number) => {
    if (y - required >= marginBottom) return;
    currentPage = pdf.addPage([pageWidth, pageHeight]);
    y = marginTop;
  };

  const drawWrapped = (params: {
    text: string;
    size: number;
    isBold?: boolean;
    prefix?: string;
    indent?: number;
    lineGap?: number;
  }) => {
    const value = params.prefix ? `${params.prefix}${params.text}` : params.text;
    const activeFont = params.isBold ? boldFont : font;
    const indent = params.indent ?? 0;
    const lineGap = params.lineGap ?? 6;
    const maxWidth = pageWidth - marginLeft - marginRight - indent;
    const lines = wrapText({
      text: value,
      font: activeFont,
      size: params.size,
      maxWidth,
    });

    for (const line of lines) {
      ensureSpace(params.size + lineGap + 2);
      if (!line) {
        y -= params.size + lineGap;
        continue;
      }
      currentPage.drawText(line, {
        x: marginLeft + indent,
        y,
        size: params.size,
        font: activeFont,
        color,
      });
      y -= params.size + lineGap;
    }
  };

  return {
    drawTitle: (text: string) => {
      const size = 18;
      const lineGap = 8;
      const contentWidth = pageWidth - marginLeft - marginRight;
      const lines = wrapText({
        text,
        font: boldFont,
        size,
        maxWidth: contentWidth,
      });
      for (const line of lines) {
        ensureSpace(size + lineGap + 2);
        const lineWidth = boldFont.widthOfTextAtSize(line, size);
        const x = marginLeft + Math.max(0, (contentWidth - lineWidth) / 2);
        currentPage.drawText(line, {
          x,
          y,
          size,
          font: boldFont,
          color,
        });
        y -= size + lineGap;
      }
      y -= 4;
    },
    drawRule: () => {
      ensureSpace(14);
      currentPage.drawLine({
        start: { x: marginLeft, y },
        end: { x: pageWidth - marginRight, y },
        thickness: 1,
        color: rgb(0.82, 0.85, 0.9),
      });
      y -= 18;
    },
    drawSubtitle: (text: string) => {
      drawWrapped({ text, size: 13, isBold: true, lineGap: 6 });
      y -= 2;
    },
    drawParagraph: (text: string) => {
      drawWrapped({ text, size: 11, lineGap: 5 });
    },
    drawBullet: (text: string) => {
      drawWrapped({ text, size: 11, prefix: "- ", indent: 10, lineGap: 5 });
    },
    drawSpacer: (height = 10) => {
      y -= height;
    },
  };
}

async function generateProducerMandatPdf(params: {
  legalEntity: Record<string, unknown>;
  producerProfile: ProfileContactRow;
  platformLegalEntity: Record<string, unknown>;
  platformProfile: ProfileContactRow;
}) {
  const pdf = await PDFDocument.create();
  const d = await createDrawer(pdf);
  const legalName = safeText(params.legalEntity.legal_name);
  const entityType = safeText(params.legalEntity.entity_type);
  const siret = safeText(params.legalEntity.siret);
  const vatNumber = safeText(params.legalEntity.vat_number);
  const iban = safeText(params.legalEntity.iban);
  const accountHolder = safeText(params.legalEntity.account_holder_name);
  const producerAddress = safeText(buildAddressFromProfile(params.producerProfile));
  const producerEmail = safeText(buildEmailFromProfile(params.producerProfile));
  const producerPhone = safeText(buildPhoneFromProfile(params.producerProfile));
  const platformLegalName = safeText(params.platformLegalEntity.legal_name);
  const platformSiret = safeText(params.platformLegalEntity.siret);
  const platformVat = safeText(params.platformLegalEntity.vat_number);
  const platformRepresentative = safeText(params.platformLegalEntity.account_holder_name);
  const platformAddress = safeText(buildAddressFromProfile(params.platformProfile));
  const platformEmail = safeText(buildEmailFromProfile(params.platformProfile));
  const platformPhone = safeText(buildPhoneFromProfile(params.platformProfile));

  d.drawTitle(DOC_TYPE_LABELS.producer_mandat);
  d.drawRule();

  d.drawSubtitle("Entre les soussignés");
  d.drawSpacer(6);
  d.drawParagraph("Le Producteur (Mandant)");
  d.drawParagraph(`Raison sociale / Nom : ${legalName}`);
  d.drawParagraph(`Forme juridique : ${entityType}`);
  d.drawParagraph(`Adresse : ${producerAddress}`);
  d.drawParagraph(`SIREN/SIRET: ${siret}`);
  d.drawParagraph(`N° TVA (si applicable) : ${vatNumber}`);
  d.drawParagraph(`Représenté par : ${accountHolder}`);
  d.drawParagraph(`Email : ${producerEmail}`);
  d.drawParagraph(`Téléphone : ${producerPhone}`);
  d.drawSpacer();

  d.drawParagraph("Et");
  d.drawParagraph(`La Plateforme PARTAGE (Mandataire) : ${platformLegalName}`);
  d.drawParagraph(`Adresse : ${platformAddress}`);
  d.drawParagraph(`SIREN/SIRET: ${platformSiret}`);
  d.drawParagraph(`N° TVA : ${platformVat}`);
  d.drawParagraph(`Représentée par : ${platformRepresentative}`);
  d.drawParagraph(`Email : ${platformEmail}`);
  d.drawParagraph(`Téléphone : ${platformPhone}`);
  d.drawSpacer();

  d.drawSubtitle("Article 1 — Objet (facturation)");
  d.drawSpacer(8);
  d.drawParagraph(
    "Le Producteur mandate la Plateforme pour établir matériellement les factures liées aux ventes réalisées via PARTAGE, au nom et pour le compte du Producteur."
  );
  d.drawSpacer(6);

  d.drawSubtitle("Article 2 — Portée");
  d.drawSpacer(8);
  d.drawBullet("Ventes de produits du Producteur commandées via la plateforme.");
  d.drawBullet("Avoirs et rectifications associés à ces ventes.");
  d.drawSpacer(6);

  d.drawSubtitle("Article 3 — Série et numérotation");
  d.drawSpacer(8);
  d.drawParagraph("Numérotation utilisée :");
  d.drawParagraph("[ ] série du Producteur");
  d.drawParagraph("[ ] série dédiée PARTAGE pour compte Producteur");
  d.drawSpacer(6);

  d.drawSubtitle("Article 4 — Transmission, validation, corrections");
  d.drawSpacer(8);
  d.drawParagraph(
    "La Plateforme met à disposition du Producteur un exemplaire de chaque facture émise. Délai de contestation/correction : ........ jours."
  );
  d.drawParagraph(
    "En cas d'erreur, la Plateforme émet les documents correctifs applicables."
  );
  d.drawSpacer(6);

  d.drawSubtitle("Article 5 — Encaissement et reversement");
  d.drawSpacer(8);
  d.drawParagraph(
    "Le Producteur autorise la Plateforme à recevoir les paiements des acheteurs pour son compte, puis à reverser les sommes dues."
  );
  d.drawParagraph("Le reversement est réalisé après déduction des montants contractuels.");
  d.drawBullet("Commission plateforme");
  d.drawBullet("Frais de service partageur (si applicables)");
  d.drawBullet("Ajustements livraison selon l'option choisie");
  d.drawBullet("Frais de paiement (si applicables)");
  d.drawSpacer(6);

  d.drawSubtitle("Article 6 — Délai et compte bancaire");
  d.drawSpacer(8);
  d.drawParagraph("Délai après clôture/encaissement : 1 mois après la clôture de la commande");
  d.drawParagraph(`IBAN du Producteur: ${iban}`);
  d.drawParagraph(`Titulaire du compte : ${accountHolder}`);
  d.drawSpacer(6);

  d.drawSubtitle("Article 7 — Responsabilités");
  d.drawSpacer(8);
  d.drawParagraph("Le Producteur reste responsable des informations commerciales, de la qualification TVA de ses produits et de ses obligations comptables et déclaratives.");
  d.drawSpacer(6);

  d.drawSubtitle("Article 8 — Durée et résiliation");
  d.drawSpacer(8);
  d.drawParagraph("Prend effet le .. / .. / ...., pour une durée indéterminée, résiliable avec préavis de ........ jours.");
  d.drawParagraph("La résiliation n'affecte pas les opérations déjà réalisées.");

  d.drawSpacer();
  d.drawSubtitle("Signatures");
  d.drawSpacer(8);
  d.drawParagraph("Fait à ........................................");
  d.drawParagraph("Le .. / .. / ....");
  d.drawParagraph("Le Producteur (signature + cachet si applicable) :");
  d.drawParagraph("........................................");
  d.drawParagraph("La Plateforme PARTAGE (signature) :");
  d.drawParagraph("........................................");

  return pdf.save();
}

async function generateSharerAutofacturationPdf(params: {
  legalEntity: Record<string, unknown>;
  sharerProfile: ProfileContactRow;
  platformLegalEntity: Record<string, unknown>;
  platformProfile: ProfileContactRow;
}) {
  const pdf = await PDFDocument.create();
  const d = await createDrawer(pdf);
  const legalName = safeText(params.legalEntity.legal_name);
  const entityType = safeText(params.legalEntity.entity_type);
  const siret = safeText(params.legalEntity.siret);
  const vatNumber = safeText(params.legalEntity.vat_number);
  const iban = safeText(params.legalEntity.iban);
  const accountHolder = safeText(params.legalEntity.account_holder_name);
  const sharerAddress = safeText(buildAddressFromProfile(params.sharerProfile));
  const sharerEmail = safeText(buildEmailFromProfile(params.sharerProfile));
  const sharerPhone = safeText(buildPhoneFromProfile(params.sharerProfile));
  const platformLegalName = safeText(params.platformLegalEntity.legal_name);
  const platformSiret = safeText(params.platformLegalEntity.siret);
  const platformVat = safeText(params.platformLegalEntity.vat_number);
  const platformRepresentative = safeText(params.platformLegalEntity.account_holder_name);
  const platformAddress = safeText(buildAddressFromProfile(params.platformProfile));
  const platformEmail = safeText(buildEmailFromProfile(params.platformProfile));
  const platformPhone = safeText(buildPhoneFromProfile(params.platformProfile));

  d.drawTitle(DOC_TYPE_LABELS.sharer_autofacturation);
  d.drawRule();

  d.drawSubtitle("Partie partageur professionnel");
  d.drawSpacer(6);
  d.drawParagraph(`Raison sociale / Nom : ${legalName}`);
  d.drawParagraph(`Forme juridique : ${entityType}`);
  d.drawParagraph(`SIREN/SIRET: ${siret}`);
  d.drawParagraph(`N° TVA (si applicable) : ${vatNumber}`);
  d.drawParagraph(`Représentant : ${accountHolder}`);
  d.drawParagraph(`Adresse : ${sharerAddress}`);
  d.drawParagraph(`Email : ${sharerEmail}`);
  d.drawParagraph(`Téléphone : ${sharerPhone}`);
  d.drawSpacer();

  d.drawSubtitle("Partie plateforme PARTAGE");
  d.drawSpacer(6);
  d.drawParagraph(`Raison sociale : ${platformLegalName}`);
  d.drawParagraph(`Adresse : ${platformAddress}`);
  d.drawParagraph(`SIREN/SIRET: ${platformSiret}`);
  d.drawParagraph(`N° TVA : ${platformVat}`);
  d.drawParagraph(`Représentant : ${platformRepresentative}`);
  d.drawParagraph(`Email : ${platformEmail}`);
  d.drawParagraph(`Téléphone : ${platformPhone}`);
  d.drawSpacer();

  d.drawSubtitle("Article 1 — Objet");
  d.drawSpacer(8);
  d.drawParagraph(
    "Le partageur professionnel accepte l'autofacturation pour la part en argent qui lui revient dans le cadre des opérations réalisées sur la plateforme."
  );
  d.drawSpacer(6);

  d.drawSubtitle("Article 2 — Modalités");
  d.drawSpacer(8);
  d.drawParagraph(
    "La Plateforme peut établir les documents nécessaires de règlement et reverser les montants dus selon les règles contractuelles."
  );
  d.drawSpacer(6);

  d.drawSubtitle("Article 3 — Coordonnées de paiement");
  d.drawSpacer(8);
  d.drawParagraph(`IBAN: ${iban}`);
  d.drawParagraph(`Titulaire du compte : ${accountHolder}`);
  d.drawSpacer(6);

  d.drawSubtitle("Article 4 — Durée");
  d.drawSpacer(8);
  d.drawParagraph("Accord valable jusqu'à résiliation écrite de l'une des parties.");

  d.drawSpacer();
  d.drawSubtitle("Signatures");
  d.drawSpacer(8);
  d.drawParagraph("Fait à ........................................");
  d.drawParagraph("Le .. / .. / ....");
  d.drawParagraph("Le Partageur professionnel (signature) :");
  d.drawParagraph("........................................");
  d.drawParagraph("La Plateforme PARTAGE (signature) :");
  d.drawParagraph("........................................");

  return pdf.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Supabase env is missing" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: { doc_type?: string; template_version?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (!isLegalDocumentType(body.doc_type)) {
    return jsonResponse({ error: "Invalid doc_type" }, 400);
  }
  const docType = body.doc_type;
  const templateVersion = (body.template_version ?? "v1").trim() || "v1";

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const profileId = userData.user.id;

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, account_type, address, address_details, city, postcode, contact_email_public, phone, phone_public")
    .eq("id", profileId)
    .maybeSingle();
  if (profileError || !profile) {
    return jsonResponse({ error: "Profile not found" }, 404);
  }

  const accountType = String(profile.account_type ?? "");
  if (accountType === "individual") {
    return jsonResponse({ error: "Document unavailable for individual account type" }, 403);
  }

  const { data: legalEntity, error: legalEntityError } = await serviceClient
    .from("legal_entities")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (legalEntityError || !legalEntity) {
    return jsonResponse({ error: "Legal entity not found" }, 404);
  }

  const { data: partageLegalEntity, error: partageLegalEntityError } = await serviceClient
    .from("legal_entities")
    .select("*")
    .eq("profile_id", PARTAGE_PLATFORM_PROFILE_ID)
    .maybeSingle();
  if (partageLegalEntityError || !partageLegalEntity) {
    return jsonResponse({ error: "Platform legal entity not found" }, 404);
  }

  const { data: partageProfile, error: partageProfileError } = await serviceClient
    .from("profiles")
    .select("id, address, address_details, city, postcode, contact_email_public, phone, phone_public")
    .eq("id", PARTAGE_PLATFORM_PROFILE_ID)
    .maybeSingle();
  if (partageProfileError || !partageProfile) {
    return jsonResponse({ error: "Platform profile not found" }, 404);
  }

  const pdfBytes = docType === "producer_mandat"
    ? await generateProducerMandatPdf({
      legalEntity: legalEntity as Record<string, unknown>,
      producerProfile: profile as ProfileContactRow,
      platformLegalEntity: partageLegalEntity as Record<string, unknown>,
      platformProfile: partageProfile as ProfileContactRow,
    })
    : await generateSharerAutofacturationPdf({
      legalEntity: legalEntity as Record<string, unknown>,
      sharerProfile: profile as ProfileContactRow,
      platformLegalEntity: partageLegalEntity as Record<string, unknown>,
      platformProfile: partageProfile as ProfileContactRow,
    });

  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${now}-${crypto.randomUUID()}.pdf`;
  const objectPath = `${profileId}/${docType}/${templateVersion}/${filename}`;

  const { error: uploadError } = await serviceClient.storage
    .from("generated_legal_documents")
    .upload(objectPath, new Blob([pdfBytes], { type: "application/pdf" }), {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) {
    return jsonResponse({ error: "Unable to upload generated PDF", details: uploadError.message }, 500);
  }

  const { data: signedUrlData, error: signedUrlError } = await serviceClient.storage
    .from("generated_legal_documents")
    .createSignedUrl(objectPath, 600);
  if (signedUrlError || !signedUrlData?.signedUrl) {
    return jsonResponse({ error: "Unable to generate signed URL" }, 500);
  }

  const { data: existingDoc } = await serviceClient
    .from("legal_documents")
    .select("id")
    .eq("profile_id", profileId)
    .eq("doc_type", docType)
    .eq("template_version", templateVersion)
    .in("status", ["draft", "uploaded", "pending_review", "approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingDoc?.id) {
    await serviceClient
      .from("legal_documents")
      .update({ generated_pdf_path: objectPath })
      .eq("id", existingDoc.id);
  } else {
    await serviceClient
      .from("legal_documents")
      .insert({
        profile_id: profileId,
        legal_entity_id: (legalEntity as { id?: string }).id ?? null,
        doc_type: docType,
        status: "draft",
        template_version: templateVersion,
        generated_pdf_path: objectPath,
      });
  }

  return jsonResponse({
    docType,
    templateVersion,
    generatedPath: objectPath,
    signedUrl: signedUrlData.signedUrl,
  });
});
