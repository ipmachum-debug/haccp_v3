/**
 * 스캔 체크리스트 업로드 페이지
 * 수기 체크리스트 사진/PDF → OCR → JSON → 확인/수정 → 저장
 * 테넌트별 양식 자동 참조
 */
import { useState, useRef } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Upload, Camera, FileText, Loader2, CheckCircle2, Edit3,
  Trash2, Eye, AlertCircle, Scan, ArrowRight, XCircle, RefreshCw
} from "lucide-react";

// PR-AJ-2026-05-27 BUILD_TAG — enhancedOcrAndStructure catch에 키 진단 주입
const BUILD_TAG = "PR-AJ-2026-05-27";

const checklistTypes = [
  { value: "purchase_invoice", label: "💰 매입전표/세금계산서" },
  { value: "ccp_1b", label: "🔴 CCP-1B 가열(증숙) 기록" },
  { value: "ccp_2b", label: "🔴 CCP-2B 가열(굽기) 기록" },
  { value: "ccp_4p", label: "🔴 CCP-4P 금속검출 기록" },
  { value: "ccp_record", label: "🔴 CCP 기록지 (범용)" },
  { value: "training_log", label: "📖 교육훈련일지" },
  { value: "material_inspection", label: "🔍 원재료 입고검사" },
  { value: "hygiene_inspection", label: "🔍 위생검사" },
  { value: "shipping_inspection", label: "🔍 출하검사" },
  { value: "personal_hygiene", label: "개인위생점검" },
  { value: "temperature_humidity", label: "온습도점검" },
  { value: "equipment_cleaning", label: "설비세정기록" },
  { value: "water_quality", label: "수질검사" },
  { value: "refrigeration", label: "냉동점검" },
  { value: "packaging_storage", label: "포장보관기록" },
  { value: "foreign_material", label: "이물질기록" },
  { value: "surface_contamination", label: "표면오염검사" },
  { value: "general", label: "일반 체크리스트" },
];

type Step = "upload" | "processing" | "preview" | "done" | "error";

interface OcrErrorInfo {
  stage: "upload" | "process" | "unknown";
  message: string;
  httpStatus?: number | null;
  trpcCode?: string | null;
  rawError?: string;
  hint?: string;
  durationMs?: number;
  fileName?: string;
  fileSizeKB?: number;
}

export default function ScanChecklistUpload() {
  const [step, setStep] = useState<Step>("upload");
  const [checklistType, setChecklistType] = useState("general");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadKey, setUploadKey] = useState<string>("");
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [editData, setEditData] = useState<any>(null);
  const [errorInfo, setErrorInfo] = useState<OcrErrorInfo | null>(null);
  const [processingStage, setProcessingStage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.scanChecklist.upload.useMutation();
  const processMutation = trpc.scanChecklist.process.useMutation();
  const confirmMutation = trpc.scanChecklist.confirm.useMutation();

  // 파일 선택
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("파일 크기는 20MB 이하만 가능합니다.");
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  // 업로드 + OCR 처리
  const handleUploadAndProcess = async () => {
    if (!selectedFile) return;

    const startTime = Date.now();
    setStep("processing");
    setErrorInfo(null);
    setProcessingStage("파일을 Base64로 변환 중...");

    let currentStage: "upload" | "process" = "upload";

    try {
      // 1. Base64 변환 + 업로드 (청크 방식 - 대용량 파일 지원)
      const buffer = await selectedFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      const base64SizeKB = Math.round(base64.length / 1024);

      setProcessingStage(`서버에 파일 업로드 중... (${base64SizeKB}KB)`);

      currentStage = "upload";
      const uploadResult = await uploadMutation.mutateAsync({
        fileName: selectedFile.name,
        fileBase64: base64,
        checklistType,
      });

      setUploadKey(uploadResult.key);
      setProcessingStage("AI가 체크리스트를 분석 중...");

      // 2. OCR 처리
      currentStage = "process";
      const ocrRes = await processMutation.mutateAsync({
        key: uploadResult.key,
        checklistType,
      });

      setOcrResult(ocrRes);
      setEditData(ocrRes.structuredData);
      setStep("preview");
      toast.success(`OCR 완료! 신뢰도 ${Math.round(ocrRes.confidence * 100)}%`);
    } catch (e: any) {
      // ─── PR-AH: 자동 리셋 제거. 에러 화면에 영구적으로 표시 ───
      const durationMs = Date.now() - startTime;

      // tRPC 에러 구조 파싱
      const httpStatus: number | null =
        e?.data?.httpStatus ?? e?.shape?.data?.httpStatus ?? null;
      const trpcCode: string | null =
        e?.data?.code ?? e?.shape?.data?.code ?? null;
      const rawMessage: string = e?.message || String(e);

      // 원인 추정 힌트
      let hint = "";
      if (rawMessage.includes("401") && rawMessage.includes("no body")) {
        hint =
          "⚠️ 서버에서 응답 본문 없이 에러가 반환되었습니다. " +
          "OCR 처리 중 서버 측 예외(500) 또는 인프라(nginx/Cloudflare) 차단일 가능성이 높습니다. " +
          "서버 로그를 확인하거나 더 작은 파일로 재시도해주세요.";
      } else if (httpStatus === 413 || rawMessage.toLowerCase().includes("payload too large")) {
        hint = "파일이 너무 큽니다. 20MB 이하로 줄여서 다시 시도해주세요.";
      } else if (httpStatus === 504 || rawMessage.toLowerCase().includes("timeout")) {
        hint =
          "OCR 처리가 시간 제한을 초과했습니다. " +
          "PDF 페이지 수가 많거나 이미지가 매우 크면 발생합니다. 더 작은 파일로 재시도해주세요.";
      } else if (httpStatus === 500 || trpcCode === "INTERNAL_SERVER_ERROR") {
        hint =
          "서버에서 OCR 처리 중 오류가 발생했습니다. " +
          "PDF 손상, OpenAI API 한도 초과, 또는 pdftoppm 변환 실패 등이 원인일 수 있습니다.";
      } else if (httpStatus === 401 || httpStatus === 403 || trpcCode === "UNAUTHORIZED") {
        hint = "인증이 만료되었습니다. 페이지를 새로고침 후 다시 로그인해주세요.";
      }

      const info: OcrErrorInfo = {
        stage: currentStage,
        message: rawMessage,
        httpStatus,
        trpcCode,
        rawError: JSON.stringify({
          message: e?.message,
          data: e?.data,
          shape: e?.shape,
        }, null, 2).slice(0, 2000),
        hint,
        durationMs,
        fileName: selectedFile?.name,
        fileSizeKB: Math.round((selectedFile?.size || 0) / 1024),
      };

      setErrorInfo(info);
      setStep("error");
      toast.error("처리 실패 — 화면의 진단 정보를 확인해주세요.");
      // 콘솔에도 전체 에러 객체 dump
      // eslint-disable-next-line no-console
      console.error(`[ScanChecklist ${BUILD_TAG}] ${currentStage} 단계 실패`, {
        info,
        rawError: e,
      });
    } finally {
      setProcessingStage("");
    }
  };

  // 확인 후 저장
  const [mappingResult, setMappingResult] = useState<any>(null);

  const handleConfirm = async () => {
    if (!editData) return;

    try {
      const result = await confirmMutation.mutateAsync({
        key: uploadKey,
        checklistType,
        formData: editData,
        deleteAfterSave: true,
      });

      setMappingResult(result);
      toast.success(result.message);
      setStep("done");
    } catch (e: any) {
      toast.error("저장 실패: " + e.message);
    }
  };

  // 초기화
  const handleReset = () => {
    setStep("upload");
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadKey("");
    setOcrResult(null);
    setEditData(null);
    setErrorInfo(null);
    setProcessingStage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 에러 상태에서 동일 파일 재시도
  const handleRetry = () => {
    setErrorInfo(null);
    if (selectedFile) {
      handleUploadAndProcess();
    } else {
      setStep("upload");
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-5">
        {/* 헤더 */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Scan className="h-5 w-5 text-violet-600" />
            스캔 체크리스트 입력
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">수기 체크리스트를 촬영/스캔하여 자동 입력합니다</p>
        </div>

        {/* 진행 단계 표시 */}
        <div className="flex items-center gap-2 text-xs">
          {["업로드", "OCR 처리", "확인/수정", "완료"].map((s, i) => {
            const stepMap: Step[] = ["upload", "processing", "preview", "done"];
            const isActive = step !== "error" && stepMap.indexOf(step) >= i;
            const isErrorStep = step === "error" && ((errorInfo?.stage === "upload" && i === 0) || (errorInfo?.stage === "process" && i === 1));
            return (
              <div key={s} className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full font-bold ${
                  isErrorStep ? "bg-red-100 text-red-700" :
                  isActive ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-400"
                }`}>
                  {i + 1}. {s}
                </span>
                {i < 3 && <ArrowRight className="h-3 w-3 text-gray-300" />}
              </div>
            );
          })}
        </div>

        {/* ═══ STEP 1: 업로드 ═══ */}
        {step === "upload" && (
          <div className="space-y-4">
            {/* 체크리스트 종류 선택 */}
            <div className="bg-white rounded-xl border p-5 shadow-sm space-y-4">
              <div>
                <Label className="text-sm font-bold">체크리스트 종류</Label>
                <Select value={checklistType} onValueChange={setChecklistType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {checklistTypes.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400 mt-1">종류를 선택하면 AI가 해당 양식에 맞춰 더 정확하게 인식합니다</p>
              </div>

              {/* 파일 업로드 영역 */}
              <div>
                <Label className="text-sm font-bold">스캔 파일</Label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1 border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-all"
                >
                  {selectedFile ? (
                    <div className="space-y-2">
                      {previewUrl && selectedFile.type.startsWith("image/") && (
                        <img src={previewUrl} alt="미리보기" className="max-h-48 mx-auto rounded-lg shadow" />
                      )}
                      <p className="text-sm font-medium text-gray-700">{selectedFile.name}</p>
                      <p className="text-xs text-gray-400">{Math.round(selectedFile.size / 1024)}KB</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-16 h-16 mx-auto bg-gray-100 rounded-2xl flex items-center justify-center">
                        <Camera className="h-8 w-8 text-gray-400" />
                      </div>
                      <p className="text-sm text-gray-500 font-medium">클릭하여 파일을 선택하거나 촬영하세요</p>
                      <p className="text-xs text-gray-400">JPG, PNG, PDF (최대 20MB)</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {selectedFile && (
                <Button onClick={handleUploadAndProcess} className="w-full h-11 bg-violet-600 hover:bg-violet-700">
                  <Upload className="h-4 w-4 mr-2" />
                  업로드 + OCR 변환 시작
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP 2: 처리 중 ═══ */}
        {step === "processing" && (
          <div className="bg-white rounded-xl border p-12 shadow-sm text-center">
            <Loader2 className="h-12 w-12 animate-spin text-violet-500 mx-auto mb-4" />
            <p className="text-lg font-bold text-gray-800">AI가 체크리스트를 분석하고 있습니다...</p>
            <p className="text-sm text-gray-500 mt-1">수기 내용을 인식하고 구조화하는 중입니다 (약 10~30초)</p>
            {processingStage && (
              <p className="text-xs text-violet-600 mt-3 font-medium">{processingStage}</p>
            )}
          </div>
        )}

        {/* ═══ STEP ERROR: 진단 정보 표시 (PR-AH) ═══ */}
        {step === "error" && errorInfo && (
          <div className="space-y-4">
            {/* 메인 에러 카드 */}
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <XCircle className="h-7 w-7 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-red-900">OCR 처리 실패</h3>
                  <p className="text-sm text-red-700 mt-1">
                    <strong>{errorInfo.stage === "upload" ? "파일 업로드" : errorInfo.stage === "process" ? "AI OCR 처리" : "알 수 없는"}</strong> 단계에서 오류가 발생했습니다.
                  </p>
                  {errorInfo.hint && (
                    <div className="mt-3 p-3 bg-amber-100 border border-amber-300 rounded-lg text-sm text-amber-900">
                      <strong>💡 원인 추정:</strong> {errorInfo.hint}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 진단 정보 카드 */}
            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" /> 진단 정보 ({BUILD_TAG})
              </h4>
              <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-xs">
                <dt className="text-gray-500">실패 단계</dt>
                <dd className="font-mono text-gray-900">{errorInfo.stage}</dd>

                <dt className="text-gray-500">에러 메시지</dt>
                <dd className="font-mono text-red-700 break-all whitespace-pre-wrap text-[11px] leading-relaxed">{errorInfo.message}</dd>

                {errorInfo.httpStatus !== null && errorInfo.httpStatus !== undefined && (
                  <>
                    <dt className="text-gray-500">HTTP 상태</dt>
                    <dd className="font-mono">
                      <span className={`px-2 py-0.5 rounded ${
                        errorInfo.httpStatus >= 500 ? "bg-red-100 text-red-700" :
                        errorInfo.httpStatus >= 400 ? "bg-amber-100 text-amber-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>{errorInfo.httpStatus}</span>
                    </dd>
                  </>
                )}

                {errorInfo.trpcCode && (
                  <>
                    <dt className="text-gray-500">tRPC 코드</dt>
                    <dd className="font-mono text-gray-900">{errorInfo.trpcCode}</dd>
                  </>
                )}

                <dt className="text-gray-500">소요 시간</dt>
                <dd className="font-mono text-gray-900">{errorInfo.durationMs}ms ({Math.round((errorInfo.durationMs || 0) / 1000)}초)</dd>

                <dt className="text-gray-500">파일</dt>
                <dd className="font-mono text-gray-900">{errorInfo.fileName} ({errorInfo.fileSizeKB}KB)</dd>

                <dt className="text-gray-500">체크리스트 종류</dt>
                <dd className="font-mono text-gray-900">{checklistType}</dd>
              </dl>

              <details className="mt-4">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                  🔍 전체 에러 객체 (개발자 지원용)
                </summary>
                <pre className="mt-2 p-3 bg-gray-50 rounded text-[10px] overflow-auto max-h-60 font-mono text-gray-700 whitespace-pre-wrap">
                  {errorInfo.rawError}
                </pre>
              </details>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleReset} className="flex-1">
                다른 파일 선택
              </Button>
              <Button onClick={handleRetry} className="flex-1 bg-violet-600 hover:bg-violet-700">
                <RefreshCw className="h-4 w-4 mr-2" />
                동일 파일로 재시도
              </Button>
            </div>
          </div>
        )}

        {/* ═══ STEP 3: 미리보기 + 수정 ═══ */}
        {step === "preview" && editData && (
          <div className="space-y-4">
            {/* 전체 신뢰도 + 필드별 요약 */}
            <div className={`px-4 py-3 rounded-lg border ${
              ocrResult?.confidence >= 0.8 ? "bg-emerald-50 border-emerald-200" :
              ocrResult?.confidence >= 0.5 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"
            }`}>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">
                  AI 인식 신뢰도: {Math.round((ocrResult?.confidence || 0) * 100)}%
                  {ocrResult?.pages > 1 && ` (${ocrResult.pages}페이지)`}
                  {ocrResult?.confidence < 0.7 && " — 내용을 꼼꼼히 확인해주세요"}
                </span>
              </div>
              {/* 저신뢰도 필드 경고 */}
              {ocrResult?.lowConfidenceFields?.length > 0 && (
                <div className="mt-2 text-xs text-amber-700">
                  <strong>확인 필요:</strong>{" "}
                  {ocrResult.lowConfidenceFields.slice(0, 5).map((f: string) => {
                    const fieldInfo = ocrResult.fields?.[f];
                    const conf = fieldInfo ? Math.round(fieldInfo.confidence * 100) : 0;
                    return <span key={f} className="inline-block bg-amber-200 rounded px-1.5 py-0.5 mr-1 mb-1">{f.replace(/items\[\d+\]\./, "")} ({conf}%)</span>;
                  })}
                  {ocrResult.lowConfidenceFields.length > 5 && <span> 외 {ocrResult.lowConfidenceFields.length - 5}건</span>}
                </div>
              )}
            </div>

            {/* 기본 정보 수정 */}
            <div className="bg-white rounded-xl border p-5 shadow-sm space-y-3">
              <h2 className="font-bold text-sm flex items-center gap-2"><Edit3 className="h-4 w-4" /> 기본 정보</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">문서 제목</Label>
                  <Input value={editData.title || ""} onChange={e => setEditData({ ...editData, title: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">작성일</Label>
                  <Input type="date" value={editData.formDate || ""} onChange={e => setEditData({ ...editData, formDate: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">점검자</Label>
                  <Input value={editData.inspector || ""} onChange={e => setEditData({ ...editData, inspector: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">체크리스트 종류</Label>
                  <Input value={checklistTypes.find(t => t.value === checklistType)?.label || checklistType} disabled className="mt-1" />
                </div>
              </div>
            </div>

            {/* 점검 항목 수정 */}
            {editData.items && editData.items.length > 0 && (
              <div className="bg-white rounded-xl border p-5 shadow-sm">
                <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><FileText className="h-4 w-4" /> 점검 항목 ({editData.items.length}개)</h2>
                <div className="space-y-2">
                  {editData.items.map((item: any, idx: number) => {
                    // 필드별 신뢰도 조회
                    const itemFields = ocrResult?.fields || {};
                    const fieldKeys = Object.keys(itemFields).filter((k: string) => k.startsWith(`items[${idx}].`));
                    const minConf = fieldKeys.length > 0
                      ? Math.min(...fieldKeys.map((k: string) => itemFields[k]?.confidence ?? 1))
                      : 1;
                    const needsReview = minConf < 0.6;
                    const suggestion = fieldKeys.find((k: string) => itemFields[k]?.suggestion)
                      ? itemFields[fieldKeys.find((k: string) => itemFields[k]?.suggestion)!]?.suggestion : null;

                    return (
                    <div key={idx} className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${needsReview ? "bg-amber-50 border-amber-300" : "bg-gray-50 border-gray-200"}`}>
                      <span className="text-xs text-gray-400 w-6 pt-1 text-right shrink-0">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <Input
                          value={item.itemText || ""}
                          onChange={e => {
                            const newItems = [...editData.items];
                            newItems[idx] = { ...newItems[idx], itemText: e.target.value };
                            setEditData({ ...editData, items: newItems });
                          }}
                          className="text-sm h-8"
                          placeholder="점검 항목"
                        />
                      </div>
                      <Select
                        value={item.checkResult || "null"}
                        onValueChange={v => {
                          const newItems = [...editData.items];
                          newItems[idx] = { ...newItems[idx], checkResult: v === "null" ? null : v };
                          setEditData({ ...editData, items: newItems });
                        }}
                      >
                        <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="적합">적합</SelectItem>
                          <SelectItem value="부적합">부적합</SelectItem>
                          <SelectItem value="해당없음">N/A</SelectItem>
                          <SelectItem value="null">미선택</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                        onClick={() => {
                          const newItems = editData.items.filter((_: any, i: number) => i !== idx);
                          setEditData({ ...editData, items: newItems });
                        }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      {/* 신뢰도 배지 */}
                      {minConf < 1 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                          minConf >= 0.8 ? "bg-emerald-100 text-emerald-700" :
                          minConf >= 0.6 ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {Math.round(minConf * 100)}%
                        </span>
                      )}
                      {suggestion && (
                        <span className="text-[10px] text-blue-600 shrink-0" title={suggestion}>💡</span>
                      )}
                    </div>
                  );})}
                </div>
              </div>
            )}

            {/* 비고 */}
            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <Label className="text-xs font-bold">비고/특이사항</Label>
              <Textarea
                value={editData.remarks || ""}
                onChange={e => setEditData({ ...editData, remarks: e.target.value })}
                className="mt-1"
                rows={2}
              />
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleReset} className="flex-1">다시 업로드</Button>
              <Button onClick={handleConfirm} disabled={confirmMutation.isPending} className="flex-1 bg-violet-600 hover:bg-violet-700">
                {confirmMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                확인 후 저장
              </Button>
            </div>
          </div>
        )}

        {/* ═══ STEP 4: 완료 ═══ */}
        {step === "done" && (
          <div className="bg-white rounded-xl border p-8 shadow-sm">
            <div className="text-center mb-6">
              <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
              <p className="text-lg font-bold text-gray-800">저장 완료!</p>
              <p className="text-sm text-gray-500 mt-1">{mappingResult?.message || "스캔 데이터가 시스템에 입력되었습니다."}</p>
            </div>

            {/* 매핑 결과 상세 */}
            {mappingResult && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">저장 위치:</span>
                  <Badge variant="outline">{mappingResult.targetTable}</Badge>
                </div>
                {mappingResult.mappedFields?.length > 0 && (
                  <div className="text-sm">
                    <span className="text-gray-500">매핑 완료:</span>
                    <span className="ml-2 text-emerald-600 font-medium">{mappingResult.mappedFields.join(", ")}</span>
                  </div>
                )}
                {mappingResult.unmappedFields?.length > 0 && (
                  <div className="text-sm">
                    <span className="text-gray-500">미매핑:</span>
                    <span className="ml-2 text-amber-600 font-medium">{mappingResult.unmappedFields.join(", ")}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={handleReset}>다른 문서 업로드</Button>
              <Button onClick={() => window.location.href = "/quality/checklists"}>체크리스트 목록 보기</Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
