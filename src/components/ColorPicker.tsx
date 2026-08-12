import { useEffect, useRef, useState } from 'react';
import { hexToHsv, hsvToHex, type Hsv } from '../lib/colors';

type ColorPickerProps = {
  value: string;
  onChange: (hex: string) => void;
  ariaLabel: string;
  className?: string;
};

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function readHsv(hex: string): Hsv {
  return hexToHsv(hex.length >= 7 ? hex.slice(0, 7) : hex);
}

export function ColorPicker({ value, onChange, ariaLabel, className }: ColorPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hsvRef = useRef<Hsv>(readHsv(value));
  const dragRef = useRef<'sv' | 'hue' | null>(null);
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<Hsv>(() => readHsv(value));

  hsvRef.current = hsv;

  useEffect(() => {
    if (open) return;
    const next = readHsv(value);
    hsvRef.current = next;
    setHsv(next);
  }, [value, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const commit = (next: Hsv) => {
    hsvRef.current = next;
    setHsv(next);
    onChange(hsvToHex(next.h, next.s, next.v));
  };

  const applyFromPoint = (mode: 'sv' | 'hue', event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp01((event.clientX - rect.left) / Math.max(rect.width, 1));
    const y = clamp01((event.clientY - rect.top) / Math.max(rect.height, 1));
    if (mode === 'sv') commit({ ...hsvRef.current, s: x, v: 1 - y });
    else commit({ ...hsvRef.current, h: x * 360 });
  };

  const onAreaDown = (mode: 'sv' | 'hue') => (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragRef.current = mode;
    event.currentTarget.setPointerCapture(event.pointerId);
    applyFromPoint(mode, event);
  };

  const onAreaMove = (mode: 'sv' | 'hue') => (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current !== mode) return;
    applyFromPoint(mode, event);
  };

  const onAreaUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const display = hsvToHex(hsv.h, hsv.s, hsv.v);

  return (
    <div ref={rootRef} className={className ? `color-picker ${className}` : 'color-picker'}>
      <button
        type="button"
        className="color-picker-swatch"
        style={{ background: display }}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div className="color-picker-pop" role="dialog" aria-label={ariaLabel}>
          <div
            className="color-sv"
            style={{ background: hsvToHex(hsv.h, 1, 1) }}
            onPointerDown={onAreaDown('sv')}
            onPointerMove={onAreaMove('sv')}
            onPointerUp={onAreaUp}
            onPointerCancel={onAreaUp}
          >
            <div className="color-sv-white" />
            <div className="color-sv-black" />
            <div
              className="color-sv-thumb"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
            />
          </div>
          <div
            className="color-hue"
            onPointerDown={onAreaDown('hue')}
            onPointerMove={onAreaMove('hue')}
            onPointerUp={onAreaUp}
            onPointerCancel={onAreaUp}
          >
            <div className="color-hue-thumb" style={{ left: `${(hsv.h / 360) * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
