import { TabsList } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface AnimatedTabsListProps {
  className?: string;
  children: React.ReactNode;
}

export function AnimatedTabsList({ className, children }: AnimatedTabsListProps) {
  return (
    <TabsList
      className={cn(
        // 기본 레이아웃
        "flex w-full overflow-x-auto scrollbar-hide whitespace-nowrap",
        // 밝은 배경 (가독성 우선)
        "bg-muted/50",
        // 테두리 & 그림자
        "border border-border rounded-xl",
        "shadow-sm",
        // 애니메이션
        "transition-all duration-300",
        // 패딩
        "p-1.5",
        // 커스텀 클래스
        className
      )}
    >
      {children}
    </TabsList>
  );
}
