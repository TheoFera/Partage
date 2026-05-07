export type OrderParticipantFeatureConfig = {
  enabled: boolean;
  forcedValue: boolean;
};

export const orderParticipantFeatures = {
  participationApproval: {
    enabled: false,
    forcedValue: true,
  },
  sharerMessages: {
    enabled: false,
    forcedValue: false,
  },
  pickupSlotApproval: {
    enabled: false,
    forcedValue: true,
  },
} satisfies Record<string, OrderParticipantFeatureConfig>;

export const resolveOrderParticipantFeatureValue = (
  feature: OrderParticipantFeatureConfig,
  value: boolean | null | undefined,
  fallbackValue: boolean
) => {
  if (!feature.enabled) return feature.forcedValue;
  return value ?? fallbackValue;
};
