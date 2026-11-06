import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import PurchasesManagement from "../../client/src/pages/accounting/PurchasesManagement";
(window as any).__PURCHASE_TEST__ = { calls: [], mode: "fail" };
createRoot(document.getElementById("root")!).render(<><PurchasesManagement /><Toaster /></>);
