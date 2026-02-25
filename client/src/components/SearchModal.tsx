import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, FileText } from "lucide-react";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export const SearchModal = ({ open, onClose }: SearchModalProps) => {
  const [keyword, setKeyword] = useState("");
  const [logType, setLogType] = useState("all");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const handleSearch = async () => {
    if (!keyword.trim()) {
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(
        `/api/search/all?tenantId=1&keyword=${encodeURIComponent(keyword)}&logType=${logType}`
      );
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error("검색 오류:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const getLogTypeName = (type: string) => {
    const types: Record<string, string> = {
      daily: "일일일지",
      weekly_hygiene: "주간 일반위생관리",
      weekly_pest: "주간 방충방서",
      monthly_hygiene: "월간 일반위생관리",
      monthly_ccp: "월간 CCP 검증",
      yearly: "연간일지",
      custom: "특정기간일지",
    };
    return types[type] || type;
  };
  
  const getStatusColor = (status: string) => {
    if (status === "승인완료") return "bg-green-100 text-green-800";
    if (status === "승인대기") return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-800";
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>일지 통합 검색</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* 검색 입력 */}
          <div className="flex gap-2">
            <Select value={logType} onValueChange={setLogType}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="daily">일일일지</SelectItem>
                <SelectItem value="weekly_hygiene">주간 일반위생관리</SelectItem>
                <SelectItem value="weekly_pest">주간 방충방서</SelectItem>
                <SelectItem value="monthly_hygiene">월간 일반위생관리</SelectItem>
                <SelectItem value="monthly_ccp">월간 CCP 검증</SelectItem>
                <SelectItem value="yearly">연간일지</SelectItem>
                <SelectItem value="custom">특정기간일지</SelectItem>
              </SelectContent>
            </Select>
            
            <Input
              placeholder="검색어를 입력하세요 (작성자, 내용 등)"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1"
            />
            
            <Button onClick={handleSearch} disabled={loading}>
              <Search className="w-4 h-4 mr-2" />
              검색
            </Button>
          </div>
          
          {/* 검색 결과 */}
          <div className="space-y-2">
            {loading ? (
              <div className="text-center py-8 text-gray-500">검색 중...</div>
            ) : results.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {keyword ? "검색 결과가 없습니다." : "검색어를 입력하고 검색 버튼을 클릭하세요."}
              </div>
            ) : (
              <>
                <div className="text-sm text-gray-600 mb-2">
                  총 {results.length}개의 결과
                </div>
                {results.map((result) => (
                  <div
                    key={`${result.log_type}-${result.id}`}
                    className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">{getLogTypeName(result.log_type)}</span>
                        <Badge className={getStatusColor(result.status)}>
                          {result.status}
                        </Badge>
                      </div>
                      <span className="text-sm text-gray-500">{result.log_date}</span>
                    </div>
                    
                    <div className="text-sm text-gray-600 mb-1">
                      작성자: {result.inspector || "-"}
                    </div>
                    
                    {result.notes && (
                      <div className="text-sm text-gray-500 line-clamp-2">
                        {result.notes}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
