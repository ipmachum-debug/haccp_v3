import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, UserPlus, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

type UserRole = "admin" | "worker" | "monitor";

const roleLabels: Record<UserRole, string> = {
  admin: "관리자",
  worker: "작업자",
  monitor: "모니터",
};

const roleColors: Record<UserRole, string> = {
  admin: "bg-red-100 text-red-800",
  worker: "bg-blue-100 text-blue-800",
  monitor: "bg-green-100 text-green-800",
};

export default function UserManagement() {
  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    name: "",
    role: "worker" as UserRole,
    userMemo: "",
  });

  const { data: users, isLoading, refetch } = trpc.user.list.useQuery();

  const updateRoleMutation = trpc.user.updateRole.useMutation({
    onSuccess: () => {
      toast.success("역할이 변경되었습니다");
      refetch();
    },
    onError: (error) => {
      toast.error(`역할 변경 실패: ${error.message}`);
    },
  });

  const toggleActiveMutation = trpc.user.toggleActive.useMutation({
    onSuccess: () => {
      toast.success("상태가 변경되었습니다");
      refetch();
    },
    onError: (error) => {
      toast.error(`상태 변경 실패: ${error.message}`);
    },
  });

  const deleteMutation = trpc.user.delete.useMutation({
    onSuccess: () => {
      toast.success("사용자가 삭제되었습니다");
      refetch();
    },
    onError: (error) => {
      toast.error(`사용자 삭제 실패: ${error.message}`);
    },
  });

  const batchApproveMutation = trpc.user.batchApprove.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setSelectedUsers([]);
      refetch();
    },
    onError: (error) => {
      toast.error(`일괄 승인 실패: ${error.message}`);
    },
  });

  const batchRejectMutation = trpc.user.batchReject.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setSelectedUsers([]);
      refetch();
    },
    onError: (error) => {
      toast.error(`일괄 거부 실패: ${error.message}`);
    },
  });

  const inviteMutation = trpc.user.invite.useMutation({
    onSuccess: (data) => {
      toast.success(`사용자가 초대되었습니다. 임시 비밀번호: ${data.tempPassword}`);
      setInviteDialogOpen(false);
      setInviteForm({
        email: "",
        name: "",
        role: "worker",
        userMemo: "",
      });
      refetch();
    },
    onError: (error) => {
      toast.error(`초대 실패: ${error.message}`);
    },
  });

  const handleRoleChange = (userId: number, newRole: UserRole) => {
    updateRoleMutation.mutate({ userId, role: newRole });
  };

  const handleToggleActive = (userId: number, isActive: boolean) => {
    toggleActiveMutation.mutate({ userId, isActive: !isActive });
  };

  const handleDelete = (userId: number) => {
    if (confirm("정말 이 사용자를 삭제하시겠습니까?")) {
      deleteMutation.mutate({ userId });
    }
  };

  const handleSelectUser = (userId: number, checked: boolean) => {
    if (checked) {
      setSelectedUsers([...selectedUsers, userId]);
    } else {
      setSelectedUsers(selectedUsers.filter((id) => id !== userId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const pendingUserIds = users?.filter((u) => u.approvalStatus === "pending").map((u) => u.id) || [];
      setSelectedUsers(pendingUserIds);
    } else {
      setSelectedUsers([]);
    }
  };

  const handleBatchApprove = () => {
    if (selectedUsers.length === 0) {
      toast.error("승인할 사용자를 선택해주세요");
      return;
    }
    batchApproveMutation.mutate({ userIds: selectedUsers });
  };

  const handleBatchReject = () => {
    if (selectedUsers.length === 0) {
      toast.error("거부할 사용자를 선택해주세요");
      return;
    }
    batchRejectMutation.mutate({ userIds: selectedUsers });
  };

  const handleInvite = () => {
    if (!inviteForm.email || !inviteForm.name) {
      toast.error("이메일과 이름을 입력해주세요");
      return;
    }
    inviteMutation.mutate(inviteForm);
  };

  const getFilteredUsers = () => {
    if (!users) return [];
    switch (activeTab) {
      case "pending":
        return users.filter((u) => u.approvalStatus === "pending");
      case "approved":
        return users.filter((u) => u.approvalStatus === "approved");
      case "rejected":
        return users.filter((u) => u.approvalStatus === "rejected");
      default:
        return users;
    }
  };

  const filteredUsers = getFilteredUsers();

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-center">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              사용자 초대
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>사용자 초대</DialogTitle>
              <DialogDescription>
                새로운 사용자를 초대합니다. 임시 비밀번호가 자동으로 생성됩니다.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={inviteForm.email}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, email: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">이름</Label>
                <Input
                  id="name"
                  placeholder="홍길동"
                  value={inviteForm.name}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, name: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">역할</Label>
                <Select
                  value={inviteForm.role}
                  onValueChange={(value: UserRole) =>
                    setInviteForm({ ...inviteForm, role: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">관리자</SelectItem>
                    <SelectItem value="worker">작업자</SelectItem>
                    <SelectItem value="monitor">모니터</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="userMemo">메모 (선택사항)</Label>
                <Textarea
                  id="userMemo"
                  placeholder="사용자에 대한 메모를 입력하세요"
                  value={inviteForm.userMemo}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, userMemo: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleInvite}>초대</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <div className="flex justify-between items-center mb-4">
          <TabsList>
            <TabsTrigger value="pending">
              승인 대기 ({users?.filter((u) => u.approvalStatus === "pending").length || 0})
            </TabsTrigger>
            <TabsTrigger value="approved">
              승인됨 ({users?.filter((u) => u.approvalStatus === "approved").length || 0})
            </TabsTrigger>
            <TabsTrigger value="rejected">
              거부됨 ({users?.filter((u) => u.approvalStatus === "rejected").length || 0})
            </TabsTrigger>
            <TabsTrigger value="all">전체 ({users?.length || 0})</TabsTrigger>
          </TabsList>

          {activeTab === "pending" && selectedUsers.length > 0 && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchApprove}
                disabled={batchApproveMutation.isPending}
              >
                <Check className="mr-2 h-4 w-4" />
                선택 승인 ({selectedUsers.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchReject}
                disabled={batchRejectMutation.isPending}
              >
                <X className="mr-2 h-4 w-4" />
                선택 거부 ({selectedUsers.length})
              </Button>
            </div>
          )}
        </div>

        <TabsContent value={activeTab} className="mt-0">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  {activeTab === "pending" && (
                    <TableHead className="w-12">
                      <Checkbox
                        checked={
                          filteredUsers.length > 0 &&
                          selectedUsers.length === filteredUsers.length
                        }
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                  )}
                  <TableHead>이메일</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>역할</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>마지막 로그인</TableHead>
                  <TableHead>가입일</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={activeTab === "pending" ? 8 : 7}
                      className="text-center py-8 text-muted-foreground"
                    >
                      사용자가 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      {activeTab === "pending" && (
                        <TableCell>
                          <Checkbox
                            checked={selectedUsers.includes(user.id)}
                            onCheckedChange={(checked) =>
                              handleSelectUser(user.id, checked as boolean)
                            }
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell>{user.name}</TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(value: UserRole) =>
                            handleRoleChange(user.id, value)
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">관리자</SelectItem>
                            <SelectItem value="worker">작업자</SelectItem>
                            <SelectItem value="monitor">모니터</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.isActive ? "default" : "secondary"}
                          className="cursor-pointer"
                          onClick={() => handleToggleActive(user.id, !!user.isActive)}
                        >
                          {user.isActive ? "활성" : "비활성"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleDateString("ko-KR")
                          : "없음"}
                      </TableCell>
                      <TableCell>
                        {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(user.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
