import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-muted/20 font-sans">
      <Sidebar />
      <main className="lg:pl-64">
        {/* Mobile Header Spacer */}
        <div className="h-16 lg:hidden" />

        {/* Main Content Area */}
        <div className="container mx-auto p-4 md:p-8 max-w-7xl animate-in fade-in duration-500">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
