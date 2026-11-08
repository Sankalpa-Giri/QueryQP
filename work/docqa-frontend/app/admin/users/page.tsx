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
      <div className="max-w-xl mx-auto my-16 bg-white p-8 rounded-2xl border border-red-200 shadow-sm text-center space-y-4">
        <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
          Managing administrator accounts and assigning role permissions is restricted to <strong>Superadmin</strong> accounts.
          Your current account role is <span className="font-bold uppercase text-blue-600">{currentUser?.role || "Reviewer"}</span>.
        </p>
        <div className="pt-2">
          <Link
            href="/admin/dashboard"
            className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow transition"
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Admin Accounts & Access Control</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Assign unique Admin IDs and granular roles (<span className="text-purple-600 font-semibold">Superadmin</span>,{" "}
            <span className="text-blue-600 font-semibold">Administrator</span>, or{" "}
            <span className="text-emerald-600 font-semibold">Reviewer</span>) to faculty and evaluators.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={loadData}
            className="p-2.5 text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <UserPlus className="w-4 h-4" />
            <span>Assign New Admin ID</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-700">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-900">{admins.length}</div>
            <div className="text-[11px] text-slate-500 font-medium">Total Accounts</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-purple-600">{superadminCount}</div>
            <div className="text-[11px] text-slate-500 font-medium">Superadmins</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-blue-600">{adminCount}</div>
            <div className="text-[11px] text-slate-500 font-medium">Administrators</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-emerald-600">{reviewerCount}</div>
            <div className="text-[11px] text-slate-500 font-medium">Reviewers</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-amber-600">{pendingPasswordCount}</div>
            <div className="text-[11px] text-slate-500 font-medium">Pending Setup</div>
          </div>
        </div>
      </div>

      {/* Controls & Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by Admin ID, name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <label className="text-xs text-slate-500 font-medium">Role Filter:</label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
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
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/75 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3.5">Admin ID & Identity</th>
                <th className="px-5 py-3.5">Assigned Role & Scope</th>
                <th className="px-5 py-3.5">Password Security</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Last Active</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAdmins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                    No administrator accounts match your criteria.
                  </td>
                </tr>
              ) : (
                filteredAdmins.map((admin) => {
                  const isCurrent = currentUser?.id === admin.id;
                  const normalizedRole = admin.role.toLowerCase();

                  return (
                    <tr key={admin.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-4">
                        <div className="flex items-center space-x-3">
                          <div
                            className={`w-8 h-8 rounded-lg font-bold flex items-center justify-center text-xs ${
                              normalizedRole === "superadmin"
                                ? "bg-purple-900 text-purple-200"
                                : normalizedRole === "admin"
                                ? "bg-blue-900 text-blue-200"
                                : "bg-emerald-900 text-emerald-200"
                            }`}
                          >
                            {admin.username.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center space-x-1.5 font-bold text-slate-900 text-xs">
                              <span>@{admin.username}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-100 text-blue-700 font-medium">
                                  You
                                </span>
                              )}
                            </div>
                            {admin.full_name && (
                              <div className="text-[11px] text-slate-500 font-medium">
                                {admin.full_name}
                              </div>
                            )}
                            {admin.email && (
                              <div className="text-[10px] text-slate-400 flex items-center space-x-1 mt-0.5">
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
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-purple-50 border border-purple-200 text-purple-700">
                              <Shield className="w-3 h-3" />
                              <span>SUPERADMIN</span>
                            </span>
                          ) : normalizedRole === "admin" ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-blue-50 border border-blue-200 text-blue-700">
                              <ShieldCheck className="w-3 h-3" />
                              <span>ADMINISTRATOR</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">
                              <ClipboardCheck className="w-3 h-3" />
                              <span>REVIEWER</span>
                            </span>
                          )}
                          <div className="text-[10px] text-slate-400 mt-1">
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
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-medium">
                            <Lock className="w-3 h-3 text-amber-600" />
                            <span>Default (Change Required)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-medium">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Secured by User</span>
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {admin.is_active ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
                            Deactivated
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-slate-500 text-[11px]">
                        {admin.last_login_at ? (
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{new Date(admin.last_login_at).toLocaleString()}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Never signed in</span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center space-x-1">
                          {/* Edit Role / Account */}
                          <button
                            onClick={() => handleOpenEdit(admin)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
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
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
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
                                ? "text-slate-200 cursor-not-allowed"
                                : admin.is_active
                                ? "text-slate-500 hover:text-red-600 hover:bg-red-50"
                                : "text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
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
                                ? "text-slate-200 cursor-not-allowed"
                                : "text-slate-500 hover:text-red-600 hover:bg-red-50"
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Assign New Admin ID</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAdmin} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Admin ID / Username <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. faculty_ds_01 or hod_cse"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Unique identifier used by the administrator to log into the system.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Ramesh Sharma"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Institutional Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="email"
                    placeholder="e.g. sharma@university.edu"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Role & Permissions <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  <label
                    className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition ${
                      newRole === "admin"
                        ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-500"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="admin"
                      checked={newRole === "admin"}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="flex items-center space-x-1.5 font-bold text-xs text-slate-900">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                        <span>Administrator</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Can upload question papers, trigger AI ingestion, verify questions, and manage slides and subjects.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition ${
                      newRole === "reviewer"
                        ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="reviewer"
                      checked={newRole === "reviewer"}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="flex items-center space-x-1.5 font-bold text-xs text-slate-900">
                        <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Reviewer</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Focused on Staging verification, AI Auto-fix & format, editing questions, and approving them into the Question Bank. (Cannot upload papers or manage administrators).
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition ${
                      newRole === "superadmin"
                        ? "border-purple-500 bg-purple-50/50 ring-1 ring-purple-500"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="superadmin"
                      checked={newRole === "superadmin"}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <div className="flex items-center space-x-1.5 font-bold text-xs text-slate-900">
                        <Shield className="w-3.5 h-3.5 text-purple-600" />
                        <span>Superadmin</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Complete institutional authority including adding/editing other admins, changing roles, and resetting credentials.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Temporary Default Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={newDefaultPassword}
                    onChange={(e) => setNewDefaultPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div className="mt-2 p-2.5 bg-blue-50 border border-blue-100 rounded-lg text-[11px] text-blue-800">
                  <span className="font-bold">Security Rule:</span> When this administrator logs in for the first time
                  with this default password, they will be strictly required to set their own confidential password.
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow transition disabled:bg-slate-300"
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <UserCog className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Edit Account (@{selectedAdmin.username})
                </h3>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateAdmin} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Ramesh Sharma"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Institutional Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="email"
                    placeholder="e.g. sharma@university.edu"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Role & Permissions <span className="text-red-500">*</span>
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option value="admin">Administrator (Upload, Ingest, Staging & Content)</option>
                  <option value="reviewer">Reviewer (Staging Verification & Question Bank)</option>
                  <option value="superadmin">Superadmin (Full Access & User Management)</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Changing the role immediately updates this user's sidebar options and API permissions upon their next request.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow transition disabled:bg-slate-300"
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <KeyRound className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">Reset Default Password</h3>
              </div>
              <button
                onClick={() => setShowResetModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Assign a new temporary default password for <span className="font-bold">@{selectedAdmin.username}</span>.
                Their account will be marked as requiring a password change upon their next sign in.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Temporary Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={resetPasswordVal}
                  onChange={(e) => setResetPasswordVal(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow transition disabled:bg-slate-300"
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
