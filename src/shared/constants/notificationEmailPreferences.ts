import type { NotificationEmailPreferences, NotificationEmailType, UserRole } from '../types';

export type NotificationEmailPreferenceDefinition = {
  type: NotificationEmailType;
  label: string;
  description: string;
  audience: UserRole;
};

export const NOTIFICATION_EMAIL_PREFERENCE_DEFINITIONS: NotificationEmailPreferenceDefinition[] = [
  {
    type: 'order_created_producer',
    label: 'Nouvelle commande ouverte',
    description: 'Prévenir le producteur quand une nouvelle commande est ouverte avec ses produits.',
    audience: 'producer',
  },
  {
    type: 'order_locked_participant',
    label: 'Commande clôturée',
    description: 'Prévenir les participants quand une commande est clôturée.',
    audience: 'participant',
  },
  {
    type: 'order_locked_producer',
    label: 'Commande clôturée côté producteur',
    description: 'Prévenir le producteur quand une commande est clôturée.',
    audience: 'producer',
  },
  {
    type: 'order_delivered_participant',
    label: 'Commande reçue',
    description: 'Prévenir les participants quand les produits ont été réceptionnés.',
    audience: 'participant',
  },
  {
    type: 'order_delivered_producer',
    label: 'Réception confirmée',
    description: 'Prévenir le producteur quand le partageur a reçu les produits.',
    audience: 'producer',
  },
  {
    type: 'order_confirmed_sharer',
    label: 'Commande confirmée',
    description: 'Prévenir le partageur quand le producteur confirme la commande.',
    audience: 'sharer',
  },
  {
    type: 'order_prepared_sharer',
    label: 'Commande préparée',
    description: 'Prévenir le partageur quand la commande est préparée.',
    audience: 'sharer',
  },
  {
    type: 'order_min_reached_sharer',
    label: 'Seuil minimum atteint',
    description: 'Prévenir le partageur quand le seuil minimum de la commande est atteint.',
    audience: 'sharer',
  },
  {
    type: 'order_max_reached_sharer',
    label: 'Seuil maximum atteint',
    description: 'Prévenir le partageur quand le seuil maximum de la commande est atteint.',
    audience: 'sharer',
  },
  {
    type: 'order_auto_locked_deadline_sharer',
    label: 'Clôture automatique à la date limite',
    description: 'Prévenir le partageur quand la commande se clôture automatiquement.',
    audience: 'sharer',
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

export const filterNotificationEmailPreferencesByRole = (
  role: UserRole
): NotificationEmailPreferenceDefinition[] => {
  if (role === 'participant') {
    return NOTIFICATION_EMAIL_PREFERENCE_DEFINITIONS.filter((definition) => definition.audience === 'participant');
  }
  if (role === 'sharer') {
    return NOTIFICATION_EMAIL_PREFERENCE_DEFINITIONS.filter(
      (definition) => definition.audience === 'participant' || definition.audience === 'sharer'
    );
  }
  return NOTIFICATION_EMAIL_PREFERENCE_DEFINITIONS.filter((definition) => definition.audience === 'producer');
};
