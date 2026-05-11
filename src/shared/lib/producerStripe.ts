import type { SupabaseClient } from '@supabase/supabase-js';

export type ProducerStripeState = {
  readyForOrders: boolean;
  status: 'not_connected' | 'action_required' | 'connected';
};

const DEFAULT_PRODUCER_STRIPE_STATE: ProducerStripeState = {
  readyForOrders: false,
  status: 'not_connected',
};

export const normalizeProducerStripeState = (
  row: { stripe_ready_for_orders?: unknown; stripe_connection_status?: unknown } | null | undefined
): ProducerStripeState => {
  const status =
    row?.stripe_connection_status === 'connected' ||
    row?.stripe_connection_status === 'action_required' ||
    row?.stripe_connection_status === 'not_connected'
      ? row.stripe_connection_status
      : 'not_connected';

  return {
    readyForOrders: Boolean(row?.stripe_ready_for_orders),
    status,
  };
};

export const canProducerCreateOrders = (state: ProducerStripeState | null | undefined) =>
  Boolean(state?.readyForOrders && state.status === 'connected');

export async function fetchProducerStripeState(
  supabaseClient: SupabaseClient,
  producerProfileId: string
): Promise<ProducerStripeState> {
  const { data, error } = await supabaseClient
    .from('legal_entities_public')
    .select('stripe_ready_for_orders, stripe_connection_status')
    .eq('profile_id', producerProfileId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeProducerStripeState(data as Record<string, unknown> | null);
}

export async function fetchProducerStripeStates(
  supabaseClient: SupabaseClient,
  producerProfileIds: string[]
): Promise<Record<string, ProducerStripeState>> {
  if (!producerProfileIds.length) return {};

  const { data, error } = await supabaseClient
    .from('legal_entities_public')
    .select('profile_id, stripe_ready_for_orders, stripe_connection_status')
    .in('profile_id', producerProfileIds);

  if (error) {
    throw error;
  }

  const mapped: Record<string, ProducerStripeState> = {};
  (data as Array<Record<string, unknown>> | null)?.forEach((row) => {
    const profileId = typeof row.profile_id === 'string' ? row.profile_id : '';
    if (!profileId) return;
    mapped[profileId] = normalizeProducerStripeState(row);
  });

  return mapped;
}

export const getDefaultProducerStripeState = () => DEFAULT_PRODUCER_STRIPE_STATE;
