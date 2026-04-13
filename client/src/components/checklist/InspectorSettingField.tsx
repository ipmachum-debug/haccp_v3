/**
 * 점검자(작성자) 설정/수정 필드 컴포넌트
 * - 드롭다운으로 점검자 선택 후 "설정" 버튼 → 고정 저장
 * - 설정 후 "수정" 버튼으로 변경 → 다시 변경 가능
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Settings, Edit3, Check, User } from "lucide-react";
import WriterSelect from "@/components/checklist/WriterSelect";

interface InspectorSettingFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  /** localStorage에 저장할 키 (폼 타입별로 다르게 설정) */
  storageKey?: string;
}

export default function InspectorSettingField({
  value,
  onChange,
  label = "점검자",
  storageKey,
}: InspectorSettingFieldProps) {
  const [isLocked, setIsLocked] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  // 초기 로드 시 localStorage에서 저장된 점검자 불러오기
  useEffect(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`inspector_${storageKey}`);
      if (saved) {
        onChange(saved);
        setTempValue(saved);
        setIsLocked(true);
      }
    }
  }, [storageKey]);

  // value가 외부에서 변경되면 tempValue도 동기화
  useEffect(() => {
    if (!isLocked) {
      setTempValue(value);
    }
  }, [value, isLocked]);

  const handleSet = () => {
    if (!tempValue) return;
    onChange(tempValue);
    setIsLocked(true);
    if (storageKey) {
      localStorage.setItem(`inspector_${storageKey}`, tempValue);
    }
  };

  const handleEdit = () => {
    setIsLocked(false);
    setTempValue(value);
  };

  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2 mt-1">
        {isLocked ? (
          <>
            <div className="flex-1 flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/50 text-sm">
              <User className="h-4 w-4 text-primary" />
              <span className="font-medium">{value}</span>
              <Check className="h-4 w-4 text-green-500 ml-auto" />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleEdit}
              className="shrink-0"
            >
              <Edit3 className="h-4 w-4 mr-1" />
              수정
            </Button>
          </>
        ) : (
          <>
            <div className="flex-1">
              <WriterSelect
                value={tempValue}
                onChange={(v: string) => setTempValue(v)}
                placeholder="작성자 선택"
              />
            </div>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSet}
              disabled={!tempValue}
              className="shrink-0"
            >
              <Settings className="h-4 w-4 mr-1" />
              설정
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
