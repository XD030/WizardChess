import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { GuardOption } from '@shared/schema';

interface GuardDialogProps {
  isOpen: boolean;
  guardOptions: GuardOption[];
  targetCoordinate: string;
  onSelectGuard: (paladinIndex: number) => void;
  onDecline: () => void;
}

export default function GuardDialog({
  isOpen,
  guardOptions,
  targetCoordinate,
  onSelectGuard,
  onDecline,
}: GuardDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onDecline()}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-guard">
        <DialogHeader>
          <DialogTitle className="text-xl">聖騎士守護</DialogTitle>
          <DialogDescription className="text-base">
            位於 <span className="font-bold text-primary">{targetCoordinate}</span> 的友方棋子受到攻擊！
            <br />
            是否使用聖騎士守護？
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {guardOptions.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">選擇一個聖騎士進行守護：</p>
              <div className="space-y-2">
                {guardOptions.map((option) => (
                  <Button
                    key={option.paladinIndex}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => onSelectGuard(option.paladinIndex)}
                    data-testid={`button-guard-${option.coordinate}`}
                  >
                    <span className="font-mono mr-2">🛡️</span>
                    聖騎士 {option.coordinate}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">沒有可用的聖騎士守護此棋子。</p>
          )}

          <div className="pt-2 border-t">
            <Button
              variant="secondary"
              className="w-full"
              onClick={onDecline}
              data-testid="button-decline-guard"
            >
              不守護
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
