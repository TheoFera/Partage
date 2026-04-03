import type { SupabaseClient } from '@supabase/supabase-js';

const normalizeSegment = (value: string) => value.trim().replace(/^\/+|\/+$/g, '');

export const getAuthenticatedStorageOwnerId = async (client: SupabaseClient) => {
  const { data, error } = await client.auth.getUser();
  const userId = data.user?.id?.trim() ?? '';
  if (error || !userId) {
    throw error ?? new Error('Utilisateur non authentifie.');
  }
  return userId;
};

export const buildOwnedStorageObjectPath = (ownerId: string, ...segments: string[]) => {
  const path = [ownerId, ...segments].map(normalizeSegment).filter(Boolean).join('/');
  if (!path) {
    throw new Error('Chemin de stockage invalide.');
  }
  return path;
};
