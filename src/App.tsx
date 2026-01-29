import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Outlet,
} from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import { Toaster } from "@/components/ui/sonner";
import Settings from "@/pages/Settings";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import CourseEditor from "@/pages/admin/CourseEditor";
import CoursePlayer from "@/pages/course/CoursePlayer";
import MyCourses from "@/pages/MyCourses";

import AccessDenied from "@/pages/AccessDenied";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, hasAccess } = useAuth();

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );

  if (!session) return <Navigate to="/login" />;

  if (!hasAccess) {
    return (
      <div className="p-8 text-center">
        You do not have access to MyLearning. Please contact support.
      </div>
    );
  }

  return <>{children}</>;
};

// Guard for Admin Routes
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, loading } = useAuth();

  // Wait for loading to finish, otherwise isAdmin might be false prematurely
  if (loading) return null;

  if (!isAdmin) {
    return <AccessDenied />;
  }

  return <>{children}</>;
};

// Guard for Guest Routes (redirect if already logged in)
const GuestRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" />;
  return <>{children}</>;
};

// Root Layout Component to wrap Context Providers
const RootLayout = () => {
  return (
    <AuthProvider>
      <Toaster />
      <Outlet />
    </AuthProvider>
  );
};

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: "/login",
        element: (
          <GuestRoute>
            <Login />
          </GuestRoute>
        ),
      },
      {
        path: "/",
        element: (
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <Dashboard /> },
          { path: "learning", element: <MyCourses /> },
          { path: "settings", element: <Settings /> },
          // Admin Routes
          {
            path: "admin",
            element: (
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            ),
          },
          {
            path: "admin/course/:id/edit",
            element: (
              <AdminRoute>
                <CourseEditor />
              </AdminRoute>
            ),
          },
        ],
      },
      // Standalone Player Route (No App Layout/Sidebar)
      {
        path: "course/:id",
        element: (
          <ProtectedRoute>
            <CoursePlayer />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
