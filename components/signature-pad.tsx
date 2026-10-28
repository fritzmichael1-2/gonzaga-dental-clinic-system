"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export type SignaturePadHandle = { clear: () => void };

/**
 * Signature capture on a canvas.
 *
 * Three things this gets right that a bare `<canvas onMouseMove>` does not:
 *
 * 1. `touch-action: none` — without it a finger-drag on the canvas is claimed
 *    by the browser as a pan/zoom gesture, so the page zooms instead of the
 *    stroke being drawn.
 * 2. Pointer events, not mouse events — pen and touch work, and
 *    `setPointerCapture` keeps the stroke alive when the finger leaves the box.
 * 3. Backing store sized from the CSS box × devicePixelRatio, and coordinates
 *    converted back through `getBoundingClientRect`. A fixed `width={400}`
 *    stretched by `w-full` makes every stroke land somewhere other than the
 *    cursor and renders at the wrong scale.
 */
const SignaturePad = forwardRef<
  SignaturePadHandle,
  {
    /** Called with a PNG data URL after each stroke, or null when cleared. */
    onChange: (dataUrl: string | null) => void;
    /** Accessible name, e.g. "Patient signature". */
    label: string;
    /** Rendered height in CSS pixels. Width comes from the className. */
    height?: number;
    /** Applied to the canvas, so callers keep their own border/background. */
    className?: string;
  }
>(function SignaturePad({ onChange, label, height = 170, className }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function applyStroke() {
      ctx!.lineWidth = 2;
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";
      ctx!.strokeStyle = "#1f2937";
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas!.width === w && canvas!.height === h) return;

      // Setting width/height wipes the bitmap, so keep the ink and repaint it
      // at the new size — a window resize must not erase a signature.
      const previous = inked.current ? canvas!.toDataURL("image/png") : null;
      canvas!.width = w;
      canvas!.height = h;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      applyStroke();

      if (previous) {
        const img = new Image();
        img.onload = () => ctx!.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = previous;
      }
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      clear() {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        inked.current = false;
        onChange(null);
      },
    }),
    [onChange]
  );

  function pointAt(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = pointAt(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    // A tap should leave a mark, not nothing.
    ctx.lineTo(p.x + 0.01, p.y);
    ctx.stroke();
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const p = pointAt(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    inked.current = true;
  }

  function handleUp() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ height, touchAction: "none", cursor: "crosshair" }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      aria-label={label}
    />
  );
});

export default SignaturePad;
