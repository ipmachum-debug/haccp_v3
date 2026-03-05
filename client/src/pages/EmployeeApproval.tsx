import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Mail, 
  User, 
  Calendar,
  Loader2,
  Users,
  UserCheck,
  Trash2,
  Shield
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export default function EmployeeApproval() {
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [action, setAction] = useState<"approve" | "reject" | "delete" | null>(null);
  const [adminMemo, setAdminMemo] = useState("");
  const [selectedRole, setSelectedRole] = useState<"worker" | "monitor">("worker");

  const utils = trpc.useUtils();

  // 승인 대기 중인 직원 조회
  const { data: pendingData, isLoading: pendingLoading } = trpc.adminEmployee.getPendingEmployees.useQuery();

  // 활성 직원 조회
  const { data: activeData, isLoading: activeLoading } = trpc.adminEmployee.getActiveEmployees.useQuery();

  // 승인/거부 mutation
  const approveMutation = trpc.adminEmployee.approveEmployee.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.adminEmployee.getPendingEmployees.invalidate();
      utils.adminEmployee.getActiveEmployees.invalidate();
      closeDialog();
    },
    onError: (error) => {
      toast.error(error.message || "처리 중 오류가 발생했습니다.");
    },
  });

  // 삭제 mutation
  const deleteMutation = trpc.adminEmployee.deleteEmployee.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.adminEmployee.getActiveEmployees.invalidate();
      closeDialog();
    },
    onError: (error) => {
      toast.error(error.message || "삭제 중 오류가 발생했습니다.");
    },
  });

  const handleApprove = () => {
    if (!selectedUser) return;
    
    approveMutation.mutate({
      userId: selectedUser.id,
      action: "approve",
      role: selectedRole,
      adminMemo: adminMemo.trim() || undefined,
    });
  };

  const handleReject = () => {
    if (!selectedUser) return;
    
    if (!adminMemo.trim()) {
      toast.error("거부 사유를 입력해주세요.");
      return;
    }
    
    approveMutation.mutate({
      userId: selectedUser.id,
      action: "reject",
      adminMemo: adminMemo.trim(),
    });
  };

  const handleDelete = () => {
    if (!selectedUser) return;
    
    deleteMutation.mutate({
      userId: selectedUser.id,
    });
  };

  const openDialog = (user: any, actionType: "approve" | "reject" | "delete") => {
    setSelectedUser(user);
    setAction(actionType);
    setAdminMemo("");
    setSelectedRole("worker");
  };

  const closeDialog = () => {
    setSelectedUser(null);
    setAction(null);
    setAdminMemo("");
    setSelectedRole("worker");
  };

  const pendingUsers = pendingData?.users || [];
  const activeUsers = activeData?.users || [];

  const roleLabels: Record<string, string> = {
    worker: "작업자",
    monitor: "모니터",
    admin: "관리자",
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            직원 승인 관리
          </h1>
          <p className="text-gray-600">
            소속 직원의 승인 요청을 처리하고 활성 직원을 관리할 수 있습니다.
          </p>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">승인 대기</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingUsers.length}</div>
              <p className="text-xs text-muted-foreground">
                검토가 필요한 신청
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">활성 직원</CardTitle>
              <UserCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeUsers.length}</div>
              <p className="text-xs text-muted-foreground">
                현재 활동 중인 직원
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">전체 직원</CardTitle>
              <Users className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingUsers.length + activeUsers.length}</div>
              <p className="text-xs text-muted-foreground">
                승인 대기 + 활성 직원
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 탭 */}
        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="pending">
              승인 대기 ({pendingUsers.length})
            </TabsTrigger>
            <TabsTrigger value="active">
              활성 직원 ({activeUsers.length})
            </TabsTrigger>
          </TabsList>

          {/* 승인 대기 탭 */}
          <TabsContent value="pending">
            {pendingLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : pendingUsers.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    모든 신청이 처리되었습니다
                  </h3>
                  <p className="text-gray-600 text-center">
                    현재 승인 대기 중인 직원이 없습니다.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {pendingUsers.map((user: any, index: number) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1, duration: 0.4 }}
                  >
                    <Card className="hover:shadow-lg transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                              <User className="w-5 h-5 text-blue-600" />
                              {user.name}
                            </CardTitle>
                            <CardDescription className="flex items-center gap-2">
                              <Mail className="w-4 h-4" />
                              {user.email}
                            </CardDescription>
                          </div>
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                            <Clock className="w-3 h-3 mr-1" />
                            승인 대기
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {/* 사용자 메모 */}
                          {user.userMemo && (
                            <div className="p-3 bg-blue-50 rounded-lg">
                              <p className="text-sm font-medium text-gray-900 mb-1">신청자 메모</p>
                              <p className="text-sm text-gray-700">{user.userMemo}</p>
                            </div>
                          )}

                          {/* 가입일 */}
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Calendar className="w-4 h-4" />
                            가입일: {new Date(user.createdAt).toLocaleString("ko-KR")}
                          </div>

                          {/* 액션 버튼 */}
                          <div className="flex gap-3 pt-4 border-t">
                            <Button
                              onClick={() => openDialog(user, "approve")}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              승인
                            </Button>
                            <Button
                              onClick={() => openDialog(user, "reject")}
                              variant="destructive"
                              className="flex-1"
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              거부
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* 활성 직원 탭 */}
          <TabsContent value="active">
            {activeLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : activeUsers.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Users className="w-16 h-16 text-gray-400 mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    활성 직원이 없습니다
                  </h3>
                  <p className="text-gray-600 text-center">
                    승인된 직원이 없습니다.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {activeUsers.map((user: any, index: number) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1, duration: 0.4 }}
                  >
                    <Card className="hover:shadow-lg transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                              <User className="w-5 h-5 text-blue-600" />
                              {user.name}
                            </CardTitle>
                            <CardDescription className="flex items-center gap-2">
                              <Mail className="w-4 h-4" />
                              {user.email}
                            </CardDescription>
                          </div>
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            <Shield className="w-3 h-3 mr-1" />
                            {roleLabels[user.role] || user.role}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {/* 가입일 */}
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Calendar className="w-4 h-4" />
                            가입일: {new Date(user.createdAt).toLocaleString("ko-KR")}
                          </div>

                          {/* 액션 버튼 */}
                          <div className="flex gap-3 pt-4 border-t">
                            <Button
                              onClick={() => openDialog(user, "delete")}
                              variant="destructive"
                              className="w-full"
                              disabled={user.role === "admin"}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              삭제
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* 액션 확인 다이얼로그 */}
      <Dialog open={!!selectedUser} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "approve" && "직원 승인"}
              {action === "reject" && "직원 거부"}
              {action === "delete" && "직원 삭제"}
            </DialogTitle>
            <DialogDescription>
              {action === "approve" && "승인하면 직원이 즉시 시스템을 사용할 수 있습니다."}
              {action === "reject" && "거부 시 사용자에게 이메일로 알림이 전송됩니다."}
              {action === "delete" && "삭제하면 직원이 시스템에 접근할 수 없게 됩니다."}
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">직원 정보</p>
                <div className="p-3 bg-gray-50 rounded-lg space-y-1">
                  <p className="text-sm">
                    <span className="font-medium">이름:</span> {selectedUser.name}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">이메일:</span> {selectedUser.email}
                  </p>
                </div>
              </div>

              {action === "approve" && (
                <div className="space-y-2">
                  <Label htmlFor="role">부여할 역할</Label>
                  <Select value={selectedRole} onValueChange={(value: any) => setSelectedRole(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="worker">작업자 (Worker)</SelectItem>
                      <SelectItem value="monitor">모니터 (Monitor)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(action === "reject" || action === "approve") && (
                <div className="space-y-2">
                  <Label htmlFor="adminMemo">
                    {action === "approve" ? "관리자 메모 (선택)" : "거부 사유 (필수)"}
                  </Label>
                  <Textarea
                    id="adminMemo"
                    placeholder={
                      action === "approve"
                        ? "승인 관련 메모를 입력하세요 (선택)"
                        : "거부 사유를 입력하세요 (필수)"
                    }
                    value={adminMemo}
                    onChange={(e) => setAdminMemo(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={closeDialog} 
              disabled={approveMutation.isPending || deleteMutation.isPending}
            >
              취소
            </Button>
            <Button
              onClick={
                action === "approve" 
                  ? handleApprove 
                  : action === "reject" 
                  ? handleReject 
                  : handleDelete
              }
              disabled={approveMutation.isPending || deleteMutation.isPending}
              className={
                action === "approve"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
              }
            >
              {(approveMutation.isPending || deleteMutation.isPending) ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  처리 중...
                </>
              ) : action === "approve" ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  승인하기
                </>
              ) : action === "reject" ? (
                <>
                  <XCircle className="w-4 h-4 mr-2" />
                  거부하기
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  삭제하기
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
