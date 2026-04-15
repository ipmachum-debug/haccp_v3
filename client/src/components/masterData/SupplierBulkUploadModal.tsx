import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { parseSupplierExcel, ParsedSupplier } from "@/lib/excelParser";

interface SupplierBulkUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SupplierBulkUploadModal({ open, onClose, onSuccess }: SupplierBulkUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedSupplier[]>([]);
  const [parseErrors, setParseErrors] = useState<Array<{ row: number; field: string; message: string }>>([]);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; field: keyof ParsedSupplier } | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const bulkCreateMutation = trpc.supplier.bulkCreate.useMutation({
    onSuccess: (result: any) => {
      setUploadResult(result);
      setStep("result");
      if (result.failureCount === 0) {
        toast.success(`${result.successCount}개 거래처가 등록되었습니다`);
        onSuccess();
      } else {
        toast.warning(`${result.successCount}개 성공, ${result.failureCount}개 실패`);
      }
    },
    onError: (error: any) => {
      toast.error(`업로드 실패: ${error.message}`);
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    try {
      const result = await parseSupplierExcel(selectedFile);
      setParsedData(result.data);
      setParseErrors(result.errors);

      if (result.data.length > 0) {
        setStep("preview");
      } else {
        toast.error("파일에 유효한 데이터가 없습니다");
      }
    } catch (error: any) {
      toast.error(`파일 파싱 오류: ${error.message}`);
      setFile(null);
    }
  };

  const handleUpload = () => {
    if (parsedData.length === 0) {
      toast.error("등록할 데이터가 없습니다");
      return;
    }

    bulkCreateMutation.mutate({
      suppliers: parsedData,
    });
  };

  const handleCellClick = (rowIndex: number, field: keyof ParsedSupplier, value: string) => {
    setEditingCell({ rowIndex, field });
    setEditValue(value);
  };

  const handleCellBlur = (rowIndex: number, field: keyof ParsedSupplier) => {
    const updatedData = [...parsedData];
    const value = editValue.trim();
    updatedData[rowIndex][field] = value || undefined as any;
    setParsedData(updatedData);
    setEditingCell(null);
    setEditValue("");

    // 수정 후 유효성 재검사
    const errors = parseErrors.filter(e => e.row !== rowIndex + 2);
    setParseErrors(errors);
  };

  const handleClose = () => {
    setFile(null);
    setParsedData([]);
    setParseErrors([]);
    setUploadResult(null);
    setStep("upload");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>거래처 일괄 업로드</DialogTitle>
          <DialogDescription>
            엑셀 파일을 업로드하여 여러 거래처를 한 번에 등록하세요
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-sm text-gray-600 mb-4">
                엑셀 파일을 선택하거나 드래그하여 업로드하세요
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload-supplier"
              />
              <label htmlFor="file-upload-supplier">
                <Button variant="outline" asChild>
                  <span>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    파일 선택
                  </span>
                </Button>
              </label>
            </div>
            <p className="text-xs text-gray-500">
              * 템플릿 다운로드 버튼을 클릭하여 양식을 다운로드하세요
            </p>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  총 {parsedData.length}개 거래처
                </p>
                {parseErrors.length > 0 && (
                  <p className="text-sm text-red-600">
                    {parseErrors.length}개 오류 발견
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setStep("upload")}>
                파일 다시 선택
              </Button>
            </div>

            {parseErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800 mb-2">
                      다음 행에 오류가 있습니다:
                    </p>
                    <ul className="text-sm text-red-700 space-y-1">
                      {parseErrors.map((error, index) => (
                        <li key={index}>
                          {error.row}행 - {error.field}: {error.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>거래처명</TableHead>
                    <TableHead>사업자번호</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>담당자</TableHead>
                    <TableHead>연락처</TableHead>
                    <TableHead>이메일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.map((supplier, index) => {
                    const hasError = parseErrors.some(e => e.row === index + 2);
                    return (
                    <TableRow key={index} className={hasError ? "bg-red-50" : ""}>
                      <TableCell className="font-medium" onClick={() => handleCellClick(index, "supplierName", supplier.supplierName)}>
                        {editingCell?.rowIndex === index && editingCell?.field === "supplierName" ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(index, "supplierName")}
                            onKeyDown={(e) => e.key === "Enter" && handleCellBlur(index, "supplierName")}
                            className="w-full px-2 py-1 border rounded"
                            autoFocus
                          />
                        ) : (
                          supplier.supplierName
                        )}
                      </TableCell>
                      <TableCell onClick={() => handleCellClick(index, "businessNumber", supplier.businessNumber || "")}>
                        {editingCell?.rowIndex === index && editingCell?.field === "businessNumber" ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(index, "businessNumber")}
                            onKeyDown={(e) => e.key === "Enter" && handleCellBlur(index, "businessNumber")}
                            className="w-full px-2 py-1 border rounded"
                            autoFocus
                          />
                        ) : (
                          supplier.businessNumber
                        )}
                      </TableCell>
                      <TableCell onClick={() => handleCellClick(index, "supplierType", supplier.supplierType || "")}>
                        {editingCell?.rowIndex === index && editingCell?.field === "supplierType" ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(index, "supplierType")}
                            onKeyDown={(e) => e.key === "Enter" && handleCellBlur(index, "supplierType")}
                            className="w-full px-2 py-1 border rounded"
                            autoFocus
                          />
                        ) : (
                          supplier.supplierType || "-"
                        )}
                      </TableCell>
                      <TableCell onClick={() => handleCellClick(index, "contactPerson", supplier.contactPerson || "")}>
                        {editingCell?.rowIndex === index && editingCell?.field === "contactPerson" ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(index, "contactPerson")}
                            onKeyDown={(e) => e.key === "Enter" && handleCellBlur(index, "contactPerson")}
                            className="w-full px-2 py-1 border rounded"
                            autoFocus
                          />
                        ) : (
                          supplier.contactPerson || "-"
                        )}
                      </TableCell>
                      <TableCell onClick={() => handleCellClick(index, "phone", supplier.phone || "")}>
                        {editingCell?.rowIndex === index && editingCell?.field === "phone" ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(index, "phone")}
                            onKeyDown={(e) => e.key === "Enter" && handleCellBlur(index, "phone")}
                            className="w-full px-2 py-1 border rounded"
                            autoFocus
                          />
                        ) : (
                          supplier.phone || "-"
                        )}
                      </TableCell>
                      <TableCell onClick={() => handleCellClick(index, "email", supplier.email || "")}>
                        {editingCell?.rowIndex === index && editingCell?.field === "email" ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(index, "email")}
                            onKeyDown={(e) => e.key === "Enter" && handleCellBlur(index, "email")}
                            className="w-full px-2 py-1 border rounded"
                            autoFocus
                          />
                        ) : (
                          supplier.email || "-"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === "result" && uploadResult && (
          <div className="space-y-4">
            <div className={`border rounded-lg p-6 text-center ${uploadResult.success ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}>
              {uploadResult.success ? (
                <>
                  <CheckCircle className="h-12 w-12 mx-auto text-green-600 mb-4" />
                  <p className="text-lg font-medium text-green-800 mb-2">
                    업로드 완료!
                  </p>
                  <p className="text-sm text-green-700">
                    {uploadResult.successCount}개 거래처가 성공적으로 등록되었습니다
                  </p>
                </>
              ) : (
                <>
                  <AlertCircle className="h-12 w-12 mx-auto text-yellow-600 mb-4" />
                  <p className="text-lg font-medium text-yellow-800 mb-2">
                    일부 업로드 실패
                  </p>
                  <p className="text-sm text-yellow-700 mb-4">
                    성공: {uploadResult.successCount}개 / 실패: {uploadResult.failureCount}개
                  </p>
                  {uploadResult.errors.length > 0 && (
                    <div className="bg-white border border-yellow-300 rounded-lg p-4 mt-4 text-left">
                      <p className="text-sm font-medium text-yellow-800 mb-2">
                        실패한 항목:
                      </p>
                      <ul className="text-sm text-yellow-700 space-y-1 max-h-40 overflow-y-auto">
                        {uploadResult.errors.map((error: any, index: number) => (
                          <li key={index}>
                            {error.row}행: {error.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>
              취소
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                취소
              </Button>
              <Button
                onClick={handleUpload}
                disabled={parsedData.length === 0 || bulkCreateMutation.isPending}
              >
                {bulkCreateMutation.isPending ? "등록 중..." : `${parsedData.length}개 등록`}
              </Button>
            </>
          )}
          {step === "result" && (
            <Button onClick={handleClose}>
              닫기
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
