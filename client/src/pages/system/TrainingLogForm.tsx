import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Upload, Loader2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";

import { todayLocal } from "../../lib/dateUtils";

interface EvidencePhoto {
  key: string;
  name?: string;
  url?: string; // 표시용 (presigned, 만료 가능) — 저장 시 제외
}

// File → base64 (data: prefix 제외)
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const config: ChecklistFormConfig = {
  formType: "training_log",
  title: "교육훈련일지",
  listPath: "/training-log",
  documentTitle: "교육훈련일지",
};

interface Attendee {
  name: string;
  position: string;
  department: string;
  signature: string;
}

const initialAttendees: Attendee[] = [{ name: "", position: "", department: "", signature: "" }];

export default function TrainingLogForm() {
  const [title, setTitle] = useState("");
  const [educator, setEducator] = useState("");
  const [education_date, setEducationDate] = useState(todayLocal());
  const [start_time, setStartTime] = useState("09:00");
  const [end_time, setEndTime] = useState("12:00");
  const [location, setLocation] = useState("");
  const [education_type, setEducationType] = useState("internal");
  const [target_audience, setTargetAudience] = useState("");
  const [education_content, setEducationContent] = useState("");
  const [textbook_name, setTextbookName] = useState("");
  const [content_summary, setContentSummary] = useState("");
  const [evidence_description, setEvidenceDescription] = useState("");
  const [attendees, setAttendees] = useState<Attendee[]>(initialAttendees);
  const [concentration_level, setConcentrationLevel] = useState("");
  const [understanding_level, setUnderstandingLevel] = useState("");
  const [reflection_level, setReflectionLevel] = useState("");
  const [improvement_action, setImprovementAction] = useState("");
  const [evidence_photos, setEvidencePhotos] = useState<EvidencePhoto[]>([]);
  const [uploading, setUploading] = useState(false);

  const { toast } = useToast();
  const uploadPhotoMutation = trpc.genericChecklist.uploadPhoto.useMutation();
  const trpcUtils = trpc.useUtils();

  const collectFormData = () => ({
    title,
    educator,
    education_date,
    start_time,
    end_time,
    location,
    education_type,
    target_audience,
    education_content,
    textbook_name,
    content_summary,
    evidence_description,
    attendees,
    concentration_level,
    understanding_level,
    reflection_level,
    improvement_action,
    // url 은 만료되므로 저장에서 제외 — key/name 만 영속화
    evidence_photos: evidence_photos.map((p) => ({ key: p.key, name: p.name })),
  });

  const onDataRestore = (fd: any) => {
    if (fd.title) setTitle(fd.title);
    if (fd.educator) setEducator(fd.educator);
    if (fd.education_date) setEducationDate(fd.education_date);
    if (fd.start_time) setStartTime(fd.start_time);
    if (fd.end_time) setEndTime(fd.end_time);
    if (fd.location) setLocation(fd.location);
    if (fd.education_type) setEducationType(fd.education_type);
    if (fd.target_audience) setTargetAudience(fd.target_audience);
    if (fd.education_content) setEducationContent(fd.education_content);
    if (fd.textbook_name) setTextbookName(fd.textbook_name);
    if (fd.content_summary) setContentSummary(fd.content_summary);
    if (fd.evidence_description) setEvidenceDescription(fd.evidence_description);
    if (fd.attendees && fd.attendees.length > 0) setAttendees(fd.attendees);
    if (fd.concentration_level) setConcentrationLevel(fd.concentration_level);
    if (fd.understanding_level) setUnderstandingLevel(fd.understanding_level);
    if (fd.reflection_level) setReflectionLevel(fd.reflection_level);
    if (fd.improvement_action) setImprovementAction(fd.improvement_action);
    if (Array.isArray(fd.evidence_photos) && fd.evidence_photos.length > 0) {
      const photos: EvidencePhoto[] = fd.evidence_photos
        .map((p: any) => (typeof p === "string" ? { key: p } : { key: p?.key, name: p?.name }))
        .filter((p: EvidencePhoto) => !!p.key);
      setEvidencePhotos(photos);
      // 표시용 presigned URL 재발급
      if (photos.length > 0) {
        trpcUtils.genericChecklist.resolvePhotoUrls
          .fetch({ keys: photos.map((p) => p.key) })
          .then((resolved) => {
            const urlMap = new Map(resolved.map((r) => [r.key, r.url]));
            setEvidencePhotos((prev) => prev.map((p) => ({ ...p, url: urlMap.get(p.key) || undefined })));
          })
          .catch(() => {});
      }
    }
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast({ title: "이미지 파일만 업로드 가능", description: file.name, variant: "destructive" });
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast({ title: "파일이 너무 큽니다 (최대 10MB)", description: file.name, variant: "destructive" });
          continue;
        }
        const data = await fileToBase64(file);
        const res = await uploadPhotoMutation.mutateAsync({
          formType: "training_log",
          file: { name: file.name, type: file.type, data },
        });
        setEvidencePhotos((prev) => [...prev, { key: res.key, name: res.name, url: res.url }]);
      }
    } catch (err: any) {
      toast({ title: "사진 업로드 실패", description: err?.message || "알 수 없는 오류", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (key: string) => {
    setEvidencePhotos((prev) => prev.filter((p) => p.key !== key));
  };

  const addAttendee = () => {
    setAttendees([...attendees, { name: "", position: "", department: "", signature: "" }]);
  };

  const removeAttendee = (index: number) => {
    setAttendees(attendees.filter((_, i) => i !== index));
  };

  const updateAttendee = (index: number, field: keyof Attendee, value: string) => {
    setAttendees(attendees.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  };

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
    >
      <div className="space-y-6 px-6 pb-6">
        {/* 기본 정보 */}
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label htmlFor="title">교육 제목 *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="교육 제목을 입력하세요"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="educator">교육자 *</Label>
                <Input
                  id="educator"
                  value={educator}
                  onChange={(e) => setEducator(e.target.value)}
                  placeholder="교육자 이름"
                />
              </div>
              <div>
                <Label htmlFor="location">교육 장소</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="교육 장소"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="education_date">교육일 *</Label>
                <Input
                  id="education_date"
                  type="date"
                  value={education_date}
                  onChange={(e) => setEducationDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="start_time">시작 시간</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={start_time}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="end_time">종료 시간</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={end_time}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="education_type">교육 구분</Label>
                <Select
                  value={education_type}
                  onValueChange={setEducationType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="교육 구분 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">사내교육</SelectItem>
                    <SelectItem value="external">외부교육</SelectItem>
                    <SelectItem value="online">온라인교육</SelectItem>
                    <SelectItem value="other">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="target_audience">교육 대상</Label>
                <Input
                  id="target_audience"
                  value={target_audience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="예: 전 직원, 생산팀, 신입사원"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 교육 내용 */}
        <Card>
          <CardHeader>
            <CardTitle>교육 내용</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="textbook_name">교재명</Label>
              <Input
                id="textbook_name"
                value={textbook_name}
                onChange={(e) => setTextbookName(e.target.value)}
                placeholder="사용한 교재명"
              />
            </div>
            <div>
              <Label htmlFor="education_content">교육 내용</Label>
              <Textarea
                id="education_content"
                value={education_content}
                onChange={(e) => setEducationContent(e.target.value)}
                placeholder="교육 내용을 상세히 기록하세요"
                rows={4}
              />
            </div>
            <div>
              <Label htmlFor="content_summary">내용 요약</Label>
              <Textarea
                id="content_summary"
                value={content_summary}
                onChange={(e) => setContentSummary(e.target.value)}
                placeholder="교육 내용 요약"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="evidence_description">증빙 설명</Label>
              <Input
                id="evidence_description"
                value={evidence_description}
                onChange={(e) => setEvidenceDescription(e.target.value)}
                placeholder="증빙 자료 설명"
              />
            </div>
            <div>
              <Label>교육 사진 (증빙자료)</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                <Upload className="mx-auto h-8 w-8 text-gray-400" />
                <p className="mt-1 text-sm text-gray-500">교육 현장 사진을 첨부하세요 (이미지, 최대 10MB)</p>
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  className="mt-3"
                  disabled={uploading}
                  onChange={(e) => {
                    handlePhotoUpload(e.target.files);
                    e.target.value = ""; // 같은 파일 재선택 허용
                  }}
                />
                {uploading && (
                  <p className="mt-2 text-sm text-blue-600 flex items-center justify-center gap-1">
                    <Loader2 className="h-4 w-4 animate-spin" /> 업로드 중...
                  </p>
                )}
              </div>
              {evidence_photos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-3">
                  {evidence_photos.map((photo) => (
                    <div key={photo.key} className="relative group border rounded-md overflow-hidden">
                      {photo.url ? (
                        <img src={photo.url} alt={photo.name || "교육사진"} className="w-full h-24 object-cover" />
                      ) : (
                        <div className="w-full h-24 flex items-center justify-center bg-gray-50 text-xs text-gray-400 px-1 text-center">
                          {photo.name || "이미지"}
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-1 right-1 h-6 w-6 p-0 opacity-80"
                        onClick={() => removePhoto(photo.key)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 참석자 목록 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>참석자 목록</CardTitle>
            <Button variant="outline" size="sm" onClick={addAttendee}>
              <Plus className="h-4 w-4 mr-1" />
              참석자 추가
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">번호</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>직책</TableHead>
                  <TableHead>부서</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendees.map((attendee, index) => (
                  <TableRow key={index}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      <Input
                        value={attendee.name}
                        onChange={(e) => updateAttendee(index, "name", e.target.value)}
                        placeholder="이름"
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={attendee.position}
                        onChange={(e) => updateAttendee(index, "position", e.target.value)}
                        placeholder="직책"
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={attendee.department}
                        onChange={(e) => updateAttendee(index, "department", e.target.value)}
                        placeholder="부서"
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      {attendees.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAttendee(index)}
                          className="text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 교육 후 결과 */}
        <Card>
          <CardHeader>
            <CardTitle>교육 후 결과</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="concentration_level">집중도</Label>
                <Select
                  value={concentration_level}
                  onValueChange={setConcentrationLevel}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="매우 높음">매우 높음</SelectItem>
                    <SelectItem value="높음">높음</SelectItem>
                    <SelectItem value="보통">보통</SelectItem>
                    <SelectItem value="낮음">낮음</SelectItem>
                    <SelectItem value="매우 낮음">매우 낮음</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="understanding_level">이해도</Label>
                <Select
                  value={understanding_level}
                  onValueChange={setUnderstandingLevel}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="매우 높음">매우 높음</SelectItem>
                    <SelectItem value="높음">높음</SelectItem>
                    <SelectItem value="보통">보통</SelectItem>
                    <SelectItem value="낮음">낮음</SelectItem>
                    <SelectItem value="매우 낮음">매우 낮음</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="reflection_level">반영도</Label>
                <Select
                  value={reflection_level}
                  onValueChange={setReflectionLevel}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="매우 높음">매우 높음</SelectItem>
                    <SelectItem value="높음">높음</SelectItem>
                    <SelectItem value="보통">보통</SelectItem>
                    <SelectItem value="낮음">낮음</SelectItem>
                    <SelectItem value="매우 낮음">매우 낮음</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="improvement_action">개선 및 조치사항</Label>
              <Textarea
                id="improvement_action"
                value={improvement_action}
                onChange={(e) => setImprovementAction(e.target.value)}
                placeholder="교육 결과에 따른 개선 및 조치사항을 입력하세요"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </ChecklistFormLayout>
  );
}

export { TrainingLogForm };
