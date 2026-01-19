import React from 'react';
import { toast } from 'sonner';
import {
  clampOffsetForRect,
  exportWebp,
  getCoverScaleForRect,
  getCropRectForRect,
  prepareImageForCrop,
  renderCroppedCanvasRect,
  type Offset,
  type PreparedImage,
} from '../lib/imageProcessing';

type ProductImageUploaderProps = {
  currentUrl?: string | null;
  alt?: string;
  onImageChange: (payload: { file: File; previewUrl: string }) => Promise<void> | void;
  aspectRatio?: number;
  cropWidth?: number;
  cropHeight?: number;
  outputWidth?: number;
  outputHeight?: number;
  maxSourceSize?: number;
  initialQuality?: number;
  maxOutputBytes?: number;
  accept?: string;
  disabled?: boolean;
};

const DEFAULT_ASPECT = 145 / 105;
const DEFAULT_CROP_WIDTH = 320;
const DEFAULT_CROP_HEIGHT = Math.round(DEFAULT_CROP_WIDTH / DEFAULT_ASPECT);
const DEFAULT_OUTPUT_WIDTH = 960;
const DEFAULT_MAX_SOURCE = 1600;
const DEFAULT_QUALITY = 0.82;
const DEFAULT_MAX_BYTES = 350 * 1024;
const DEFAULT_ACCEPT = 'image/jpeg,image/png,image/webp';
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
]);

export function ProductImageUploader({
  currentUrl,
  alt = 'Image du produit',
  onImageChange,
  aspectRatio,
  cropWidth,
  cropHeight,
  outputWidth,
  outputHeight,
  maxSourceSize = DEFAULT_MAX_SOURCE,
  initialQuality = DEFAULT_QUALITY,
  maxOutputBytes = DEFAULT_MAX_BYTES,
  accept = DEFAULT_ACCEPT,
  disabled = false,
}: ProductImageUploaderProps) {
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
  const frameRef = React.useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = React.useState<{ width: number; height: number } | null>(null);

  const resolvedAspect = aspectRatio ?? DEFAULT_ASPECT;
  const baseCropWidth =
    cropWidth ?? (cropHeight ? Math.round(cropHeight * resolvedAspect) : DEFAULT_CROP_WIDTH);
  const baseCropHeight = cropHeight ?? Math.round(baseCropWidth / resolvedAspect);
  const effectiveCropWidth = frameSize?.width ?? baseCropWidth;
  const effectiveCropHeight = frameSize?.height ?? baseCropHeight;
  const resolvedOutputWidth =
    outputWidth ??
    (outputHeight
      ? Math.round((outputHeight * effectiveCropWidth) / effectiveCropHeight)
      : DEFAULT_OUTPUT_WIDTH);
  const resolvedOutputHeight =
    outputHeight ?? Math.round((resolvedOutputWidth * effectiveCropHeight) / effectiveCropWidth);
  const frameStyle = aspectRatio ? { aspectRatio: String(aspectRatio) } : undefined;

  const baseScale = React.useMemo(() => {
    if (!prepared) return 1;
    return getCoverScaleForRect(prepared.width, prepared.height, effectiveCropWidth, effectiveCropHeight);
  }, [effectiveCropHeight, effectiveCropWidth, prepared]);

  const scale = baseScale * zoom;

  const clamp = React.useCallback(
    (next: Offset) => {
      if (!prepared) return next;
      return clampOffsetForRect(
        next,
        prepared.width,
        prepared.height,
        effectiveCropWidth,
        effectiveCropHeight,
        scale
      );
    },
    [effectiveCropHeight, effectiveCropWidth, prepared, scale]
  );

  React.useEffect(() => {
    if (!prepared) return;
    setOffset((prev) => {
      const clamped = clamp(prev);
      if (clamped.x === prev.x && clamped.y === prev.y) return prev;
      return clamped;
    });
  }, [clamp, prepared, scale]);

  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const updateSize = () => {
      const rect = frame.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      setFrameSize((prev) => {
        if (
          prev &&
          Math.abs(prev.width - rect.width) < 0.5 &&
          Math.abs(prev.height - rect.height) < 0.5
        ) {
          return prev;
        }
        return { width: rect.width, height: rect.height };
      });
    };
    updateSize();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateSize());
      observer.observe(frame);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [prepared]);

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

  const handleSave = React.useCallback(async () => {
    if (!prepared) {
      setError('Selectionnez une image.');
      return;
    }
    setIsBusy(true);
    setError(null);
    let previewUrl: string | null = null;
    try {
      const cropRect = getCropRectForRect(
        prepared.width,
        prepared.height,
        effectiveCropWidth,
        effectiveCropHeight,
        scale,
        offset
      );
      const croppedCanvas = renderCroppedCanvasRect(
        prepared.source,
        cropRect,
        resolvedOutputWidth,
        resolvedOutputHeight
      );
      const { blob } = await exportWebp(croppedCanvas, {
        quality: initialQuality,
        maxBytes: maxOutputBytes,
      });
      previewUrl = URL.createObjectURL(blob);
      const file = new File([blob], `product-${Date.now()}.webp`, { type: 'image/webp' });
      await Promise.resolve(onImageChange({ file, previewUrl }));
      resetCrop();
    } catch (err) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      const message = err instanceof Error ? err.message : 'Recadrage impossible.';
      setError(message);
      toast.error(message);
    } finally {
      setIsBusy(false);
    }
  }, [
    initialQuality,
    maxOutputBytes,
    offset,
    onImageChange,
    prepared,
    resetCrop,
    effectiveCropHeight,
    effectiveCropWidth,
    resolvedOutputHeight,
    resolvedOutputWidth,
    scale,
  ]);

  const transformStyle = React.useMemo(
    () => ({
      transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
    }),
    [offset.x, offset.y, scale]
  );

  const imageUrl = currentUrl ?? '';
  const hasImage = Boolean(imageUrl);
  const isDisabled = disabled || isBusy;

  return (
    <div className="product-image-uploader">
      {!prepared ? (
        <>
          <div
            className={`product-image-uploader__frame${
              hasImage ? '' : ' product-image-uploader__frame--empty'
            }`}
            ref={frameRef}
            style={frameStyle}
          >
            {hasImage ? <img src={imageUrl} alt={alt} className="product-image-uploader__image" /> : null}
            <label className="product-image-uploader__overlay" aria-disabled={isDisabled}>
              <span className="product-image-uploader__overlay-button">
                Selectionner une image
                <input
                  ref={inputRef}
                  type="file"
                  accept={accept}
                  onChange={handleFileChange}
                  disabled={isDisabled}
                />
              </span>
            </label>
          </div>
          {error && <p className="product-image-uploader__error">{error}</p>}
        </>
      ) : (
        <div className="product-image-uploader__crop">
          <div
            className="product-image-cropper__frame"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            ref={frameRef}
            style={frameStyle}
          >
            <img
              src={prepared.previewUrl}
              alt="Apercu"
              className="product-image-cropper__image"
              style={transformStyle}
              draggable={false}
            />
          </div>
          <div className="product-image-cropper__controls">
            <label htmlFor="product-image-zoom" className="product-image-cropper__label">
              Zoom
            </label>
            <input
              id="product-image-zoom"
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              disabled={isBusy}
            />
            <span className="product-image-cropper__value">{Math.round(zoom * 100)}%</span>
          </div>
          <div className="product-image-uploader__actions">
            <button type="button" onClick={resetCrop} className="product-image-uploader__ghost" disabled={isBusy}>
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="product-image-uploader__primary"
              disabled={isBusy}
            >
              {isBusy ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
          {error && <p className="product-image-uploader__error">{error}</p>}
        </div>
      )}
    </div>
  );
}
