import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function BannerManagement() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedBanner, setSelectedBanner] = useState<any>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    type: "welcome" as "welcome" | "event" | "notice" | "update",
    color: "blue",
    icon: "sun",
    startDate: "",
    endDate: "",
    priority: 1,
    isActive: true,
  });

  // Queries
  const { data: banners, refetch } = trpc.banner.getAll.useQuery();

  // Mutations
  const createMutation = trpc.banner.create.useMutation({
    onSuccess: () => {
      toast({
        title: "배너 생성 완료",
        description: "새 배너가 성공적으로 생성되었습니다.",
      });
      setIsCreateDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "배너 생성 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = trpc.banner.update.useMutation({
    onSuccess: () => {
      toast({
        title: "배너 수정 완료",
        description: "배너가 성공적으로 수정되었습니다.",
      });
      setIsEditDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "배너 수정 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = trpc.banner.delete.useMutation({
    onSuccess: () => {
      toast({
        title: "배너 삭제 완료",
        description: "배너가 성공적으로 삭제되었습니다.",
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "배너 삭제 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = trpc.banner.update.useMutation({
    onSuccess: () => {
      toast({
        title: "배너 상태 변경 완료",
        description: "배너 활성화 상태가 변경되었습니다.",
      });
      refetch();
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      content: "",
      type: "welcome",
      color: "blue",
      icon: "sun",
      startDate: "",
      endDate: "",
      priority: 1,
      isActive: true,
    });
    setSelectedBanner(null);
  };

  const handleCreate = () => {
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!selectedBanner) return;
    updateMutation.mutate({
      id: selectedBanner.id,
      ...formData,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("정말 이 배너를 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleToggleActive = (banner: any) => {
    toggleActiveMutation.mutate({
      id: banner.id,
      isActive: !banner.isActive,
    });
  };

  const handleEdit = (banner: any) => {
    setSelectedBanner(banner);
    setFormData({
      title: banner.title,
      content: banner.content,
      type: banner.type,
      color: banner.color,
      icon: banner.icon,
      startDate: banner.startDate?.split("T")[0] || "",
      endDate: banner.endDate?.split("T")[0] || "",
      priority: banner.priority,
      isActive: banner.isActive,
    });
    setIsEditDialogOpen(true);
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      welcome: "환영",
      event: "이벤트",
      notice: "공지",
      update: "업데이트",
    };
    return labels[type] || type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      welcome: "bg-blue-500",
      event: "bg-pink-500",
      notice: "bg-yellow-500",
      update: "bg-green-500",
    };
    return colors[type] || "bg-gray-500";
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">배너 관리</h1>
          <p className="text-muted-foreground mt-2">
            대시보드 환영 배너 및 이벤트 배너 관리
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="mr-2 h-4 w-4" />새 배너 생성
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>새 배너 생성</DialogTitle>
              <DialogDescription>
                대시보드에 표시될 새로운 배너를 생성합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="title">제목</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="배너 제목을 입력하세요"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="content">내용</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  placeholder="배너 내용을 입력하세요"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="type">타입</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: any) =>
                      setFormData({ ...formData, type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="welcome">환영</SelectItem>
                      <SelectItem value="event">이벤트</SelectItem>
                      <SelectItem value="notice">공지</SelectItem>
                      <SelectItem value="update">업데이트</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="priority">우선순위</Label>
                  <Input
                    id="priority"
                    type="number"
                    min="1"
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        priority: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="color">색상</Label>
                  <Select
                    value={formData.color}
                    onValueChange={(value) =>
                      setFormData({ ...formData, color: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blue">파란색</SelectItem>
                      <SelectItem value="pink">분홍색</SelectItem>
                      <SelectItem value="yellow">노란색</SelectItem>
                      <SelectItem value="green">초록색</SelectItem>
                      <SelectItem value="purple">보라색</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="icon">아이콘</Label>
                  <Select
                    value={formData.icon}
                    onValueChange={(value) =>
                      setFormData({ ...formData, icon: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sun">☀️ 태양</SelectItem>
                      <SelectItem value="moon">🌙 달</SelectItem>
                      <SelectItem value="star">⭐ 별</SelectItem>
                      <SelectItem value="fire">🔥 불</SelectItem>
                      <SelectItem value="gift">🎁 선물</SelectItem>
                      <SelectItem value="bell">🔔 종</SelectItem>
                      <SelectItem value="rocket">🚀 로켓</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="startDate">시작일</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) =>
                      setFormData({ ...formData, startDate: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="endDate">종료일</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) =>
                      setFormData({ ...formData, endDate: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isActive: checked })
                  }
                />
                <Label htmlFor="isActive">활성화</Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                취소
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "생성 중..." : "생성"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>상태</TableHead>
              <TableHead>타입</TableHead>
              <TableHead>제목</TableHead>
              <TableHead>내용</TableHead>
              <TableHead>기간</TableHead>
              <TableHead>우선순위</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {banners?.map((banner: any) => (
              <TableRow key={banner.id}>
                <TableCell>
                  {banner.isActive ? (
                    <Badge className="bg-green-500">활성</Badge>
                  ) : (
                    <Badge variant="secondary">비활성</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={getTypeColor(banner.type)}>
                    {getTypeLabel(banner.type)}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{banner.title}</TableCell>
                <TableCell className="max-w-xs truncate">
                  {banner.content}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {banner.startDate
                    ? new Date(banner.startDate).toLocaleDateString("ko-KR")
                    : "-"}
                  {" ~ "}
                  {banner.endDate
                    ? new Date(banner.endDate).toLocaleDateString("ko-KR")
                    : "-"}
                </TableCell>
                <TableCell>{banner.priority}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleActive(banner)}
                    >
                      {banner.isActive ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(banner)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(banner.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!banners || banners.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <p className="text-muted-foreground">
                    등록된 배너가 없습니다.
                  </p>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>배너 수정</DialogTitle>
            <DialogDescription>배너 정보를 수정합니다.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-title">제목</Label>
              <Input
                id="edit-title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-content">내용</Label>
              <Textarea
                id="edit-content"
                value={formData.content}
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-type">타입</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="welcome">환영</SelectItem>
                    <SelectItem value="event">이벤트</SelectItem>
                    <SelectItem value="notice">공지</SelectItem>
                    <SelectItem value="update">업데이트</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-priority">우선순위</Label>
                <Input
                  id="edit-priority"
                  type="number"
                  min="1"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      priority: parseInt(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-color">색상</Label>
                <Select
                  value={formData.color}
                  onValueChange={(value) =>
                    setFormData({ ...formData, color: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blue">파란색</SelectItem>
                    <SelectItem value="pink">분홍색</SelectItem>
                    <SelectItem value="yellow">노란색</SelectItem>
                    <SelectItem value="green">초록색</SelectItem>
                    <SelectItem value="purple">보라색</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-icon">아이콘</Label>
                <Select
                  value={formData.icon}
                  onValueChange={(value) =>
                    setFormData({ ...formData, icon: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sun">☀️ 태양</SelectItem>
                    <SelectItem value="moon">🌙 달</SelectItem>
                    <SelectItem value="star">⭐ 별</SelectItem>
                    <SelectItem value="fire">🔥 불</SelectItem>
                    <SelectItem value="gift">🎁 선물</SelectItem>
                    <SelectItem value="bell">🔔 종</SelectItem>
                    <SelectItem value="rocket">🚀 로켓</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-startDate">시작일</Label>
                <Input
                  id="edit-startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData({ ...formData, startDate: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-endDate">종료일</Label>
                <Input
                  id="edit-endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) =>
                    setFormData({ ...formData, endDate: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="edit-isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked })
                }
              />
              <Label htmlFor="edit-isActive">활성화</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              취소
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "수정 중..." : "수정"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
