/**
 * CCP 모니터링 기록지 컴포넌트 (v2 - BOM 배치수 자동계산 + 설비 순차할당)
 *
 * CCP-2B: 중요관리점(CCP-2B) 모니터링일지 [가열(굽기)공정]
 * CCP-1B: 중요관리점(CCP-1B) 모니터링일지 [가열(증숙)공정 - 교반기/증숙기]
 * CCP-4P: 중요관리점(CCP-4P) 모니터링일지 [금속검출공정]
 *
 * 핵심 기능:
 * - BOM 배치목표량(batch_target_kg) 조회 → 배치수 자동계산(계획생산량 ÷ BOM배치량)
 * - 설비 순차할당: 배치1→설비1, 배치2→설비2, 배치3→설비3
 * - 그룹방식: 동시(concurrent) / 순차(sequential) + 배치간격(분)
 * - 자동/수동 처리모드 → 승인관리 연동
 *
 * 기준서 CL 값:
 * CCP-2B: 가열시간 10~15분, 가열온도 150°C 이상
 * CCP-1B: 가열시간 10~15분 (교반기1: 0.16MPa, 교반기2,3: 0.12MPa), 품온 90°C 이상
 * CCP-4P: 감도 130, Fe 2.0mmΦ 이상 불검출, SUS 3.0mmΦ 이상 불검출
 */
import { useState, useEffect, useCallback } from "react";
import { trpc } from "../../lib/trpc";
import { useToast } from "../../hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Zap, Plus, RefreshCw, Calculator, Wrench,
} from "lucide-react";
import { useLocation } from "wouter";

import { todayLocal } from "../../lib/dateUtils";


// 2026-04-20 분해: FormPanel 섹션 전체를 _ccpForms/ 로 이동
import { CcpFormPanel } from "./_ccpForms/FormPanel";

// ─────────────────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────
  batchId, batchNumber, productId, productName, plannedQtyKg, workDate, onFormSaved,
}: Props) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const today = workDate ?? todayLocal();

  // CCP 기록지 목록 조회
  const { data: formRecords, refetch: refetchForms, isLoading: formsLoading } =
    trpc.ccpForm.getByBatch.useQuery({ batchId }, { enabled: !!batchId });

  // 설비 목록 조회
  const { data: equipmentGroups = [] } = trpc.ccpForm.getEquipmentForBatch.useQuery(
    { batchId }, { enabled: !!batchId }
  );

  // 각 기록지의 행 데이터 조회
  const firstRecord = (formRecords as any[])?.[0];
  const { data: firstRecordFull } = trpc.ccpForm.getById.useQuery(
    { id: firstRecord?.id ?? 0 }, { enabled: !!firstRecord?.id }
  );

  // CCP 인스턴스 기반 CCP 유형 파악
  const { data: ccpInstances } = trpc.ccp.getByBatchId.useQuery(
    { batchId }, { enabled: !!batchId }
  );

  const getOrCreateMutation = trpc.ccpForm.getOrCreate.useMutation({
    onSuccess: () => {
      toast({ title: "CCP 기록지 생성", description: "기록지가 준비되었습니다." });
      refetchForms();
      utils.ccpForm.getById.invalidate();
    },
    onError: (err: { message: string }) => toast({ title: "기록지 생성 실패", description: err.message, variant: "destructive" }),
  });

  const resyncRowsMutation = trpc.ccpForm.resyncRows.useMutation({
    onSuccess: (data: any) => {
      if (data.synced > 0) {
        toast({ title: "배치행 재생성 완료", description: `${data.synced}건의 CCP 행이 재동기화되었습니다.` });
      }
      // getByBatch + 각 기록지의 getById 캐시 모두 무효화
      refetchForms();
      utils.ccpForm.getById.invalidate();
    },
    onError: (err: { message: string }) => toast({ title: "재동기화 실패", description: err.message, variant: "destructive" }),
  });

  // CCP 기록지 자동 생성 (없으면)
  const handleCreateForms = useCallback(() => {
    if (!ccpInstances || ccpInstances.length === 0) {
      toast({ title: "CCP 인스턴스 없음", description: "먼저 CCP를 자동 생성해주세요.", variant: "destructive" });
      return;
    }
    const uniqueTypes = Array.from(new Set((ccpInstances as any[]).map((c: any) => c.ccpType as string)));
    for (const ccpType of uniqueTypes) {
      const inst = (ccpInstances as any[]).find((c: any) => c.ccpType === ccpType);
      const cl = CCP_CL_DEFAULTS[ccpType] ?? {};
      getOrCreateMutation.mutate({
        batchId, ccpType, workDate: today,
        productId, productName,
        processGroupId: inst?.processGroupId ?? undefined,
        plannedQtyKg,
        clHeatTimeMinLo: cl.heatTimeMinLo, clHeatTimeMinHi: cl.heatTimeMinHi,
        clHeatTempLo: cl.heatTempLo, clPressureMpaLo: cl.pressureMpaLo,
        clProductTempLo: cl.productTempLo,
        clMetalSensitivity: cl.metalSensitivity, clFeMm: cl.feMm, clSusMm: cl.susMm,
      });
    }
  }, [ccpInstances, batchId, today, productId, productName, plannedQtyKg]);

  const handleRefresh = () => { refetchForms(); onFormSaved?.(); };

  // ★ 자동 재동기화: 페이지 로드 시 CCP-1B/2B 누락 행 자동 추가
  //    syncCcpRowsToFormRows는 기존 행을 보호하고 누락분만 추가하므로 안전
  //    getByBatch 결과에 rowCount가 없으므로, batchCount > 1인 기록이 하나라도 있으면 실행
  const [autoSynced, setAutoSynced] = useState(false);
  useEffect(() => {
    if (autoSynced || !formRecords || !Array.isArray(formRecords) || (formRecords as any[]).length === 0) return;
    if (resyncRowsMutation.isPending) return;
    
    // batchCount > 1인 CCP-1B/2B 기록이 있으면 자동 재동기화 (누락 행만 추가, 기존 데이터 보호)
    const hasBatchRecords = (formRecords as any[]).some((fr: any) => 
      fr.ccpType !== "CCP-4P" && fr.batchCount && Number(fr.batchCount) > 1
    );
    
    if (hasBatchRecords) {
      setAutoSynced(true);
      resyncRowsMutation.mutate({ batchId });
    }
  }, [formRecords, autoSynced, batchId]);

  if (formsLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        CCP 모니터링 기록지 로딩 중...
      </div>
    );
  }

  const records = (formRecords as CcpFormRecord[] | undefined) ?? [];

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 gap-3">
        <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
          <Zap className="h-7 w-7 text-blue-500" />
        </div>
        <p className="text-sm font-semibold">CCP 모니터링 기록지가 없습니다</p>
        <p className="text-xs text-muted-foreground">
          CCP 인스턴스를 기반으로 공식 기록지를 생성하세요.
        </p>
        <Button onClick={handleCreateForms} disabled={getOrCreateMutation.isPending}
          className="mt-1">
          {getOrCreateMutation.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />생성 중...</>
          ) : (
            <><Plus className="h-4 w-4 mr-2" />CCP 기록지 생성</>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 도움말 */}
      <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded text-xs text-green-800">
        <Calculator className="h-4 w-4 flex-shrink-0 mt-0.5 text-green-600" />
        <div>
          <strong>배치수 자동계산:</strong> BOM 배치목표량(kg) ÷ 계획생산량(kg) = 배치수
          <br />
          <strong>설비 순차할당:</strong> 배치1→설비1, 배치2→설비2, 배치3→설비3 (순환)
          <br />
          <strong>굽기/증숙 공정:</strong> 설비기준에서 시루(교반기/증숙기)가 표시됩니다.
        </div>
      </div>

      {/* CCP 기록지 패널 목록 */}
      {records.map((record) => {
        // 해당 기록지의 행 데이터는 별도 쿼리 필요 (현재는 formRecord 안에 없음)
        return (
          <CcpFormPanelWrapper
            key={record.id}
            formRecord={record}
            batchId={batchId}
            productId={productId}
            plannedQtyKg={plannedQtyKg}
            equipmentGroups={equipmentGroups as any}
            onRefresh={handleRefresh}
          />
        );
      })}

      {/* 기록지 추가 / 행 재동기화 버튼 */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleCreateForms}
          disabled={getOrCreateMutation.isPending} className="flex-1 text-xs">
          <RefreshCw className="h-3 w-3 mr-1" />
          기록지 동기화 (CCP 인스턴스 기반)
        </Button>
        <Button variant="outline" size="sm" onClick={() => resyncRowsMutation.mutate({ batchId })}
          disabled={resyncRowsMutation.isPending} className="flex-1 text-xs text-orange-600 border-orange-300 hover:bg-orange-50">
          {resyncRowsMutation.isPending ? (
            <><Loader2 className="h-3 w-3 animate-spin mr-1" />재동기화 중...</>
          ) : (
            <><Wrench className="h-3 w-3 mr-1" />배치행 재생성 (배치수 변경 시)</>
          )}
        </Button>
      </div>
    </div>
  );
}

// 기록지 래퍼 (행 데이터 별도 조회)
function CcpFormPanelWrapper({
  formRecord, batchId, productId, plannedQtyKg, equipmentGroups, onRefresh,
}: {
  formRecord: CcpFormRecord;
  batchId: number;
  productId?: number;
  plannedQtyKg?: number;
  equipmentGroups: any[];
  onRefresh: () => void;
}) {
  const { data: fullRecord, refetch } = trpc.ccpForm.getById.useQuery(
    { id: formRecord.id }, { enabled: !!formRecord.id }
  );
  const rows: CcpFormRow[] = (fullRecord as any)?.rows ?? [];

  const handleRefresh = () => { refetch(); onRefresh(); };

  return (
    <CcpFormPanel
      formRecord={formRecord}
      rows={rows}
      batchId={batchId}
      productId={productId}
      plannedQtyKg={plannedQtyKg}
      equipmentGroups={equipmentGroups}
      onRefresh={handleRefresh}
    />
  );
}
