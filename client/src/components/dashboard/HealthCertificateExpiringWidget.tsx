import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, FileText, Calendar } from "lucide-react";
import { Link } from "wouter";

/**
 * 보건증 만료 임박 위젯
 * - 만료 임박 보건증 목록 표시
 * - 만료일 기준 정렬
 */
export function HealthCertificateExpiringWidget() {
  const { data: certificates, isLoading } = trpc.healthCertificate.getUpcoming.useQuery({ limit: 5 });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            보건증 만료 임박
          </CardTitle>
          <CardDescription>만료 예정인 보건증을 확인하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">로딩 중...</div>
        </CardContent>
      </Card>
    );
  }

  if (!certificates || certificates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            보건증 만료 임박
          </CardTitle>
          <CardDescription>만료 예정인 보건증을 확인하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            만료 임박 보건증이 없습니다
          </div>
        </CardContent>
      </Card>
    );
  }

  // 만료일까지 남은 일수 계산
  const getDaysUntilExpiry = (expiryDate: Date) => {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diff = expiry.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  // 상태별 배지 색상
  const getStatusBadge = (daysLeft: number) => {
    if (daysLeft < 0) {
      return <Badge variant="destructive">만료됨</Badge>;
    } else if (daysLeft <= 7) {
      return <Badge variant="destructive">{daysLeft}일 남음</Badge>;
    } else if (daysLeft <= 30) {
      return <Badge className="bg-yellow-500 text-white border-transparent">{daysLeft}일 남음</Badge>;
    } else {
      return <Badge variant="secondary">{daysLeft}일 남음</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-500" />
          보건증 만료 임박
        </CardTitle>
        <CardDescription>만료 예정인 보건증을 확인하세요</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {certificates.map((cert: any) => {
            const daysLeft = getDaysUntilExpiry(cert.expiryDate);
            return (
              <Link key={cert.id} href={`/health-certificates/${cert.id}`}>
                <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{cert.employeeName}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(cert.expiryDate).toLocaleDateString("ko-KR")}
                      </div>
                    </div>
                  </div>
                  {getStatusBadge(daysLeft)}
                </div>
              </Link>
            );
          })}
        </div>
        <Link href="/health-certificates">
          <div className="text-center text-sm text-primary hover:underline mt-4 cursor-pointer">
            전체 보건증 보기 →
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}
