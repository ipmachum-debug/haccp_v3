import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Users, Settings, Building2, FileCheck } from "lucide-react";
import UserManagement from "./UserManagement";
import AdminSettings from "./AdminSettings";
import DepartmentManagement from "./DepartmentManagement";
import PositionManagement from "./PositionManagement";
import EmployeeManagement from "./EmployeeManagement";
import DocumentApprovalSettingsPage from "./DocumentApprovalSettingsPage";

export default function SystemManagement() {
  const [activeTab, setActiveTab] = useState<"users" | "settings" | "organization" | "approval">("users");

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">시스템 관리</h1>
        <p className="text-muted-foreground mt-2">
          사용자, 시스템 설정 및 조직 구조를 관리합니다
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "users" | "settings" | "organization" | "approval")}>
        <TabsList className="grid w-full max-w-3xl grid-cols-4">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            사용자 관리
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            시스템 설정
          </TabsTrigger>
          <TabsTrigger value="organization" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            조직·책임 관리
          </TabsTrigger>
          <TabsTrigger value="approval" className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            문서 결재 설정
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <UserManagement />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <AdminSettings />
        </TabsContent>

        <TabsContent value="organization" className="space-y-6">
          <div className="space-y-6">
            {/* 부서 관리 */}
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-semibold">부서 관리</h2>
                <p className="text-sm text-muted-foreground">조직의 부서 구조를 관리합니다</p>
              </div>
              <DepartmentManagement />
            </div>

            <div className="border-t pt-6" />

            {/* 직급 관리 */}
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-semibold">직급 관리</h2>
                <p className="text-sm text-muted-foreground">조직의 직급 체계를 관리합니다</p>
              </div>
              <PositionManagement />
            </div>

            <div className="border-t pt-6" />

            {/* 구성원 관리 */}
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-semibold">구성원 관리</h2>
                <p className="text-sm text-muted-foreground">조직 구성원의 부서 및 직급을 관리합니다</p>
              </div>
              <EmployeeManagement />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="approval" className="space-y-4">
          <DocumentApprovalSettingsPage />
        </TabsContent>
      </Tabs>
    </div>
    </DashboardLayout>
  );
}
