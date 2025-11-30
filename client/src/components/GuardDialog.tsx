import { useState, useRef, useEffect } from 'react';
import { Shield } from 'lucide-react';
import type { GuardOption } from '@shared/schema';

interface GuardDialogProps {
  isOpen: boolean;
  guardOptions: GuardOption[];
  targetCoordinate: string;
  selectedPaladinIndex: number | null;
  onChangeSelectedPaladin: (paladinIndex: number) => void;
  onConfirmGuard: () => void;
  onDecline: () => void;
}

export default function GuardDialog({
  isOpen,
  guardOptions,
  targetCoordinate,
  selectedPaladinIndex,
  onChangeSelectedPaladin,
  onConfirmGuard,
  onDecline,
}: GuardDialogProps) {
  if (!isOpen) return null;

  // ======= 讓視窗可拖曳 ============
  const dialogRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!dialogRef.current) return;
    setDragging(true);

    const rect = dialogRef.current.getBoundingClientRect();
    setOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseUp = () => setDragging(false);

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragging || !dialogRef.current) return;

    dialogRef.current.style.left = `${e.clientX - offset.x}px`;
    dialogRef.current.style.top = `${e.clientY - offset.y}px`;
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  });

  // =====================================

  return (
    <div
      className="
        fixed inset-0 z-50 
        flex items-center justify-center
        pointer-events-none
      "
    >
      <div
        ref={dialogRef}
        className="
          absolute
          w-full max-w-md
          rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl 
          p-6 
          pointer-events-auto
          select-none
        "
        style={{ position: 'absolute' }}
      >
        {/* 可拖曳的標題列（已移除右上角叉叉） */}
        <div
          className="w-full cursor-move mb-3 flex justify-center items-center"
          onMouseDown={handleMouseDown}
        >
          <h2 className="text-lg font-bold text-slate-100">聖騎士守護</h2>
        </div>

        <p className="text-sm text-slate-300 mb-1">
          位於{' '}
          <span className="text-emerald-300 font-semibold">
            {targetCoordinate}
          </span>{' '}
          的友方棋子受到攻擊！
        </p>
        <p className="text-xs text-slate-400 mb-4">是否使用聖騎士守護？</p>

        <div className="text-sm text-slate-200 mb-2">
          選擇一個聖騎士進行守護：
        </div>

        <div className="space-y-2 mb-4 max-h-40 overflow-y-auto pr-1">
          {guardOptions.map((opt) => {
            const isSelected = opt.paladinIndex === selectedPaladinIndex;
            return (
              <button
                key={opt.paladinIndex}
                type="button"
                onClick={() => onChangeSelectedPaladin(opt.paladinIndex)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                  isSelected
                    ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                    : 'border-slate-600 bg-slate-800/60 text-slate-100 hover:border-slate-400'
                }`}
              >
                <Shield className="w-4 h-4 shrink-0" />
                <span>聖騎士 {opt.coordinate}</span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={onConfirmGuard}
            disabled={selectedPaladinIndex === null}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
              selectedPaladinIndex === null
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
            }`}
          >
            守護
          </button>

          <button
            type="button"
            onClick={onDecline}
            className="flex-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-semibold py-2"
          >
            不守護
          </button>
        </div>
      </div>
    </div>
  );
}
