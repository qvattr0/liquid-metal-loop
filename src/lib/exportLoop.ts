import {
  ShaderFitOptions,
  ShaderMount,
  getShaderColorFromString,
  type LiquidMetalShape,
  LiquidMetalShapes,
} from '@paper-design/shaders';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  canEncodeVideo,
} from 'mediabunny';
import { hexToRgb, padRippleColors } from './colors';
import { loopingLiquidMetalShader } from './loopingShader';
import { speedForDuration } from './loop';

export type ExportFormat = 'gif' | 'mp4' | 'webm';

export type ShaderParams = {
  colorBack: string;
  colorMetal: string;
  rippleColors: string[];
  contour: number;
  distortion: number;
  softness: number;
  repetition: number;
  shiftRed: number;
  shiftBlue: number;
  angle: number;
  scale: number;
  grain: number;
  grainLogoOnly: boolean;
  glow: boolean;
  flow: number;
  shape: LiquidMetalShape;
  hasImage: boolean;
};

export type ExportOptions = {
  format: ExportFormat;
  duration: number;
  fps: number;
  size: number;
  cycles: number;
  processedImageUrl: string | null;
  params: ShaderParams;
  transparent?: boolean;
  onProgress?: (progress: number, label: string) => void;
};

type FrameRenderer = {
  canvas: HTMLCanvasElement;
  setFrame: (timeMs: number) => void;
  dispose: () => void;
};

function waitFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function buildUniforms(params: ShaderParams, image: HTMLImageElement | undefined, transparent: boolean) {
  return {
    u_colorBack: transparent
      ? ([0, 0, 0, 0] as [number, number, number, number])
      : getShaderColorFromString(params.colorBack),
    u_colorTint: [1, 1, 1, 0] as [number, number, number, number],
    u_colorMetal: hexToRgb(params.colorMetal),
    u_rippleColors: padRippleColors(params.rippleColors),
    u_rippleCount: Math.min(Math.max(params.rippleColors.length, 1), 8),
    u_image: image,
    u_contour: params.contour,
    u_distortion: params.distortion,
    u_softness: params.softness,
    u_repetition: params.repetition,
    u_shiftRed: params.shiftRed,
    u_shiftBlue: params.shiftBlue,
    u_angle: params.angle,
    u_isImage: params.hasImage,
    u_shape: LiquidMetalShapes[params.shape],
    u_seamlessLoop: 1,
    u_grain: params.grain,
    u_grainLogoOnly: params.grainLogoOnly ? 1 : 0,
    u_glow: params.glow ? 1 : 0,
    u_flow: params.flow,
    u_fit: ShaderFitOptions.contain,
    u_scale: params.scale,
    u_rotation: 0,
    u_offsetX: 0,
    u_offsetY: 0,
    u_originX: 0.5,
    u_originY: 0.5,
    u_worldWidth: 0,
    u_worldHeight: 0,
  };
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load processed logo'));
  });
  img.src = url;
  await loaded;
  await img.decode().catch(() => undefined);
  return img;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function mountExportShader(
  size: number,
  params: ShaderParams,
  processedImageUrl: string | null,
  transparent: boolean,
) {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${size}px;height:${size}px;pointer-events:none;`;
  document.body.appendChild(host);

  const image = processedImageUrl ? await loadImage(processedImageUrl) : undefined;
  const mount = new ShaderMount(
    host,
    loopingLiquidMetalShader,
    buildUniforms(params, image, transparent),
    { preserveDrawingBuffer: true, alpha: true, premultipliedAlpha: false },
    0,
    0,
    1,
    size * size,
    params.hasImage ? ['u_image'] : undefined,
  );

  await waitFrame();
  return { host, mount, canvas: mount.canvasElement };
}

async function encodeFromRenderer(
  renderer: FrameRenderer,
  options: {
    format: ExportFormat;
    duration: number;
    fps: number;
    size: number;
    timeScale: number;
    transparent: boolean;
    onProgress?: (progress: number, label: string) => void;
  },
) {
  const { format, duration, fps, size, timeScale, transparent, onProgress } = options;
  const frameCount = Math.max(2, Math.round(duration * fps));
  const frameDuration = 1 / fps;
  let outputFormat = format;
  if (transparent && format === 'mp4') {
    outputFormat = 'webm';
    onProgress?.(0.01, 'MP4 has no alpha — encoding WebM');
  }

  if (outputFormat === 'gif') {
    const gif = GIFEncoder();
    const capture = document.createElement('canvas');
    capture.width = size;
    capture.height = size;
    const ctx = capture.getContext('2d', { willReadFrequently: true, alpha: true });
    if (!ctx) throw new Error('Could not create 2D capture context');

    for (let i = 0; i < frameCount; i++) {
      renderer.setFrame((i / fps) * 1000 * timeScale);
      await waitFrame();
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(renderer.canvas, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      const palette = transparent
        ? quantize(data, 256, {
            format: 'rgba4444',
            oneBitAlpha: 24,
            clearAlpha: true,
            clearAlphaThreshold: 24,
          })
        : quantize(data, 256);
      const index = applyPalette(data, palette, transparent ? 'rgba4444' : 'rgb565');
      const transparentIndex = transparent
        ? palette.findIndex((color) => (color[3] ?? 255) === 0)
        : -1;
      gif.writeFrame(index, size, size, {
        palette,
        delay: Math.round(1000 / fps),
        repeat: i === 0 ? 0 : undefined,
        transparent: transparent && transparentIndex >= 0,
        transparentIndex: transparentIndex >= 0 ? transparentIndex : 0,
        dispose: transparent ? 2 : undefined,
      });
      onProgress?.((i + 1) / frameCount, `Encoding GIF ${i + 1}/${frameCount}`);
    }

    gif.finish();
    downloadBlob(new Blob([gif.bytes() as BlobPart], { type: 'image/gif' }), 'liquid-metal-loop.gif');
    return;
  }

  const wantsMp4 = outputFormat === 'mp4';
  const videoCodec = wantsMp4
    ? ((await canEncodeVideo('avc')) ? 'avc' : (await canEncodeVideo('av1')) ? 'av1' : null)
    : transparent
      ? ((await canEncodeVideo('vp9', { alpha: 'keep' }))
        ? 'vp9'
        : (await canEncodeVideo('vp8', { alpha: 'keep' }))
          ? 'vp8'
          : (await canEncodeVideo('vp9'))
            ? 'vp9'
            : (await canEncodeVideo('vp8'))
              ? 'vp8'
              : null)
      : ((await canEncodeVideo('vp9')) ? 'vp9' : (await canEncodeVideo('vp8')) ? 'vp8' : null);

  if (!videoCodec) {
    throw new Error(
      wantsMp4
        ? 'This browser cannot encode MP4. Try GIF or WebM, or use Chrome / Safari 17+.'
        : 'This browser cannot encode WebM. Try GIF instead.',
    );
  }

  const output = new Output({
    format: wantsMp4 ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(renderer.canvas, {
    codec: videoCodec,
    quality: QUALITY_HIGH,
    keyFrameInterval: duration,
    alpha: transparent ? 'keep' : 'discard',
  });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  for (let i = 0; i < frameCount; i++) {
    renderer.setFrame((i / fps) * 1000 * timeScale);
    await waitFrame();
    await source.add(i * frameDuration, frameDuration);
    onProgress?.((i + 1) / frameCount, `Encoding ${outputFormat.toUpperCase()} ${i + 1}/${frameCount}`);
  }

  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) throw new Error('Export produced an empty file');
  const mime = wantsMp4 ? 'video/mp4' : 'video/webm';
  downloadBlob(new Blob([buffer], { type: mime }), `liquid-metal-loop.${outputFormat}`);
}

export async function exportPerfectLoop(options: ExportOptions): Promise<void> {
  const {
    format,
    duration,
    fps,
    size,
    cycles,
    processedImageUrl,
    params,
    transparent = false,
    onProgress,
  } = options;
  onProgress?.(0.02, 'Preparing shader');
  const { host, mount, canvas } = await mountExportShader(
    size,
    params,
    processedImageUrl,
    transparent,
  );
  try {
    await encodeFromRenderer(
      {
        canvas,
        setFrame: (timeMs) => mount.setFrame(timeMs),
        dispose: () => {
          mount.dispose();
          host.remove();
        },
      },
      {
        format,
        duration,
        fps,
        size,
        timeScale: speedForDuration(duration, cycles),
        transparent,
        onProgress,
      },
    );
  } finally {
    mount.dispose();
    host.remove();
  }
}
