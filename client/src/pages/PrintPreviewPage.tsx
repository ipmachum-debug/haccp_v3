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

  const { data: approvedRequests = [], isLoading: isApprovalLoading } = trpc.approval.list.useQuery({ status: "approved" });
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

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
        <p className="text-gray-600">문서를 불러오는 중...</p>
      </div>
    </div>
  );

  if (documents.length === 0) return (
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

  // 문서 목록을 페이지 단위로 펼침 (daily_log는 5페이지)
  const allPages: { doc: any; pageContent: React.ReactNode; pageTitle: string; pageIndex: number; totalPages: number }[] = [];

  documents.forEach((doc) => {
    const approval = doc.formData?.approval || {};
    // 우선순위: formData.approval > 대시보드 결재 설정 > approvalRole > 요청자/승인자
    const settingNames = getApprovalSettingNames(doc.formType || doc.requestType || "");
    const authorName = approval.writerName || settingNames?.authorName || doc.formData?.inspector || doc.formData?.author || doc.formData?.writer || doc.requester?.name || "";
    const reviewerName = approval.reviewerName || settingNames?.reviewerName || doc.reviewer?.name || reviewerEmployee?.name || "";
    const approverName = approval.approverName || settingNames?.approverName || doc.approver?.name || approverEmployee?.name || "";
    // Date 객체를 string으로 안전 변환 (Drizzle ORM이 timestamp를 Date 객체로 반환)
    const toDateStr = (v: any): string | undefined => {
      if (!v) return undefined;
      if (v instanceof Date) return v.toISOString();
      if (typeof v === "string") return v;
      return String(v);
    };
    const requestedAt = toDateStr(doc.requestedAt);
    const reviewedAt = toDateStr(doc.reviewedAt) || (doc.approvedAt && reviewerName ? toDateStr(doc.approvedAt) : undefined);
    const approvedAt = toDateStr(doc.approvedAt);
    // Date 객체 필드 전체 string 변환 (Drizzle ORM 타임스탬프 → Date 객체 방지)
    const safeDocDates = {
      requestedAt,
      reviewedAt,
      approvedAt,
      createdAt: toDateStr(doc.createdAt),
      updatedAt: toDateStr(doc.updatedAt),
    };

    if (doc.formType === "daily_log") {
      const enrichedDoc = { ...doc, ...safeDocDates, authorName, reviewerName, approverName };
      const pages = renderDailyLogPages(doc.formData, enrichedDoc);
      pages.forEach((pageContent, idx) => {
        allPages.push({
          doc: enrichedDoc,
          pageContent,
          pageTitle: DAILY_LOG_PAGE_TITLES[idx] || `일일일지 ${idx + 1}`,
          pageIndex: idx,
          totalPages: pages.length,
        });
      });
    } else if (doc.formType === "weekly_log") {
      const weeklyEnrichedDoc = { ...doc, ...safeDocDates, authorName, reviewerName, approverName };
      const weeklyPages = renderWeeklyLogPages(doc.formData, weeklyEnrichedDoc);
      const weeklyPageTitles = ["일반위생관리 점검표 (주간)", "방충·방서관리 점검표 (주간)"];
      weeklyPages.forEach((pageContent, idx) => {
        allPages.push({
          doc: weeklyEnrichedDoc,
          pageContent,
          pageTitle: weeklyPageTitles[idx] || `주간일지 ${idx + 1}`,
          pageIndex: idx,
          totalPages: weeklyPages.length,
        });
      });
    } else if (doc.formType === "yearly_log") {
      const yearlyEnrichedDoc = { ...doc, ...safeDocDates, authorName, reviewerName, approverName };
      allPages.push({
        doc: yearlyEnrichedDoc,
        pageContent: renderYearlyLog(doc.formData, yearlyEnrichedDoc),
        pageTitle: `연간 검교정 점검표 - ${doc.formData?.year || ""}년`,
        pageIndex: 0,
        totalPages: 1,
      });
    } else if (doc.formType === "batch_production" || doc.formType === "batch_approval") {
      // CCP 기록지(배치): 같은 CCP 타입은 연속으로 한 페이지에, 타입별 페이지 분리
      const ccpRecords: any[] = doc.formData?.ccpFormRecords || [];
      if (ccpRecords.length === 0) {
        allPages.push({
          doc: { ...doc, ...safeDocDates, authorName, reviewerName, approverName },
          pageContent: renderCcpBatchSummary(doc),
          pageTitle: `배치 CCP 기록지 - ${doc.title || ""}`,
          pageIndex: 0,
          totalPages: 1,
        });
      } else {
        // 같은 CCP 타입끼리 그룹핑하여 연속 렌더링
        const byType: Record<string, any[]> = {};
        ccpRecords.forEach((fr: any) => {
          const t = fr.ccpType || fr.ccp_type || "UNKNOWN";
          if (!byType[t]) byType[t] = [];
          byType[t].push(fr);
        });
        const typeKeys = Object.keys(byType);
        const enrichedDoc = { ...doc, ...safeDocDates, authorName, reviewerName, approverName };
        typeKeys.forEach((ccpType, typeIdx) => {
          const records = byType[ccpType];

          if (ccpType === "CCP-4P" && records.length > 1) {
            // ★ CCP-4P: 하루 모든 배치를 한 페이지에 합산 (금속검출기 공정 = 일일 단위)
            // 모든 form_rows를 합쳐서 하나의 가상 레코드로 만듦
            const allRows: any[] = [];
            for (const fr of records) {
              const rows = fr.rows || [];
              allRows.push(...rows);
            }
            // 시간 기준 정렬 (sensitivity: metal_pass_time, passage: pass_time_start)
            allRows.sort((a: any, b: any) => {
              const typeA = (a.equipmentType || a.equipment_type) || "";
              const typeB = (b.equipmentType || b.equipment_type) || "";
              if (typeA !== typeB) return typeA === "sensitivity" ? -1 : 1;
              const tA = String(a.metalPassTime || a.metal_pass_time || a.passTimeStart || a.pass_time_start || "");
              const tB = String(b.metalPassTime || b.metal_pass_time || b.passTimeStart || b.pass_time_start || "");
              return tA.localeCompare(tB);
            });
            // 첫 번째 레코드의 메타정보를 사용하되 rows를 합산
            const mergedFr = { ...records[0], rows: allRows };
            allPages.push({
              doc: enrichedDoc,
              pageContent: renderCcpFormRecord(mergedFr, enrichedDoc),
              pageTitle: `CCP 기록지 - CCP-4P (금속검출공정)`,
              pageIndex: typeIdx,
              totalPages: typeKeys.length,
            });
          } else {
            // CCP-1B/2B 또는 CCP-4P 단건: 같은 타입의 여러 배치 기록을 하나의 페이지에 연속 렌더링
            const combinedContent = (
              <div>
                {records.map((fr: any, idx: number) => (
                  <div key={idx} className={idx > 0 ? "mt-4" : ""}>
                    {idx > 0 && <hr className="border-gray-400 mb-4" />}
                    {renderCcpFormRecord(fr, enrichedDoc)}
                  </div>
                ))}
              </div>
            );
            const firstFr = records[0];
            allPages.push({
              doc: enrichedDoc,
              pageContent: combinedContent,
              pageTitle: `CCP 기록지 - ${ccpType} (${firstFr.processGroupName || firstFr.process_group_name || ""})`,
              pageIndex: typeIdx,
              totalPages: typeKeys.length,
            });
          }
        });
      }
    } else if (doc.formType === "ccp_form") {
      // CCP 기록지 단건
      const fr = doc.formData?.ccpFormRecord;
      // getById returns { record, rows } — merge rows into the record object
      const frData = fr?.record ? { ...fr.record, rows: fr.rows || [] } : fr;
      const enrichedDocSingle = { ...doc, ...safeDocDates, authorName, reviewerName, approverName };
      allPages.push({
        doc: enrichedDocSingle,
        pageContent: renderCcpFormRecord(frData, enrichedDocSingle),
        pageTitle: `CCP 기록지 - ${fr?.record?.ccpType || ""}`,
        pageIndex: 0,
        totalPages: 1,
      });
    } else {
      const genericEnrichedDoc = { ...doc, ...safeDocDates, authorName, reviewerName, approverName };
      allPages.push({
        doc: genericEnrichedDoc,
        pageContent: renderFormContent(doc.formData, doc.formType, genericEnrichedDoc),
        pageTitle: FORM_TYPE_LABELS[doc.formType] || doc.title || doc.requestType || "체크리스트",
        pageIndex: 0,
        totalPages: 1,
      });
    }
  });

  // ── PDF 저장 시 파일명 자동 생성 (document.title → 브라우저 PDF 파일명) ──
  useEffect(() => {
    if (allPages.length === 0) return;

    const generatePdfTitle = () => {
      const firstDoc = documents[0];
      if (!firstDoc) return "HACCP_문서";

      // 1) 제목: formType 라벨 또는 문서 타이틀
      const formType = firstDoc.formType || firstDoc.requestType || "";
      const titleLabel = FORM_TYPE_LABELS[formType] || firstDoc.title || formType;

      // 2) 날짜: formData.date > formData.workDate > requestedAt
      const fd = firstDoc.formData || {};
      let dateStr = fd.date || fd.workDate || fd.checkDate || fd.inspectionDate || fd.formDate || "";
      if (!dateStr && firstDoc.requestedAt) {
        const d = firstDoc.requestedAt instanceof Date ? firstDoc.requestedAt : new Date(firstDoc.requestedAt);
        if (!isNaN(d.getTime())) dateStr = d.toISOString().split("T")[0];
      }
      const datePart = dateStr ? `_${dateStr.replace(/\//g, "-")}` : "";

      // 3) CCP: 제품명 추가
      let productPart = "";
      if (["batch_production", "batch_approval", "ccp_form"].includes(formType)) {
        const ccpRecords = fd.ccpFormRecords || [];
        const ccpRecord = fd.ccpFormRecord?.record || fd.ccpFormRecord;
        const productName = ccpRecords[0]?.productName || ccpRecords[0]?.product_name
          || ccpRecord?.productName || ccpRecord?.product_name
          || fd.productName || "";
        if (productName) productPart = `_${productName}`;
      }

      // 4) 여러 문서 선택 시 건수 표시
      const countPart = documents.length > 1 ? `_외${documents.length - 1}건` : "";

      return `${titleLabel}${datePart}${productPart}${countPart}`;
    };

    const originalTitle = document.title;
    document.title = generatePdfTitle();
    return () => { document.title = originalTitle; };
  }, [allPages.length, documents]);

  return (
    <>
      <style>{`
        @media print { body { margin: 0; padding: 0; } .no-print { display: none !important; } .print-page { page-break-after: always; } .print-page:last-child { page-break-after: auto; } table { break-inside: auto; } tr { break-inside: avoid; } thead { display: table-header-group; } .ccp-corrective-section { break-inside: avoid; page-break-inside: avoid; } .text-xs { font-size: 11px; } }
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
          <div key={index} className="print-page">
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
