export type StripeRequirementsLists = {
  currentlyDue: string[];
  eventuallyDue: string[];
  pastDue: string[];
  outstanding: string[];
  requirementsStatus: string | null;
  disabledReason: string | null;
};

export type StripeAccountSyncPayload = {
  stripe_account_country: string | null;
  stripe_connection_status: "not_connected" | "action_required" | "connected";
  stripe_ready_for_orders: boolean;
  stripe_onboarding_complete: boolean;
  stripe_requirements_due_count: number;
  stripe_requirements_currently_due: string[];
  stripe_requirements_eventually_due: string[];
  stripe_requirements_past_due: string[];
  stripe_requirements_status: string | null;
  stripe_requirements_disabled_reason: string | null;
  stripe_transfers_status: string | null;
  stripe_last_synced_at: string;
};

const STRIPE_API_BASE_V2 = Deno.env.get("STRIPE_API_BASE_V2") ?? "https://api.stripe.com";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_V2_API_VERSION = Deno.env.get("STRIPE_V2_API_VERSION") ?? "2026-03-25.preview";

export function buildStripeV2Headers(secretKey = STRIPE_SECRET_KEY, version = STRIPE_V2_API_VERSION) {
  return {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
    "Stripe-Version": version,
  };
}

export function toStringList(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function readStripeRequirements(snapshot: Record<string, unknown> | null | undefined): StripeRequirementsLists {
  const requirements =
    snapshot?.requirements && typeof snapshot.requirements === "object"
      ? snapshot.requirements as Record<string, unknown>
      : {};
  const currentlyDue = toStringList(requirements.currently_due);
  const eventuallyDue = toStringList(requirements.eventually_due);
  const pastDue = toStringList(requirements.past_due);
  const outstanding = Array.from(new Set([...currentlyDue, ...eventuallyDue, ...pastDue]));
  const summary =
    requirements.summary && typeof requirements.summary === "object"
      ? requirements.summary as Record<string, unknown>
      : {};
  const minimumDeadline =
    summary.minimum_deadline && typeof summary.minimum_deadline === "object"
      ? summary.minimum_deadline as Record<string, unknown>
      : {};
  const requirementsStatus =
    typeof minimumDeadline.status === "string" && minimumDeadline.status.trim()
      ? minimumDeadline.status.trim()
      : null;
  const disabledReason =
    typeof requirements.disabled_reason === "string" && requirements.disabled_reason.trim()
      ? requirements.disabled_reason.trim()
      : null;
  return {
    currentlyDue,
    eventuallyDue,
    pastDue,
    outstanding,
    requirementsStatus,
    disabledReason,
  };
}

export function deriveStripeAccountSyncPayload(
  stripeJson: Record<string, unknown> | null | undefined,
  fallbackCountry: string | null,
) : StripeAccountSyncPayload {
  const syncedAt = new Date().toISOString();
  const requirements = readStripeRequirements(stripeJson);
  const configuration =
    stripeJson?.configuration && typeof stripeJson.configuration === "object"
      ? stripeJson.configuration as Record<string, unknown>
      : {};
  const recipient =
    configuration.recipient && typeof configuration.recipient === "object"
      ? configuration.recipient as Record<string, unknown>
      : {};
  const recipientCapabilities =
    recipient.capabilities && typeof recipient.capabilities === "object"
      ? recipient.capabilities as Record<string, unknown>
      : {};
  const stripeBalance =
    recipientCapabilities.stripe_balance && typeof recipientCapabilities.stripe_balance === "object"
      ? recipientCapabilities.stripe_balance as Record<string, unknown>
      : {};
  const stripeTransfers =
    stripeBalance.stripe_transfers && typeof stripeBalance.stripe_transfers === "object"
      ? stripeBalance.stripe_transfers as Record<string, unknown>
      : {};
  const merchant =
    configuration.merchant && typeof configuration.merchant === "object"
      ? configuration.merchant as Record<string, unknown>
      : {};
  const merchantCapabilities =
    merchant.capabilities && typeof merchant.capabilities === "object"
      ? merchant.capabilities as Record<string, unknown>
      : {};
  const cardPayments =
    merchantCapabilities.card_payments && typeof merchantCapabilities.card_payments === "object"
      ? merchantCapabilities.card_payments as Record<string, unknown>
      : {};
  const rawTransfersStatus =
    typeof stripeTransfers.status === "string" && stripeTransfers.status.trim()
      ? stripeTransfers.status.trim()
      : null;
  const fallbackCardPaymentsStatus =
    typeof cardPayments.status === "string" && cardPayments.status.trim()
      ? cardPayments.status.trim()
      : null;
  const transfersStatus = rawTransfersStatus ?? fallbackCardPaymentsStatus;
  const readyForOrders = transfersStatus === "active";
  const onboardingComplete =
    readyForOrders &&
    requirements.requirementsStatus !== "currently_due" &&
    requirements.requirementsStatus !== "past_due";
  const identity =
    stripeJson?.identity && typeof stripeJson.identity === "object"
      ? stripeJson.identity as Record<string, unknown>
      : {};
  const country =
    typeof identity.country === "string" && identity.country.trim()
      ? identity.country.trim().toUpperCase()
      : fallbackCountry;
  return {
    stripe_account_country: country,
    stripe_connection_status: onboardingComplete ? "connected" : "action_required",
    stripe_ready_for_orders: readyForOrders,
    stripe_onboarding_complete: onboardingComplete,
    stripe_requirements_due_count: requirements.outstanding.length,
    stripe_requirements_currently_due: requirements.currentlyDue,
    stripe_requirements_eventually_due: requirements.eventuallyDue,
    stripe_requirements_past_due: requirements.pastDue,
    stripe_requirements_status: requirements.requirementsStatus,
    stripe_requirements_disabled_reason: requirements.disabledReason,
    stripe_transfers_status: transfersStatus,
    stripe_last_synced_at: syncedAt,
  };
}

export async function fetchStripeConnectedAccountSnapshot(stripeAccountId: string) {
  if (!STRIPE_SECRET_KEY) throw new Error("Missing STRIPE_SECRET_KEY");
  const accountUrl = new URL(`${STRIPE_API_BASE_V2}/v2/core/accounts/${encodeURIComponent(stripeAccountId)}`);
  accountUrl.searchParams.append("include[0]", "identity");
  accountUrl.searchParams.append("include[1]", "requirements");
  accountUrl.searchParams.append("include[2]", "configuration.recipient");
  accountUrl.searchParams.append("include[3]", "configuration.merchant");

  const stripeRes = await fetch(accountUrl.toString(), {
    headers: buildStripeV2Headers(),
  });
  const stripeJson = await stripeRes.json().catch(() => ({}));
  if (!stripeRes.ok) {
    const stripeMessage =
      typeof stripeJson?.error?.message === "string"
        ? stripeJson.error.message
        : "Stripe connected account fetch failed";
    throw new Error(stripeMessage);
  }
  return stripeJson as Record<string, unknown>;
}

export async function syncStripeConnectedAccountToLegalEntity(params: {
  serviceClient: any;
  stripeAccountId: string;
  fallbackCountry: string | null;
  legalEntityId?: string | null;
}) {
  const stripeJson = await fetchStripeConnectedAccountSnapshot(params.stripeAccountId);
  const payload = deriveStripeAccountSyncPayload(stripeJson, params.fallbackCountry);
  let targetLegalEntityId = params.legalEntityId ?? null;

  if (!targetLegalEntityId) {
    const { data: legalEntity, error } = await params.serviceClient
      .from("legal_entities")
      .select("id")
      .eq("stripe_account_id", params.stripeAccountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    targetLegalEntityId = typeof legalEntity?.id === "string" ? legalEntity.id : null;
  }

  if (targetLegalEntityId) {
    const { error: updateError } = await params.serviceClient
      .from("legal_entities")
      .update(payload)
      .eq("id", targetLegalEntityId);
    if (updateError) throw new Error(updateError.message);
  }

  return {
    stripeJson,
    payload,
  };
}
