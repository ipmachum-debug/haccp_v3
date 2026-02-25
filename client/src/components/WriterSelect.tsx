/**
 * 작성자 선택 드롭다운 컴포넌트
 * 구성원 목록에서 작성자를 선택할 수 있는 공통 컴포넌트
 */
import { trpc } from "@/lib/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User } from "lucide-react";

interface WriterSelectProps {
  value: string;
  onChange: (value: string, employeeId?: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function WriterSelect({
  value,
  onChange,
  placeholder = "작성자 선택",
  className = "",
  disabled = false,
}: WriterSelectProps) {
  const { data: employees } = trpc.organization.employees.list.useQuery();

  const activeEmployees = (employees || []).filter((e: any) => e.isActive === 1);

  return (
    <Select
      value={value}
      onValueChange={(val) => {
        const emp = activeEmployees.find((e: any) => e.name === val);
        onChange(val, emp?.id);
      }}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder}>
          {value ? (
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{value}</span>
            </div>
          ) : (
            placeholder
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {activeEmployees.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            등록된 구성원이 없습니다
          </div>
        ) : (
          activeEmployees.map((emp: any) => (
            <SelectItem key={emp.id} value={emp.name}>
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{emp.name}</span>
                {emp.positionName && (
                  <span className="text-xs text-muted-foreground">
                    ({emp.positionName})
                  </span>
                )}
                {emp.departmentName && (
                  <span className="text-xs text-muted-foreground">
                    - {emp.departmentName}
                  </span>
                )}
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
