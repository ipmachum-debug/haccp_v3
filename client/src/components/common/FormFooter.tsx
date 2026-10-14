/**
 * FormFooter — 등록·수정 하단 버튼 표준 (3-a, 명세 §5)
 *   하단 고정 [취소][저장] — 저장이 오른쪽. 저장 중에는 저장 버튼만 잠그고 문구를 바꾼다.
 *   전용 페이지에서는 sticky(기본), 다이얼로그·시트 안에서는 sticky={false}.
 *
 *   <FormFooter onCancel={() => history.back()} onSave={submit} saving={mut.isPending} saveDisabled={!valid} />
 */
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FormFooter({ onCancel, onSave, saving, saveDisabled, saveLabel = "저장", cancelLabel = "취소", sticky = true, hint, className }: {
  onCancel?: () => void;
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  sticky?: boolean;
  /** 왼쪽 안내 한 줄 (예: 필수 항목 안내) */
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn(
      "flex items-center gap-2 border-t bg-background/95 backdrop-blur px-4 py-3",
      sticky && "sticky bottom-0 z-20 -mx-3 md:-mx-5",
      className,
    )}>
      {hint && <p className="text-xs text-muted-foreground mr-auto">{hint}</p>}
      <div className={cn("flex items-center gap-2", !hint && "ml-auto")}>
        {onCancel && <Button variant="outline" onClick={onCancel} disabled={saving}>{cancelLabel}</Button>}
        <Button onClick={onSave} disabled={saving || saveDisabled} data-testid="form-save">{saving ? "저장 중…" : saveLabel}</Button>
      </div>
    </div>
  );
}
