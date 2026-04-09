/**
 * 통합 데이터 임포트 페이지
 *
 * 기존 "엑셀 데이터 임포트"와 "단순 데이터 임포트"를 하나로 통합.
 * 3가지 임포트 모드:
 *   Tab 1: 기초 데이터 (기존 4단계 파이프라인 - BOM 기반)
 *   Tab 2: 단순 임포트 (바이패스 - BOM 없이 직접 입력)
 *   Tab 3: JSON 임포트 (AI 에이전트 / 외부 시스템용)
 *
 * + AI 검증 모듈: 업로드 데이터의 이상치 탐지 및 오차 범위 검증
 */

import { useState, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

// ── 타입 정의 ──

interface ImportResults {
  step1: { partners: number; materials: number; products: number };
  step2: { mfReports: number; ingredients: number };
  step3: { purchases: number; batches: number; batchInputs: number; sales: number; inspections: number; openingStock: number };
  step4: { ccpInstances: number; approvals: number; dailyReports: number; weeklyReports: number; costAnalysis: number };
  errors: string[];
}

interface PreviewResult {
  sheets: Record<string, { rows: number; cols: number; sample: any[] }>;
  summary: {
    materials: number;
    products: number;
    partners: number;
    purchases: number;
    production: number;
    sales: number;
    inspections: number;
  };
}

interface SimplifiedResult {
  success: boolean;
  summary: {
    mastersCreated: { products: number; materials: number; partners: number };
    purchasesCreated: number;
    batchesCreated: number;
    ccpRecordsCreated: number;
    outboundsCreated: number;
    journalEntriesCreated: number;
    inspectionsCreated: number;
    ledgerEntriesCreated: number;
  };
  errors: string[];
  parsedCounts?: { purchases: number; productions: number };
}

interface AiValidation {
  warnings: { field: string; message: string; severity: "low" | "medium" | "high" }[];
  stats: { totalRecords: number; validRecords: number; suspiciousRecords: number };
}

type TabType = "basic" | "simplified" | "json";

export default function DataImport() {
  const [activeTab, setActiveTab] = useState<TabType>("simplified");

  return (
    <DashboardLayout>
      <div className="max-w-5xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold">데이터 임포트</h1>
          <p className="text-muted-foreground mt-1">
            테넌트 온보딩 시 과거 운영 데이터를 축적합니다.
            목적에 맞는 임포트 방식을 선택하세요.
          </p>
        </div>

        {/* 탭 선택 */}
        <div className="flex border-b">
          <TabButton active={activeTab === "simplified"} onClick={() => setActiveTab("simplified")} label="단순 임포트" desc="BOM 없이 직접 입력" />
          <TabButton active={activeTab === "basic"} onClick={() => setActiveTab("basic")} label="기초 데이터" desc="4단계 파이프라인 (BOM 기반)" />
          <TabButton active={activeTab === "json"} onClick={() => setActiveTab("json")} label="JSON / AI 연동" desc="에이전트 · 외부 시스템" />
        </div>

        {activeTab === "simplified" && <SimplifiedTab />}
        {activeTab === "basic" && <BasicTab />}
        {activeTab === "json" && <JsonTab />}
      </div>
    </DashboardLayout>
  );
}

// ══════════════════════════════════════════════
// 탭 버튼 컴포넌트
// ══════════════════════════════════════════════

function TabButton({ active, onClick, label, desc }: { active: boolean; onClick: () => void; label: string; desc: string }) {
  return (
    <button
      className={`px-4 py-3 text-left border-b-2 transition-colors ${
        active
          ? "border-blue-500 text-blue-700 bg-blue-50/50"
          : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
      }`}
      onClick={onClick}
    >
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </button>
  );
}

// ══════════════════════════════════════════════
// Tab 1: 단순 임포트 (바이패스)
// ══════════════════════════════════════════════

function SimplifiedTab() {
  const [result, setResult] = useState<SimplifiedResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [validation, setValidation] = useState<AiValidation | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const importExcel = trpc.simplifiedImport.importExcel.useMutation();
  const templateQuery = trpc.simplifiedImport.downloadTemplate.useQuery(undefined, { enabled: false });
  const validateMutation = trpc.simplifiedImport.validateData.useMutation();

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("파일을 선택해주세요."); return; }
    setLoading(true);
    setError("");
    setResult(null);
    setValidation(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const fileBase64 = btoa(binary);

      // Step 1: AI 검증
      try {
        const v = await validateMutation.mutateAsync({ fileBase64 });
        setValidation(v as AiValidation);
        const highWarnings = (v as AiValidation).warnings.filter(w => w.severity === "high");
        if (highWarnings.length > 0) {
          setError(`${highWarnings.length}건의 심각한 이상 감지됨. 아래 경고를 확인 후 계속하려면 다시 클릭하세요.`);
          setLoading(false);
          return;
        }
      } catch { /* AI 검증 실패 시 무시하고 계속 */ }

      // Step 2: 임포트 실행
      const res = await importExcel.mutateAsync({ fileBase64 });
      setResult(res as SimplifiedResult);
    } catch (err: any) {
      setError(err.message || "임포트 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 경고 확인 후 강제 임포트
  const handleForceImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setLoading(true);
    setError("");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const fileBase64 = btoa(binary);
      const res = await importExcel.mutateAsync({ fileBase64 });
      setResult(res as SimplifiedResult);
    } catch (err: any) {
      setError(err.message || "임포트 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleTemplate = async () => {
    try {
      const res = await templateQuery.refetch();
      if (res.data) downloadBase64(res.data.fileBase64, res.data.filename);
    } catch { setError("템플릿 다운로드 실패"); }
  };

  return (
    <div className="space-y-4">
      {/* 처리 규칙 */}
      <Card>
        <CardHeader><CardTitle className="text-base">처리 규칙</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
            {[
              "날짜순 자동 정렬", "마스터 자동 등록", "BOM 없이 직접 입력",
              "배치 완료 상태 직접 생성", "입고→차감 순서 보장", "CCP 값 직접 삽입",
              "회계 분개 자동 생성", "전체 트랜잭션 (롤백)", "중복 방지 (멱등성)",
            ].map((rule, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-blue-500 font-bold text-xs">{i + 1}</span>
                <span>{rule}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 엑셀 업로드 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">엑셀 파일 업로드</CardTitle>
          <CardDescription>
            시트1: 매입(날짜, 원재료명, 수량, 단가, 거래처) /
            시트2: 생산(날짜, 제품명, 생산량, 원료투입, CCP기록, 출고량, 거래처, 단가)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <Button variant="outline" size="sm" onClick={handleTemplate}>템플릿</Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleUpload} disabled={loading}>
              {loading ? "처리 중..." : "AI 검증 + 임포트"}
            </Button>
            {validation && error.includes("심각한 이상") && (
              <Button variant="destructive" onClick={handleForceImport} disabled={loading}>
                경고 무시하고 임포트
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI 검증 결과 */}
      {validation && <AiValidationCard validation={validation} />}

      {/* 에러 */}
      {error && !error.includes("심각한 이상") && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4"><p className="text-red-600 text-sm">{error}</p></CardContent>
        </Card>
      )}

      {/* 결과 */}
      {result && <SimplifiedResultCard result={result} />}
    </div>
  );
}

// ══════════════════════════════════════════════
// Tab 2: 기초 데이터 (4단계 파이프라인)
// ══════════════════════════════════════════════

function BasicTab() {
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const previewMutation = trpc.excelImport.preview.useMutation();
  const importMutation = trpc.excelImport.importAll.useMutation();
  const statusQuery = trpc.excelImport.status.useQuery(undefined, {
    refetchInterval: importing ? 5000 : false,
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResults(null);
    setPreview(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const arrayBuffer = ev.target?.result as ArrayBuffer;
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      setFileBase64(base64);

      setPreviewing(true);
      try {
        const res = await previewMutation.mutateAsync({ fileBase64: base64 });
        setPreview(res as PreviewResult);
      } catch { /* ignore preview errors */ }
      setPreviewing(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!fileBase64) return;
    setImporting(true);
    try {
      const res = await importMutation.mutateAsync({ fileBase64 });
      setResults(res as ImportResults);
    } catch (err: any) {
      setResults({ step1: { partners: 0, materials: 0, products: 0 }, step2: { mfReports: 0, ingredients: 0 }, step3: { purchases: 0, batches: 0, batchInputs: 0, sales: 0, inspections: 0, openingStock: 0 }, step4: { ccpInstances: 0, approvals: 0, dailyReports: 0, weeklyReports: 0, costAnalysis: 0 }, errors: [err.message] });
    }
    setImporting(false);
  };

  return (
    <div className="space-y-4">
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-4">
          <p className="text-sm text-amber-700">
            이 모드는 BOM(배합비)이 설정된 상태에서 사용합니다.
            BOM 없이 데이터를 넣으려면 "단순 임포트" 탭을 사용하세요.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">기초 엑셀 임포트 (4단계 파이프라인)</CardTitle>
          <CardDescription>
            원료마스터 → 배합비 → 운영데이터 → 문서/CCP 순차 처리
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />

          {previewing && <p className="text-sm text-gray-500">미리보기 로딩...</p>}

          {preview && (
            <div className="border rounded-md p-3">
              <p className="font-medium text-sm mb-2">미리보기: {fileName}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div>원재료: <b>{preview.summary.materials}</b></div>
                <div>제품: <b>{preview.summary.products}</b></div>
                <div>거래처: <b>{preview.summary.partners}</b></div>
                <div>매입: <b>{preview.summary.purchases}</b></div>
                <div>생산: <b>{preview.summary.production}</b></div>
                <div>매출: <b>{preview.summary.sales}</b></div>
                <div>검사: <b>{preview.summary.inspections}</b></div>
              </div>
            </div>
          )}

          <Button onClick={handleImport} disabled={!fileBase64 || importing}>
            {importing ? "임포트 실행 중..." : "4단계 임포트 실행"}
          </Button>

          {statusQuery.data && importing && (
            <p className="text-sm text-gray-500">
              진행: 원료 {(statusQuery.data as any).materials} / 제품 {(statusQuery.data as any).products} / 배치 {(statusQuery.data as any).batches}
            </p>
          )}
        </CardContent>
      </Card>

      {results && (
        <Card className={results.errors.length === 0 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}>
          <CardHeader><CardTitle className="text-base">임포트 결과</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div>거래처: <b>{results.step1.partners}</b></div>
              <div>원재료: <b>{results.step1.materials}</b></div>
              <div>제품: <b>{results.step1.products}</b></div>
              <div>배합비: <b>{results.step2.mfReports}</b></div>
              <div>배치: <b>{results.step3.batches}</b></div>
              <div>매입: <b>{results.step3.purchases}</b></div>
              <div>매출: <b>{results.step3.sales}</b></div>
              <div>CCP: <b>{results.step4.ccpInstances}</b></div>
              <div>일보: <b>{results.step4.dailyReports}</b></div>
            </div>
            {results.errors.length > 0 && (
              <div className="mt-3 border-t pt-2">
                <p className="text-sm font-medium text-red-600">오류:</p>
                <ul className="text-xs text-red-500 list-disc pl-4">
                  {results.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// Tab 3: JSON / AI 에이전트 연동
// ══════════════════════════════════════════════

function JsonTab() {
  const [jsonText, setJsonText] = useState("");
  const [result, setResult] = useState<SimplifiedResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [validation, setValidation] = useState<AiValidation | null>(null);

  const importJson = trpc.simplifiedImport.importJson.useMutation();
  const validateJson = trpc.simplifiedImport.validateJson.useMutation();

  const handleImport = async () => {
    if (!jsonText.trim()) { setError("JSON 데이터를 입력해주세요."); return; }
    setLoading(true);
    setError("");
    setResult(null);
    setValidation(null);

    try {
      const data = JSON.parse(jsonText);

      // AI 검증
      try {
        const v = await validateJson.mutateAsync(data);
        setValidation(v as AiValidation);
      } catch { /* 검증 실패 시 무시 */ }

      const res = await importJson.mutateAsync(data);
      setResult(res as SimplifiedResult);
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        setError("잘못된 JSON 형식입니다.");
      } else {
        setError(err.message || "임포트 중 오류가 발생했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  const sampleJson = JSON.stringify({
    purchases: [
      { date: "2026-01-15", materialName: "쌀가루", qty: 500, unitPrice: 3000, supplier: "농협" },
    ],
    productions: [{
      date: "2026-01-15", productName: "떡볶이떡", productionQty: 280,
      materials: [{ name: "쌀가루", qty: 200 }, { name: "소금", qty: 5 }],
      ccpRecords: [{ type: "CCP-1B", temp: 95, time: 30 }, { type: "CCP-4P", feMm: 2.0, susMm: 3.0 }],
      outbound: { qty: 250, partner: "이마트", unitPrice: 5000 },
    }],
  }, null, 2);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">JSON 데이터 임포트</CardTitle>
          <CardDescription>
            AI 에이전트 또는 외부 시스템에서 구조화된 JSON을 직접 전달할 때 사용합니다.
            AI가 자동으로 데이터 오류를 검증합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            className="w-full h-64 p-3 border rounded-md font-mono text-sm"
            placeholder={sampleJson}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
          <Button onClick={handleImport} disabled={loading}>
            {loading ? "처리 중..." : "AI 검증 + 임포트"}
          </Button>
        </CardContent>
      </Card>

      {validation && <AiValidationCard validation={validation} />}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4"><p className="text-red-600 text-sm">{error}</p></CardContent>
        </Card>
      )}

      {result && <SimplifiedResultCard result={result} />}
    </div>
  );
}

// ══════════════════════════════════════════════
// 공통 컴포넌트
// ══════════════════════════════════════════════

function AiValidationCard({ validation }: { validation: AiValidation }) {
  const { warnings, stats } = validation;
  const highCount = warnings.filter(w => w.severity === "high").length;
  const medCount = warnings.filter(w => w.severity === "medium").length;

  return (
    <Card className={highCount > 0 ? "border-red-200 bg-red-50" : medCount > 0 ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}>
      <CardHeader>
        <CardTitle className="text-base">AI 데이터 검증 결과</CardTitle>
        <CardDescription>
          전체 {stats.totalRecords}건 / 정상 {stats.validRecords}건 / 의심 {stats.suspiciousRecords}건
        </CardDescription>
      </CardHeader>
      {warnings.length > 0 && (
        <CardContent>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {warnings.map((w, i) => (
              <div key={i} className={`text-sm flex items-start gap-2 ${
                w.severity === "high" ? "text-red-600" : w.severity === "medium" ? "text-amber-600" : "text-gray-600"
              }`}>
                <span className="font-bold text-xs mt-0.5">
                  {w.severity === "high" ? "!!!" : w.severity === "medium" ? "!!" : "!"}
                </span>
                <span><b>{w.field}</b>: {w.message}</span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function SimplifiedResultCard({ result }: { result: SimplifiedResult }) {
  return (
    <Card className={result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
      <CardHeader>
        <CardTitle className="text-base">{result.success ? "임포트 완료" : "임포트 실패"}</CardTitle>
      </CardHeader>
      <CardContent>
        {result.parsedCounts && (
          <p className="text-sm text-muted-foreground mb-3">
            파싱: 매입 {result.parsedCounts.purchases}건 / 생산 {result.parsedCounts.productions}건
          </p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ResultCard label="마스터 등록" sub={`제품 ${result.summary.mastersCreated.products} / 원료 ${result.summary.mastersCreated.materials} / 거래처 ${result.summary.mastersCreated.partners}`} />
          <ResultCard label="매입(입고)" value={result.summary.purchasesCreated} />
          <ResultCard label="생산 배치" value={result.summary.batchesCreated} />
          <ResultCard label="CCP 기록" value={result.summary.ccpRecordsCreated} />
          <ResultCard label="출고" value={result.summary.outboundsCreated} />
          <ResultCard label="회계 분개" value={result.summary.journalEntriesCreated} />
          <ResultCard label="검사 기록" value={result.summary.inspectionsCreated} />
          <ResultCard label="수불 기록" value={result.summary.ledgerEntriesCreated} />
        </div>
        {result.errors.length > 0 && (
          <div className="mt-4 border-t pt-2">
            <p className="text-sm font-medium text-red-600">오류:</p>
            <ul className="text-xs text-red-500 list-disc pl-4">
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResultCard({ label, value, sub }: { label: string; value?: number; sub?: string }) {
  return (
    <div className="bg-white rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {value !== undefined && <p className="text-lg font-bold">{value}건</p>}
      {sub && <p className="text-sm font-medium">{sub}</p>}
    </div>
  );
}

function downloadBase64(base64: string, filename: string) {
  const byteChars = atob(base64);
  const byteArr = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
