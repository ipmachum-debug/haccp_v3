import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";

export default function SurfaceContaminationCheck() {
  const [searchTerm, setSearchTerm] = useState("");
  const [surface, setSurface] = useState("");
  const [result, setResult] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!surface || !result) {
      toast.error("표면과 측정값을 입력해주세요");
      return;
    }
    toast.success("표면오염도 기록이 저장되었습니다");
    setSurface("");
    setResult("");
  };

  return (
    <DashboardLayout>

    <div className="container mx-auto py-6 space-y-6">
      <div><h1 className="text-3xl font-bold">표면오염도</h1><p className="text-muted-foreground mt-1">표면 오염도 측정 이력을 관리합니다</p></div>
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><Activity className="h-5 w-5" />표면오염도 측정</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label htmlFor="surface">측정 표면 *</Label><Input id="surface" value={surface} onChange={(e) => setSurface(e.target.value)} placeholder="예: 작업대 A" /></div>
            <div className="space-y-2"><Label htmlFor="result">측정값 (RLU) *</Label><Input id="result" type="number" value={result} onChange={(e) => setResult(e.target.value)} placeholder="예: 50" /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setSurface(""); setResult(""); }}>초기화</Button>
            <Button type="submit"><Plus className="mr-2 h-4 w-4" />기록 저장</Button>
          </div>
        </form>
      </Card>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4"><h2 className="text-xl font-semibold">기록 목록</h2><div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 w-64" /></div></div>
        <div className="text-center py-12 text-muted-foreground"><Activity className="mx-auto h-12 w-12 mb-4 opacity-50" /><p>아직 기록된 표면오염도 측정 내역이 없습니다</p></div>
      </Card>
    </div>
  
    </DashboardLayout>
  );
}
