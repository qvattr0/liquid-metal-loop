import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getShaderColorFromString,
  LiquidMetalShapes,
  toProcessedLiquidMetal,
  type LiquidMetalShape,
} from '@paper-design/shaders';
import { ShaderMount } from '@paper-design/shaders-react';
import {
  Download,
  ImageUp,
  Loader2,
  Pause,
  Play,
  Plus,
  Repeat,
  X,
} from 'lucide-react';
import { loopingLiquidMetalShader } from './lib/loopingShader';
import { loopPeriodSeconds, speedForDuration } from './lib/loop';
import { exportPerfectLoop, type ExportFormat } from './lib/exportLoop';
import { MAX_RIPPLE_COLORS, padRippleColors, hexToRgb } from './lib/colors';
import { ColorPicker } from './components/ColorPicker';
import { Toggle } from './components/Toggle';

const BACKGROUNDS = ['#d8d8da', '#ffffff', '#000000', '#c41212'] as const;
const TRANSPARENT_BG = '#00000000';

type SliderKey =
  | 'refraction'
  | 'contour'
  | 'softness'
  | 'distortion'
  | 'grain'
  | 'flow'
  | 'speed'
  | 'repetition'
  | 'angle'
  | 'scale';

const SLIDERS: { key: SliderKey; label: string; min: number; max: number; step: number }[] = [
  { key: 'refraction', label: 'Refraction', min: 0, max: 1, step: 0.001 },
  { key: 'contour', label: 'Edge', min: 0, max: 1, step: 0.01 },
  { key: 'softness', label: 'Pattern Blur', min: 0, max: 1, step: 0.005 },
  { key: 'distortion', label: 'Liquify', min: 0, max: 1, step: 0.005 },
  { key: 'grain', label: 'Texture', min: 0, max: 1, step: 0.01 },
  { key: 'flow', label: 'Pattern Warp', min: 0, max: 1, step: 0.01 },
  { key: 'speed', label: 'Speed', min: 0, max: 3, step: 0.01 },
  { key: 'repetition', label: 'Pattern Scale', min: 0.25, max: 8, step: 0.05 },
  { key: 'angle', label: 'Angle', min: 0, max: 360, step: 1 },
  { key: 'scale', label: 'Logo Scale', min: 0.2, max: 1.6, step: 0.01 },
];

function formatValue(value: number, step: number) {
  const digits = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return value.toFixed(digits);
}

export default function App() {
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadUrlRef = useRef<string | null>(null);

  const [imageUrl, setImageUrl] = useState('/presets/hex.svg');
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [shape] = useState<LiquidMetalShape>('diamond');

  const [colorBack, setColorBack] = useState<string>('#000000');
  const [colorMetal, setColorMetal] = useState('#f4f4f8');
  const [rippleColors, setRippleColors] = useState<string[]>(['#111111', '#c41212']);
  const [refraction, setRefraction] = useState(0.06);
  const [contour, setContour] = useState(0.45);
  const [softness, setSoftness] = useState(0.28);
  const [distortion, setDistortion] = useState(0.07);
  const [grain, setGrain] = useState(0.34);
  const [grainLogoOnly, setGrainLogoOnly] = useState(false);
  const [glow, setGlow] = useState(false);
  const [flow, setFlow] = useState(0.28);
  const [speed, setSpeed] = useState(1);
  const [repetition, setRepetition] = useState(0.85);
  const [angle, setAngle] = useState(70);
  const [scale, setScale] = useState(0.6);
  const [seamlessLoop, setSeamlessLoop] = useState(true);
  const [paused, setPaused] = useState(false);

  const [format, setFormat] = useState<ExportFormat>('gif');
  const [duration, setDuration] = useState(2);
  const [fps, setFps] = useState(30);
  const [size, setSize] = useState(720);
  const [cycles, setCycles] = useState(1);
  const [transparentExport, setTransparentExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const values = useMemo(
    () => ({
      refraction,
      contour,
      softness,
      distortion,
      grain,
      flow,
      speed,
      repetition,
      angle,
      scale,
    }),
    [refraction, contour, softness, distortion, grain, flow, speed, repetition, angle, scale],
  );

  const setValue = useCallback((key: SliderKey, next: number) => {
    const setters = {
      refraction: setRefraction,
      contour: setContour,
      softness: setSoftness,
      distortion: setDistortion,
      grain: setGrain,
      flow: setFlow,
      speed: setSpeed,
      repetition: setRepetition,
      angle: setAngle,
      scale: setScale,
    };
    setters[key](next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    toProcessedLiquidMetal(imageUrl)
      .then((result) => {
        const url = URL.createObjectURL(result.pngBlob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setProcessedUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not process image');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const uniforms = useMemo(
    () => ({
      u_colorBack: getShaderColorFromString(colorBack),
      u_colorTint: [1, 1, 1, 0] as [number, number, number, number],
      u_colorMetal: hexToRgb(colorMetal),
      u_rippleColors: padRippleColors(rippleColors),
      u_rippleCount: Math.min(Math.max(rippleColors.length, 1), MAX_RIPPLE_COLORS),
      u_image: processedUrl ?? undefined,
      u_contour: contour,
      u_distortion: distortion,
      u_softness: softness,
      u_repetition: repetition,
      u_shiftRed: refraction,
      u_shiftBlue: refraction,
      u_angle: angle,
      u_isImage: Boolean(processedUrl),
      u_shape: LiquidMetalShapes[shape],
      u_seamlessLoop: seamlessLoop ? 1 : 0,
      u_grain: grain,
      u_grainLogoOnly: grainLogoOnly ? 1 : 0,
      u_glow: glow ? 1 : 0,
      u_flow: flow,
      u_fit: 1,
      u_scale: scale,
      u_rotation: 0,
      u_offsetX: 0,
      u_offsetY: 0,
      u_originX: 0.5,
      u_originY: 0.5,
      u_worldWidth: 0,
      u_worldHeight: 0,
    }),
    [
      angle,
      colorBack,
      colorMetal,
      rippleColors,
      contour,
      distortion,
      flow,
      grain,
      grainLogoOnly,
      glow,
      processedUrl,
      refraction,
      repetition,
      scale,
      seamlessLoop,
      shape,
      softness,
    ],
  );

  const loopSeconds = loopPeriodSeconds(speed);

  const onUpload = (file: File) => {
    const url = URL.createObjectURL(file);
    if (uploadUrlRef.current) URL.revokeObjectURL(uploadUrlRef.current);
    uploadUrlRef.current = url;
    setError(null);
    setImageUrl(url);
  };

  const exportLoop = async () => {
    if (exporting) return;
    setError(null);
    setPaused(false);
    setExporting(true);
    setProgress(0);
    setProgressLabel('Starting export');
    try {
      const snappedSpeed = speedForDuration(duration, cycles);
      setSeamlessLoop(true);
      setSpeed(snappedSpeed);
      await exportPerfectLoop({
        format,
        duration,
        fps,
        size,
        cycles,
        processedImageUrl: processedUrl,
        transparent: transparentExport,
        params: {
          colorBack,
          colorMetal,
          rippleColors,
          contour,
          distortion,
          softness,
          repetition,
          shiftRed: refraction,
          shiftBlue: refraction,
          angle,
          scale,
          grain,
          grainLogoOnly,
          glow,
          flow,
          shape,
          hasImage: Boolean(processedUrl),
        },
        onProgress: (value, label) => {
          setProgress(value);
          setProgressLabel(label);
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
      setProgressLabel('');
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="brand">Paper-style</div>
        <h1>Liquid Metal Loop</h1>
        <div className="brand right" aria-hidden="true" />
      </header>

      <main className="workspace">
        <section className="preview-wrap">
          <div
            className={colorBack === TRANSPARENT_BG ? 'preview checkerboard' : 'preview'}
            style={colorBack === TRANSPARENT_BG ? undefined : { background: colorBack }}
          >
            {processedUrl ? (
              <ShaderMount
                fragmentShader={loopingLiquidMetalShader}
                uniforms={uniforms}
                speed={paused ? 0 : speed}
                mipmaps={['u_image']}
                style={{ width: '100%', height: '100%' }}
                webGlContextAttributes={{
                  preserveDrawingBuffer: true,
                  alpha: true,
                  premultipliedAlpha: false,
                }}
              />
            ) : (
              <div className="preview-status">
                <Loader2 className="spin" size={22} />
                Processing logo
              </div>
            )}
            <button
              type="button"
              className="play-toggle"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Play' : 'Pause'}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          </div>
        </section>

        <aside className="panel">
          <div className="panel-section colors">
          <div className="swatches">
            <span className="swatch-label">BG</span>
            {BACKGROUNDS.map((hex) => (
              <button
                key={hex}
                type="button"
                className={colorBack === hex ? 'swatch active' : 'swatch'}
                style={{ background: hex }}
                onClick={() => {
                  setColorBack(hex);
                  setTransparentExport(false);
                }}
                aria-label={`Background ${hex}`}
              />
            ))}
            <button
              type="button"
              className={colorBack === TRANSPARENT_BG ? 'swatch checkerboard active' : 'swatch checkerboard'}
              onClick={() => {
                setColorBack(TRANSPARENT_BG);
                setTransparentExport(true);
              }}
              aria-label="Transparent background"
              title="Transparent background"
            />
            <ColorPicker
              className={
                colorBack !== TRANSPARENT_BG && !(BACKGROUNDS as readonly string[]).includes(colorBack)
                  ? 'circle active'
                  : 'circle'
              }
              value={colorBack === TRANSPARENT_BG ? '#000000' : colorBack}
              onChange={(hex) => {
                setColorBack(hex);
                setTransparentExport(false);
              }}
              ariaLabel="Custom background color"
            />
            <label className="tint">
              Metal
              <ColorPicker
                value={colorMetal}
                onChange={setColorMetal}
                ariaLabel="Logo metal color"
              />
            </label>
          </div>
          <div className="ripple-row">
            <span className="swatch-label">Ripples</span>
            {rippleColors.map((hex, index) => (
              <span key={index} className="ripple-chip">
                <ColorPicker
                  value={hex}
                  onChange={(nextHex) => {
                    const next = [...rippleColors];
                    next[index] = nextHex;
                    setRippleColors(next);
                  }}
                  ariaLabel={`Ripple color ${index + 1}`}
                />
                {rippleColors.length > 1 && (
                  <button
                    type="button"
                    className="ripple-remove"
                    onClick={() => setRippleColors(rippleColors.filter((_, i) => i !== index))}
                    aria-label={`Remove ripple color ${index + 1}`}
                  >
                    <X size={10} />
                  </button>
                )}
              </span>
            ))}
            {rippleColors.length < MAX_RIPPLE_COLORS && (
              <button
                type="button"
                className="ripple-add"
                onClick={() => setRippleColors([...rippleColors, '#ff1a1a'])}
                aria-label="Add ripple color"
              >
                <Plus size={14} />
              </button>
            )}
          </div>
          </div>

          <div className="panel-section sliders">
            {SLIDERS.map((slider) => (
              <label key={slider.key} className="slider-row">
                <span>{slider.label}</span>
                <input
                  type="range"
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={values[slider.key]}
                  onChange={(e) => setValue(slider.key, Number(e.target.value))}
                />
                <input
                  type="number"
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={formatValue(values[slider.key], slider.step)}
                  onChange={(e) => setValue(slider.key, Number(e.target.value))}
                />
              </label>
            ))}
          </div>

          <div className="panel-section toggles">
            <Toggle
              isSelected={glow}
              onChange={setGlow}
              label="Outer glow"
            />
            <Toggle
              isSelected={grainLogoOnly}
              onChange={setGrainLogoOnly}
              label="Texture on logo only"
            />
            <Toggle
              isSelected={seamlessLoop}
              onChange={setSeamlessLoop}
              label="Seamless loop preview"
              description={`${loopSeconds.toFixed(2)}s cycle`}
            />
          </div>

          <div className="panel-section file-import">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/svg+xml,image/webp,image/jpeg"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                e.target.value = '';
              }}
            />
            <button type="button" className="upload-btn" onClick={() => fileRef.current?.click()}>
              <ImageUp size={16} />
              Upload image
            </button>
            <p className="tips">
              Tips: transparent or white background is required. Shapes work better than words.
              Use an SVG or a high-resolution image.
            </p>
          </div>

          <div className="export">
            <div className="export-title">
              <Repeat size={16} />
              Perfect loop export
            </div>
            <div className="export-grid">
              <label>
                Format
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as ExportFormat)}
                >
                  <option value="gif">GIF</option>
                  <option value="mp4">MP4</option>
                  <option value="webm">WebM</option>
                </select>
              </label>
              <label>
                Duration
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                >
                  <option value={1.5}>1.5s</option>
                  <option value={2}>2s</option>
                  <option value={3}>3s</option>
                  <option value={4}>4s</option>
                </select>
              </label>
              <label>
                FPS
                <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                  <option value={24}>24</option>
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                </select>
              </label>
              <label>
                Size
                <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
                  <option value={512}>512</option>
                  <option value={720}>720</option>
                  <option value={1080}>1080</option>
                </select>
              </label>
              <label>
                Cycles
                <select value={cycles} onChange={(e) => setCycles(Number(e.target.value))}>
                  <option value={1}>1 pass</option>
                  <option value={2}>2 passes</option>
                </select>
              </label>
            </div>
            <Toggle
              isSelected={transparentExport}
              onChange={(on) => {
                setTransparentExport(on);
                if (on) setColorBack(TRANSPARENT_BG);
                else if (colorBack === TRANSPARENT_BG) setColorBack('#000000');
              }}
              label="Transparent background"
              description={transparentExport && format === 'mp4' ? 'exports as WebM' : 'GIF / WebM'}
            />
            <p className="tips">
              One click snaps speed so {cycles} metal cycle{cycles > 1 ? 's' : ''} {cycles > 1 ? 'fit' : 'fits'} {duration}s,
              then renders frames 0…N−1 (no duplicated first frame).
              {transparentExport
                ? ' GIF uses 1-bit alpha; WebM keeps a smoother alpha channel. MP4 cannot store transparency, so that option encodes WebM instead.'
                : ''}
            </p>
            <button
              type="button"
              className="export-btn"
              onClick={() => void exportLoop()}
              disabled={exporting || !processedUrl}
            >
              {exporting ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
              {exporting ? progressLabel || 'Exporting…' : `Export ${format.toUpperCase()} loop`}
            </button>
            {exporting && (
              <div className="progress">
                <div style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </div>
        </aside>
      </main>
    </div>
  );
}
