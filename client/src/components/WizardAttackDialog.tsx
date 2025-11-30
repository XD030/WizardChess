// src/components/WizardAttackDialog.tsx
import { useState, useRef, MouseEvent } from 'react';
import { Zap } from 'lucide-react';

interface WizardAttackDialogProps {
  isOpen: boolean;
  targetCoordinate: string;
  onLineShot: () => void;   // 導線射擊
  onMoveAttack: () => void; // 巫師移動
}

function WizardAttackDialog({
  isOpen,
  targetCoordinate,
  onLineShot,
  onMoveAttack,
}: WizardAttackDialogProps) {
  if (!isOpen) return null;

  // 可拖曳 offset
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    offsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setPosition({
      x: e.clientX - offsetRef.current.x,
      y: e.clientY - offsetRef.current.y,
    });
  };

  const handleMouseUp = () => {
    draggingRef.current = false;
  };

  return (
    // 外層只負責接 mousemove，不擋住棋盤
    <div
      className="fixed inset-0 z-50 pointer-events-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* 內層視窗本體：可以吃滑鼠事件 */}
      <div
        className="pointer-events-auto w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-5 absolute left-1/2 top-1/3 -translate-x-1/2"
        style={{
          transform: `translate(calc(-50% + ${position.x}px), ${position.y}px)`,
        }}
      >
        {/* 上方標題列：拖曳區域 */}
        <div
          className="flex items-center justify-between mb-3 cursor-move select-none"
          onMouseDown={handleMouseDown}
        >
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-300" />
            巫師攻擊選擇
          </h2>
        </div>

        <p className="text-sm text-slate-300 mb-1">
          目標位置{' '}
          <span className="text-emerald-300 font-semibold">
            {targetCoordinate}
          </span>
        </p>
        <p className="text-xs text-slate-400 mb-4">
          巫師可以用導線射擊或移動到該位置進行攻擊，請選擇方式：
        </p>

        <div className="flex flex-col gap-2 mt-2">
          <button
            type="button"
            onClick={onLineShot}
            className="w-full rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-sm font-semibold py-2"
          >
            導線射擊（巫師留在原地）
          </button>
          <button
            type="button"
            onClick={onMoveAttack}
            className="w-full rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-semibold py-2"
          >
            巫師移動（走到該位置）
          </button>
        </div>
      </div>
    </div>
  );
}

// ⚠️ 最重要：這一行一定要有
export default WizardAttackDialog;
