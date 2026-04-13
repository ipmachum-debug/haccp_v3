import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CheckCircle, XCircle, Clock, Building2, Mail, User, Calendar,
  FileText, Loader2, Users, Shield, Phone, Hash
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import SuperAdminLayout from "@/components/dashboard/SuperAdminLayout";

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending: { label: "승인 대기", color: "bg-yellow-100 text-yellow-800" },
  approved: { label: "승인 완료", color: "bg-green-100 text-green-800" },
  rejected: { label: "거부", color: "bg-red-100 text-red-800" },
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: "슈퍼관리자",
  admin: "관리자",
  accountant: "회계",
  worker: "작업자",
  monitor: "품질검토자",
  inspector: "품질검사원",
  employee: "직원",
};

export default function UserApproval() {
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [adminMemo, setAdminMemo] = useState("");
  const [activeTab, setActiveTab] = useState("pending");

  const utils = trpc.useUtils();

  const { data: pendingData, isLoading: pendingLoading } = trpc.superadminApproval.getPendingClientAdmins.useQuery();
  const { data: allUsersData, isLoading: allLoading } = trpc.superadminApproval.getAllUsers.useQuery();

  const approveMutation = trpc.superadminApproval.approveClientAdmin.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.message);
      utils.superadminApproval.getPendingClientAdmins.invalidate();
      utils.superadminApproval.getAllUsers.invalidate();
      closeDialog();
    },
    onError: (error: any) => toast.error(error.message || "처리 중 오류가 발생했습니다."),
  });

  const handleApprove = () => {
    if (!selectedUser) return;
    approveMutation.mutate({ userId: selectedUser.id, action: "approve", adminMemo: adminMemo.trim() || undefined });
  };

  const handleReject = () => {
    if (!selectedUser) return;
    if (!adminMemo.trim()) { toast.error("거부 사유를 입력해주세요."); return; }
    approveMutation.mutate({ userId: selectedUser.id, action: "reject", adminMemo: adminMemo.trim() });
  };

  const openDialog = (user: any, actionType: "approve" | "reject") => {
    setSelectedUser(user); setAction(actionType); setAdminMemo("");
  };
  const closeDialog = () => {
    setSelectedUser(null); setAction(null); setAdminMemo("");
  };

  const pendingUsers = pendingData?.users || [];
  const allUsers = allUsersData?.users || [];
  const approvedUsers = allUsers.filter((u: any) => u.approvalStatus === "approved");
  const rejectedUsers = allUsers.filter((u: any) => u.approvalStatus === "rejected");

  const isLoading = pendingLoading || allLoading;

  if (isLoading) {
    return (
      <SuperAdminLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </SuperAdminLayout>
    );
  }

  return (
    <SuperAdminLayout>
      <div className="container mx-auto p-6 max-w-7xl space-y-6">
        {/* 헤더 */}
        <div>
          <h1 className="text-3xl font-bold">클라이언트 승인 관리</h1>
          <p className="text-muted-foreground mt-1">
            신규 가입 승인, 처리 이력, 전체 사용자 현황을 관리합니다
          </p>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">승인 대기</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{pendingUsers.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">승인 완료</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{approvedUsers.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">거부</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{rejectedUsers.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">전체 사용자</CardTitle>
              <Users className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{allUsers.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* 탭 */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="pending" className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              대기 ({pendingUsers.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              처리 이력
            </TabsTrigger>
            <TabsTrigger value="all" className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              전체 ({allUsers.length})
            </TabsTrigger>
          </TabsList>

          {/* 승인 대기 */}
          <TabsContent value="pending">
            {pendingUsers.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <CheckCircle className="w-12 h-12 text-green-500 mb-3" />
                  <h3 className="text-lg font-semibold">모든 신청이 처리되었습니다</h3>
                  <p className="text-muted-foreground text-sm">승인 대기 중인 요청이 없습니다</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pendingUsers.map((user: any) => (
                  <UserCard key={user.id} user={user} onApprove={() => openDialog(user, "approve")} onReject={() => openDialog(user, "reject")} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* 처리 이력 */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">승인/거부 이력</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[...approvedUsers, ...rejectedUsers]
                    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((user: any) => (
                      <div key={user.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{user.name}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right text-xs text-muted-foreground">
                            <p>{user.companyName || "-"}</p>
                            <p>{new Date(user.createdAt).toLocaleDateString("ko-KR")}</p>
                          </div>
                          <Badge className={STATUS_BADGE[user.approvalStatus]?.color || ""}>
                            {STATUS_BADGE[user.approvalStatus]?.label || user.approvalStatus}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  {approvedUsers.length + rejectedUsers.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">처리된 이력이 없습니다</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 전체 사용자 */}
          <TabsContent value="all">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">전체 사용자 현황</CardTitle>
                <CardDescription>모든 테넌트의 등록된 사용자 목록</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 font-medium">이름</th>
                        <th className="text-left py-2 px-3 font-medium">이메일</th>
                        <th className="text-left py-2 px-3 font-medium">회사</th>
                        <th className="text-left py-2 px-3 font-medium">역할</th>
                        <th className="text-left py-2 px-3 font-medium">테넌트</th>
                        <th className="text-left py-2 px-3 font-medium">상태</th>
                        <th className="text-left py-2 px-3 font-medium">가입일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allUsers.map((user: any) => (
                        <tr key={user.id} className="border-b hover:bg-muted/30">
                          <td className="py-2.5 px-3 font-medium">{user.name}</td>
                          <td className="py-2.5 px-3 text-muted-foreground">{user.email}</td>
                          <td className="py-2.5 px-3">{user.companyName || "-"}</td>
                          <td className="py-2.5 px-3">
                            <Badge variant="outline" className="text-xs">
                              {ROLE_LABEL[user.role] || user.role}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-xs">{user.tenantId || "-"}</td>
                          <td className="py-2.5 px-3">
                            <Badge className={`text-xs ${user.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                              {user.isActive ? "활성" : "비활성"}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-muted-foreground">
                            {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* 승인/거부 다이얼로그 */}
      <Dialog open={!!selectedUser} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {action === "approve" ? "클라이언트 관리자 승인" : "클라이언트 관리자 거부"}
            </DialogTitle>
            <DialogDescription>
              {action === "approve"
                ? "승인하면 새 테넌트가 생성되고, 사용자가 즉시 시스템을 사용할 수 있습니다."
                : "거부 사유를 입력해주세요. 사용자에게 이메일로 안내됩니다."}
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <InfoField icon={User} label="이름" value={selectedUser.name} />
                <InfoField icon={Mail} label="이메일" value={selectedUser.email} />
                <InfoField icon={Building2} label="회사명" value={selectedUser.companyName || "미입력"} />
                <InfoField icon={Hash} label="사업자번호" value={selectedUser.businessNumber || "미입력"} />
              </div>
              {selectedUser.userMemo && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <p className="text-xs font-medium mb-1">신청자 메모</p>
                  <p className="text-sm text-muted-foreground">{selectedUser.userMemo}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label>{action === "approve" ? "관리자 메모 (선택)" : "거부 사유 (필수)"}</Label>
                <Textarea
                  placeholder={action === "approve" ? "승인 메모 (선택)" : "거부 사유 입력 (필수)"}
                  value={adminMemo} onChange={(e) => setAdminMemo(e.target.value)} rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={approveMutation.isPending}>취소</Button>
            <Button
              onClick={action === "approve" ? handleApprove : handleReject}
              disabled={approveMutation.isPending}
              className={action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {approveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {action === "approve" ? "승인" : "거부"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SuperAdminLayout>
  );
}

function InfoField({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 p-2.5 bg-muted/50 rounded-lg">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function UserCard({ user, onApprove, onReject }: { user: any; onApprove: () => void; onReject: () => void }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shrink-0">
              <User className="h-6 w-6 text-blue-600" />
            </div>
            <div className="space-y-2 flex-1">
              <div>
                <h3 className="font-semibold text-base">{user.name}</h3>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> {user.email}
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" /> {user.companyName || "미입력"}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Hash className="h-3.5 w-3.5" /> {user.businessNumber || "미입력"}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" /> {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </div>
              {user.userMemo && (
                <p className="text-xs bg-blue-50 dark:bg-blue-950 px-3 py-2 rounded-md text-muted-foreground">
                  "{user.userMemo}"
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Button size="sm" onClick={onApprove} className="bg-green-600 hover:bg-green-700 text-white">
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> 승인
            </Button>
            <Button size="sm" variant="destructive" onClick={onReject}>
              <XCircle className="w-3.5 h-3.5 mr-1.5" /> 거부
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
