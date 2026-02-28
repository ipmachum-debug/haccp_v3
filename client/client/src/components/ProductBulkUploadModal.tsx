/**
 * 제품 일괄 업로드 모달 컴포넌트
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { parseProductExcel, ParsedProduct } from "@/lib/excelParser";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";

interface ProductBulkUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProductBulkUploadModal({ open, onClose, onSuccess }: ProductBulkUploadModalProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedProduct[]>([]);
  const [parseErrors, setParseErrors] = useState<Array<{ row: number; field: string; message: string }>>([]);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    total: number;
    successCount: number;
    errorCount: number;
    errors: Array<{ row: number; productName: string; error: string }>;
  } | null>(null);
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; field: keyof ParsedProduct } | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const bulkCreateMutation = trpc.product.bulkCreate.useMutation();

  const handleCellClick = (rowIndex: number, field: keyof ParsedProduct, value: string) => {
    setEditingCell({ rowIndex, field });
    setEditValue(value);
  };

  const handleCellBlur = (rowIndex: number, field: keyof ParsedProduct) => {
    const updatedData = [...parsedData];
    const value = editValue.trim();

    if (field === "unitPrice") {
      (updatedData[rowIndex] as any)[field] = value ? parseFloat(value) : undefined;
    } else {
      (updatedData[rowIndex] as any)[field] = value || undefined;
    }

    setParsedData(updatedData);
    setEditingCell(null);
    setEditValue("");

    // 수정 후 유효성 재검사
    const errors = parseErrors.filter(e => e.row !== rowIndex + 2);
    setParseErrors(errors);
  };

  // 파일 선택 핸들러
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setParseErrors([]);
    setParsedData([]);
    setUploadResult(null);

    try {
      const result = await parseProductExcel(selectedFile);
      
      if (result.errors.length > 0) {
        setParseErrors(result.errors);
        toast({
          title: "파일 파싱 오류",
          description: `${result.errors.length}개의 오류가 발견되었습니다.`,
          variant: "destructive",
        });
      }

      if (result.data.length > 0) {
        setParsedData(result.data);
        setStep("preview");
      }
    } catch (error: any) {
      toast({
        title: "파일 읽기 오류",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // 일괄 등록 핸들러
  const handleBulkUpload = async () => {
    if (parsedData.length === 0) return;

    try {
      const result = await bulkCreateMutation.mutateAsync({
        products: parsedData,
      });

      setUploadResult(result);
      setStep("result");

      if (result.success) {
        toast({
          title: "일괄 등록 완료",
          description: `${result.successCount}개의 제품이 등록되었습니다.`,
        });
        onSuccess();
      } else {
        toast({
          title: "일부 등록 실패",
          description: `${result.successCount}개 성공, ${result.errorCount}개 실패`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "등록 오류",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // 모달 닫기 핸들러
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
          <DialogTitle>제품 일괄 업로드</DialogTitle>
        </DialogHeader>

        {/* 1단계: 파일 업로드 */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-sm text-gray-600 mb-4">
                엑셀 파일을 선택하여 제품을 일괄 등록하세요
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                id="product-file-upload"
              />
              <label htmlFor="product-file-upload">
                <Button asChild>
                  <span>
                    <Upload className="mr-2 h-4 w-4" />
                    파일 선택
                  </span>
                </Button>
              </label>
            </div>

            {parseErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <div className="font-semibold mb-2">파일 파싱 오류:</div>
                  <ul className="list-disc list-inside space-y-1">
                    {parseErrors.slice(0, 5).map((error, index) => (
                      <li key={index}>
                        {error.row}행 - {error.field}: {error.message}
                      </li>
                    ))}
                    {parseErrors.length > 5 && (
                      <li className="text-sm">... 외 {parseErrors.length - 5}개</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* 2단계: 미리보기 */}
        {step === "preview" && (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                총 <strong>{parsedData.length}개</strong>의 제품이 등록됩니다.
              </AlertDescription>
            </Alert>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>번호</TableHead>
                    <TableHead>제품명</TableHead>
                    <TableHead>카테고리</TableHead>
                    <TableHead>단위</TableHead>
                    <TableHead>단가</TableHead>
                    <TableHead>유통기한(월)</TableHead>
                    <TableHead>설명</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.slice(0, 10).map((product, index) => {
                    const hasError = parseErrors.some(e => e.row === index + 2);
                    return (
                    <TableRow key={index} className={hasError ? "bg-red-50" : ""}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium" onClick={() => handleCellClick(index, "productName", product.productName)}>
                        {editingCell?.rowIndex === index && editingCell?.field === "productName" ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(index, "productName")}
                            onKeyDown={(e) => e.key === "Enter" && handleCellBlur(index, "productName")}
                            className="w-full px-2 py-1 border rounded"
                            autoFocus
                          />
                        ) : (
                          product.productName
                        )}
                      </TableCell>
                      <TableCell onClick={() => handleCellClick(index, "category", product.category || "")}>
                        {editingCell?.rowIndex === index && editingCell?.field === "category" ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(index, "category")}
                            onKeyDown={(e) => e.key === "Enter" && handleCellBlur(index, "category")}
                            className="w-full px-2 py-1 border rounded"
                            autoFocus
                          />
                        ) : (
                          product.category || "-"
                        )}
                      </TableCell>
                      <TableCell onClick={() => handleCellClick(index, "unit", product.unit || "")}>
                        {editingCell?.rowIndex === index && editingCell?.field === "unit" ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(index, "unit")}
                            onKeyDown={(e) => e.key === "Enter" && handleCellBlur(index, "unit")}
                            className="w-full px-2 py-1 border rounded"
                            autoFocus
                          />
                        ) : (
                          product.unit || "-"
                        )}
                      </TableCell>
                      <TableCell onClick={() => handleCellClick(index, "unitPrice", product.unitPrice?.toString() || "")}>
                        {editingCell?.rowIndex === index && editingCell?.field === "unitPrice" ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(index, "unitPrice")}
                            onKeyDown={(e) => e.key === "Enter" && handleCellBlur(index, "unitPrice")}
                            className="w-full px-2 py-1 border rounded"
                            autoFocus
                          />
                        ) : (
                          product.unitPrice ? `${product.unitPrice.toLocaleString()}원` : "-"
                        )}
                      </TableCell>
                      <TableCell onClick={() => handleCellClick(index, "shelfLifeMonths", product.shelfLifeMonths?.toString() || "")}>
                        {editingCell?.rowIndex === index && editingCell?.field === "shelfLifeMonths" ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(index, "shelfLifeMonths")}
                            onKeyDown={(e) => e.key === "Enter" && handleCellBlur(index, "shelfLifeMonths")}
                            className="w-full px-2 py-1 border rounded"
                            autoFocus
                          />
                        ) : (
                          product.shelfLifeMonths ? `${product.shelfLifeMonths}개월` : "-"
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate" onClick={() => handleCellClick(index, "description", product.description || "")}>
                        {editingCell?.rowIndex === index && editingCell?.field === "description" ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(index, "description")}
                            onKeyDown={(e) => e.key === "Enter" && handleCellBlur(index, "description")}
                            className="w-full px-2 py-1 border rounded"
                            autoFocus
                          />
                        ) : (
                          product.description || "-"
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                  {parsedData.length > 10 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-gray-500">
                        ... 외 {parsedData.length - 10}개 제품
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                취소
              </Button>
              <Button
                onClick={handleBulkUpload}
                disabled={bulkCreateMutation.isPending}
              >
                {bulkCreateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    등록 중...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    등록
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* 3단계: 결과 */}
        {step === "result" && uploadResult && (
          <div className="space-y-4">
            <Alert variant={uploadResult.success ? "default" : "destructive"}>
              <AlertDescription>
                <div className="flex items-center gap-2">
                  {uploadResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <div>
                    <div className="font-semibold">
                      {uploadResult.success ? "일괄 등록 완료" : "일부 등록 실패"}
                    </div>
                    <div className="text-sm">
                      총 {uploadResult.total}개 중 {uploadResult.successCount}개 성공,{" "}
                      {uploadResult.errorCount}개 실패
                    </div>
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            {uploadResult.errors.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>행 번호</TableHead>
                      <TableHead>제품명</TableHead>
                      <TableHead>오류 내용</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadResult.errors.map((error, index) => (
                      <TableRow key={index}>
                        <TableCell>{error.row}</TableCell>
                        <TableCell>{error.productName}</TableCell>
                        <TableCell className="text-red-600">{error.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleClose}>닫기</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
