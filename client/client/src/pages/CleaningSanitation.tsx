import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Droplets, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";

export default function CleaningSanitation() {
  const [searchTerm, setSearchTerm] = useState("");
  const [area, setArea] = useState("");
  const [method, setMethod] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!area || !method) {
      toast.error("구역과 방법을 입력해주세요");
      return;
    }
    toast.success("세척·소독 기록이 저장되었습니다");
    setArea("");
    setMethod("");
    setNotes("");
  };

  return (
    <DashboardLayout>

    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">세척·소독</h1>
          <p className="text-muted-foreground mt-1">세척 및 소독 이력을 관리합니다</p>
        </div>
      </div>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Droplets className="h-5 w-5" />
          세척·소독 기록
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="area">구역 *</Label>
              <Input id="area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="예: 작업장 A" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="method">방법 *</Label>
              <Input id="method" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="예: 알코올 소독" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">비고</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="추가 메모" rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setArea(""); setMethod(""); setNotes(""); }}>초기화</Button>
            <Button type="submit"><Plus className="mr-2 h-4 w-4" />기록 저장</Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">기록 목록</h2>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 w-64" />
          </div>
        </div>
        <div className="text-center py-12 text-muted-foreground">
          <Droplets className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>아직 기록된 세척·소독 내역이 없습니다</p>
        </div>
      </Card>
    </div>
  
    </DashboardLayout>
  );
}
