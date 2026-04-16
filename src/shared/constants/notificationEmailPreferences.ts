import type { NotificationEmailPreferences, NotificationEmailType } from '../types';

export type NotificationEmailPreferenceDefinition = {
  type: NotificationEmailType;
  label: string;
  description: string;
};

export const NOTIFICATION_EMAIL_PREFERENCE_DEFINITIONS: NotificationEmailPreferenceDefinition[] = [
  {
    type: 'order_created_producer',
    label: 'Nouvelle commande ouverte',
    description: 'Prévenir le producteur quand une nouvelle commande est ouverte avec ses produits.',
  },
  {
    type: 'order_locked_participant',
    label: 'Commande clôturée',
    description: 'Prévenir les participants quand une commande est clôturée.',
  },
  {
    type: 'order_locked_producer',
    label: 'Commande cloturée côté producteur',
    description: 'Prévenir le producteur quand une commande est clôturée.',
  },
  {
    type: 'order_delivered_participant',
    label: 'Commande reçue',
    description: 'Prévenir les participants quand les produits ont été receptionnés.',
  },
  {
    type: 'order_delivered_producer',
    label: 'Réception confirmée',
    description: 'Prévenir le producteur quand le partageur a reçu les produits.',
  },
  {
    type: 'order_confirmed_sharer',
    label: 'Commande confirmée',
    description: 'Prévenir le partageur quand le producteur confirme la commande.',
  },
  {
    type: 'order_prepared_sharer',
    label: 'Commande preparée',
    description: 'Prévenir le partageur quand la commande est préparée.',
  },
  {
    type: 'order_min_reached_sharer',
    label: 'Seuil minimum atteint',
    description: 'Prévenir le partageur quand le seuil minimum de la commande est atteint.',
  },
  {
    type: 'order_max_reached_sharer',
    label: 'Seuil maximum atteint',
    description: 'Prévenir le partageur quand le seuil maximum de la commande est atteint.',
  },
  {
    type: 'order_auto_locked_deadline_sharer',
    label: 'Clôture automatique à la date limite',
    description: 'Prévenir le partageur quand la commande se clôture automatiquement.',
  },
];

export const DEFAULT_NOTIFICATION_EMAIL_PREFERENCES = NOTIFICATION_EMAIL_PREFERENCE_DEFINITIONS.reduce(
  (acc, definition) => {
    acc[definition.type] = true;
    return acc;
  },
  {} as Record<NotificationEmailType, boolean>
);

export const normalizeNotificationEmailPreferences = (
  value?: NotificationEmailPreferences | Record<string, unknown> | null
): Record<NotificationEmailType, boolean> => {
  const normalized = { ...DEFAULT_NOTIFICATION_EMAIL_PREFERENCES };
  if (!value || typeof value !== 'object') return normalized;
  for (const definition of NOTIFICATION_EMAIL_PREFERENCE_DEFINITIONS) {
    const rawValue = value[definition.type];
    if (typeof rawValue === 'boolean') normalized[definition.type] = rawValue;
  }
  return normalized;
};
