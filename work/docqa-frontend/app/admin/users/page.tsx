"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  AdminUser,
  fetchAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  getAdminUser,
} from "../../../lib/api";
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ClipboardCheck,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Search,
  RefreshCw,
  Trash2,
  UserCheck,
  UserX,
  UserCog,
  Mail,
  User,
  X,
  Clock,
  ArrowRight,
} from "lucide-react";

export default function AdminUsersPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminUser | null>(null);

  // Create form state
  const [newUsername, setNewUsername] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("admin");
  const [newDefaultPassword, setNewDefaultPassword] = useState("UnivPass@2026");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Edit form state
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("admin");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Reset password form state
  const [resetPasswordVal, setResetPasswordVal] = useState("TempReset@2026");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const currentUser = getAdminUser();
  const isSuperAdmin = currentUser?.role?.toLowerCase() === "superadmin";

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminUsers();
      setAdmins(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateSubmitting(true);
    setError(null);
    try {
      await createAdminUser({
        username: newUsername.trim(),
        full_name: newFullName.trim() || undefined,
        email: newEmail.trim() || undefined,
        role: newRole,
        default_password: newDefaultPassword.trim(),
      });
      setSuccessMsg(`Admin account '${newUsername.trim()}' created successfully with role '${newRole.toUpperCase()}'.`);
      setShowCreateModal(false);
      setNewUsername("");
      setNewFullName("");
      setNewEmail("");
      setNewRole("admin");
      setNewDefaultPassword("UnivPass@2026");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create admin");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleOpenEdit = (admin: AdminUser) => {
    setSelectedAdmin(admin);
    setEditFullName(admin.full_name || "");
    setEditEmail(admin.email || "");
    setEditRole(admin.role || "admin");
    setShowEditModal(true);
  };

  const handleUpdateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmin) return;
    setEditSubmitting(true);
    setError(null);
    try {
      await updateAdminUser(selectedAdmin.id, {
        role: editRole,
        full_name: editFullName.trim() || undefined,
        email: editEmail.trim() || undefined,
      });
      setSuccessMsg(`Account for '@${selectedAdmin.username}' updated. Role is now '${editRole.toUpperCase()}'.`);
      setShowEditModal(false);
      setSelectedAdmin(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update admin account");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmin) return;
    setResetSubmitting(true);
    setError(null);
    try {
      await updateAdminUser(selectedAdmin.id, {
        reset_password: resetPasswordVal.trim(),
      });
      setSuccessMsg(`Password for '@${selectedAdmin.username}' reset. They will be prompted to change it on next login.`);
      setShowResetModal(false);
      setSelectedAdmin(null);
      setResetPasswordVal("TempReset@2026");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleToggleActive = async (admin: AdminUser) => {
    try {
      await updateAdminUser(admin.id, {
        is_active: !admin.is_active,
      });
      setSuccessMsg(`Account '@${admin.username}' ${!admin.is_active ? "activated" : "deactivated"}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update account status");
    }
  };

  const handleDelete = async (admin: AdminUser) => {
    if (!confirm(`Are you sure you want to permanently delete admin account '@${admin.username}'?`)) {
      return;
    }
    try {
      await deleteAdminUser(admin.id);
      setSuccessMsg(`Admin account '@${admin.username}' removed.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
    }
  };

  // If not superadmin, render access denied view
  if (!isSuperAdmin) {
    return (
      <div className="max-w-xl mx-auto my-16 bg-surface p-8 rounded-2xl border border-red-500/25 text-center space-y-4">
        <div className="w-14 h-14 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-semibold text-ink">Access Restricted</h2>
        <p className="text-xs text-ink-soft leading-relaxed max-w-md mx-auto">
          Managing administrator accounts and assigning role permissions is restricted to <strong>Superadmin</strong> accounts.
          Your current account role is <span className="font-semibold text-primary">{currentUser?.role || "Reviewer"}</span>.
        </p>
        <div className="pt-2">
          <Link
            href="/admin/dashboard"
            className="inline-flex items-center space-x-2 px-4 py-2 bg-primary hover:bg-primary-hover text-ground text-xs font-semibold rounded-xl transition"
          >
            <span>Return to Dashboard</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // Filtered list
  const filteredAdmins = admins.filter((a) => {
    const matchesSearch =
      a.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.full_name && a.full_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (a.email && a.email.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesRole = roleFilter === "ALL" || a.role.toLowerCase() === roleFilter.toLowerCase();
    return matchesSearch && matchesRole;
  });

  const pendingPasswordCount = admins.filter((a) => a.must_change_password).length;
  const activeCount = admins.filter((a) => a.is_active).length;
  const superadminCount = admins.filter((a) => a.role.toLowerCase() === "superadmin").length;
  const adminCount = admins.filter((a) => a.role.toLowerCase() === "admin").length;
  const reviewerCount = admins.filter((a) => a.role.toLowerCase() === "reviewer").length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-surface p-6 rounded-2xl border border-line">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-raised text-ink-soft rounded-lg">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-semibold text-ink tracking-tight">Admin Accounts & Access Control</h1>
          </div>
          <p className="text-xs text-ink-muted mt-1 max-w-2xl">
            Assign unique Admin IDs and granular roles (<span className="text-primary font-semibold">Superadmin</span>,{" "}
            <span className="text-primary font-semibold">Administrator</span>, or{" "}
            <span className="text-emerald-400 font-semibold">Reviewer</span>) to faculty and evaluators.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={loadData}
            className="p-2.5 text-ink-muted hover:text-ink-soft bg-ground hover:bg-lift rounded-xl border border-line transition"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-ground rounded-xl text-xs font-semibold transition"
          >
            <UserPlus className="w-4 h-4" />
            <span>Assign New Admin ID</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/25 rounded-xl flex items-center justify-between text-xs text-red-300">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-surface p-4 rounded-2xl border border-line flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-raised text-ink-soft flex items-center justify-center font-semibold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-semibold text-ink">{admins.length}</div>
            <div className="text-[11px] text-ink-muted font-medium">Total Accounts</div>
          </div>
        </div>

        <div className="bg-surface p-4 rounded-2xl border border-line flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-raised text-ink-soft flex items-center justify-center font-semibold">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-semibold text-primary">{superadminCount}</div>
            <div className="text-[11px] text-ink-muted font-medium">Superadmins</div>
          </div>
        </div>

        <div className="bg-surface p-4 rounded-2xl border border-line flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-raised text-ink-soft flex items-center justify-center font-semibold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-semibold text-primary">{adminCount}</div>
            <div className="text-[11px] text-ink-muted font-medium">Administrators</div>
          </div>
        </div>

        <div className="bg-surface p-4 rounded-2xl border border-line flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-semibold">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-semibold text-emerald-400">{reviewerCount}</div>
            <div className="text-[11px] text-ink-muted font-medium">Reviewers</div>
          </div>
        </div>

        <div className="bg-surface p-4 rounded-2xl border border-line flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-semibold">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-semibold text-amber-400">{pendingPasswordCount}</div>
            <div className="text-[11px] text-ink-muted font-medium">Pending Setup</div>
          </div>
        </div>
      </div>

      {/* Controls & Table */}
      <div className="bg-surface rounded-2xl border border-line overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b border-line bg-ground/50 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-ink-faint absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by Admin ID, name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <label className="text-xs text-ink-muted font-medium">Role Filter:</label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-surface border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-medium"
            >
              <option value="ALL">All Roles</option>
              <option value="superadmin">Superadmin ({superadminCount})</option>
              <option value="admin">Administrator ({adminCount})</option>
              <option value="reviewer">Reviewer ({reviewerCount})</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-ink-soft">
            <thead className="bg-raised/75 border-b border-line text-ink-soft font-semibold text-[10px]">
              <tr>
                <th className="px-5 py-3.5">Admin ID & Identity</th>
                <th className="px-5 py-3.5">Assigned Role & Scope</th>
                <th className="px-5 py-3.5">Password Security</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Last Active</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filteredAdmins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-ink-faint">
                    No administrator accounts match your criteria.
                  </td>
                </tr>
              ) : (
                filteredAdmins.map((admin) => {
                  const isCurrent = currentUser?.id === admin.id;
                  const normalizedRole = admin.role.toLowerCase();

                  return (
                    <tr key={admin.id} className="hover:bg-raised/80 transition">
                      <td className="px-5 py-4">
                        <div className="flex items-center space-x-3">
                          <div
                            className={`w-8 h-8 rounded-lg font-semibold flex items-center justify-center text-xs ${
                              normalizedRole === "superadmin"
                                ? "bg-primary text-ground"
                                : normalizedRole === "admin"
                                ? "bg-primary text-ground"
                                : "bg-emerald-900 text-emerald-200"
                            }`}
                          >
                            {admin.username.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center space-x-1.5 font-semibold text-ink text-xs">
                              <span>@{admin.username}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-raised text-ink-soft font-medium">
                                  You
                                </span>
                              )}
                            </div>
                            {admin.full_name && (
                              <div className="text-[11px] text-ink-muted font-medium">
                                {admin.full_name}
                              </div>
                            )}
                            {admin.email && (
                              <div className="text-[10px] text-ink-faint flex items-center space-x-1 mt-0.5">
                                <Mail className="w-3 h-3" />
                                <span>{admin.email}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div>
                          {normalizedRole === "superadmin" ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-raised border border-line-strong text-ink-soft">
                              <Shield className="w-3 h-3" />
                              <span>SUPERADMIN</span>
                            </span>
                          ) : normalizedRole === "admin" ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-raised border border-line-strong text-ink-soft">
                              <ShieldCheck className="w-3 h-3" />
                              <span>ADMINISTRATOR</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">
                              <ClipboardCheck className="w-3 h-3" />
                              <span>REVIEWER</span>
                            </span>
                          )}
                          <div className="text-[10px] text-ink-faint mt-1">
                            {normalizedRole === "superadmin"
                              ? "Full access + User management"
                              : normalizedRole === "admin"
                              ? "Uploads, Staging & Slides"
                              : "Staging Verification & Question Bank"}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {admin.must_change_password ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[10px] font-medium">
                            <Lock className="w-3 h-3 text-amber-400" />
                            <span>Default (Change Required)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[10px] font-medium">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>Secured by User</span>
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {admin.is_active ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-300">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-300">
                            Deactivated
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-ink-muted text-[11px]">
                        {admin.last_login_at ? (
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-ink-faint" />
                            <span>{new Date(admin.last_login_at).toLocaleString()}</span>
                          </div>
                        ) : (
                          <span className="text-ink-faint italic">Never signed in</span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center space-x-1">
                          {/* Edit Role / Account */}
                          <button
                            onClick={() => handleOpenEdit(admin)}
                            className="p-1.5 text-ink-muted hover:text-primary hover:bg-primary/10 rounded-lg transition"
                            title="Edit Role & Permissions"
                          >
                            <UserCog className="w-4 h-4" />
                          </button>

                          {/* Reset Password */}
                          <button
                            onClick={() => {
                              setSelectedAdmin(admin);
                              setShowResetModal(true);
                            }}
                            className="p-1.5 text-ink-muted hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition"
                            title="Reset to default password"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>

                          {/* Toggle Active */}
                          <button
                            onClick={() => handleToggleActive(admin)}
                            disabled={isCurrent}
                            className={`p-1.5 rounded-lg transition ${
                              isCurrent
                                ? "text-ink cursor-not-allowed"
                                : admin.is_active
                                ? "text-ink-muted hover:text-red-400 hover:bg-red-500/10"
                                : "text-ink-muted hover:text-emerald-400 hover:bg-emerald-500/10"
                            }`}
                            title={admin.is_active ? "Deactivate account" : "Activate account"}
                          >
                            {admin.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(admin)}
                            disabled={isCurrent}
                            className={`p-1.5 rounded-lg transition ${
                              isCurrent
                                ? "text-ink cursor-not-allowed"
                                : "text-ink-muted hover:text-red-400 hover:bg-red-500/10"
                            }`}
                            title="Delete account"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE ADMIN MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl max-w-lg w-full border border-line overflow-hidden">
            <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between bg-ground">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-semibold text-ink">Assign New Admin ID</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-ink-faint hover:text-ink-soft p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAdmin} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">
                  Assigned Admin ID / Username <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-ink-faint absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. faculty_ds_01 or hod_cse"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-ground border border-line rounded-lg focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <p className="text-[10px] text-ink-faint mt-1">
                  Unique identifier used by the administrator to log into the system.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Ramesh Sharma"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-ground border border-line rounded-lg focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">Institutional Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-ink-faint absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="email"
                    placeholder="e.g. sharma@university.edu"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-ground border border-line rounded-lg focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">
                  Select Role & Permissions <span className="text-red-400">*</span>
                </label>
                <div className="space-y-2">
                  <label
                    className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition ${
                      newRole === "admin"
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-line hover:bg-raised"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="admin"
                      checked={newRole === "admin"}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="mt-0.5 text-primary focus:ring-primary"
                    />
                    <div>
                      <div className="flex items-center space-x-1.5 font-semibold text-xs text-ink">
                        <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                        <span>Administrator</span>
                      </div>
                      <p className="text-[11px] text-ink-muted mt-0.5">
                        Can upload question papers, trigger AI ingestion, verify questions, and manage slides and subjects.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition ${
                      newRole === "reviewer"
                        ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500"
                        : "border-line hover:bg-raised"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="reviewer"
                      checked={newRole === "reviewer"}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="mt-0.5 text-emerald-400 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="flex items-center space-x-1.5 font-semibold text-xs text-ink">
                        <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Reviewer</span>
                      </div>
                      <p className="text-[11px] text-ink-muted mt-0.5">
                        Focused on Staging verification, AI Auto-fix & format, editing questions, and approving them into the Question Bank. (Cannot upload papers or manage administrators).
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition ${
                      newRole === "superadmin"
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-line hover:bg-raised"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="superadmin"
                      checked={newRole === "superadmin"}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="mt-0.5 text-primary focus:ring-primary"
                    />
                    <div>
                      <div className="flex items-center space-x-1.5 font-semibold text-xs text-ink">
                        <Shield className="w-3.5 h-3.5 text-primary" />
                        <span>Superadmin</span>
                      </div>
                      <p className="text-[11px] text-ink-muted mt-0.5">
                        Complete institutional authority including adding/editing other admins, changing roles, and resetting credentials.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">
                  Temporary Default Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-ink-faint absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={newDefaultPassword}
                    onChange={(e) => setNewDefaultPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-ground border border-line rounded-lg focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                  />
                </div>
                <div className="mt-2 p-2.5 bg-raised border border-line-strong rounded-lg text-[11px] text-ink-soft">
                  <span className="font-semibold">Security Rule:</span> When this administrator logs in for the first time
                  with this default password, they will be strictly required to set their own confidential password.
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-ink-soft hover:text-ink bg-raised hover:bg-line-strong rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-ground bg-primary hover:bg-primary-hover rounded-lg transition disabled:bg-ink-dim"
                >
                  {createSubmitting ? "Creating..." : "Create Admin Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ADMIN MODAL */}
      {showEditModal && selectedAdmin && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl max-w-md w-full border border-line overflow-hidden">
            <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between bg-ground">
              <div className="flex items-center space-x-2">
                <UserCog className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-semibold text-ink">
                  Edit Account (@{selectedAdmin.username})
                </h3>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-ink-faint hover:text-ink-soft p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateAdmin} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Ramesh Sharma"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-ground border border-line rounded-lg focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">Institutional Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-ink-faint absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="email"
                    placeholder="e.g. sharma@university.edu"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-ground border border-line rounded-lg focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">
                  Assigned Role & Permissions <span className="text-red-400">*</span>
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-ground border border-line rounded-lg focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                >
                  <option value="admin">Administrator (Upload, Ingest, Staging & Content)</option>
                  <option value="reviewer">Reviewer (Staging Verification & Question Bank)</option>
                  <option value="superadmin">Superadmin (Full Access & User Management)</option>
                </select>
                <p className="text-[10px] text-ink-faint mt-1">
                  Changing the role immediately updates this user's sidebar options and API permissions upon their next request.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-xs font-medium text-ink-soft hover:text-ink bg-raised hover:bg-line-strong rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-ground bg-primary hover:bg-primary-hover rounded-lg transition disabled:bg-ink-dim"
                >
                  {editSubmitting ? "Saving Changes..." : "Save Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {showResetModal && selectedAdmin && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl max-w-md w-full border border-line overflow-hidden">
            <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between bg-ground">
              <div className="flex items-center space-x-2">
                <KeyRound className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-semibold text-ink">Reset Default Password</h3>
              </div>
              <button
                onClick={() => setShowResetModal(false)}
                className="text-ink-faint hover:text-ink-soft p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              <p className="text-xs text-ink-soft">
                Assign a new temporary default password for <span className="font-semibold">@{selectedAdmin.username}</span>.
                Their account will be marked as requiring a password change upon their next sign in.
              </p>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">
                  New Temporary Password <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={resetPasswordVal}
                  onChange={(e) => setResetPasswordVal(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-ground border border-line rounded-lg focus:bg-raised focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="px-4 py-2 text-xs font-medium text-ink-soft hover:text-ink bg-raised hover:bg-line-strong rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition disabled:bg-ink-dim"
                >
                  {resetSubmitting ? "Resetting..." : "Apply Default Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
