import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { Avatar } from './Avatar';
import {
  clampOffset,
  exportWebp,
  getCoverScale,
  getCropRect,
  prepareImageForCrop,
  renderCroppedCanvas,
  type Offset,
  type PreparedImage,
} from '../lib/imageProcessing';

type AvatarUploaderProps = {
  supabaseClient: SupabaseClient | null;
  userId: string;
  currentPath?: string | null;
  onUploadComplete?: (payload: { avatarPath: string; avatarUpdatedAt?: string | null }) => void;
  bucket?: string;
  pathPrefix?: string;
  cropSize?: number;
  outputSize?: number;
  maxSourceSize?: number;
  initialQuality?: number;
  maxOutputBytes?: number;
  fallbackSrc?: string;
  avatarUpdatedAt?: string | null;
  accept?: string;
};

const DEFAULT_CROP_SIZE = 240;
const DEFAULT_OUTPUT_SIZE = 256;
const DEFAULT_MAX_SOURCE = 1024;
const DEFAULT_QUALITY = 0.82;
const DEFAULT_MAX_BYTES = 200 * 1024;
const DEFAULT_ACCEPT = 'image/jpeg,image/png,image/webp';
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
]);

const isMissingColumnError = (error: { code?: string; message?: string }) =>
  error.code === '42703' || Boolean(error.message?.includes('avatar_updated_at'));

export function AvatarUploader({
  supabaseClient,
  userId,
  currentPath,
  onUploadComplete,
  bucket = 'avatars',
  pathPrefix,
  cropSize = DEFAULT_CROP_SIZE,
  outputSize = DEFAULT_OUTPUT_SIZE,
  maxSourceSize = DEFAULT_MAX_SOURCE,
  initialQuality = DEFAULT_QUALITY,
  maxOutputBytes = DEFAULT_MAX_BYTES,
  fallbackSrc = '',
  avatarUpdatedAt,
  accept = DEFAULT_ACCEPT,
}: AvatarUploaderProps) {
  const [prepared, setPrepared] = React.useState<PreparedImage | null>(null);
  const [offset, setOffset] = React.useState<Offset>({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dragRef = React.useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const baseScale = React.useMemo(() => {
    if (!prepared) return 1;
    return getCoverScale(prepared.width, prepared.height, cropSize);
  }, [cropSize, prepared]);

  const scale = baseScale * zoom;

  const clamp = React.useCallback(
    (next: Offset) => {
      if (!prepared) return next;
      return clampOffset(next, prepared.width, prepared.height, cropSize, scale);
    },
    [cropSize, prepared, scale]
  );

  React.useEffect(() => {
    if (!prepared) return;
    setOffset((prev) => {
      const clamped = clamp(prev);
      if (clamped.x === prev.x && clamped.y === prev.y) return prev;
      return clamped;
    });
  }, [clamp, prepared, scale]);

  React.useEffect(() => () => prepared?.revokePreviewUrl(), [prepared]);

  const resetCrop = React.useCallback(() => {
    prepared?.revokePreviewUrl();
    setPrepared(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }, [prepared]);

  const handleFileChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/') || (!ALLOWED_TYPES.has(file.type) && file.type !== '')) {
        setError('Format non supporte. Utilisez un JPG, PNG ou WebP.');
        toast.error('Format non supporte.');
        return;
      }
      setIsBusy(true);
      setError(null);
      try {
        const next = await prepareImageForCrop(file, maxSourceSize);
        prepared?.revokePreviewUrl();
        setPrepared(next);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Impossible de charger cette image.';
        setError(message);
        toast.error(message);
      } finally {
        setIsBusy(false);
      }
    },
    [maxSourceSize, prepared]
  );

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!prepared || isBusy) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originX: offset.x,
        originY: offset.y,
      };
    },
    [isBusy, offset.x, offset.y, prepared]
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current || !prepared || isBusy) return;
      const deltaX = event.clientX - dragRef.current.startX;
      const deltaY = event.clientY - dragRef.current.startY;
      setOffset(
        clamp({
          x: dragRef.current.originX + deltaX,
          y: dragRef.current.originY + deltaY,
        })
      );
    },
    [clamp, isBusy, prepared]
  );

  const handlePointerUp = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  }, []);

  const updateProfileAvatar = React.useCallback(
    async (path: string) => {
      if (!supabaseClient) throw new Error('Supabase non configure.');
      const now = new Date().toISOString();
      const payload = { avatar_path: path, avatar_updated_at: now };
      let { data, error: updateError } = await supabaseClient
        .from('profiles')
        .update(payload)
        .eq('id', userId)
        .select('avatar_path, avatar_updated_at')
        .maybeSingle();

      if (updateError && isMissingColumnError(updateError)) {
        const fallback = await supabaseClient
          .from('profiles')
          .update({ avatar_path: path })
          .eq('id', userId)
          .select('avatar_path')
          .maybeSingle();
        if (fallback.error) {
          throw fallback.error;
        }
        return { avatarPath: fallback.data?.avatar_path ?? path, avatarUpdatedAt: null };
      }

      if (updateError) {
        throw updateError;
      }

      return {
        avatarPath: data?.avatar_path ?? path,
        avatarUpdatedAt: data?.avatar_updated_at ?? now,
      };
    },
    [supabaseClient, userId]
  );

  const handleUpload = React.useCallback(async () => {
    if (!prepared) {
      setError('Selectionnez une image.');
      return;
    }
    if (!supabaseClient) {
      setError('Supabase non configure.');
      return;
    }
    setIsBusy(true);
    setError(null);
    const pathBase = pathPrefix ?? userId;
    const targetPath = `${pathBase}/avatar-${Date.now()}.webp`;
    try {
      const cropRect = getCropRect(prepared.width, prepared.height, cropSize, scale, offset);
      const croppedCanvas = renderCroppedCanvas(prepared.source, cropRect, outputSize);
      const { blob } = await exportWebp(croppedCanvas, {
        quality: initialQuality,
        maxBytes: maxOutputBytes,
      });
      const { error: uploadError } = await supabaseClient.storage.from(bucket).upload(targetPath, blob, {
        upsert: false,
        contentType: 'image/webp',
        cacheControl: '3600',
      });
      if (uploadError) {
        throw uploadError;
      }

      const updated = await updateProfileAvatar(targetPath);

      if (currentPath && currentPath !== targetPath) {
        const { error: removeError } = await supabaseClient.storage.from(bucket).remove([currentPath]);
        if (removeError) {
          toast.info('Ancien avatar non supprime.');
        }
      }

      onUploadComplete?.(updated);
      toast.success('Avatar mis a jour.');
      resetCrop();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload impossible.';
      setError(message);
      toast.error(message);
      try {
        await supabaseClient.storage.from(bucket).remove([targetPath]);
      } catch {
        // ignore cleanup errors
      }
    } finally {
      setIsBusy(false);
    }
  }, [
    bucket,
    cropSize,
    currentPath,
    initialQuality,
    maxOutputBytes,
    offset,
    onUploadComplete,
    outputSize,
    pathPrefix,
    prepared,
    resetCrop,
    scale,
    supabaseClient,
    updateProfileAvatar,
    userId,
  ]);

  const transformStyle = React.useMemo(
    () => ({
      transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
    }),
    [offset.x, offset.y, scale]
  );

  return (
    <div className="avatar-uploader">
      {!prepared ? (
        <div className="avatar-uploader__select">
          <div className="avatar-uploader__current">
            <div className="avatar-uploader__current-preview">
              <Avatar
                supabaseClient={supabaseClient ?? null}
                path={currentPath}
                updatedAt={avatarUpdatedAt}
                fallbackSrc={fallbackSrc}
                alt="Avatar"
                className="avatar-uploader__current-image"
              />
            </div>
            <div className="avatar-uploader__current-meta">
              <p className="avatar-uploader__title">Choisir une photo</p>
              <p className="avatar-uploader__subtitle">JPG, PNG ou WebP. Recadrage carre.</p>
            </div>
          </div>
          <label className="avatar-uploader__button" aria-disabled={isBusy}>
            Selectionner une image
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              onChange={handleFileChange}
              disabled={isBusy}
            />
          </label>
          {!supabaseClient && (
            <p className="avatar-uploader__hint">Supabase non configure: upload desactive.</p>
          )}
        </div>
      ) : (
        <div className="avatar-uploader__crop">
          <div
            className="avatar-cropper__frame"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <img
              src={prepared.previewUrl}
              alt="Apercu"
              className="avatar-cropper__image"
              style={transformStyle}
              draggable={false}
            />
          </div>
          <div className="avatar-cropper__controls">
            <label htmlFor="avatar-zoom" className="avatar-cropper__label">
              Zoom
            </label>
            <input
              id="avatar-zoom"
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              disabled={isBusy}
            />
            <span className="avatar-cropper__value">{Math.round(zoom * 100)}%</span>
          </div>
          <div className="avatar-uploader__actions">
            <button type="button" onClick={resetCrop} className="avatar-uploader__ghost" disabled={isBusy}>
              Annuler
            </button>
            <button
              type="button"
              onClick={handleUpload}
              className="avatar-uploader__primary"
              disabled={isBusy || !supabaseClient}
            >
              {isBusy ? 'Upload...' : 'Enregistrer'}
            </button>
          </div>
          {error && <p className="avatar-uploader__error">{error}</p>}
        </div>
      )}
    </div>
  );
}
