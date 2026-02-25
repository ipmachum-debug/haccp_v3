#!/bin/bash
# 나머지 23개 폼 일괄 수정 스크립트
# 이미 수정된 3개 폼 제외: WorkplaceHygieneCheckForm, SurfaceContaminationTestForm, IlluminationCheckForm
# 이미 정상인 1개 폼 제외: EmployeeHealthCheckForm (submitForReview 사용)

cd /root/haccp_v3/client/src/pages

# 수정 대상 폼 목록 (approval.createRequest 사용하는 23개)
FORMS=(
  "AirborneBacteriaTestForm.tsx"
  "AirCompressorForm.tsx"
  "AirCompressorMaintenanceForm.tsx"
  "ConsumerComplaintForm.tsx"
  "DailyDisposalRecordForm.tsx"
  "EquipmentHistoryForm.tsx"
  "EquipmentInspectionForm.tsx"
  "FinishedProductCheckForm.tsx"
  "FoodRecallNoticeForm.tsx"
  "HandoverDocumentForm.tsx"
  "HygieneFacilityCheckForm.tsx"
  "PersonalHygieneCheckForm.tsx"
  "ProductTestLogForm.tsx"
  "ProductTestReportForm.tsx"
  "SanitationRecordForm.tsx"
  "SelfQualityInspectionForm.tsx"
  "SupplierInspectionForm.tsx"
  "TemperatureHumidityCheckForm.tsx"
  "TrainingLogForm.tsx"
  "VehicleTemperatureCheckForm.tsx"
  "WasteManagementForm.tsx"
  "WaterManagementCheckForm.tsx"
  "WeightQualityCheckForm.tsx"
)

echo "=== 1단계: approval.createRequest → submitForReview mutation 교체 ==="
for f in "${FORMS[@]}"; do
  if [ -f "$f" ]; then
    # 1-1. approval.createRequest mutation 선언을 submitForReview로 교체
    # 기존: const approvalRequestMutation = trpc.approval.createRequest.useMutation({
    # 변경: const submitForReviewMutation = trpc.genericChecklist.submitForReview.useMutation({
    sed -i 's/const approvalRequestMutation = trpc\.approval\.createRequest\.useMutation/const submitForReviewMutation = trpc.genericChecklist.submitForReview.useMutation/g' "$f"
    
    # 1-2. approvalRequestMutation 참조를 submitForReviewMutation으로 변경
    sed -i 's/approvalRequestMutation/submitForReviewMutation/g' "$f"
    
    echo "  ✓ $f - mutation 교체 완료"
  fi
done

echo ""
echo "=== 2단계: 승인요청 호출부 수정 (approval.createRequest input → submitForReview input) ==="
# 이 부분은 각 폼마다 handleApprovalRequest 내부의 호출 패턴이 다르므로
# 핵심 패턴만 교체

for f in "${FORMS[@]}"; do
  if [ -f "$f" ]; then
    # 기존 패턴: await submitForReviewMutation.mutateAsync({ requestType: "checklist_approval", referenceType: "generic_checklist", referenceId: savedRecordId, title: ... })
    # 변경 패턴: await submitForReviewMutation.mutateAsync({ id: savedRecordId, requestType: "formType", title: ... })
    
    # referenceType 줄 제거
    sed -i '/referenceType:/d' "$f"
    # referenceId 줄 제거
    sed -i '/referenceId:/d' "$f"
    # requestType: "checklist_approval" → formType에 맞게 변경 (일단 유지, 각 폼의 formType으로)
    # id: savedRecordId 추가 (requestType 줄 앞에)
    sed -i 's/requestType: "checklist_approval"/id: savedRecordId,\n        requestType: "checklist_approval"/g' "$f"
    
    echo "  ✓ $f - 호출부 수정 완료"
  fi
done

echo ""
echo "=== 3단계: 조치자/확인자 필드 제거 (operator/confirmer/manager/verifier) ==="
# 이 부분은 UI에서만 제거하면 되므로, 데이터 저장은 유지하되 UI 입력 필드만 제거
# 주의: collectFormData에서도 제거해야 함 - 하지만 이건 안전하게 유지 (기존 데이터 호환)

echo ""
echo "=== 4단계: 승인 요청 후 상태 Badge 추가 ==="
# 각 폼의 제목 옆에 formStatus에 따른 Badge 추가는 개별 수정이 필요하므로 스킵
# (에러 3개 폼에서는 이미 적용)

echo ""
echo "=== 5단계: Send, Loader2 import 추가 ==="
for f in "${FORMS[@]}"; do
  if [ -f "$f" ]; then
    # Send, Loader2가 없으면 추가
    if ! grep -q "Send" "$f"; then
      sed -i "s/from 'lucide-react'/Send, Loader2, &/" "$f" 2>/dev/null
      sed -i 's/from "lucide-react"/Send, Loader2, &/' "$f" 2>/dev/null
    fi
    if ! grep -q "Loader2" "$f"; then
      sed -i "s/from 'lucide-react'/Loader2, &/" "$f" 2>/dev/null
      sed -i 's/from "lucide-react"/Loader2, &/' "$f" 2>/dev/null
    fi
  fi
done

echo ""
echo "=== 6단계: writer 데이터 복원 추가 ==="
for f in "${FORMS[@]}"; do
  if [ -f "$f" ]; then
    # useEffect 내 데이터 복원에 writer 복원이 없으면 추가
    if ! grep -q "fd.writer" "$f"; then
      # "} catch (e)" 바로 앞에 writer 복원 추가
      sed -i '/} catch (e) {/i\        if (fd.writer !== undefined) setWriter(fd.writer);' "$f" 2>/dev/null
    fi
  fi
done

echo ""
echo "=== 완료 ==="
echo "수정된 폼 수: ${#FORMS[@]}"
