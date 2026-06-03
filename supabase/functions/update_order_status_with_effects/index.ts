import {
  corsHeaders,
  createServiceClient,
  createUserClient,
  jsonResponse,
  processProducerTopupsForOrder,
  requireAuthenticatedUser,
} from "../_shared/checkout-payment.ts";

type OrderStatus =
  | "open"
  | "locked"
  | "confirmed"
  | "preparing"
  | "prepared"
  | "delivered"
  | "distributed"
  | "finished"
  | "cancelled";

const statusDateColumns: Partial<Record<OrderStatus, string>> = {
  locked: "locked_at",
  confirmed: "confirmed_at",
  preparing: "preparing_at",
  prepared: "prepared_at",
  delivered: "delivered_at",
  distributed: "distributed_at",
  finished: "finished_at",
  cancelled: "cancelled_at",
};

const statusOrder: OrderStatus[] = ["locked", "confirmed", "preparing", "prepared", "delivered", "distributed", "finished"];

const isStatusDatesConstraintError = (error: { code?: string | null; message?: string | null } | null | undefined) =>
  error?.code === "23514" &&
  typeof error.message === "string" &&
  error.message.includes("orders_status_dates_consistency_check");

const normalizeErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown };
    if (typeof value.message === "string" && value.message.trim()) return value.message.trim();
    if (typeof value.details === "string" && value.details.trim()) return value.details.trim();
    if (typeof value.hint === "string" && value.hint.trim()) return value.hint.trim();
  }
  return String(error);
};

async function setOrderStatusWithFallback(authHeader: string, orderId: string, status: OrderStatus) {
  const userClient = createUserClient(authHeader);
  const { error: rpcError } = await userClient.rpc("set_order_status", {
    p_order_id: orderId,
    p_status: status,
  });
  if (rpcError && !isStatusDatesConstraintError(rpcError)) {
    throw rpcError;
  }

  if (rpcError) {
    const { data: orderRow, error: orderError } = await userClient.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (orderError || !orderRow) throw orderError ?? rpcError;

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status };
    if ("updated_at" in orderRow) {
      updates.updated_at = now;
    }

    const statusIndex = statusOrder.indexOf(status);
    if (status === "cancelled") {
      const column = statusDateColumns.cancelled;
      if (column && column in orderRow && (orderRow as Record<string, unknown>)[column] == null) {
        updates[column] = now;
      }
    } else if (statusIndex >= 0) {
      for (let i = 0; i <= statusIndex; i += 1) {
        const step = statusOrder[i];
        const column = statusDateColumns[step];
        if (!column || !(column in orderRow)) continue;
        if ((orderRow as Record<string, unknown>)[column] == null) {
          updates[column] = now;
        }
      }
    }

    const { error: updateError } = await userClient.from("orders").update(updates).eq("id", orderId);
    if (updateError) throw updateError;
  }

  const { data: refreshedOrder, error: refreshedOrderError } = await userClient
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();
  if (refreshedOrderError) throw refreshedOrderError;
  if (!refreshedOrder?.status) {
    throw new Error("Aucune ligne mise à jour. Vérifiez les droits d'accès sur la commande.");
  }
  return refreshedOrder.status as OrderStatus;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const user = await requireAuthenticatedUser(authHeader);
    const body = await req.json().catch(() => ({}));
    const orderId = typeof body?.order_id === "string" ? body.order_id.trim() : "";
    const status = typeof body?.status === "string" ? (body.status.trim() as OrderStatus) : "";

    if (!orderId) {
      return jsonResponse({ error: "Missing order_id" }, 400);
    }
    if (!status) {
      return jsonResponse({ error: "Missing status" }, 400);
    }

    const updatedStatus = await setOrderStatusWithFallback(authHeader, orderId, status);
    const serviceClient = createServiceClient();
    const userClient = createUserClient(authHeader);

    const { data: orderRow, error: orderError } = await serviceClient
      .from("orders")
      .select("id, producer_profile_id, sharer_profile_id")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!orderRow) {
      return jsonResponse({ error: "Commande introuvable." }, 404);
    }

    let warningCode: string | null = null;
    let warningMessage: string | null = null;
    const effects: Record<string, unknown> = {};

    if (updatedStatus === "confirmed") {
      if ((orderRow as Record<string, unknown>).producer_profile_id === user.id) {
        try {
          const topupResult = await processProducerTopupsForOrder(serviceClient, orderId);
          effects.producer_topups = { ok: true, result: topupResult };
        } catch (error) {
          console.error("update_order_status_with_effects.producer_topups_error", error);
          warningCode = "producer_topups_failed";
          warningMessage = "Statut mis à jour, mais l'envoi des compléments producteur doit être relancé.";
          effects.producer_topups = { ok: false, error: normalizeErrorMessage(error) };
        }
      } else {
        warningCode = "producer_topups_skipped";
        warningMessage = "Statut mis à jour, mais les compléments producteur n'ont pas été déclenchés automatiquement.";
      }
    }

    if (updatedStatus === "distributed") {
      try {
        const { data: invoiceData, error: invoiceError } = await userClient.rpc("create_platform_invoice_and_send_for_order", {
          p_order_id: orderId,
        });
        if (invoiceError) throw invoiceError;
        effects.platform_invoice = { ok: true, result: invoiceData };
      } catch (error) {
        console.error("update_order_status_with_effects.platform_invoice_error", error);
        warningCode = warningCode ?? "platform_invoice_failed";
        warningMessage =
          warningMessage ?? "Statut mis à jour, mais la facture plateforme n'a pas pu être émise automatiquement.";
        effects.platform_invoice = { ok: false, error: normalizeErrorMessage(error) };
      }
    }

    return jsonResponse({
      ok: true,
      status: updatedStatus,
      warning_code: warningCode,
      warning_message: warningMessage,
      effects,
    });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status =
      message === "Missing Authorization header" || message === "Unauthorized"
        ? 401
        : message === "Forbidden"
          ? 403
          : 400;
    return jsonResponse({ error: message }, status);
  }
});
