import React, { useState } from "react";
import { jsPDF } from "jspdf";
import { generateSealImage } from "./SealGenerator";

import { todayLocal } from "../lib/dateUtils";

interface Document {
  id: number;
  type: string;
  title: string;
  date: string;
  inspector?: string;
  reviewedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  status: string;
  data: any;
}

interface BulkPrintManagerProps {
  documents: Document[];
  onClose: () => void;
}

/**
 * 문서 일괄인쇄 관리 컴포넌트
 * 여러 문서를 선택하여 하나의 PDF로 출력하거나 개별 PDF로 출력
 */
export const BulkPrintManager: React.FC<BulkPrintManagerProps> = ({
  documents,
  onClose,
}) => {
  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);
  const [printMode, setPrintMode] = useState<"merged" | "individual">("merged");
  const [isProcessing, setIsProcessing] = useState(false);

  const toggleSelection = (docId: number) => {
    setSelectedDocs((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId]
    );
  };

  const selectAll = () => {
    setSelectedDocs(documents.map((doc) => doc.id));
  };

  const deselectAll = () => {
    setSelectedDocs([]);
  };

  const generateDocumentPage = (doc: jsPDF, document: Document, pageNum?: number) => {
    // 제목
    doc.setFontSize(18);
    doc.text(document.title, 105, 20, { align: "center" });

    // 기본 정보
    doc.setFontSize(12);
    let yPos = 40;
    doc.text(`작성일자: ${document.date}`, 20, yPos);
    yPos += 10;
    doc.text(`작성자: ${document.inspector || "-"}`, 20, yPos);
    yPos += 10;
    doc.text(`상태: ${document.status}`, 20, yPos);
    yPos += 20;

    // 문서 내용
    doc.setFontSize(10);
    if (document.data?.checklistItems && Array.isArray(document.data.checklistItems)) {
      doc.setFontSize(14);
      doc.text("체크리스트", 20, yPos);
      yPos += 10;
      doc.setFontSize(10);

      document.data.checklistItems.forEach((item: any, index: number) => {
        const status = item.checked ? "✓" : "✗";
        doc.text(`${index + 1}. ${item.name}: ${status}`, 25, yPos);
        yPos += 10;

        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }
      });
    }

    // 특이사항
    if (document.data?.notes) {
      yPos += 10;
      doc.setFontSize(12);
      doc.text("특이사항", 20, yPos);
      yPos += 10;
      doc.setFontSize(10);
      const splitNotes = doc.splitTextToSize(document.data.notes, 170);
      doc.text(splitNotes, 20, yPos);
      yPos += splitNotes.length * 7;
    }

    // 날인 표기 - 자동생성 직인 추가
    yPos = 250;
    doc.setFontSize(10);

    // 작성자 직인
    if (document.inspector) {
      doc.text("작성자:", 20, yPos);
      const writerSeal = generateSealImage(document.inspector, { type: "round", size: 60 });
      if (writerSeal) {
        doc.addImage(writerSeal, "PNG", 20, yPos + 2, 15, 15);
      }
    }

    // 검토자 직인
    if (document.reviewedBy) {
      doc.text("검토자:", 80, yPos);
      const reviewerSeal = generateSealImage(document.reviewedBy, { type: "round", size: 60 });
      if (reviewerSeal) {
        doc.addImage(reviewerSeal, "PNG", 80, yPos + 2, 15, 15);
      }
    }

    // 승인자 직인
    if (document.approvedBy && document.status === "승인완료") {
      doc.text("승인자:", 140, yPos);
      const approverSeal = generateSealImage(document.approvedBy, { date: document.approvedAt?.split(" ")[0], type: "round", size: 60 });
      if (approverSeal) {
        doc.addImage(approverSeal, "PNG", 140, yPos + 2, 15, 15);
      }
    }

    // 페이지 번호 (옵션)
    if (pageNum) {
      doc.setFontSize(8);
      doc.text(`페이지 ${pageNum}`, 105, 285, { align: "center" });
    }
  };

  const handlePrint = async () => {
    if (selectedDocs.length === 0) {
      alert("인쇄할 문서를 선택해주세요.");
      return;
    }

    setIsProcessing(true);

    try {
      const selectedDocuments = documents.filter((doc) =>
        selectedDocs.includes(doc.id)
      );

      if (printMode === "merged") {
        // 병합 인쇄 - 하나의 PDF로
        const doc = new jsPDF();
        let isFirstPage = true;

        selectedDocuments.forEach((document, index) => {
          if (!isFirstPage) {
            doc.addPage();
          }
          generateDocumentPage(doc, document, index + 1);
          isFirstPage = false;
        });

        doc.save(`일괄인쇄_${todayLocal()}.pdf`);
      } else {
        // 개별 인쇄 - 각각 별도 PDF로
        selectedDocuments.forEach((document) => {
          const doc = new jsPDF();
          generateDocumentPage(doc, document);
          doc.save(`${document.title}_${document.date}.pdf`);
        });
      }

      alert(`${selectedDocs.length}개 문서 인쇄 완료`);
      onClose();
    } catch (error) {
      console.error("인쇄 오류:", error);
      alert("인쇄 중 오류가 발생했습니다.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-semibold">문서 일괄인쇄</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* 컨트롤 */}
        <div className="px-6 py-4 border-b border-gray-200 space-y-4">
          <div className="flex gap-4 items-center">
            <button
              onClick={selectAll}
              className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
            >
              전체 선택
            </button>
            <button
              onClick={deselectAll}
              className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
            >
              선택 해제
            </button>
            <span className="text-sm text-gray-600">
              {selectedDocs.length}개 선택됨
            </span>
          </div>

          <div className="flex gap-4 items-center">
            <label className="text-sm font-medium">인쇄 방식:</label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="merged"
                checked={printMode === "merged"}
                onChange={(e) => setPrintMode(e.target.value as "merged")}
              />
              <span className="text-sm">병합 인쇄 (하나의 PDF)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="individual"
                checked={printMode === "individual"}
                onChange={(e) => setPrintMode(e.target.value as "individual")}
              />
              <span className="text-sm">개별 인쇄 (각각 PDF)</span>
            </label>
          </div>
        </div>

        {/* 문서 목록 */}
        <div className="px-6 py-4 overflow-y-auto max-h-96">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium">선택</th>
                <th className="px-4 py-2 text-left text-sm font-medium">문서명</th>
                <th className="px-4 py-2 text-left text-sm font-medium">날짜</th>
                <th className="px-4 py-2 text-left text-sm font-medium">작성자</th>
                <th className="px-4 py-2 text-left text-sm font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr
                  key={doc.id}
                  className={`border-b ${
                    selectedDocs.includes(doc.id) ? "bg-blue-50" : ""
                  }`}
                >
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selectedDocs.includes(doc.id)}
                      onChange={() => toggleSelection(doc.id)}
                    />
                  </td>
                  <td className="px-4 py-2 text-sm">{doc.title}</td>
                  <td className="px-4 py-2 text-sm">{doc.date}</td>
                  <td className="px-4 py-2 text-sm">{doc.inspector || "-"}</td>
                  <td className="px-4 py-2 text-sm">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        doc.status === "승인완료"
                          ? "bg-green-100 text-green-800"
                          : doc.status === "대기"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {doc.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
            disabled={isProcessing}
          >
            취소
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
            disabled={isProcessing || selectedDocs.length === 0}
          >
            {isProcessing ? "처리 중..." : "인쇄"}
          </button>
        </div>
      </div>
    </div>
  );
};
