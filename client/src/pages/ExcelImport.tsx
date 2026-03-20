/**
 * 엑셀 기초데이터 임포트 UI
 *
 * 엑셀 파일 업로드 → 미리보기 → 임포트 실행 → 결과 확인
 */

import { useState, useRef } from "react";
import DashboardLayout from "./DashboardLayout";
import { trpc } from "../lib/trpc";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";

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

export default function ExcelImport() {
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      setFileBase64(base64);

      // 자동 미리보기
      setPreviewing(true);
      try {
        const result = await previewMutation.mutateAsync({ fileBase64: base64 });
        setPreview(result);
      } catch (err: any) {
        alert("미리보기 실패: " + err.message);
      }
      setPreviewing(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!fileBase64) return;
    if (!confirm("엑셀 데이터를 HACCP-ONE에 임포트하시겠습니까?\n\n마스터 → 배합비 → 입고/생산/납품 → 문서생성 순서로 진행됩니다.")) return;

    setImporting(true);
    setResults(null);

    try {
      const result = await importMutation.mutateAsync({
        fileBase64,
        options: { skipExisting: true, generateDocuments: true },
      });
      setResults(result);
      statusQuery.refetch();
    } catch (err: any) {
      alert("임포트 실패: " + err.message);
    }
    setImporting(false);
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">엑셀 기초데이터 임포트</h1>
          <p className="text-muted-foreground mt-1">
            HACCP 원료수불부 & 원가관리 엑셀 파일을 업로드하여 시스템에 데이터를 일괄 등록합니다.
          </p>
        </div>

        {/* 현재 상태 */}
        {statusQuery.data && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">현재 시스템 데이터 현황</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div className="text-center p-3 bg-blue-50 rounded">
                  <div className="text-2xl font-bold text-blue-600">{statusQuery.data.partners}</div>
                  <div className="text-muted-foreground">거래처</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded">
                  <div className="text-2xl font-bold text-green-600">{statusQuery.data.materials}</div>
                  <div className="text-muted-foreground">원재료</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded">
                  <div className="text-2xl font-bold text-purple-600">{statusQuery.data.products}</div>
                  <div className="text-muted-foreground">제품</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded">
                  <div className="text-2xl font-bold text-orange-600">{statusQuery.data.batches}</div>
                  <div className="text-muted-foreground">배치</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 파일 업로드 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 1: 엑셀 파일 선택</CardTitle>
            <CardDescription>HACCP_원료수불부_원가관리 엑셀 파일을 선택하세요</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                파일 선택
              </Button>
              {fileName && (
                <span className="text-sm text-muted-foreground">{fileName}</span>
              )}
              {previewing && (
                <span className="text-sm text-blue-600 animate-pulse">분석 중...</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 미리보기 */}
        {preview && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Step 2: 데이터 미리보기</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 시트 목록 */}
              <div>
                <h3 className="font-medium mb-2">시트 구성</h3>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {Object.entries(preview.sheets).map(([name, info]) => (
                    <div key={name} className="p-2 border rounded bg-gray-50">
                      <div className="font-medium truncate">{name}</div>
                      <div className="text-muted-foreground">{info.rows}행 x {info.cols}열</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 데이터 요약 */}
              <div>
                <h3 className="font-medium mb-2">임포트 예정 데이터</h3>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <SummaryCard label="원재료" count={preview.summary.materials} icon="🏭" />
                  <SummaryCard label="제품" count={preview.summary.products} icon="📦" />
                  <SummaryCard label="거래처" count={preview.summary.partners} icon="🏢" />
                  <SummaryCard label="입고" count={preview.summary.purchases} icon="📥" />
                  <SummaryCard label="생산" count={preview.summary.production} icon="🔧" />
                  <SummaryCard label="납품" count={preview.summary.sales} icon="📤" />
                  <SummaryCard label="검사" count={preview.summary.inspections} icon="📋" />
                </div>
              </div>

              {/* 임포트 버튼 */}
              <div className="pt-4 border-t">
                <Button
                  onClick={handleImport}
                  disabled={importing}
                  className="w-full"
                  size="lg"
                >
                  {importing ? (
                    <span className="animate-pulse">임포트 진행 중...</span>
                  ) : (
                    "Step 3: 데이터 임포트 실행"
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  마스터 → 배합비(BOM) → 입고/생산/납품 → CCP/승인/일보 순서로 생성됩니다
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 임포트 결과 */}
        {results && (
          <Card className={results.errors.length > 0 ? "border-red-300" : "border-green-300"}>
            <CardHeader>
              <CardTitle className="text-base">
                {results.errors.length > 0 ? "임포트 완료 (일부 오류)" : "임포트 성공!"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Step 1 결과 */}
              <ResultSection title="Step 1: 마스터 데이터" items={[
                { label: "거래처", count: results.step1.partners },
                { label: "원재료", count: results.step1.materials },
                { label: "제품", count: results.step1.products },
              ]} />

              {/* Step 2 결과 */}
              <ResultSection title="Step 2: 배합비(BOM)" items={[
                { label: "품목제조보고", count: results.step2.mfReports },
                { label: "배합비 항목", count: results.step2.ingredients },
              ]} />

              {/* Step 3 결과 */}
              <ResultSection title="Step 3: 운영 데이터" items={[
                { label: "이월재고", count: results.step3.openingStock },
                { label: "원재료 입고", count: results.step3.purchases },
                { label: "생산 배치", count: results.step3.batches },
                { label: "원료 투입", count: results.step3.batchInputs },
                { label: "납품 출고", count: results.step3.sales },
                { label: "육안검사", count: results.step3.inspections },
              ]} />

              {/* Step 4 결과 */}
              <ResultSection title="Step 4: 문서 + 자동로직" items={[
                { label: "승인 요청", count: results.step4.approvals },
                { label: "생산일보", count: results.step4.dailyReports },
                { label: "원가 분석", count: results.step4.costAnalysis },
              ]} />

              {/* 오류 */}
              {results.errors.length > 0 && (
                <div className="p-3 bg-red-50 rounded text-sm">
                  <h4 className="font-medium text-red-700">오류:</h4>
                  {results.errors.map((err, i) => (
                    <div key={i} className="text-red-600">{err}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 파이프라인 설명 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">임포트 파이프라인</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <PipelineStep num={1} title="마스터 데이터" desc="거래처, 원재료(82종), 제품(82종) → partners, h_item_master, h_products_v2" />
              <PipelineStep num={2} title="배합비(BOM)" desc="제품×원료 배합비 매트릭스(727건) → h_mf_reports, h_mf_report_versions, h_mf_ingredients" />
              <PipelineStep num={3} title="운영 데이터" desc="입고(121건), 이월재고, 생산배치(292건), 납품(1,437건), 육안검사 → 재고+수불부 자동계산" />
              <PipelineStep num={4} title="문서 + 자동로직" desc="CCP 기록지, 승인요청, 생산일보, 주간리포트, 배치원가 → 자동 생성" />
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function SummaryCard({ label, count, icon }: { label: string; count: number; icon: string }) {
  return (
    <div className="p-3 border rounded text-center">
      <div className="text-lg">{icon}</div>
      <div className="font-bold text-lg">{count}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

function ResultSection({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  const total = items.reduce((s, i) => s + i.count, 0);
  return (
    <div className="p-3 bg-gray-50 rounded">
      <h4 className="font-medium text-sm mb-2">{title} <span className="text-muted-foreground">({total}건)</span></h4>
      <div className="flex flex-wrap gap-3 text-xs">
        {items.map((item) => (
          <span key={item.label} className="bg-white px-2 py-1 rounded border">
            {item.label}: <strong>{item.count}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function PipelineStep({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
        {num}
      </div>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}
