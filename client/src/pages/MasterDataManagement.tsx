import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Database, Package, Leaf, Building2, GitBranch, Plus, Pencil, Trash2, Upload, FileSpreadsheet, FileDown, Search, ArrowUpDown, ChevronLeft, ChevronRight, Download, Eye } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import CategoryManagement from "@/pages/CategoryManagement";

import ProductCcpMapping from "@/pages/ProductCcpMapping";
import MaterialBulkUploadModal from "@/components/MaterialBulkUploadModal";
import SupplierBulkUploadModal from "@/components/SupplierBulkUploadModal";
import ProductBulkUploadModal from "@/components/ProductBulkUploadModal";
import TemplateCustomizer from "@/components/TemplateCustomizer";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function MasterDataManagement() {
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any>(null);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [viewingProduct, setViewingProduct] = useState<any>(null);
  const [viewingMaterial, setViewingMaterial] = useState<any>(null);
  const [editProductCategory, setEditProductCategory] = useState<string>("");
  const [editMaterialCategory, setEditMaterialCategory] = useState<string>("");
  const [materialBulkUploadOpen, setMaterialBulkUploadOpen] = useState(false);
  const [supplierBulkUploadOpen, setSupplierBulkUploadOpen] = useState(false);
  const [productBulkUploadOpen, setProductBulkUploadOpen] = useState(false);
  const [templateCustomizerOpen, setTemplateCustomizerOpen] = useState(false);
  const [templateType, setTemplateType] = useState<"material" | "supplier" | "product">("material");
  const [autoProductCode, setAutoProductCode] = useState("");
  const [autoMaterialCode, setAutoMaterialCode] = useState("");
  
  // 제품 필터/정렬/페이지네이션 state
  const [prodSearchQuery, setProdSearchQuery] = useState("");
  const [prodSortBy, setProdSortBy] = useState<"productCode" | "productName" | "category">("productCode");
  const [prodSortOrder, setProdSortOrder] = useState<"asc" | "desc">("asc");
  const [prodPage, setProdPage] = useState(1);
  const prodPageSize = 30;
  
  // 거래처 필터/정렬/페이지네이션 state
  const [supSearchQuery, setSupSearchQuery] = useState("");
  const [supSortBy, setSupSortBy] = useState<"supplierCode" | "supplierName" | "supplierType">("supplierName");
  const [supSortOrder, setSupSortOrder] = useState<"asc" | "desc">("asc");
  const [supPage, setSupPage] = useState(1);
  const supPageSize = 30;
  
  // 원재료 필터/정렬/페이지네이션 state
  const [matSearchQuery, setMatSearchQuery] = useState("");
  const [matSortBy, setMatSortBy] = useState<"materialCode" | "materialName" | "category">("materialCode");
  const [matSortOrder, setMatSortOrder] = useState<"asc" | "desc">("asc");
  const [matPage, setMatPage] = useState(1);
  const matPageSize = 30;
  
  // 카테고리 목록 조회
  const { data: productCategories = [] } = trpc.categories.listByType.useQuery({ type: "product" });
  const { data: materialCategories = [] } = trpc.categories.listByType.useQuery({ type: "material" });

  
  const utils = trpc.useUtils();

  // 다운로드 mutations (useMutation 훅)
  const downloadTemplateMutation = trpc.itemMaster.downloadTemplate.useMutation();
  const downloadAllMutation = trpc.itemMaster.downloadAll.useMutation();
  
  // 제품 다이얼로그가 열릴 때 자동 코드 생성
  useEffect(() => {
    if (productDialogOpen) {
      (async () => {
        try {
          const result = await utils.product.generateCode.fetch();
          setAutoProductCode(result);
        } catch (error: any) {
          console.error("제품 코드 자동 생성 실패:", error.message);
        }
      })();
    }
  }, [productDialogOpen]);

  // 원재료 다이얼로그가 열릴 때 자동 코드 생성
  useEffect(() => {
    if (materialDialogOpen) {
      (async () => {
        try {
          const result = await utils.inventory.generateCode.fetch();
          setAutoMaterialCode(result);
        } catch (error: any) {
          console.error("원재료 코드 자동 생성 실패:", error.message);
        }
      })();
    }
  }, [materialDialogOpen]);

  // 제품 관리
  const { data: productData, refetch: refetchProducts } = trpc.product.list.useQuery({
    page: prodPage,
    limit: prodPageSize,
    sortBy: prodSortBy,
    sortOrder: prodSortOrder,
    search: prodSearchQuery || undefined,
  });
  const products = (productData as any)?.items ?? (Array.isArray(productData) ? productData : []);
  const productTotal = (productData as any)?.total ?? 0;
  const productTotalPages = Math.ceil(productTotal / prodPageSize) || 1;
  const createProductMutation = trpc.product.create.useMutation({
    onSuccess: () => {
      toast.success("제품이 추가되었습니다");
      setProductDialogOpen(false);
      refetchProducts();
    },
    onError: (error) => {
      toast.error(`제품 추가 실패: ${error.message}`);
    },
  });
  
  const deleteProductMutation = trpc.product.delete.useMutation({
    onSuccess: () => {
      toast.success("제품이 삭제되었습니다");
      refetchProducts();
    },
    onError: (error) => {
      toast.error(`제품 삭제 실패: ${error.message}`);
    },
  });

  // ✅ 제품 수정 mutation 추가
  const updateProductMutation = trpc.product.update.useMutation({
    onSuccess: () => {
      toast.success("제품이 수정되었습니다");
      setEditingProduct(null);
      refetchProducts();
    },
    onError: (error) => {
      toast.error(`제품 수정 실패: ${error.message}`);
    },
  });
  
  // 원재료 관리
  const { data: materialData, refetch: refetchMaterials } = trpc.material.list.useQuery({
    page: matPage,
    limit: matPageSize,
    sortBy: matSortBy,
    sortOrder: matSortOrder,
    search: matSearchQuery || undefined,
  });
  const materials = Array.isArray(materialData) ? materialData : (materialData?.items ?? []);
  const materialTotal = (materialData as any)?.total ?? 0;
  const materialTotalPages = Math.ceil(materialTotal / matPageSize) || 1;
  const createMaterialMutation = trpc.material.create.useMutation({
    onSuccess: () => {
      toast.success("원재료가 추가되었습니다");
      setMaterialDialogOpen(false);
      refetchMaterials();
    },
    onError: (error) => {
      toast.error(`원재료 추가 실패: ${error.message}`);
    },
  });
  
  const deleteMaterialMutation = trpc.material.delete.useMutation({
    onSuccess: () => {
      toast.success("원재료가 삭제되었습니다");
      refetchMaterials();
    },
    onError: (error) => {
      toast.error(`원재료 삭제 실패: ${error.message}`);
    },
  });
  
  const updateMaterialMutation = trpc.material.update.useMutation({
    onSuccess: () => {
      toast.success("원재료가 수정되었습니다");
      setEditingMaterial(null);
      refetchMaterials();
    },
    onError: (error) => {
      toast.error(`원재료 수정 실패: ${error.message}`);
    },
  });
  
  // 거래처 관리
  const { data: supplierData, refetch: refetchSuppliers } = trpc.supplier.getAll.useQuery({
    page: supPage,
    limit: supPageSize,
    sortBy: supSortBy,
    sortOrder: supSortOrder,
    search: supSearchQuery || undefined,
  });
  const suppliers = (supplierData as any)?.items ?? (Array.isArray(supplierData) ? supplierData : []);
  const supplierTotal = (supplierData as any)?.total ?? 0;
  const supplierTotalPages = Math.ceil(supplierTotal / supPageSize) || 1;
  const createSupplierMutation = trpc.supplier.create.useMutation({
    onSuccess: () => {
      toast.success("거래처가 추가되었습니다");
      setSupplierDialogOpen(false);
      refetchSuppliers();
    },
    onError: (error) => {
      toast.error(`거래처 추가 실패: ${error.message}`);
    },
  });
  
  const deleteSupplierMutation = trpc.supplier.delete.useMutation({
    onSuccess: () => {
      toast.success("거래처가 삭제되었습니다");
      refetchSuppliers();
    },
    onError: (error) => {
      toast.error(`거래처 삭제 실패: ${error.message}`);
    },
  });
  
  const updateSupplierMutation = trpc.supplier.update.useMutation({
    onSuccess: () => {
      toast.success("거래처가 수정되었습니다");
      setEditingSupplier(null);
      refetchSuppliers();
    },
    onError: (error) => {
      toast.error(`거래처 수정 실패: ${error.message}`);
    },
  });
  
  const handleCreateProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createProductMutation.mutate({
      productCode: autoProductCode,
      productName: formData.get("productName") as string,
      category: (formData.get("category") as string) || undefined,
      unit: (formData.get("unit") as string) || undefined,
      shelfLifeMonths: formData.get("shelfLifeDays") ? Math.ceil(parseInt(formData.get("shelfLifeDays") as string) / 30) : undefined,
      description: (formData.get("description") as string) || undefined,
      isActive: 1,
    });
  };

  // ✅ 제품 수정 핸들러 추가
  const handleUpdateProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const shelfLifeDays = formData.get("shelfLifeDays") ? parseInt(formData.get("shelfLifeDays") as string) : undefined;
    const shelfLifeMonths = shelfLifeDays ? Math.round(shelfLifeDays / 30) : undefined;
    
    const updateData = {
      id: editingProduct.id,
      productCode: formData.get("productCode") as string,
      productName: formData.get("productName") as string,
      category: editProductCategory || undefined,
      unit: (formData.get("unit") as string) || undefined,
      shelfLifeMonths: shelfLifeMonths,
      description: (formData.get("description") as string) || undefined,
    };
    
    console.log('🔵 제품 수정 데이터:', updateData);
    console.log('🔵 editProductCategory 상태:', editProductCategory);
    
    updateProductMutation.mutate(updateData);
  };
  
  const handleCreateMaterial = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const kind = (formData.get("materialKind") as string) || "RAW";
    if (!kind || !["RAW", "PACKAGING", "SUBSIDIARY"].includes(kind)) {
      toast.error("원재료 종류를 선택해주세요");
      return;
    }
    createMaterialMutation.mutate({
      materialCode: autoMaterialCode,
      materialName: formData.get("materialName") as string,
      kind: kind as "RAW" | "PACKAGING" | "SUBSIDIARY",
      category: (formData.get("category") as string) || undefined,
      unit: (formData.get("unit") as string) || undefined,
      expiryWarningDays: formData.get("shelfLifeDays") ? parseInt(formData.get("shelfLifeDays") as string) : undefined,
      isActive: 1,
    });
  };
  
  const handleUpdateMaterial = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    updateMaterialMutation.mutate({
      id: editingMaterial.id,
      materialCode: formData.get("materialCode") as string,
      materialName: formData.get("materialName") as string,
      category: editMaterialCategory || undefined,
      unit: (formData.get("unit") as string) || undefined,
      expiryWarningDays: formData.get("shelfLifeDays") ? parseInt(formData.get("shelfLifeDays") as string) : undefined,
    });
  };
  
  const handleCreateSupplier = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createSupplierMutation.mutate({
      businessNumber: formData.get("businessNumber") as string,
      supplierName: formData.get("supplierName") as string,
      supplierType: (formData.get("supplierType") as string) || undefined,
      contactPerson: (formData.get("contactPerson") as string) || undefined,
      phone: (formData.get("contactPhone") as string) || undefined,
      email: (formData.get("contactEmail") as string) || undefined,
      address: (formData.get("address") as string) || undefined,
      certifications: undefined,
      rating: undefined,
    });
  };
  
  const handleUpdateSupplier = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    updateSupplierMutation.mutate({
      id: editingSupplier.id,
      businessNumber: formData.get("businessNumber") as string,
      supplierName: formData.get("supplierName") as string,
      supplierType: (formData.get("supplierType") as string) || undefined,
      contactPerson: (formData.get("contactPerson") as string) || undefined,
      phone: (formData.get("contactPhone") as string) || undefined,
      email: (formData.get("contactEmail") as string) || undefined,
      address: (formData.get("address") as string) || undefined,
    });
  };
  
  // 템플릿 다운로드 핸들러 (서버 API 사용)
  const handleDownloadMaterialTemplate = async () => {
    try {
      const result = await downloadTemplateMutation.mutateAsync({ itemType: 'raw_material' });
      
      // Base64를 Blob으로 변환
      const byteCharacters = atob(result.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      // 다운로드
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success("템플릿이 다운로드되었습니다");
    } catch (e: any) {
      toast.error("템플릿 다운로드 실패: " + e.message);
    }
  };
  
  // 원재료 전체 다운로드 (현재 등록된 데이터를 엑셀로)
  const handleExportAllMaterials = async () => {
    try {
      const result = await downloadAllMutation.mutateAsync({ itemType: 'raw_material' });
      
      // Base64 디코딩
      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      // 다운로드
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success(`${result.count}개 원재료 데이터를 다운로드했습니다`);
    } catch (error: any) {
      toast.error(`다운로드 실패: ${error.message}`);
    }
  };
  
  // 원재료 정렬 토글
  const handleMatSort = (field: "materialCode" | "materialName" | "category") => {
    if (matSortBy === field) {
      setMatSortOrder(matSortOrder === "asc" ? "desc" : "asc");
    } else {
      setMatSortBy(field);
      setMatSortOrder("asc");
    }
    setMatPage(1);
  };
  
  // 제품 정렬 토글
  const handleProdSort = (field: "productCode" | "productName" | "category") => {
    if (prodSortBy === field) { setProdSortOrder(prodSortOrder === "asc" ? "desc" : "asc"); }
    else { setProdSortBy(field); setProdSortOrder("asc"); }
    setProdPage(1);
  };
  
  // 거래처 정렬 토글
  const handleSupSort = (field: "supplierCode" | "supplierName" | "supplierType") => {
    if (supSortBy === field) { setSupSortOrder(supSortOrder === "asc" ? "desc" : "asc"); }
    else { setSupSortBy(field); setSupSortOrder("asc"); }
    setSupPage(1);
  };
  
  // 제품 전체 다운로드
  const handleExportAllProducts = async () => {
    try {
      const result = await downloadAllMutation.mutateAsync({ itemType: 'own_product' });
      
      // Base64 디코딩
      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      // 다운로드
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success(`${result.count}개 제품 데이터를 다운로드했습니다`);
    } catch (e: any) {
      toast.error("다운로드 실패: " + e.message);
    }
  };
  
  // 거래처 전체 다운로드
  const handleExportAllSuppliers = async () => {
    try {
      const allData = await utils.supplier.exportAll.fetch();
      const items = (allData as any)?.items ?? [];
      if (items.length === 0) { toast.error("다운로드할 거래처가 없습니다"); return; }
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("거래처 목록");
      const hr = ws.addRow(["사업자번호", "거래처명", "유형", "담당자", "연락처", "이메일", "주소"]);
      hr.eachCell((c: any) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } }; });
      items.forEach((s: any) => { ws.addRow([s.businessNumber || "", s.supplierName || "", s.supplierType || "", s.contactPerson || "", s.phone || "", s.email || "", s.address || ""]); });
      ws.columns = [{ width: 18 }, { width: 25 }, { width: 15 }, { width: 12 }, { width: 15 }, { width: 20 }, { width: 30 }];
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "거래처_전체목록_" + new Date().toISOString().slice(0, 10) + ".xlsx"; a.click(); URL.revokeObjectURL(url);
      toast.success(items.length + "개 거래처 데이터를 다운로드했습니다");
    } catch (e: any) { toast.error("다운로드 실패: " + e.message); }
  };
  
  const handleDownloadSupplierTemplate = async () => {
    const { generateSupplierTemplate, downloadTemplate } = await import("@/lib/excelTemplates");
    const blob = await generateSupplierTemplate();
    downloadTemplate(blob, "거래처_일괄등록_템플릿.xlsx");
    toast.success("템플릿이 다운로드되었습니다");
  };
  
  const handleDownloadProductTemplate = async () => {
    try {
      const result = await downloadTemplateMutation.mutateAsync({ itemType: 'own_product' });
      
      // Base64 디코딩
      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      // 다운로드
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success("템플릿이 다운로드되었습니다");
    } catch (e: any) {
      toast.error("템플릿 다운로드 실패: " + e.message);
    }
  };
  
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Database className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">마스터 데이터 관리</h1>
            <p className="text-muted-foreground">제품, 원재료, 거래처 등 기준 정보를 관리하세요</p>
          </div>
        </div>

        <Tabs defaultValue="products" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span>제품</span>
            </TabsTrigger>
            <TabsTrigger value="materials" className="flex items-center gap-2">
              <Leaf className="h-4 w-4" />
              <span>원재료</span>
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span>거래처</span>
            </TabsTrigger>
            <TabsTrigger value="mapping" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              <span>제품-CCP 매핑</span>
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span>카테고리</span>
            </TabsTrigger>
          </TabsList>

          {/* 제품 관리 탭 */}
          <TabsContent value="products" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>제품 관리</CardTitle>
                    <CardDescription>
                      제품 목록 및 상세 정보 관리 | 총 <strong>{productTotal}개</strong> 등록됨
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportAllProducts}>
                      <Download className="h-4 w-4 mr-2" />
                      전체 다운로드
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownloadProductTemplate}>
                      <FileDown className="h-4 w-4 mr-2" />
                      템플릿
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTemplateType("product");
                        setTemplateCustomizerOpen(true);
                      }}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      커스텀 템플릿
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setProductBulkUploadOpen(true)}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      일괄 업로드
                    </Button>
                    <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          제품 추가
                        </Button>
                      </DialogTrigger>
                    <DialogContent>
                      <form onSubmit={handleCreateProduct}>
                        <DialogHeader>
                          <DialogTitle>새 제품 추가</DialogTitle>
                          <DialogDescription>새로운 제품 정보를 입력하세요</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="productCode">제품 코드 *</Label>
                            <Input id="productCode" name="productCode" value={autoProductCode} readOnly className="bg-muted" placeholder="자동 생성됩니다" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="productName">제품명 *</Label>
                            <Input id="productName" name="productName" required />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="category">카테고리</Label>
                            <Select onValueChange={(val) => {
                              const hidden = document.getElementById('newProductCategory') as HTMLInputElement;
                              if (hidden) hidden.value = val;
                            }}>
                              <SelectTrigger>
                                <SelectValue placeholder="카테고리 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                {productCategories.map((cat: any) => (
                                  <SelectItem key={cat.id} value={cat.name}>
                                    {cat.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <input type="hidden" id="newProductCategory" name="category" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="unit">단위</Label>
                            <Input id="unit" name="unit" placeholder="예: kg, 개, L" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="shelfLifeDays">소비기한 (일)</Label>
                            <Input id="shelfLifeDays" name="shelfLifeDays" type="number" placeholder="30일 = 1개월로 자동 변환" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="description">설명</Label>
                            <Input id="description" name="description" />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="submit" disabled={createProductMutation.isPending}>
                            {createProductMutation.isPending ? "추가 중..." : "추가"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* 검색 바 */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="제품명 또는 코드로 검색..." value={prodSearchQuery} onChange={(e) => { setProdSearchQuery(e.target.value); setProdPage(1); }} className="pl-10" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {prodSearchQuery ? `검색 결과: ${productTotal}건` : `${prodPage}/${productTotalPages} 페이지`}
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleProdSort("productCode")}>
                        <div className="flex items-center gap-1">제품 코드 <ArrowUpDown className="h-3 w-3" />{prodSortBy === "productCode" && <span className="text-xs">({prodSortOrder === "asc" ? "▲" : "▼"})</span>}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleProdSort("productName")}>
                        <div className="flex items-center gap-1">제품명 <ArrowUpDown className="h-3 w-3" />{prodSortBy === "productName" && <span className="text-xs">({prodSortOrder === "asc" ? "▲" : "▼"})</span>}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleProdSort("category")}>
                        <div className="flex items-center gap-1">카테고리 <ArrowUpDown className="h-3 w-3" />{prodSortBy === "category" && <span className="text-xs">({prodSortOrder === "asc" ? "▲" : "▼"})</span>}</div>
                      </TableHead>
                      <TableHead>단위</TableHead>
                      <TableHead>소비기한 (개월)</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead className="text-right">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          {prodSearchQuery ? `"${prodSearchQuery}"에 대한 검색 결과가 없습니다.` : '등록된 제품이 없습니다. "제품 추가" 또는 "일괄 업로드"를 사용하세요.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      products.map((product: any) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">{product.productCode}</TableCell>
                          <TableCell>{product.productName}</TableCell>
                          <TableCell>{product.category || "-"}</TableCell>
                          <TableCell>{product.unit || "-"}</TableCell>
                          <TableCell>{product.shelfLifeDays ? Math.round(product.shelfLifeDays / 30) : "-"}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              product.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                            }`}>
                              {product.isActive ? "활성" : "비활성"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setViewingProduct(product)}
                                title="상세보기"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingProduct(product);
                                  setEditProductCategory(product.category || "");
                                }}
                                title="수정"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm("정말 삭제하시겠습니까?")) {
                                    deleteProductMutation.mutate({ id: product.id });
                                  }
                                }}
                                title="삭제"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

                {/* 페이지네이션 */}
                {productTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">총 {productTotal}개 중 {(prodPage - 1) * prodPageSize + 1}~{Math.min(prodPage * prodPageSize, productTotal)}개 표시</p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={prodPage <= 1} onClick={() => setProdPage(prodPage - 1)}><ChevronLeft className="h-4 w-4" /> 이전</Button>
                      {Array.from({ length: Math.min(productTotalPages, 7) }, (_, i) => {
                        let pn: number;
                        if (productTotalPages <= 7) pn = i + 1;
                        else if (prodPage <= 4) pn = i + 1;
                        else if (prodPage >= productTotalPages - 3) pn = productTotalPages - 6 + i;
                        else pn = prodPage - 3 + i;
                        return <Button key={pn} variant={prodPage === pn ? "default" : "outline"} size="sm" className="w-9" onClick={() => setProdPage(pn)}>{pn}</Button>;
                      })}
                      <Button variant="outline" size="sm" disabled={prodPage >= productTotalPages} onClick={() => setProdPage(prodPage + 1)}>다음 <ChevronRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                )}

            {/* ✅ 제품 수정 Dialog 추가 */}
            <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
              <DialogContent>
                <form onSubmit={handleUpdateProduct}>
                  <DialogHeader>
                    <DialogTitle>제품 수정</DialogTitle>
                    <DialogDescription>제품 정보를 수정하세요</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="edit-productCode">제품 코드</Label>
                      <Input id="edit-productCode" name="productCode" defaultValue={editingProduct?.productCode} readOnly className="bg-muted" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-productName">제품명 *</Label>
                      <Input id="edit-productName" name="productName" defaultValue={editingProduct?.productName} required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-category">카테고리</Label>
                      <Select value={editProductCategory} onValueChange={setEditProductCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder="카테고리 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {productCategories.map((cat: any) => (
                            <SelectItem key={cat.id} value={cat.name}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-unit">단위</Label>
                      <Input id="edit-unit" name="unit" defaultValue={editingProduct?.unit || ""} placeholder="예: kg, 개, L" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-shelfLifeDays">소비기한 (일)</Label>
                      <Input id="edit-shelfLifeDays" name="shelfLifeDays" type="number" defaultValue={editingProduct?.shelfLifeDays || ""} placeholder="30일 = 1개월로 자동 변환" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-description">설명</Label>
                      <Input id="edit-description" name="description" defaultValue={editingProduct?.description || ""} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setEditingProduct(null)}>
                      취소
                    </Button>
                    <Button type="submit" disabled={updateProductMutation.isPending}>
                      {updateProductMutation.isPending ? "수정 중..." : "수정"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            
            {/* 제품 상세보기 Dialog */}
            <Dialog open={!!viewingProduct} onOpenChange={() => setViewingProduct(null)}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>제품 상세 정보</DialogTitle>
                  <DialogDescription>
                    제품의 상세 정보를 확인하세요
                  </DialogDescription>
                </DialogHeader>
                {viewingProduct && (
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">제품 코드</Label>
                        <p className="font-medium">{viewingProduct.productCode}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">제품명</Label>
                        <p className="font-medium">{viewingProduct.productName}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">카테고리</Label>
                        <p className="font-medium">{viewingProduct.category || "-"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">단위</Label>
                        <p className="font-medium">{viewingProduct.unit || "-"}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">소비기한 (개월)</Label>
                        <p className="font-medium">{viewingProduct.shelfLifeDays ? Math.round(viewingProduct.shelfLifeDays / 30) + " 개월" : "-"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">상태</Label>
                        <p className="font-medium">{viewingProduct.isActive ? "활성" : "비활성"}</p>
                      </div>
                    </div>
                    {viewingProduct.description && (
                      <div>
                        <Label className="text-muted-foreground">설명</Label>
                        <p className="font-medium">{viewingProduct.description}</p>
                      </div>
                    )}
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setViewingProduct(null)}>
                    닫기
                  </Button>
                  <Button onClick={() => {
                    setEditingProduct(viewingProduct);
                    setViewingProduct(null);
                  }}>
                    수정
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

</Dialog>
          </TabsContent>

          {/* 원재료 관리 탭 */}
          <TabsContent value="materials" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>원재료 관리</CardTitle>
                    <CardDescription>
                      원재료 목록 및 상세 정보 관리 | 총 <strong>{materialTotal}개</strong> 등록됨
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={handleExportAllMaterials}>
                      <Download className="h-4 w-4 mr-2" />
                      전체 다운로드
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownloadMaterialTemplate}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      템플릿
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setMaterialBulkUploadOpen(true)}>
                      <Upload className="h-4 w-4 mr-2" />
                      일괄 업로드
                    </Button>
                    <Dialog open={materialDialogOpen} onOpenChange={setMaterialDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm">
                          <Plus className="h-4 w-4 mr-2" />
                          원재료 추가
                        </Button>
                      </DialogTrigger>
                    <DialogContent>
                      <form onSubmit={handleCreateMaterial}>
                        <DialogHeader>
                          <DialogTitle>새 원재료 추가</DialogTitle>
                          <DialogDescription>새로운 원재료 정보를 입력하세요</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="materialCode">원재료 코드 *</Label>
                            <Input id="materialCode" name="materialCode" value={autoMaterialCode} readOnly className="bg-muted" placeholder="자동 생성됩니다" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="materialName">원재료명 *</Label>
                            <Input id="materialName" name="materialName" required />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="materialKind">원재료 종류 *</Label>
                            <Select onValueChange={(val) => {
                              const hidden = document.getElementById('newMaterialKind') as HTMLInputElement;
                              if (hidden) hidden.value = val;
                            }}>
                              <SelectTrigger>
                                <SelectValue placeholder="종류 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="RAW">원재료</SelectItem>
                                <SelectItem value="PACKAGING">포장재</SelectItem>
                                <SelectItem value="SUBSIDIARY">부자재</SelectItem>
                              </SelectContent>
                            </Select>
                            <input type="hidden" id="newMaterialKind" name="materialKind" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="category">카테고리</Label>
                            <Select onValueChange={(val) => {
                              const hidden = document.getElementById('newMaterialCategory') as HTMLInputElement;
                              if (hidden) hidden.value = val;
                            }}>
                              <SelectTrigger>
                                <SelectValue placeholder="카테고리 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                {materialCategories.map((cat: any) => (
                                  <SelectItem key={cat.id} value={cat.name}>
                                    {cat.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <input type="hidden" id="newMaterialCategory" name="category" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="unit">단위</Label>
                            <Input id="unit" name="unit" placeholder="예: kg, 개, L" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="shelfLifeDays">소비기한 (일)</Label>
                            <Input id="shelfLifeDays" name="shelfLifeDays" type="number" placeholder="30일 = 1개월로 자동 변환" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="description">설명</Label>
                            <Input id="description" name="description" />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="submit" disabled={createMaterialMutation.isPending}>
                            {createMaterialMutation.isPending ? "추가 중..." : "추가"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                  </div>
                </div>
                {/* 검색 바 */}
                <div className="flex items-center gap-3 mt-4">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="원재료명 또는 코드로 검색..."
                      value={matSearchQuery}
                      onChange={(e) => { setMatSearchQuery(e.target.value); setMatPage(1); }}
                      className="pl-10"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {matSearchQuery ? `검색 결과: ${materialTotal}건` : `${matPage}/${materialTotalPages} 페이지`}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleMatSort("materialCode")}>
                        <div className="flex items-center gap-1">
                          원재료 코드
                          <ArrowUpDown className="h-3 w-3" />
                          {matSortBy === "materialCode" && <span className="text-xs">({matSortOrder === "asc" ? "▲" : "▼"})</span>}
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleMatSort("materialName")}>
                        <div className="flex items-center gap-1">
                          원재료명
                          <ArrowUpDown className="h-3 w-3" />
                          {matSortBy === "materialName" && <span className="text-xs">({matSortOrder === "asc" ? "▲" : "▼"})</span>}
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleMatSort("category")}>
                        <div className="flex items-center gap-1">
                          카테고리
                          <ArrowUpDown className="h-3 w-3" />
                          {matSortBy === "category" && <span className="text-xs">({matSortOrder === "asc" ? "▲" : "▼"})</span>}
                        </div>
                      </TableHead>
                      <TableHead>단위</TableHead>
                      <TableHead>소비기한 (일)</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead className="text-right">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materials.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          {matSearchQuery 
                            ? `"${matSearchQuery}"에 대한 검색 결과가 없습니다.`
                            : '등록된 원재료가 없습니다. "원재료 추가" 또는 "일괄 업로드" 버튼을 사용하세요.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      materials.map((material: any) => (
                        <TableRow key={material.id}>
                          <TableCell className="font-mono text-sm">{material.materialCode}</TableCell>
                          <TableCell className="font-medium">{material.materialName}</TableCell>
                          <TableCell>
                            {material.category ? (
                              <Badge variant="outline">{material.category}</Badge>
                            ) : "-"}
                          </TableCell>
                          <TableCell>{material.unit || "-"}</TableCell>
                          <TableCell>{material.expiryWarningDays || "-"}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              material.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                            }`}>
                              {material.isActive ? "활성" : "비활성"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setViewingMaterial(material)}
                                title="상세보기"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingMaterial(material);
                                  setEditMaterialCategory(material.category || "");
                                }}
                                title="수정"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm(`"${material.materialName}" 원재료를 삭제하시겠습니까?`)) {
                                    deleteMaterialMutation.mutate({ id: material.id });
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                
                {/* 페이지네이션 */}
                {materialTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      총 {materialTotal}개 중 {(matPage - 1) * matPageSize + 1}~{Math.min(matPage * matPageSize, materialTotal)}개 표시
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={matPage <= 1}
                        onClick={() => setMatPage(matPage - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        이전
                      </Button>
                      {Array.from({ length: Math.min(materialTotalPages, 7) }, (_, i) => {
                        let pageNum: number;
                        if (materialTotalPages <= 7) {
                          pageNum = i + 1;
                        } else if (matPage <= 4) {
                          pageNum = i + 1;
                        } else if (matPage >= materialTotalPages - 3) {
                          pageNum = materialTotalPages - 6 + i;
                        } else {
                          pageNum = matPage - 3 + i;
                        }
                        return (
                          <Button
                            key={pageNum}
                            variant={matPage === pageNum ? "default" : "outline"}
                            size="sm"
                            className="w-9"
                            onClick={() => setMatPage(pageNum)}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={matPage >= materialTotalPages}
                        onClick={() => setMatPage(matPage + 1)}
                      >
                        다음
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 원재료 수정 Dialog */}
                  <Dialog open={!!editingMaterial} onOpenChange={(open) => !open && setEditingMaterial(null)}>
                    <DialogContent>
                      <form onSubmit={handleUpdateMaterial}>
                        <DialogHeader>
                          <DialogTitle>원재료 수정</DialogTitle>
                          <DialogDescription>원재료 정보를 수정하세요</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="edit-materialCode">원재료 코드</Label>
                            <Input id="edit-materialCode" name="materialCode" defaultValue={editingMaterial?.materialCode} readOnly className="bg-muted" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="edit-materialName">원재료명 *</Label>
                            <Input id="edit-materialName" name="materialName" defaultValue={editingMaterial?.materialName} required />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="edit-category">카테고리</Label>
                            <Select value={editMaterialCategory} onValueChange={setEditMaterialCategory}>
                              <SelectTrigger>
                                <SelectValue placeholder="카테고리 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                {materialCategories.map((cat: any) => (
                                  <SelectItem key={cat.id} value={cat.name}>
                                    {cat.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="edit-unit">단위</Label>
                            <Input id="edit-unit" name="unit" defaultValue={editingMaterial?.unit || ""} placeholder="예: kg, 개, L" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="edit-shelfLifeDays">소비기한 (일)</Label>
                            <Input id="edit-shelfLifeDays" name="shelfLifeDays" type="number" defaultValue={editingMaterial?.expiryWarningDays || ""} placeholder="30일 = 1개월로 자동 변환" />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setEditingMaterial(null)}>
                            취소
                          </Button>
                          <Button type="submit" disabled={updateMaterialMutation.isPending}>
                            {updateMaterialMutation.isPending ? "수정 중..." : "수정"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
          
            {/* 원재료 상세보기 Dialog */}
            <Dialog open={!!viewingMaterial} onOpenChange={() => setViewingMaterial(null)}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>원재료 상세 정보</DialogTitle>
                  <DialogDescription>
                    원재료의 상세 정보를 확인하세요
                  </DialogDescription>
                </DialogHeader>
                {viewingMaterial && (
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">원재료 코드</Label>
                        <p className="font-medium">{viewingMaterial.materialCode}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">원재료명</Label>
                        <p className="font-medium">{viewingMaterial.materialName}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">카테고리</Label>
                        <p className="font-medium">{viewingMaterial.category || "-"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">단위</Label>
                        <p className="font-medium">{viewingMaterial.unit || "-"}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">소비기한 경고 (일)</Label>
                        <p className="font-medium">{viewingMaterial.expiryWarningDays || "-"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">상태</Label>
                        <p className="font-medium">{viewingMaterial.isActive ? "활성" : "비활성"}</p>
                      </div>
                    </div>
                    {viewingMaterial.description && (
                      <div>
                        <Label className="text-muted-foreground">설명</Label>
                        <p className="font-medium">{viewingMaterial.description}</p>
                      </div>
                    )}
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setViewingMaterial(null)}>
                    닫기
                  </Button>
                  <Button onClick={() => {
                    setEditingMaterial(viewingMaterial);
                    setViewingMaterial(null);
                  }}>
                    수정
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

</TabsContent>

          {/* 거래처 관리 탭 */}
          <TabsContent value="suppliers" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>거래처 관리</CardTitle>
                    <CardDescription>
                      거래처 목록 및 연락처 정보 관리 | 총 <strong>{supplierTotal}개</strong> 등록됨
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportAllSuppliers}>
                      <Download className="h-4 w-4 mr-2" />
                      전체 다운로드
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownloadSupplierTemplate}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      템플릿
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTemplateType("supplier");
                        setTemplateCustomizerOpen(true);
                      }}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      커스텀 템플릿
                    </Button>
                    <Button variant="outline" onClick={() => setSupplierBulkUploadOpen(true)}>
                      <Upload className="h-4 w-4 mr-2" />
                      일괄 업로드
                    </Button>
                    <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          거래처 추가
                        </Button>
                      </DialogTrigger>
                    <DialogContent>
                      <form onSubmit={handleCreateSupplier}>
                        <DialogHeader>
                          <DialogTitle>새 거래처 추가</DialogTitle>
                          <DialogDescription>새로운 거래처 정보를 입력하세요</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="businessNumber">사업자번호 *</Label>
                            <Input id="businessNumber" name="businessNumber" required placeholder="123-45-67890" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="supplierName">거래처명 *</Label>
                            <Input id="supplierName" name="supplierName" required />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="supplierType">거래처 유형</Label>
                            <Select name="supplierType">
                              <SelectTrigger id="supplierType">
                                <SelectValue placeholder="선택하세요" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="거래처">거래처</SelectItem>
                                <SelectItem value="공급처">공급처</SelectItem>
                                <SelectItem value="원재료">원재료</SelectItem>
                                <SelectItem value="판매처">판매처</SelectItem>
                                <SelectItem value="전자상거래">전자상거래</SelectItem>
                                <SelectItem value="경비항목">경비항목</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="contactPerson">담당자</Label>
                            <Input id="contactPerson" name="contactPerson" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="contactPhone">연락처</Label>
                            <Input id="contactPhone" name="contactPhone" placeholder="예: 010-1234-5678" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="contactEmail">이메일</Label>
                            <Input id="contactEmail" name="contactEmail" type="email" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="address">주소</Label>
                            <Input id="address" name="address" />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="submit" disabled={createSupplierMutation.isPending}>
                            {createSupplierMutation.isPending ? "추가 중..." : "추가"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* 검색 바 */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="거래처명 또는 사업자번호로 검색..." value={supSearchQuery} onChange={(e) => { setSupSearchQuery(e.target.value); setSupPage(1); }} className="pl-10" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {supSearchQuery ? `검색 결과: ${supplierTotal}건` : `${supPage}/${supplierTotalPages} 페이지`}
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleSupSort("supplierCode")}>
                        <div className="flex items-center gap-1">사업자번호 <ArrowUpDown className="h-3 w-3" />{supSortBy === "supplierCode" && <span className="text-xs">({supSortOrder === "asc" ? "▲" : "▼"})</span>}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleSupSort("supplierName")}>
                        <div className="flex items-center gap-1">거래처명 <ArrowUpDown className="h-3 w-3" />{supSortBy === "supplierName" && <span className="text-xs">({supSortOrder === "asc" ? "▲" : "▼"})</span>}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleSupSort("supplierType")}>
                        <div className="flex items-center gap-1">유형 <ArrowUpDown className="h-3 w-3" />{supSortBy === "supplierType" && <span className="text-xs">({supSortOrder === "asc" ? "▲" : "▼"})</span>}</div>
                      </TableHead>
                      <TableHead>담당자</TableHead>
                      <TableHead>연락처</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead className="text-right">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          {supSearchQuery ? `"${supSearchQuery}"에 대한 검색 결과가 없습니다.` : '등록된 거래처가 없습니다. "거래처 추가" 또는 "일괄 업로드"를 사용하세요.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      suppliers.map((supplier: any) => (
                        <TableRow key={supplier.id}>
                          <TableCell className="font-medium">{supplier.businessNumber || "-"}</TableCell>
                          <TableCell>{supplier.supplierName}</TableCell>
                          <TableCell>{supplier.supplierType || "-"}</TableCell>
                          <TableCell>{supplier.contactPerson || "-"}</TableCell>
                          <TableCell>{supplier.phone || "-"}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              supplier.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                            }`}>
                              {supplier.isActive ? "활성" : "비활성"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingSupplier(supplier)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm("정말 삭제하시겠습니까?")) {
                                    deleteSupplierMutation.mutate({ id: supplier.id });
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                {/* 페이지네이션 */}
                {supplierTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">총 {supplierTotal}개 중 {(supPage - 1) * supPageSize + 1}~{Math.min(supPage * supPageSize, supplierTotal)}개 표시</p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={supPage <= 1} onClick={() => setSupPage(supPage - 1)}><ChevronLeft className="h-4 w-4" /> 이전</Button>
                      {Array.from({ length: Math.min(supplierTotalPages, 7) }, (_, i) => {
                        let pn: number;
                        if (supplierTotalPages <= 7) pn = i + 1;
                        else if (supPage <= 4) pn = i + 1;
                        else if (supPage >= supplierTotalPages - 3) pn = supplierTotalPages - 6 + i;
                        else pn = supPage - 3 + i;
                        return <Button key={pn} variant={supPage === pn ? "default" : "outline"} size="sm" className="w-9" onClick={() => setSupPage(pn)}>{pn}</Button>;
                      })}
                      <Button variant="outline" size="sm" disabled={supPage >= supplierTotalPages} onClick={() => setSupPage(supPage + 1)}>다음 <ChevronRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 거래처 수정 Dialog */}
                  <Dialog open={!!editingSupplier} onOpenChange={(open) => !open && setEditingSupplier(null)}>
                    <DialogContent>
                      <form onSubmit={handleUpdateSupplier}>
                        <DialogHeader>
                          <DialogTitle>거래처 수정</DialogTitle>
                          <DialogDescription>거래처 정보를 수정하세요</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="edit-businessNumber">사업자번호 *</Label>
                            <Input id="edit-businessNumber" name="businessNumber" defaultValue={editingSupplier?.businessNumber} required placeholder="123-45-67890" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="edit-supplierName">거래처명 *</Label>
                            <Input id="edit-supplierName" name="supplierName" defaultValue={editingSupplier?.supplierName} required />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="edit-supplierType">거래처 유형</Label>
                            <Select name="supplierType" defaultValue={editingSupplier?.supplierType || ""}>
                              <SelectTrigger id="edit-supplierType">
                                <SelectValue placeholder="선택하세요" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="거래처">거래처</SelectItem>
                                <SelectItem value="공급처">공급처</SelectItem>
                                <SelectItem value="원재료">원재료</SelectItem>
                                <SelectItem value="판매처">판매처</SelectItem>
                                <SelectItem value="전자상거래">전자상거래</SelectItem>
                                <SelectItem value="경비항목">경비항목</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="edit-contactPerson">담당자</Label>
                            <Input id="edit-contactPerson" name="contactPerson" defaultValue={editingSupplier?.contactPerson || ""} />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="edit-contactPhone">연락처</Label>
                            <Input id="edit-contactPhone" name="contactPhone" defaultValue={editingSupplier?.phone || ""} placeholder="예: 010-1234-5678" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="edit-contactEmail">이메일</Label>
                            <Input id="edit-contactEmail" name="contactEmail" type="email" defaultValue={editingSupplier?.email || ""} />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="edit-address">주소</Label>
                            <Input id="edit-address" name="address" defaultValue={editingSupplier?.address || ""} />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setEditingSupplier(null)}>
                            취소
                          </Button>
                          <Button type="submit" disabled={updateSupplierMutation.isPending}>
                            {updateSupplierMutation.isPending ? "수정 중..." : "수정"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
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
      
      {/* 일괄 업로드 모달 */}
      <MaterialBulkUploadModal
        open={materialBulkUploadOpen}
        onClose={() => setMaterialBulkUploadOpen(false)}
        onSuccess={() => refetchMaterials()}
      />
      <SupplierBulkUploadModal
        open={supplierBulkUploadOpen}
        onClose={() => setSupplierBulkUploadOpen(false)}
        onSuccess={() => refetchSuppliers()}
      />
      <ProductBulkUploadModal
        open={productBulkUploadOpen}
        onClose={() => setProductBulkUploadOpen(false)}
        onSuccess={() => refetchProducts()}
      />
      <TemplateCustomizer
        open={templateCustomizerOpen}
        onClose={() => setTemplateCustomizerOpen(false)}
        templateType={templateType}
      />
    </DashboardLayout>
  );
}
