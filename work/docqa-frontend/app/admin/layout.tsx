"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  clearAdminToken,
  getAdminToken,
  getAdminUser,
  setAdminUser,
  fetchCurrentAdmin,
  changeAdminPassword,
  AdminUser,
} from "../../lib/api";
import {
  LayoutDashboard,
  UploadCloud,
  Presentation,
  Layers,
  ClipboardCheck,
  HelpCircle,
  BookMarked,
  Users,
  LogOut,
  ExternalLink,
  Shield,
  Menu,
  X,
  KeyRound,
  Lock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { LogoMark } from "../../components/brand/LogoMark";

const NAV_ITEMS = [
  { name: "Admin Accounts", href: "/admin/users", icon: Users },
  { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { name: "Upload Paper", href: "/admin/upload", icon: UploadCloud },
  { name: "Batch Monitor", href: "/admin/batches", icon: Layers },
  { name: "Staging Area", href: "/admin/staging", icon: ClipboardCheck },
  { name: "Question Bank", href: "/admin/questions", icon: HelpCircle },
  { name: "Slides Manager", href: "/admin/slides", icon: Presentation },
  { name: "Subjects", href: "/admin/subjects", icon: BookMarked },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Current admin session
  const [currentUser, setCurrentUserState] = useState<AdminUser | null>(null);

  // Password change modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isMandatoryPasswordChange, setIsMandatoryPasswordChange] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);

  
useEffect(() => {
  setMounted(true);

  if (pathname === "/admin/login") {
    return;
  }

  const isLocalPreview =
    process.env.NODE_ENV === "development" &&
    (
      new URLSearchParams(window.location.search).get("preview") === "1" ||
      window.sessionStorage.getItem("queryqp-admin-preview") === "1"
    );

  if (isLocalPreview) {
    window.sessionStorage.setItem("queryqp-admin-preview", "1");
    setPreviewMode(true);
    return;
  }

  setPreviewMode(false);

  if (pathname !== "/admin/login") {

      // Load cached user or sync fresh from backend
      const cached = getAdminUser();
      if (cached) {
        setCurrentUserState(cached);
        if (cached.must_change_password) {
          setIsMandatoryPasswordChange(true);
          setShowPasswordModal(true);
        }
      }

      fetchCurrentAdmin()
        .then((freshUser) => {
          setCurrentUserState(freshUser);
          if (freshUser.must_change_password) {
            setIsMandatoryPasswordChange(true);
            setShowPasswordModal(true);
          }
        })
        .catch(() => {
          // Token might have expired
        });
    }
  }, [pathname, router]);

  const handleLogout = () => {
    clearAdminToken();
    router.push("/admin/login");
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    setPwdSuccess(null);

    if (newPwd.length < 6) {
      setPwdError("New password must be at least 6 characters long.");
      return;
    }

    if (newPwd !== confirmPwd) {
      setPwdError("New password and confirmation do not match.");
      return;
    }

    if (newPwd === currentPwd) {
      setPwdError("New password must be different from your existing password.");
      return;
    }

    setPwdLoading(true);
    try {
      const res = await changeAdminPassword(currentPwd, newPwd, confirmPwd);
      setPwdSuccess(res.message || "Password changed successfully!");
      if (currentUser) {
        const updated = { ...currentUser, must_change_password: false };
        setCurrentUserState(updated);
        setAdminUser(updated);
      }
      setIsMandatoryPasswordChange(false);
      setTimeout(() => {
        setShowPasswordModal(false);
        setCurrentPwd("");
        setNewPwd("");
        setConfirmPwd("");
        setPwdSuccess(null);
      }, 1200);
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPwdLoading(false);
    }
  };

  // If on login page, render clean full-screen wrapper
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const userRole = (
  previewMode ? "superadmin" : (currentUser?.role || "admin")
    ).toLowerCase();

  const filteredNavItems = NAV_ITEMS.filter((item) => {
    if (item.href === "/admin/users") {
      return userRole === "superadmin";
    }
    if (item.href === "/admin/upload" || item.href === "/admin/batches") {
      return userRole === "superadmin" || userRole === "admin";
    }
    return true;
  });

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-ground flex flex-col md:flex-row font-sans">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between bg-frame text-white px-4 py-3 border-b border-line">
        <div className="flex items-center space-x-2">
          <Shield className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm">QueryQP Admin</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 text-ink-soft hover:text-white"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`${
          mobileMenuOpen ? "block" : "hidden"
        } md:block md:w-64 border-r border-line bg-frame text-ink flex flex-col flex-shrink-0 z-30`}
      >
        {/* Brand */}
        <div className="hidden md:flex items-center space-x-3 px-6 py-5 border-b border-line">
          <LogoMark className="h-9 w-9 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-white leading-none">
              QueryQP Admin
            </h2>
            <span className="text-[10px] text-ink-muted font-medium">
              Management Portal
            </span>
          </div>
        </div>

        {/* Links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
                  isActive
                    ? "bg-primary text-ground"
                    : "text-ink-muted hover:text-ink hover:bg-raised"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-ink-muted"}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Profile Card & Options */}
        <div className="p-3 border-t border-line space-y-2">
          {currentUser && (
            <div className="p-2.5 rounded-xl bg-raised/80 border border-line-strong/60 flex items-center justify-between">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-primary/30 border border-primary/30 text-primary font-semibold flex items-center justify-center text-xs flex-shrink-0">
                  {currentUser.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate leading-tight">
                    @{currentUser.username}
                  </div>
                  <div className="flex items-center space-x-1.5 mt-0.5">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                        userRole === "superadmin"
                          ? "bg-primary/20 text-primary border border-primary/30"
                          : userRole === "reviewer"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-white/10 text-ink-soft border border-line-strong"
                      }`}
                    >
                      {userRole}
                    </span>
                    {currentUser.full_name && (
                      <span className="text-[10px] text-ink-muted truncate">
                        {currentUser.full_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsMandatoryPasswordChange(false);
                  setShowPasswordModal(true);
                }}
                className="p-1.5 text-ink-muted hover:text-white hover:bg-lift rounded-lg transition"
                title="Change Password"
              >
                <KeyRound className="w-4 h-4" />
              </button>
            </div>
          )}

          <Link
            href="/"
            className="flex items-center space-x-3 px-3 py-2 rounded-lg text-xs font-medium text-ink-muted hover:text-ink hover:bg-raised transition"
          >
            <ExternalLink className="w-4 h-4 text-ink-faint" />
            <span>Student Portal</span>
          </Link>

          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition text-left"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>

      {/* PASSWORD CHANGE MODAL */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl max-w-md w-full border border-line overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between bg-ground">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-raised text-ink-soft rounded-lg">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-ink">
                  {isMandatoryPasswordChange ? "First-Time Password Setup Required" : "Change Account Password"}
                </h3>
              </div>
              {!isMandatoryPasswordChange && (
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="text-ink-faint hover:text-ink-soft p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <form onSubmit={handlePasswordSubmit} className="p-6 space-y-4">
              {isMandatoryPasswordChange && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-300 space-y-1">
                  <div className="flex items-center space-x-1.5 font-semibold text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span>Institution Security Policy</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-300">
                    You have signed in using a temporary default password assigned by your institution.
                    To secure your account and protect examination data, you must configure a personal password to proceed.
                  </p>
                </div>
              )}

              {pwdError && (
                <div className="p-3 bg-red-500/10 border border-red-500/25 text-red-300 text-xs rounded-lg">
                  {pwdError}
                </div>
              )}

              {pwdSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs rounded-lg flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>{pwdSuccess}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">
                  Current (Default) Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-ink-faint absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="password"
                    required
                    placeholder="Enter current password"
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-ground border border-line rounded-lg focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">
                  New Confidential Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-ink-faint absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="password"
                    required
                    placeholder="Minimum 6 characters"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-ground border border-line rounded-lg focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">
                  Confirm New Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-ink-faint absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="password"
                    required
                    placeholder="Re-enter new password"
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-ground border border-line rounded-lg focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                {!isMandatoryPasswordChange && (
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="px-4 py-2 text-xs font-medium text-ink-soft hover:text-ink bg-raised hover:bg-line-strong rounded-lg transition"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="px-4 py-2 text-xs font-semibold text-ground bg-primary hover:bg-primary-hover rounded-lg transition disabled:bg-ink-dim flex items-center space-x-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{pwdLoading ? "Securing..." : "Update & Secure Password"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
