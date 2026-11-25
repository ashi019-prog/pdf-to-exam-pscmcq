import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pen,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Grid,
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  Layers,
  FileText,
} from 'lucide-react';
import { useExamStore } from '../../store/useExamStore';
import { PenColor, SlateStroke, SlateTool, StrokePoint, StrokeWidth } from '../../types/exam';

interface PaperSlateProps {
  currentQuestionNumber: number;
}

const PEN_COLORS: Array<{ label: string; value: PenColor; swatchClass: string }> = [
  { label: 'Black', value: '#111827', swatchClass: 'bg-slate-900' },
  { label: 'Blue', value: '#2563eb', swatchClass: 'bg-blue-600' },
  { label: 'Red', value: '#dc2626', swatchClass: 'bg-red-600' },
];

const STROKE_WIDTHS: Array<{ label: string; value: StrokeWidth }> = [
  { label: 'Fine', value: 2 },
  { label: 'Medium', value: 4 },
  { label: 'Thick', value: 8 },
];

function renderStroke(ctx: CanvasRenderingContext2D, stroke: SlateStroke) {
  if (stroke.points.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = stroke.width * 4;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
  }

  ctx.beginPath();
  const first = stroke.points[0];
  ctx.moveTo(first.x, first.y);

  if (stroke.points.length === 1) {
    ctx.lineTo(first.x + 0.1, first.y + 0.1);
  } else {
    for (let i = 1; i < stroke.points.length; i += 1) {
      const pt = stroke.points[i];
      ctx.lineTo(pt.x, pt.y);
    }
  }

  ctx.stroke();
  ctx.restore();
}

export const PaperSlate: React.FC<PaperSlateProps> = ({ currentQuestionNumber }) => {
  const {
    slateOpen,
    slateHeight,
    slateMode,
    slateGridVisible,
    slates,
    setSlateOpen,
    setSlateHeight,
    setSlateMode,
    toggleSlateGrid,
    pushSlateStroke,
    undoSlateStroke,
    redoSlateStroke,
    clearSlate,
  } = useExamStore();

  const [tool, setTool] = useState<SlateTool>('pen');
  const [color, setColor] = useState<PenColor>('#111827');
  const [width, setWidth] = useState<StrokeWidth>(4);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeStrokeRef = useRef<SlateStroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const slateKey = slateMode === 'shared' ? 'shared' : `q-${currentQuestionNumber}`;
  const currentSlate = slates[slateKey] ?? { strokes: [], redoStack: [] };

  const redrawCanvas = useCallback(
    (strokes: SlateStroke[], liveStroke?: SlateStroke | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      for (const stroke of strokes) {
        renderStroke(ctx, stroke);
      }
      if (liveStroke) {
        renderStroke(ctx, liveStroke);
      }
      ctx.restore();
    },
    []
  );

  useEffect(() => {
    if (!slateOpen) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      redrawCanvas(currentSlate.strokes, activeStrokeRef.current);
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(container);

    return () => observer.disconnect();
  }, [slateOpen, slateHeight, currentSlate.strokes, redrawCanvas]);

  useEffect(() => {
    if (slateOpen) {
      redrawCanvas(currentSlate.strokes, null);
    }
  }, [slateOpen, slateKey, currentSlate.strokes, redrawCanvas]);

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = slateHeight;

    const handleMove = (moveEvent: PointerEvent) => {
      const deltaY = startY - moveEvent.clientY;
      setSlateHeight(startHeight + deltaY);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;

    const pt = getCanvasPoint(e);
    activeStrokeRef.current = {
      tool,
      color,
      width,
      points: [pt],
    };
    redrawCanvas(currentSlate.strokes, activeStrokeRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== e.pointerId || !activeStrokeRef.current) return;
    const pt = getCanvasPoint(e);
    activeStrokeRef.current.points.push(pt);
    redrawCanvas(currentSlate.strokes, activeStrokeRef.current);
  };

  const finishActiveStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== e.pointerId || !activeStrokeRef.current) return;
    const completed = activeStrokeRef.current;
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    pushSlateStroke(slateKey, completed);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-300 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
      {/* Draggable Top Resize Handle */}
      {slateOpen && (
        <div
          onPointerDown={handleResizePointerDown}
          className="flex h-3 cursor-ns-resize items-center justify-center bg-slate-100 transition-colors hover:bg-indigo-100"
          title="Drag to resize Paper Slate height"
        >
          <GripHorizontal className="h-3.5 w-3.5 text-slate-400" />
        </div>
      )}

      {/* Toolbar Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSlateOpen(!slateOpen)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            {slateOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
            {slateOpen ? 'Minimize Paper Slate' : 'Open Paper Slate'}
          </button>

          <span className="hidden text-xs font-medium text-slate-500 sm:inline">
            {slateMode === 'shared'
              ? 'Shared Slate (Entire Exam)'
              : `Per-Question Slate — Q${currentQuestionNumber}`}
          </span>
        </div>

        {/* Drawing Controls */}
        {slateOpen && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Pen / Eraser */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setTool('pen')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${
                  tool === 'pen' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Pen className="h-3.5 w-3.5" />
                Pen
              </button>
              <button
                type="button"
                onClick={() => setTool('eraser')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${
                  tool === 'eraser'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Eraser className="h-3.5 w-3.5" />
                Eraser
              </button>
            </div>

            {/* Ink Colors */}
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1">
              {PEN_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => {
                    setColor(c.value);
                    setTool('pen');
                  }}
                  title={`${c.label} Ink`}
                  aria-label={`${c.label} Ink`}
                  className={`h-4 w-4 rounded-full ${c.swatchClass} transition ${
                    color === c.value && tool === 'pen'
                      ? 'ring-2 ring-indigo-500 ring-offset-2'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                />
              ))}
            </div>

            {/* Stroke Widths */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              {STROKE_WIDTHS.map((sw) => (
                <button
                  key={sw.value}
                  type="button"
                  onClick={() => setWidth(sw.value)}
                  className={`rounded-md px-2 py-1 text-xs font-semibold ${
                    width === sw.value
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {sw.label}
                </button>
              ))}
            </div>

            {/* Blank Paper vs Faint Math Grid Toggle */}
            <button
              type="button"
              onClick={toggleSlateGrid}
              title="Toggle Blank Paper vs Faint Math Grid"
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                slateGridVisible
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Grid className="h-3.5 w-3.5" />
              {slateGridVisible ? 'Faint Math Grid' : 'Blank Paper'}
            </button>

            {/* Per-Question vs Shared Slate */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setSlateMode('per_question')}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                  slateMode === 'per_question'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="Separate rough sheet per question"
              >
                <FileText className="h-3 w-3" />
                Per-Question
              </button>
              <button
                type="button"
                onClick={() => setSlateMode('shared')}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                  slateMode === 'shared'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="One continuous rough sheet across the entire exam"
              >
                <Layers className="h-3 w-3" />
                Shared
              </button>
            </div>

            {/* Undo / Redo / Clear Board */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentSlate.strokes.length === 0}
                onClick={() => undoSlateStroke(slateKey)}
                title="Undo"
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={currentSlate.redoStack.length === 0}
                onClick={() => redoSlateStroke(slateKey)}
                title="Redo"
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={currentSlate.strokes.length === 0}
                onClick={() => clearSlate(slateKey)}
                title="Clear Board"
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Board
              </button>
            </div>
          </div>
        )}
      </div>

      {/* White Paper Canvas Surface */}
      {slateOpen && (
        <div
          ref={containerRef}
          style={{ height: `${slateHeight}px` }}
          className={`relative w-full overflow-hidden ${
            slateGridVisible ? 'paper-grid-bg' : 'paper-plain-bg'
          }`}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishActiveStroke}
            onPointerCancel={finishActiveStroke}
            className="block h-full w-full touch-none cursor-crosshair"
          />
        </div>
      )}
    </div>
  );
};
