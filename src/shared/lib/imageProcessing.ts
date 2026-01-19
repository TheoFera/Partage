export type ImageSource = HTMLImageElement | HTMLCanvasElement;

export type PreparedImage = {
  source: ImageSource;
  width: number;
  height: number;
  previewUrl: string;
  revokePreviewUrl: () => void;
};

export type Offset = {
  x: number;
  y: number;
};

type CropRect = {
  x: number;
  y: number;
  size: number;
};

type RectCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas export failed.'));
      },
      type,
      quality
    );
  });

const loadImageFromFile = (file: File) =>
  new Promise<{ image: HTMLImageElement; objectUrl: string }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image load failed.'));
    };
    image.src = objectUrl;
  });

export const prepareImageForCrop = async (file: File, maxDimension = 1024): Promise<PreparedImage> => {
  const { image, objectUrl } = await loadImageFromFile(file);
  const originalWidth = image.naturalWidth || image.width;
  const originalHeight = image.naturalHeight || image.height;
  const maxSide = Math.max(originalWidth, originalHeight);

  if (maxSide <= maxDimension) {
    return {
      source: image,
      width: originalWidth,
      height: originalHeight,
      previewUrl: objectUrl,
      revokePreviewUrl: () => URL.revokeObjectURL(objectUrl),
    };
  }

  const ratio = maxDimension / maxSide;
  const targetWidth = Math.round(originalWidth * ratio);
  const targetHeight = Math.round(originalHeight * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    URL.revokeObjectURL(objectUrl);
    throw new Error('Canvas context unavailable.');
  }
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
  URL.revokeObjectURL(objectUrl);
  const previewBlob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  const previewUrl = URL.createObjectURL(previewBlob);

  return {
    source: canvas,
    width: targetWidth,
    height: targetHeight,
    previewUrl,
    revokePreviewUrl: () => URL.revokeObjectURL(previewUrl),
  };
};

export const getCoverScale = (sourceWidth: number, sourceHeight: number, cropSize: number) =>
  Math.max(cropSize / sourceWidth, cropSize / sourceHeight);

export const getCoverScaleForRect = (
  sourceWidth: number,
  sourceHeight: number,
  cropWidth: number,
  cropHeight: number
) => Math.max(cropWidth / sourceWidth, cropHeight / sourceHeight);

export const clampOffset = (
  offset: Offset,
  sourceWidth: number,
  sourceHeight: number,
  cropSize: number,
  scale: number
): Offset => {
  const maxOffsetX = Math.max(0, (sourceWidth * scale) / 2 - cropSize / 2);
  const maxOffsetY = Math.max(0, (sourceHeight * scale) / 2 - cropSize / 2);

  return {
    x: Math.min(maxOffsetX, Math.max(-maxOffsetX, offset.x)),
    y: Math.min(maxOffsetY, Math.max(-maxOffsetY, offset.y)),
  };
};

export const clampOffsetForRect = (
  offset: Offset,
  sourceWidth: number,
  sourceHeight: number,
  cropWidth: number,
  cropHeight: number,
  scale: number
): Offset => {
  const maxOffsetX = Math.max(0, (sourceWidth * scale) / 2 - cropWidth / 2);
  const maxOffsetY = Math.max(0, (sourceHeight * scale) / 2 - cropHeight / 2);

  return {
    x: Math.min(maxOffsetX, Math.max(-maxOffsetX, offset.x)),
    y: Math.min(maxOffsetY, Math.max(-maxOffsetY, offset.y)),
  };
};

export const getCropRect = (
  sourceWidth: number,
  sourceHeight: number,
  cropSize: number,
  scale: number,
  offset: Offset
): CropRect => {
  const size = cropSize / scale;
  const x = sourceWidth / 2 - size / 2 - offset.x / scale;
  const y = sourceHeight / 2 - size / 2 - offset.y / scale;

  return {
    x: Math.max(0, Math.min(sourceWidth - size, x)),
    y: Math.max(0, Math.min(sourceHeight - size, y)),
    size,
  };
};

export const getCropRectForRect = (
  sourceWidth: number,
  sourceHeight: number,
  cropWidth: number,
  cropHeight: number,
  scale: number,
  offset: Offset
): RectCropRect => {
  const width = cropWidth / scale;
  const height = cropHeight / scale;
  const x = sourceWidth / 2 - width / 2 - offset.x / scale;
  const y = sourceHeight / 2 - height / 2 - offset.y / scale;

  return {
    x: Math.max(0, Math.min(sourceWidth - width, x)),
    y: Math.max(0, Math.min(sourceHeight - height, y)),
    width,
    height,
  };
};

export const renderCroppedCanvas = (
  source: ImageSource,
  cropRect: CropRect,
  outputSize: number
) => {
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context unavailable.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    source,
    cropRect.x,
    cropRect.y,
    cropRect.size,
    cropRect.size,
    0,
    0,
    outputSize,
    outputSize
  );
  return canvas;
};

export const renderCroppedCanvasRect = (
  source: ImageSource,
  cropRect: RectCropRect,
  outputWidth: number,
  outputHeight: number
) => {
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context unavailable.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    source,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    0,
    0,
    outputWidth,
    outputHeight
  );
  return canvas;
};

export const exportWebp = async (
  canvas: HTMLCanvasElement,
  {
    quality = 0.82,
    maxBytes = 200 * 1024,
    minQuality = 0.6,
    step = 0.08,
  }: { quality?: number; maxBytes?: number; minQuality?: number; step?: number } = {}
) => {
  let currentQuality = quality;
  let blob = await canvasToBlob(canvas, 'image/webp', currentQuality);

  while (blob.size > maxBytes && currentQuality > minQuality) {
    currentQuality = Math.max(minQuality, currentQuality - step);
    blob = await canvasToBlob(canvas, 'image/webp', currentQuality);
  }

  return { blob, quality: currentQuality };
};
