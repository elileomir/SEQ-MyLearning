import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard,
  BookOpen,
  Settings,
  LogOut,
  Menu,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Sidebar() {
  const { pathname } = useLocation();
  const { user, signOut, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  // Common Navigation Items
  const navItems = [
    {
      name: "Dashboard",
      href: "/",
      icon: LayoutDashboard,
      active: pathname === "/",
    },
    {
      name: "My Courses",
      href: "/learning",
      icon: BookOpen,
      active: pathname === "/learning",
    },
    // Admin specific link
    ...(profile?.role === "admin"
      ? [
          {
            name: "Admin Panel",
            href: "/admin",
            icon: ShieldCheck,
            active: pathname.startsWith("/admin"),
          },
        ]
      : []),
    {
      name: "Settings",
      href: "/settings",
      icon: Settings,
      active: pathname === "/settings",
    },
  ];

  const NavContent = () => (
    <div className="flex flex-col h-full bg-zinc-900 text-white">
      {/* Brand */}
      <div className="flex h-16 items-center border-b border-zinc-800 px-6">
        <img src="/SEQ-Formwork-Logo.svg" alt="SEQ Logo" className="h-6" />
        <span className="ml-3 text-lg font-bold tracking-tight">
          MyLearning
        </span>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.name}
            to={item.href}
            onClick={() => setIsOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-zinc-800",
              item.active
                ? "bg-primary text-white shadow-sm"
                : "text-zinc-400 hover:text-white",
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </Link>
        ))}
      </div>

      {/* User & Footer */}
      <div className="border-t border-zinc-800 p-4">
        <div className="mb-4 flex items-center gap-3 px-2">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary border border-primary/30">
            {profile?.full_name?.charAt(0) ||
              user?.email?.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-sm font-medium text-white">
              {profile?.full_name || "User"}
            </span>
            <span className="truncate text-xs text-zinc-500">
              {user?.email}
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 border-zinc-700 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Trigger */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b bg-background px-4">
        <div className="flex items-center gap-2">
          <img
            src="/SEQ-Formwork-Logo.svg"
            alt="SEQ Logo"
            className="h-6 brightness-0"
          />
          <span className="font-bold">MyLearning</span>
        </div>
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="p-0 w-72 border-r-zinc-800 bg-zinc-900"
          >
            <NavContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex fixed inset-y-0 left-0 z-50 w-64 flex-col border-r bg-zinc-900">
        <NavContent />
      </div>
    </>
  );
}
