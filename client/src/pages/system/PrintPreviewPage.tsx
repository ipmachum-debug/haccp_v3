/**
 * 통합 인쇄 프리뷰 페이지
 * - daily_log: 5페이지 분할 렌더링
 * - 직인: formData.approval 우선, 바로승인 시 검토자 직인도 표시
 * - employee_health_check 전용 렌더러
 *
 * Render functions are split into:
 *   - @/components/print/PrintHelpers      (shared constants, ApprovalHeader, renderRowsTable)
 *   - @/components/print/DailyLogRenderers  (renderDailyLogPages + sub-renderers)
 *   - @/components/print/ChecklistRenderers (renderChecklistItems, renderPersonalHygieneCheck, etc.)
 *   - @/components/print/CcpRenderers       (renderCcpBatchSummary, renderCcpFormRecord)
 *   - @/components/print/renderFormContent  (renderFormContent dispatcher + renderGenericData)
 */
import React, { useEffect, useState, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { FORM_TYPE_LABELS, DAILY_LOG_PAGE_TITLES, ApprovalHeader } from "@/components/print/PrintHelpers";
import { renderDailyLogPages } from "@/components/print/DailyLogRenderers";
import { renderWeeklyLogPages, renderYearlyLog } from "@/components/print/WeeklyYearlyRenderers";
import { renderCcpBatchSummary, renderCcpFormRecord } from "@/components/print/CcpRenderers";
import { renderFormContent } from "@/components/print/renderFormContent";

// ============================================================================
// 메인 컴포넌트
// ============================================================================
export default function PrintPreviewPage() {
  const ids = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const idsParam = params.get("ids");
    return idsParam ? idsParam.split(",").map(Number).filter(Boolean) : [];
  }, []);

  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const printTriggered = useRef(false);

  // ★ 성능 개선: 전체 목록(수천 건) 대신 필요한 ID만 조회
  const { data: approvedRequests = [], isLoading: isApprovalLoading } = trpc.approval.listByIds.useQuery(
    { ids },
    { enabled: ids.length > 0 }
  );
  const { data: employees = [] } = trpc.organization.employees.list.useQuery();
  const { data: allApprovalSettings = [] } = trpc.organization.approvalSettings.list.useQuery();
  const trpcUtils = trpc.useUtils();

  const reviewerEmployee = useMemo(() => (employees as any[]).find((e: any) => e.approvalRole === "reviewer" && e.isActive === 1), [employees]);
  const approverEmployee = useMemo(() => (employees as any[]).find((e: any) => e.approvalRole === "approver" && e.isActive === 1), [employees]);

  // 문서 유형별 결재 설정에서 이름 조회 헬퍼
  const getApprovalSettingNames = (formType: string) => {
    const setting = (allApprovalSettings as any[]).find((s: any) => s.documentType === formType);
    if (!setting) return null;
    const empList = employees as any[];
    const author = empList.find((e: any) => e.id === setting.authorEmployeeId);
    const reviewer = empList.find((e: any) => e.id === setting.reviewerEmployeeId);
    const approver = empList.find((e: any) => e.id === setting.approverEmployeeId);
    return {
      authorName: author?.name || "",
      reviewerName: reviewer?.name || "",
      approverName: approver?.name || "",
    };
  };

  useEffect(() => {
    const loadDocuments = async () => {
      // IDs가 없으면 로딩 종료
      if (ids.length === 0) {
        setLoading(false);
        return;
      }
      // 승인 목록 로딩 중이면 대기
      if (isApprovalLoading) return;
      // 승인 목록이 비어있으면 로딩 종료
      if (approvedRequests.length === 0) {
        setLoading(false);
        return;
      }
      const docs: any[] = [];
      for (const id of ids) {
        const request = (approvedRequests as any[]).find((r: any) => r.id === id);
        if (!request) continue;
        let formData = null;
        let formType = request.requestType || "";

        // ── batch_plan (일괄 배치 그룹): referenceId = 첫 배치ID → 그룹 내 모든 배치 CCP 기록지 조회
        if (request.requestType === "batch_plan" && request.referenceId) {
          try {
            const ccpRecords = await trpcUtils.ccpForm.getByBatchGroup.fetch({ batchId: Number(request.referenceId), includeRows: true });
            formData = { ccpFormRecords: ccpRecords || [], batchId: request.referenceId };
            formType = "batch_production";
          } catch (e) { console.error("배치 그룹 CCP 기록지 조회 오류:", e); }
        }
        // ── batch_production / batch_approval: CCP 기록지 전용 처리
        //    referenceId = 배치ID → genericChecklist가 아닌 ccpForm.getByBatch 사용
        else if (
          (request.requestType === "batch_production" || request.requestType === "batch_approval") &&
          request.referenceId
        ) {
          try {
            const ccpRecords = await trpcUtils.ccpForm.getByBatch.fetch({ batchId: Number(request.referenceId), includeRows: true });
            formData = { ccpFormRecords: ccpRecords || [], batchId: request.referenceId };
            formType = "batch_production";
          } catch (e) { console.error("CCP 기록지 조회 오류:", e); }
        }
        // ── ccp_form: CCP 기록지 단건 (referenceId = h_ccp_form_records.id)
        else if (request.requestType === "ccp_form" && request.referenceId) {
          try {
            const ccpRecord = await trpcUtils.ccpForm.getById.fetch({ id: Number(request.referenceId) });
            formData = { ccpFormRecord: ccpRecord, batchId: ccpRecord?.record?.batchId };
            formType = "ccp_form";
          } catch (e) { console.error("CCP 기록지 단건 조회 오류:", e); }
        }
        // ── visual_inspection: 육안검사일지 (referenceId = h_visual_inspection_logs.id)
        else if (request.requestType === "visual_inspection" && request.referenceId) {
          try {
            const log = await (trpcUtils as any).visualInspection.getById.fetch({ id: Number(request.referenceId) });
            formData = log;
            formType = "visual_inspection";
          } catch (e) { console.error("육안검사일지 조회 오류:", e); }
        }
        // ── finished_product_inspection: 완제품 출고검사일지 (referenceId = h_finished_product_inspection_logs.id)
        else if (request.requestType === "finished_product_inspection" && request.referenceId) {
          try {
            const log = await (trpcUtils as any).finishedProductInspection.getById.fetch({ id: Number(request.referenceId) });
            formData = log;
            formType = "finished_product_inspection";
          } catch (e) { console.error("완제품 출고검사일지 조회 오류:", e); }
        }
        // ── production_daily: 생산일지 (referenceId = h_daily_reports.id)
        else if (request.requestType === "production_daily" && request.referenceId) {
          try {
            const report = await (trpcUtils as any).dailyReport.getReportById.fetch({ id: Number(request.referenceId) });
            formData = report?.summary || report;
            formType = "production_daily";
          } catch (e) { console.error("생산일지 조회 오류:", e); }
        }
        // ── material_usage_report: 원료수불 보고서 (referenceId = material_usage_reports.id)
        else if (request.requestType === "material_usage_report" && request.referenceId) {
          try {
            const report = await (trpcUtils as any).materialLedger.getReportById.fetch({ id: Number(request.referenceId) });
            formData = report;
            formType = "material_usage_report";
          } catch (e) { console.error("원료수불 보고서 조회 오류:", e); }
        }
        // ── 그 외: genericChecklist (일일일지, 위생체크리스트 등)
        //    단, referenceType이 'batch'가 아닐 때만 조회 (배치ID 오조회 방지)
        else if (request.referenceId && request.referenceType !== "batch" && request.referenceType !== "batch_group") {
          try {
            const record = await trpcUtils.genericChecklist.getById.fetch({ id: request.referenceId });
            let rawFormData = record?.formData || (record as any)?.data || record;
            if (typeof rawFormData === "string") {
              try { rawFormData = JSON.parse(rawFormData); } catch (_) {}
            }
            formData = rawFormData;
            formType = record?.formType || request.requestType || "";
          } catch (e) { console.error("폼 데이터 조회 오류:", e); }
        }

        docs.push({ ...request, formData, formType });
      }
      setDocuments(docs);
      setLoading(false);
    };
    loadDocuments();
  }, [ids.length, approvedRequests.length, isApprovalLoading]);

  useEffect(() => {
    if (!loading && documents.length > 0 && !printTriggered.current) {
      printTriggered.current = true;
      setTimeout(() => window.print(), 800);
    }
  }, [loading, documents.length]);

  // ── allPages 구성을 useMemo로 이동 (조건부 return 전에 모든 hook 호출 필수) ──
  const allPages = useMemo(() => {
    if (loading || documents.length === 0) return [];
    const pages: { doc: any; pageContent: React.ReactNode; pageTitle: string; pageIndex: number; totalPages: number }[] = [];

    documents.forEach((doc) => {
      const approval = doc.formData?.approval || {};
      const settingNames = getApprovalSettingNames(doc.formType || doc.requestType || "");
      const authorName = approval.writerName || settingNames?.authorName || doc.formData?.inspector || doc.formData?.author || doc.formData?.writer || doc.requester?.name || "";
      const reviewerName = approval.reviewerName || settingNames?.reviewerName || doc.reviewer?.name || reviewerEmployee?.name || "";
      const approverName = approval.approverName || settingNames?.approverName || doc.approver?.name || approverEmployee?.name || "";
      const toDateStr = (v: any): string | undefined => {
        if (!v) return undefined;
        if (v instanceof Date) return v.toISOString();
        if (typeof v === "string") return v;
        return String(v);
      };
      const requestedAt = toDateStr(doc.requestedAt);
      const reviewedAt = toDateStr(doc.reviewedAt) || (doc.approvedAt && reviewerName ? toDateStr(doc.approvedAt) : undefined);
      const approvedAt = toDateStr(doc.approvedAt);
      const safeDocDates = {
        requestedAt,
        reviewedAt,
        approvedAt,
        createdAt: toDateStr(doc.createdAt),
        updatedAt: toDateStr(doc.updatedAt),
      };

      if (doc.formType === "daily_log") {
        const enrichedDoc = { ...doc, ...safeDocDates, authorName, reviewerName, approverName };
        const dailyPages = renderDailyLogPages(doc.formData, enrichedDoc);
        dailyPages.forEach((pageContent, idx) => {
          pages.push({
            doc: enrichedDoc,
            pageContent,
            pageTitle: DAILY_LOG_PAGE_TITLES[idx] || `일일일지 ${idx + 1}`,
            pageIndex: idx,
            totalPages: dailyPages.length,
          });
        });
      } else if (doc.formType === "weekly_log") {
        const weeklyEnrichedDoc = { ...doc, ...safeDocDates, authorName, reviewerName, approverName };
        const weeklyPages = renderWeeklyLogPages(doc.formData, weeklyEnrichedDoc);
        const weeklyPageTitles = ["일반위생관리 점검표 (주간)", "방충·방서관리 점검표 (주간)"];
        weeklyPages.forEach((pageContent, idx) => {
          pages.push({
            doc: weeklyEnrichedDoc,
            pageContent,
            pageTitle: weeklyPageTitles[idx] || `주간일지 ${idx + 1}`,
            pageIndex: idx,
            totalPages: weeklyPages.length,
          });
        });
      } else if (doc.formType === "yearly_log") {
        const yearlyEnrichedDoc = { ...doc, ...safeDocDates, authorName, reviewerName, approverName };
        pages.push({
          doc: yearlyEnrichedDoc,
          pageContent: renderYearlyLog(doc.formData, yearlyEnrichedDoc),
          pageTitle: `연간 검교정 점검표 - ${doc.formData?.year || ""}년`,
          pageIndex: 0,
          totalPages: 1,
        });
      } else if (doc.formType === "batch_production" || doc.formType === "batch_approval") {
        const ccpRecords: any[] = doc.formData?.ccpFormRecords || [];
        if (ccpRecords.length === 0) {
          pages.push({
            doc: { ...doc, ...safeDocDates, authorName, reviewerName, approverName },
            pageContent: renderCcpBatchSummary(doc),
            pageTitle: `배치 CCP 기록지 - ${doc.title || ""}`,
            pageIndex: 0,
            totalPages: 1,
          });
        } else {
          // ★ CCP-4P(금속검출)는 별도 승인문서로 출력되므로 배치 CCP 인쇄에서 제외
          const filteredRecords = ccpRecords.filter((fr: any) => {
            const t = fr.ccpType || fr.ccp_type || "";
            return t !== "CCP-4P";
          });

          if (filteredRecords.length === 0) {
            // CCP-4P만 있고 나머지가 없는 경우 (이론상 드묾)
            pages.push({
              doc: { ...doc, ...safeDocDates, authorName, reviewerName, approverName },
              pageContent: renderCcpBatchSummary(doc),
              pageTitle: `배치 CCP 기록지 - ${doc.title || ""}`,
              pageIndex: 0,
              totalPages: 1,
            });
          } else {
            const enrichedDoc = { ...doc, ...safeDocDates, authorName, reviewerName, approverName };
            // ★ 각 CCP 기록지(제품별)를 개별 페이지로 생성 (page-break 자동 적용)
            filteredRecords.forEach((fr: any, idx: number) => {
              const ccpType = fr.ccpType || fr.ccp_type || "";
              const pName = fr.productName || fr.product_name || "";
              const gName = fr.processGroupName || fr.process_group_name || "";
              pages.push({
                doc: enrichedDoc,
                pageContent: renderCcpFormRecord(fr, enrichedDoc),
                pageTitle: `CCP 기록지 - ${ccpType} ${pName} (${gName})`,
                pageIndex: idx,
                totalPages: filteredRecords.length,
              });
            });
          }
        }
      } else if (doc.formType === "ccp_form") {
        const fr = doc.formData?.ccpFormRecord;
        const frData = fr?.record ? { ...fr.record, rows: fr.rows || [] } : fr;
        const enrichedDocSingle = { ...doc, ...safeDocDates, authorName, reviewerName, approverName };
        pages.push({
          doc: enrichedDocSingle,
          pageContent: renderCcpFormRecord(frData, enrichedDocSingle),
          pageTitle: `CCP 기록지 - ${fr?.record?.ccpType || ""}`,
          pageIndex: 0,
          totalPages: 1,
        });
      } else {
        const genericEnrichedDoc = { ...doc, ...safeDocDates, authorName, reviewerName, approverName };
        pages.push({
          doc: genericEnrichedDoc,
          pageContent: renderFormContent(doc.formData, doc.formType, genericEnrichedDoc),
          pageTitle: FORM_TYPE_LABELS[doc.formType] || doc.title || doc.requestType || "체크리스트",
          pageIndex: 0,
          totalPages: 1,
        });
      }
    });
    return pages;
  }, [loading, documents, allApprovalSettings, employees, reviewerEmployee, approverEmployee]);

  // ── PDF 저장 시 파일명 자동 생성 (document.title → 브라우저 PDF 파일명) ──
  useEffect(() => {
    if (allPages.length === 0) return;

    const generatePdfTitle = () => {
      const firstDoc = documents[0];
      if (!firstDoc) return "HACCP_문서";
      const formType = firstDoc.formType || firstDoc.requestType || "";
      const titleLabel = FORM_TYPE_LABELS[formType] || firstDoc.title || formType;
      const fd = firstDoc.formData || {};
      let dateStr = fd.date || fd.workDate || fd.checkDate || fd.inspectionDate || fd.formDate || "";
      if (!dateStr && firstDoc.requestedAt) {
        const d = firstDoc.requestedAt instanceof Date ? firstDoc.requestedAt : new Date(firstDoc.requestedAt);
        if (!isNaN(d.getTime())) dateStr = d.toISOString().split("T")[0];
      }
      const datePart = dateStr ? `_${dateStr.replace(/\//g, "-")}` : "";
      let productPart = "";
      if (["batch_production", "batch_approval", "ccp_form"].includes(formType)) {
        const ccpRecords = fd.ccpFormRecords || [];
        const ccpRecord = fd.ccpFormRecord?.record || fd.ccpFormRecord;
        const productName = ccpRecords[0]?.productName || ccpRecords[0]?.product_name
          || ccpRecord?.productName || ccpRecord?.product_name
          || fd.productName || "";
        if (productName) productPart = `_${productName}`;
      }
      const countPart = documents.length > 1 ? `_외${documents.length - 1}건` : "";
      return `${titleLabel}${datePart}${productPart}${countPart}`;
    };

    const originalTitle = document.title;
    document.title = generatePdfTitle();
    return () => { document.title = originalTitle; };
  }, [allPages.length, documents]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
        <p className="text-gray-600">문서를 불러오는 중...</p>
      </div>
    </div>
  );

  if (documents.length === 0 && !loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <p className="text-gray-500 text-lg mb-2">
          {ids.length === 0 ? "문서 ID가 지정되지 않았습니다." : "인쇄할 문서가 없습니다."}
        </p>
        <p className="text-gray-400 text-sm mb-4">
          {ids.length === 0
            ? "문서인쇄 관리 페이지에서 승인된 문서를 선택해주세요."
            : "승인된 문서를 찾을 수 없습니다. 문서가 승인되었는지 확인해주세요."}
        </p>
        <button onClick={() => window.close()} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">닫기</button>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .print-page { page-break-after: always; break-after: page; }
          .print-page:last-child { page-break-after: auto; break-after: auto; }
          /* 첫 번째가 아닌 모든 print-page에 page-break-before 강제 */
          .print-page + .print-page { page-break-before: always; break-before: page; }
          /* 테이블 행 단위로 페이지 분할 (행 중간에서 잘리지 않음) */
          table { break-inside: auto; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          thead { display: table-header-group; }
          /* CCP 개선조치 섹션: 한 페이지 안에 유지 */
          .ccp-corrective-section { break-inside: avoid; page-break-inside: avoid; }
          /* CCP 기록지 전체 테이블: 헤더 반복 + 행 보호 */
          .ccp-print-table { break-inside: auto; }
          .ccp-print-table thead { display: table-header-group; }
          .ccp-print-table tr { break-inside: avoid; page-break-inside: avoid; }
          /* 인쇄 양식 헤더(결재란 포함): 페이지 시작 시 유지 */
          .print-header { break-inside: avoid; page-break-inside: avoid; }
          /* 주기/모니터링 방법 섹션: 잘리지 않게 */
          .ccp-info-section { break-inside: avoid; page-break-inside: avoid; }
          .text-xs { font-size: 11px; }
          /* A4 여백 최적화 */
          @page { size: A4; margin: 10mm 10mm 15mm 10mm; }
        }
        @media screen { .print-page { max-width: 210mm; margin: 0 auto 20px; padding: 15mm; box-shadow: 0 2px 8px rgba(0,0,0,0.1); background: white; border: 1px solid #e5e7eb; } }
        /* CCP 테이블 인쇄 미리보기 안정화 */
        .ccp-print-table { table-layout: fixed; width: 100%; }
        .ccp-print-table th, .ccp-print-table td { overflow: hidden; text-overflow: ellipsis; word-break: keep-all; box-sizing: border-box; }
        .ccp-print-table th { white-space: normal; line-height: 1.2; }
        /* 일지/체크리스트 테이블 오버플로우 방지 - auto layout으로 컬럼 폭 자동 배분 */
        .print-page .print-content table { table-layout: auto; width: 100%; }
        .print-page .print-content td, .print-page .print-content th { word-wrap: break-word; overflow-wrap: break-word; box-sizing: border-box; }
        .print-page .print-content td { font-size: 11px; line-height: 1.3; padding: 3px 4px; }
        /* 헤더 영역 결재란 테이블은 고정 폭 유지 */
        .print-page .print-header table { table-layout: auto; width: auto; }
        .print-page .print-header td, .print-page .print-header th { word-break: normal; word-wrap: normal; overflow-wrap: normal; }
        /* CCP 제목 테이블: 글자 단위 줄바꿈 방지 */
        .print-page .print-content table.border-2 td { word-break: keep-all; }
      `}</style>

      <div className="no-print bg-blue-600 text-white p-4 sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-bold text-lg">인쇄 미리보기</h1>
          <span className="text-blue-200">{allPages.length}페이지 ({documents.length}건의 문서)</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="bg-white text-blue-600 px-4 py-2 rounded font-medium hover:bg-blue-50">인쇄하기</button>
          <button onClick={() => window.close()} className="bg-blue-500 text-white px-4 py-2 rounded font-medium hover:bg-blue-400">닫기</button>
        </div>
      </div>

      <div className="bg-gray-100 min-h-screen p-4 print:p-0 print:bg-white">
        {allPages.map((page, index) => {
          const isCcpForm = ["batch_production", "batch_approval", "ccp_form"].includes(page.doc.formType || "");
          return (
          <div key={index} className="print-page" style={index > 0 ? { pageBreakBefore: 'always', breakBefore: 'page' } : undefined}>
            {/* 결재란은 각 페이지 렌더러 내부 TitleRow에 포함됨 */}
            <div className="print-content mb-2">{page.pageContent}</div>
            <div className="text-center text-xs text-gray-400 mt-4">{index + 1} / {allPages.length}</div>
          </div>
          );
        })}
      </div>
    </>
  );
}
