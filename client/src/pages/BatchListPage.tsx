import DashboardLayout from "@/components/DashboardLayout";
import BatchList from "./BatchList";

export default function BatchListPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BatchList />
      </div>
    </DashboardLayout>
  );
}
