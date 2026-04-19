/**
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
 * 단순 데이터 임포트 페이지
 *
 * 신규 테넌트 온보딩 시 과거 운영 데이터를 축적하는 UI.
 * 엑셀 업로드 + JSON 직접 입력 두 가지 방식 지원.
 */

import { useState, useRef } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

type ImportResult = {
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
};

export default function SimplifiedImport() {
  const L = useIndustryLabel();
  const [mode, setMode] = useState<"excel" | "json">("excel");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const importExcel = trpc.simplifiedImport.importExcel.useMutation();
  const importJson = trpc.simplifiedImport.importJson.useMutation();
  const templateQuery = trpc.simplifiedImport.downloadTemplate.useQuery(undefined, { enabled: false });

  // 엑셀 업로드 처리
  const handleExcelUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("파일을 선택해주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const fileBase64 = btoa(binary);

      const res = await importExcel.mutateAsync({ fileBase64 });
      setResult(res as ImportResult);
    } catch (err: any) {
      setError(err.message || "임포트 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // JSON 임포트 처리
  const handleJsonImport = async () => {
    if (!jsonText.trim()) {
      setError("JSON 데이터를 입력해주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = JSON.parse(jsonText);
      const res = await importJson.mutateAsync(data);
      setResult(res as ImportResult);
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

  // 템플릿 다운로드
  const handleDownloadTemplate = async () => {
    try {
      const res = await templateQuery.refetch();
      if (res.data) {
        const byteChars = atob(res.data.fileBase64);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteArr[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([byteArr], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.data.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      setError("템플릿 다운로드 실패");
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">단순 데이터 임포트</h1>
          <p className="text-muted-foreground mt-1">
            신규 온보딩 시 과거 운영 데이터를 한번에 축적합니다.
            BOM/공정 설정 없이도 생산, CCP, 재고, 회계 데이터가 자동 생성됩니다.
          </p>
        </div>

        {/* 처리 규칙 안내 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">처리 규칙</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">1</span>
                <span>날짜순 자동 정렬 처리</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">2</span>
                <span>제품/원료/거래처 자동 등록</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">3</span>
                <span>BOM 없이 투입량 직접 입력</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">4</span>
                <span>{L("batch")} 완료 상태로 직접 생성</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">5</span>
                <span>입고→차감 순서 자동 보장</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">6</span>
                <span>CCP 값 직접 삽입 (PASS 기록)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">7</span>
                <span>회계 분개 자동 생성 (금액 있을 때)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">8</span>
                <span>전체 트랜잭션 (실패 시 롤백)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">9</span>
                <span>중복 방지 (멱등성 보장)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 모드 선택 */}
        <div className="flex gap-2">
          <Button
            variant={mode === "excel" ? "default" : "outline"}
            onClick={() => setMode("excel")}
          >
            엑셀 업로드
          </Button>
          <Button
            variant={mode === "json" ? "default" : "outline"}
            onClick={() => setMode("json")}
          >
            JSON 직접 입력
          </Button>
        </div>

        {/* 엑셀 모드 */}
        {mode === "excel" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">엑셀 파일 업로드</CardTitle>
              <CardDescription>
                시트1: 매입(날짜, 원재료명, 수량, 단가, 거래처) /
                시트2: 생산(날짜, 제품명, 생산량, 원료투입, CCP기록, 출고량, 출고거래처, 출고단가)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100"
                />
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                  템플릿 다운로드
                </Button>
              </div>
              <Button onClick={handleExcelUpload} disabled={loading}>
                {loading ? "처리 중..." : "임포트 실행"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* JSON 모드 */}
        {mode === "json" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">JSON 데이터 입력</CardTitle>
              <CardDescription>
                AI 에이전트 또는 외부 시스템에서 구조화된 JSON을 직접 전달할 때 사용합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                className="w-full h-64 p-3 border rounded-md font-mono text-sm"
                placeholder={JSON.stringify(
                  {
                    purchases: [
                      { date: "2026-01-15", materialName: "쌀가루", qty: 500, unitPrice: 3000, supplier: "농협" },
                    ],
                    productions: [
                      {
                        date: "2026-01-15",
                        productName: "떡볶이떡",
                        productionQty: 280,
                        materials: [{ name: "쌀가루", qty: 200 }, { name: "소금", qty: 5 }],
                        ccpRecords: [
                          { type: "CCP-1B", temp: 95, time: 30 },
                          { type: "CCP-4P", feMm: 2.0, susMm: 3.0 },
                        ],
                        outbound: { qty: 250, partner: "이마트", unitPrice: 5000 },
                      },
                    ],
                  },
                  null,
                  2
                )}
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
              />
              <Button onClick={handleJsonImport} disabled={loading}>
                {loading ? "처리 중..." : "임포트 실행"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 에러 표시 */}
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-4">
              <p className="text-red-600 text-sm">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* 결과 표시 */}
        {result && (
          <Card className={result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
            <CardHeader>
              <CardTitle className="text-base">
                {result.success ? "임포트 완료" : "임포트 실패"}
              </CardTitle>
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
                <div className="mt-4">
                  <p className="text-sm font-medium text-red-600 mb-1">오류:</p>
                  <ul className="text-sm text-red-500 list-disc pl-4">
                    {result.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
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
