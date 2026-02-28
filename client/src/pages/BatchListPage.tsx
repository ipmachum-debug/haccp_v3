import DashboardLayout from "@/components/DashboardLayout";
import BatchList from "./BatchList";

export default function BatchListPage() {
  return (
    <DashboardLayout>
      <div className="mx-auto py-2 px-1 md:px-2">
        <BatchList />
      </div>
    </DashboardLayout>
  );
}
