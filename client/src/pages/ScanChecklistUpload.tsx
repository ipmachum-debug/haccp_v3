/**
 * 스캔 체크리스트 업로드 페이지
 * 수기 체크리스트 사진/PDF → OCR → JSON → 확인/수정 → 저장
 * 테넌트별 양식 자동 참조
 */
import { useState, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
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
  Trash2, Eye, AlertCircle, Scan, ArrowRight
} from "lucide-react";

const checklistTypes = [
  { value: "training_log", label: "📖 교육훈련일지" },
  { value: "ccp_record", label: "🔴 CCP 기록지 (범용)" },
  { value: "ccp_2b", label: "🔴 CCP-2B 가열(굽기) 기록" },
  { value: "ccp_1b", label: "🔴 CCP-1B 가열(증숙) 기록" },
  { value: "ccp_4p", label: "🔴 CCP-4P 금속검출 기록" },
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
  { value: "training_log", label: "교육훈련기록" },
  { value: "general", label: "일반 체크리스트" },
];

type Step = "upload" | "processing" | "preview" | "done";

export default function ScanChecklistUpload() {
  const [step, setStep] = useState<Step>("upload");
  const [checklistType, setChecklistType] = useState("general");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadKey, setUploadKey] = useState<string>("");
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [editData, setEditData] = useState<any>(null);
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

    setStep("processing");

    try {
      // 1. Base64 변환 + 업로드
      const buffer = await selectedFile.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

      const uploadResult = await uploadMutation.mutateAsync({
        fileName: selectedFile.name,
        fileBase64: base64,
        checklistType,
      });

      setUploadKey(uploadResult.key);

      // 2. OCR 처리
      const ocrRes = await processMutation.mutateAsync({
        key: uploadResult.key,
        checklistType,
      });

      setOcrResult(ocrRes);
      setEditData(ocrRes.structuredData);
      setStep("preview");
      toast.success(`OCR 완료! 신뢰도 ${Math.round(ocrRes.confidence * 100)}%`);
    } catch (e: any) {
      toast.error("처리 실패: " + e.message);
      setStep("upload");
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-5">
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
            const isActive = stepMap.indexOf(step) >= i;
            return (
              <div key={s} className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full font-bold ${isActive ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-400"}`}>
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
          </div>
        )}

        {/* ═══ STEP 3: 미리보기 + 수정 ═══ */}
        {step === "preview" && editData && (
          <div className="space-y-4">
            {/* 신뢰도 표시 */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
              ocrResult?.confidence >= 0.8 ? "bg-emerald-50 border-emerald-200" :
              ocrResult?.confidence >= 0.5 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"
            }`}>
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">
                AI 인식 신뢰도: {Math.round((ocrResult?.confidence || 0) * 100)}%
                {ocrResult?.confidence < 0.7 && " — 내용을 꼼꼼히 확인해주세요"}
              </span>
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
                  {editData.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-gray-50 border">
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
                    </div>
                  ))}
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
