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

const NAV_ITEMS = [
  { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { name: "Upload Paper", href: "/admin/upload", icon: UploadCloud },
  { name: "Batch Monitor", href: "/admin/batches", icon: Layers },
  { name: "Staging Area", href: "/admin/staging", icon: ClipboardCheck },
  { name: "Question Bank", href: "/admin/questions", icon: HelpCircle },
  { name: "Subjects", href: "/admin/subjects", icon: BookMarked },
  { name: "Admin Accounts", href: "/admin/users", icon: Users },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

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
    if (pathname !== "/admin/login") {
      const token = getAdminToken();
      if (!token) {
        router.push("/admin/login");
        return;
      }

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

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row font-sans">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between bg-slate-900 text-white px-4 py-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Shield className="w-5 h-5 text-blue-400" />
          <span className="font-bold text-sm">QueryQP Admin</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 text-slate-300 hover:text-white"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`${
          mobileMenuOpen ? "block" : "hidden"
        } md:block md:w-64 bg-slate-900 text-slate-200 flex flex-col flex-shrink-0 z-30`}
      >
        {/* Brand */}
        <div className="hidden md:flex items-center space-x-3 px-6 py-5 border-b border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-white leading-none">
              QueryQP Admin
            </h2>
            <span className="text-[10px] text-slate-400 font-medium">
              Management Portal
            </span>
          </div>
        </div>

        {/* Links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Profile Card & Options */}
        <div className="p-3 border-t border-slate-800 space-y-2">
          {currentUser && (
            <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-between">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500/30 text-blue-400 font-bold flex items-center justify-center text-xs flex-shrink-0">
                  {currentUser.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate leading-tight">
                    @{currentUser.username}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {currentUser.full_name || currentUser.role.toUpperCase()}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsMandatoryPasswordChange(false);
                  setShowPasswordModal(true);
                }}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
                title="Change Password"
              >
                <KeyRound className="w-4 h-4" />
              </button>
            </div>
          )}

          <Link
            href="/"
            className="flex items-center space-x-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <ExternalLink className="w-4 h-4 text-slate-500" />
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  {isMandatoryPasswordChange ? "First-Time Password Setup Required" : "Change Account Password"}
                </h3>
              </div>
              {!isMandatoryPasswordChange && (
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <form onSubmit={handlePasswordSubmit} className="p-6 space-y-4">
              {isMandatoryPasswordChange && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                  <div className="flex items-center space-x-1.5 font-bold text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>Institution Security Policy</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-800">
                    You have signed in using a temporary default password assigned by your institution.
                    To secure your account and protect examination data, you must configure a personal password to proceed.
                  </p>
                </div>
              )}

              {pwdError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                  {pwdError}
                </div>
              )}

              {pwdSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{pwdSuccess}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Current (Default) Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="password"
                    required
                    placeholder="Enter current password"
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Confidential Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="password"
                    required
                    placeholder="Minimum 6 characters"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm New Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="password"
                    required
                    placeholder="Re-enter new password"
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                {!isMandatoryPasswordChange && (
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow transition disabled:bg-slate-300 flex items-center space-x-1.5"
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
