import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Building2, Save } from "lucide-react";

export default function CompanySettings() {
  return (
    <DashboardLayout>
      <CompanySettingsContent />
    </DashboardLayout>
  );
}

function CompanySettingsContent() {
  const [formData, setFormData] = useState({
    companyName: "",
    businessNumber: "",
    address: "",
    representative: "",
    phone: "",
  });

  // 회사 정보 조회
  const { data: companyInfo, isLoading } = trpc.companyInfo.get.useQuery();

  // 회사 정보가 로드되면 폼 초기화
  useEffect(() => {
    if (companyInfo) {
      setFormData({
        companyName: companyInfo.companyName || "",
        businessNumber: companyInfo.businessNumber || "",
        address: companyInfo.address || "",
        representative: companyInfo.representative || "",
        phone: companyInfo.phone || "",
      });
    }
  }, [companyInfo]);

  // 회사 정보 저장 mutation
  const updateMutation = trpc.companyInfo.update.useMutation({
    onSuccess: () => {
      toast({
        title: "저장 완료",
        description: "회사 정보가 저장되었습니다.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "저장 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 유효성 검사
    if (!formData.companyName) {
      toast({
        title: "입력 오류",
        description: "회사명을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate({
      companyName: formData.companyName,
      businessNumber: formData.businessNumber || undefined,
      address: formData.address || undefined,
      representative: formData.representative || undefined,
      phone: formData.phone || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8 text-muted-foreground">
          데이터를 불러오는 중...
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">회사 정보 설정</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            기본 정보
          </CardTitle>
          <CardDescription>
            거래명세표 및 공식 문서에 표시될 회사 정보를 입력하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 회사명 */}
              <div className="space-y-2">
                <Label htmlFor="companyName">
                  회사명 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) =>
                    setFormData({ ...formData, companyName: e.target.value })
                  }
                  placeholder="예: (주)한국식품"
                  required
                />
              </div>

              {/* 사업자번호 */}
              <div className="space-y-2">
                <Label htmlFor="businessNumber">사업자번호</Label>
                <Input
                  id="businessNumber"
                  value={formData.businessNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, businessNumber: e.target.value })
                  }
                  placeholder="예: 123-45-67890"
                />
              </div>

              {/* 주소 */}
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">주소</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  placeholder="예: 서울시 강남구 테헤란로 123"
                />
              </div>

              {/* 대표자 */}
              <div className="space-y-2">
                <Label htmlFor="representative">대표자</Label>
                <Input
                  id="representative"
                  value={formData.representative}
                  onChange={(e) =>
                    setFormData({ ...formData, representative: e.target.value })
                  }
                  placeholder="예: 홍길동"
                />
              </div>

              {/* 전화번호 */}
              <div className="space-y-2">
                <Label htmlFor="phone">전화번호</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  placeholder="예: 02-1234-5678"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? "저장 중..." : "저장"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 안내 메시지 */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-blue-100 p-2">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-blue-900">회사 정보 활용</p>
              <p className="text-sm text-blue-800">
                여기에 입력한 회사 정보는 거래명세표 PDF 생성 시 자동으로 포함됩니다.
                정확한 정보를 입력하여 전문적인 문서를 작성하세요.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
