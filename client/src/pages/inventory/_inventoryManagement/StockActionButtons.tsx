/**
 * 재고 일괄 작업 버튼 — InventoryManagementIntegrated.tsx 에서 분리 (2026-04-19)
 *
 * - RetroactiveDeductionButton: 배치 재고 일괄 차감 (백업 데이터 누락 복구용)
 * - StockSyncButton: 소모 데이터 → 현황 재고 일괄 동기화
 */
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";

/* ═══════════════════════════════════════════════════
   배치 생산 소급 재고 차감 버튼
   ═══════════════════════════════════════════════════ */
export function RetroactiveDeductionButton({ onComplete }: { onComplete: () => void }) {
  const [status, setStatus] = useState<"idle" | "checking" | "running" | "done">("idle");
  const [resultMsg, setResultMsg] = useState("");

  const retroMut = trpc.inventory.retroactiveDeduction.useMutation({
    onSuccess: (data: any) => {
      if (data.processedBatches === 0) {
        setResultMsg("모든 배치의 원재료가 이미 차감되어 있습니다.");
      } else {
        setResultMsg(`${data.processedBatches}개 배치 처리 완료 (원재료 ${data.totalDeducted}건 차감, 총 원가 ₩${data.totalCost.toLocaleString()})`);
      }
      setStatus("done");
      onComplete();
    },
    onError: (e: { message: string }) => {
      setResultMsg(`오류: ${e.message}`);
      setStatus("done");
    }
  });

  const dryRunMut = trpc.inventory.retroactiveDeduction.useMutation({
    onSuccess: (data: any) => {
      if (data.processedBatches === 0 && data.errors?.length) {
        setResultMsg("차감 대상 배치가 없습니다.");
        setStatus("idle");
        return;
      }
      const details = data.details?.map((d: any) =>
        `  - 배치 ${d.batchNumber}: 원재료 ${d.materialsIssued}건`
      ).join("\n") || "";
      if (confirm(`소급 차감 대상: ${data.processedBatches}개 배치\n\n${details}\n\n재고에서 원재료를 차감하시겠습니까?`)) {
        setStatus("running");
        retroMut.mutate({ dryRun: false });
      } else {
        setStatus("idle");
      }
    },
    onError: (e: { message: string }) => {
      setResultMsg(`확인 오류: ${e.message}`);
      setStatus("done");
    }
  });

  const handleClick = useCallback(() => {
    setStatus("checking");
    setResultMsg("");
    dryRunMut.mutate({ dryRun: true });
  }, []);

  if (status === "done" && resultMsg) {
    return (
      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-green-700 dark:text-green-400">{resultMsg}</span>
        <button onClick={() => { setStatus("idle"); setResultMsg(""); }} className="text-[10px] text-blue-600 underline">닫기</button>
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      <Button
        size="sm"
        variant="outline"
        disabled={status === "checking" || status === "running"}
        onClick={handleClick}
        className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950/30"
      >
        <Play className="h-3 w-3 mr-1" />
        {status === "checking" ? "확인 중..." : status === "running" ? "차감 처리 중..." : "배치 재고 일괄 차감"}
      </Button>
      <span className="text-[10px] text-muted-foreground ml-2">백업 데이터 등으로 누락된 배치별 원재료 재고 차감 실행</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   소모 기준 재고 차이 보기 (참고용, 2026-10-17)
   이전 '소모→현황 재고 동기화' 는 재고를 통째로 덮어써 매출·취소·실사 반영분을 지웠다 →
   서버에서 쓰기를 막고, 화면은 차이만 보여 준다. 차이 해소는 실사·재고 조정으로.
   ═══════════════════════════════════════════════════ */
export function StockSyncButton({ onComplete: _onComplete }: { onComplete: () => void }) {
  const [status, setStatus] = useState<"idle" | "checking" | "done">("idle");
  const [resultMsg, setResultMsg] = useState("");
  const [details, setDetails] = useState<any[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  const previewMut = trpc.inventory.syncStockFromConsumption.useMutation({
    onSuccess: (data: any) => {
      if (data.materialsProcessed === 0 && data.errors?.length) {
        setResultMsg(data.errors[0] || "차이가 없습니다.");
        setDetails([]);
      } else {
        setResultMsg(`${data.materialsProcessed}개 원재료에 차이 (참고용 — 매출·취소·실사·반품은 이 식에 없음, 재고는 바꾸지 않음)`);
        setDetails(data.details || []);
        setShowDetails(true);
      }
      setStatus("done");
    },
    onError: (e: { message: string }) => {
      setResultMsg(`확인 오류: ${e.message}`);
      setStatus("done");
    }
  });

  const handleClick = useCallback(() => {
    setStatus("checking");
    setResultMsg("");
    setDetails([]);
    previewMut.mutate({ dryRun: true });
  }, []);

  if (status === "done" && resultMsg) {
    return (
      <div className="mt-2 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">{resultMsg}</span>
          <button onClick={() => { setStatus("idle"); setResultMsg(""); setDetails([]); }} className="text-[10px] text-blue-600 underline">닫기</button>
          {details.length > 0 && (
            <button onClick={() => setShowDetails(!showDetails)} className="text-[10px] text-blue-600 underline">
              {showDetails ? "상세 접기" : "상세 보기"}
            </button>
          )}
        </div>
        {showDetails && details.length > 0 && (
          <div className="text-[10px] text-muted-foreground space-y-0.5 pl-2 border-l-2 border-slate-200 dark:border-slate-700">
            {details.map((d: any, i: number) => (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{d.materialName}</span>
                {(d.warnings || []).map((w: string, j: number) => <span key={j} className={w.startsWith("⚠️") ? "text-amber-500" : ""}>{w}</span>)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <Button
        size="sm"
        variant="outline"
        disabled={status === "checking"}
        onClick={handleClick}
        className="h-7 text-xs"
      >
        <RefreshCw className={`h-3 w-3 mr-1 ${status === "checking" ? "animate-spin" : ""}`} />
        {status === "checking" ? "확인 중..." : "소모 기준 재고 차이 보기"}
      </Button>
      <span className="text-[10px] text-muted-foreground ml-2">입고 − 배치 소모 기준 참고 차이 (재고는 바꾸지 않음)</span>
    </div>
  );
}
