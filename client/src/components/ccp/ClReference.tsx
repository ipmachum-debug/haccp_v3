/**
 * 한계기준 (참고) — 이 회사의 공정그룹에서 읽는다 (2026-10-18: 코드에 박힌 특정 회사 품목·숫자 제거)
 */
import { trpc } from "@/lib/trpc";
import { clRange, clMin } from "./ccpCl";

export function ClReference({ ccpType }: { ccpType: "CCP-1B" | "CCP-2B" }) {
  const { data } = trpc.ccpMonitoring.getProcessGroups.useQuery({ ccpType });
  const groups = (data ?? []) as any[];
  const num = (v: unknown) => (v == null || v === "" ? undefined : Number(v));
  return (
    <div className="bg-muted p-4 rounded-lg space-y-2">
      <h3 className="font-semibold">한계기준 (참고)</h3>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">등록된 {ccpType} 공정이 없습니다 — CCP 관리 → 공정그룹에서 한계기준을 입력하세요.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          {groups.map((g) => (
            <div key={g.id}>
              <div className="font-medium">{g.name}</div>
              <div className="text-muted-foreground">
                {clRange(num(g.time_min), num(g.time_max), "분")}
                {ccpType === "CCP-1B" && g.pressure_min != null ? `, ${clMin(num(g.pressure_min), "MPa 이상")}` : ""}
                {`, ${clMin(num(g.temperature_min), "℃ 이상")}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
