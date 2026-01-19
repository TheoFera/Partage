import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ImageWithFallback } from './figma/ImageWithFallback';

type AvatarProps = {
  path?: string | null;
  alt: string;
  fallbackSrc: string;
  updatedAt?: string | null;
  supabaseClient?: SupabaseClient | null;
  className?: string;
  bucket?: string;
};

const buildVersionQuery = (value?: string | null) => {
  if (!value) return '';
  return `?v=${encodeURIComponent(value)}`;
};

export function Avatar({
  path,
  alt,
  fallbackSrc,
  updatedAt,
  supabaseClient,
  className,
  bucket = 'avatars',
}: AvatarProps) {
  const publicUrl = React.useMemo(() => {
    const trimmed = path?.trim();
    if (!trimmed || !supabaseClient) return null;
    const { data } = supabaseClient.storage.from(bucket).getPublicUrl(trimmed);
    return data?.publicUrl ?? null;
  }, [bucket, path, supabaseClient]);

  const versionQuery = React.useMemo(() => buildVersionQuery(updatedAt), [updatedAt]);
  const src = publicUrl ? `${publicUrl}${versionQuery}` : fallbackSrc;

  return <ImageWithFallback src={src} alt={alt} className={className} />;
}
