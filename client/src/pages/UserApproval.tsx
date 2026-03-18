import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, Clock, User, Mail, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SuperAdminLayout from "@/components/SuperAdminLayout";

interface PendingUser {
  id: number;
  email: string;
  name: string;
  role: string;
  tenantId: number | null;
  createdAt: string;
}

export default function UserApproval() {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<PendingUser | null>(null);
  const [approveDialog, setApproveDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [selectedRole, setSelectedRole] = useState("worker");
  const [rejectReason, setRejectReason] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const fetchPendingUsers = async () => {
    try {
      const response = await fetch("/api/superadmin/users/pending", {
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error("대기 중인 사용자 조회 실패");
      }

      const data = await response.json();
      setPendingUsers(data);
    } catch (error) {
      console.error("사용자 조회 오류:", error);
      toast({
        title: "오류",
        description: "대기 중인 사용자를 불러올 수 없습니다.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedUser) return;

    try {
      const response = await fetch(`/api/superadmin/users/${selectedUser.id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ role: selectedRole })
      });

      if (!response.ok) {
        throw new Error("사용자 승인 실패");
      }

      toast({
        title: "승인 완료",
        description: `${selectedUser.name}님이 ${selectedRole} 역할로 승인되었습니다.`,
      });

      setApproveDialog(false);
      setSelectedUser(null);
      fetchPendingUsers();
    } catch (error) {
      console.error("승인 오류:", error);
      toast({
        title: "오류",
        description: "사용자 승인 중 문제가 발생했습니다.",
        variant: "destructive"
      });
    }
  };

  const handleReject = async () => {
    if (!selectedUser) return;

    try {
      const response = await fetch(`/api/superadmin/users/${selectedUser.id}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ reason: rejectReason })
      });

      if (!response.ok) {
        throw new Error("사용자 거부 실패");
      }

      toast({
        title: "거부 완료",
        description: `${selectedUser.name}님의 가입 요청이 거부되었습니다.`,
      });

      setRejectDialog(false);
      setSelectedUser(null);
      setRejectReason("");
      fetchPendingUsers();
    } catch (error) {
      console.error("거부 오류:", error);
      toast({
        title: "오류",
        description: "사용자 거부 중 문제가 발생했습니다.",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <SuperAdminLayout>
      <div className="container mx-auto py-8 px-4">
      <Card className="shadow-lg">
        <CardHeader className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">
          <CardTitle className="text-2xl flex items-center gap-2">
            <Clock className="h-6 w-6" />
            사용자 승인 관리
          </CardTitle>
          <CardDescription className="text-purple-100">
            가입 대기 중인 사용자를 검토하고 승인하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {pendingUsers.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">승인 대기 중인 사용자가 없습니다</h3>
              <p className="text-muted-foreground">모든 사용자가 승인되었습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    <TableHead>이메일</TableHead>
                    <TableHead>가입일</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {user.name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          {user.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                          <Clock className="h-3 w-3 mr-1" />
                          대기 중
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => {
                            setSelectedUser(user);
                            setApproveDialog(true);
                          }}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          승인
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setSelectedUser(user);
                            setRejectDialog(true);
                          }}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          거부
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 승인 다이얼로그 */}
      <Dialog open={approveDialog} onOpenChange={setApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>사용자 승인</DialogTitle>
            <DialogDescription>
              {selectedUser?.name}님을 승인하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="block text-sm font-medium mb-2">역할 선택</label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue placeholder="역할을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">관리자</SelectItem>
                <SelectItem value="worker">작업자</SelectItem>
                <SelectItem value="monitor">모니터</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialog(false)}>
              취소
            </Button>
            <Button onClick={handleApprove} className="bg-green-600 hover:bg-green-700">
              승인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 거부 다이얼로그 */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>사용자 거부</DialogTitle>
            <DialogDescription>
              {selectedUser?.name}님의 가입 요청을 거부하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="block text-sm font-medium mb-2">거부 사유 (선택)</label>
            <Textarea
              placeholder="거부 사유를 입력하세요..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              거부
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </SuperAdminLayout>
  );
}
