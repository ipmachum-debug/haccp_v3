import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Database, Package, Leaf, Building2, GitBranch, Layers } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CategoryManagement from "@/pages/accounting/CategoryManagement";
import ProductCcpMapping from "@/pages/haccp/ProductCcpMapping";
import ProductsTab from "@/components/masterData/ProductsTab";
import MaterialsTab from "@/components/masterData/MaterialsTab";
import SuppliersTab from "@/components/masterData/SuppliersTab";
import { IntermediatesContent } from "@/pages/manufacturing/IntermediatesPage";

import { useTabWithUrl } from "@/hooks/useTabWithUrl";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function MasterDataManagement() {
  const L = useIndustryLabel();
  const [activeTab, setActiveTab] = useTabWithUrl('tab', 'products');
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Database className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">마스터 데이터 관리</h1>
            <p className="text-muted-foreground">{`${L("product")}, 원재료, 거래처 등 기준 정보를 관리하세요`}</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span>{`${L("product")}`}</span>
            </TabsTrigger>
            <TabsTrigger value="materials" className="flex items-center gap-2">
              <Leaf className="h-4 w-4" />
              <span>{`${L("material")}`}</span>
            </TabsTrigger>
            <TabsTrigger value="intermediates" className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              <span>중간재</span>
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span>거래처</span>
            </TabsTrigger>
            <TabsTrigger value="mapping" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              <span>{`${L("product")}-CCP 매핑`}</span>
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span>카테고리</span>
            </TabsTrigger>
          </TabsList>

          {/* 제품 관리 탭 */}
          <TabsContent value="products" className="space-y-4">
            <ProductsTab />
          </TabsContent>

          {/* 원재료 관리 탭 */}
          <TabsContent value="materials" className="space-y-4">
            <MaterialsTab />
          </TabsContent>

          {/* 중간재 관리 탭 (PR #250) — 통팥앙금 / 콩고물 / 카스테라가루 등 BOM 사용 중간재 */}
          <TabsContent value="intermediates" className="space-y-4">
            <IntermediatesContent embedded />
          </TabsContent>

          {/* 거래처 관리 탭 */}
          <TabsContent value="suppliers" className="space-y-4">
            <SuppliersTab />
          </TabsContent>

          {/* 제품-CCP 매핑 탭 */}
          <TabsContent value="mapping" className="space-y-4">
            <ProductCcpMapping embedded />
          </TabsContent>

          {/* 카테고리 관리 탭 */}
          <TabsContent value="categories" className="space-y-4">
            <CategoryManagement />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
