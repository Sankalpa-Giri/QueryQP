"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminSubjects,
  createSubject,
  updateSubject,
  deleteSubjectPermanent,
  Subject,
  getAdminUser,
} from "../../../lib/api";
import {
  BookMarked,
  Plus,
  Edit,
  Power,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export default function SubjectManagementPage() {
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [department, setDepartment] = useState("");
  const [semester, setSemester] = useState<string>("");
  const [description, setDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const currentUser = getAdminUser();
  const isReviewer = currentUser?.role?.toLowerCase() === "reviewer";

  const { data: subjects = [], isLoading } = useQuery<Subject[]>({
    queryKey: ["admin-subjects"],
    queryFn: fetchAdminSubjects,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Partial<Subject> = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        department: department.trim() || null,
        semester: semester ? parseInt(semester, 10) : null,
        description: description.trim() || null,
      };

      if (editingSubject) {
        return updateSubject(editingSubject.id, payload);
      } else {
        return createSubject(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subjects"] });
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      setSuccessMessage(editingSubject ? "Subject updated successfully!" : "Subject created successfully!");
      setModalOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to save subject.");
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateSubject(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subjects"] });
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      setSuccessMessage("Subject status updated.");
    },
  });

  const deleteSubjectMutation = useMutation({
    mutationFn: (id: string) => deleteSubjectPermanent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subjects"] });
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      setSuccessMessage("Subject deleted successfully.");
    },
    onError: (err: any) => {
      alert(err.message || "Cannot delete subject.");
    },
  });

  const resetForm = () => {
    setEditingSubject(null);
    setName("");
    setCode("");
    setDepartment("");
    setSemester("");
    setDescription("");
    setErrorMessage(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setModalOpen(true);
  };

  const handleOpenEdit = (s: Subject) => {
    setEditingSubject(s);
    setName(s.name);
    setCode(s.code);
    setDepartment(s.department || "");
    setSemester(s.semester !== null && s.semester !== undefined ? s.semester.toString() : "");
    setDescription(s.description || "");
    setErrorMessage(null);
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      setErrorMessage("Subject name and unique subject code are required.");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">Subject Management</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Configure academic curriculum subjects, course codes, departments, and active statuses
          </p>
        </div>

        {!isReviewer ? (
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-primary hover:bg-primary-hover text-ground rounded-lg text-xs font-semibold transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Subject</span>
          </button>
        ) : (
          <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-medium">
            Reviewer Mode: Read-Only Curriculum
          </div>
        )}
      </div>

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 rounded-xl text-xs font-medium flex items-center justify-between animate-fadeIn">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-400 hover:text-emerald-300 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Subjects Table */}
      <div className="bg-surface rounded-xl border border-line overflow-hidden">
        <div className="px-6 py-3.5 border-b border-line-soft flex items-center justify-between bg-ground">
          <span className="text-xs font-semibold text-ink-soft">
            Registered Subjects ({subjects.length})
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-ink-faint animate-pulse">
            Loading subjects...
          </div>
        ) : subjects.length === 0 ? (
          <div className="p-12 text-center text-xs text-ink-faint">
            No subjects created yet. Click &quot;Add New Subject&quot; above to create one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line text-ink-muted font-semibold text-[10px] bg-ground">
                <tr>
                  <th className="px-6 py-3">Code</th>
                  <th className="px-6 py-3">Subject Name</th>
                  <th className="px-6 py-3">Department</th>
                  <th className="px-6 py-3">Semester</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {subjects.map((s) => (
                  <tr key={s.id} className="hover:bg-raised transition">
                    <td className="px-6 py-3 font-mono font-semibold text-primary">
                      {s.code}
                    </td>
                    <td className="px-6 py-3 font-semibold text-ink">
                      {s.name}
                      {s.description && (
                        <p className="text-[11px] text-ink-faint font-normal truncate max-w-xs">
                          {s.description}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-3 text-ink-soft">
                      {s.department || "-"}
                    </td>
                    <td className="px-6 py-3 text-ink-soft">
                      {s.semester ? `Semester ${s.semester}` : "-"}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                          s.is_active
                            ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/25"
                            : "bg-raised text-ink-muted border border-line"
                        }`}
                      >
                        {s.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      {!isReviewer ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(s)}
                            className="p-1.5 text-ink-muted hover:text-primary hover:bg-lift rounded-lg transition"
                            title="Edit Subject Details"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              toggleStatusMutation.mutate({ id: s.id, is_active: !s.is_active })
                            }
                            className={`p-1.5 rounded-lg transition ${
                              s.is_active
                                ? "text-ink-faint hover:text-amber-400 hover:bg-amber-500/10"
                                : "text-ink-faint hover:text-emerald-400 hover:bg-emerald-500/10"
                            }`}
                            title={s.is_active ? "Deactivate Subject" : "Activate Subject"}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Permanently delete subject "${s.name}" (${s.code})?`)) {
                                deleteSubjectMutation.mutate(s.id);
                              }
                            }}
                            className="p-1.5 text-ink-faint hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                            title="Delete Subject"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-ink-faint italic">View Only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-surface rounded-xl shadow-2xl max-w-lg w-full border border-line overflow-hidden">
            <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between bg-ground">
              <h3 className="text-sm font-semibold text-ink">
                {editingSubject ? `Edit Subject (${editingSubject.code})` : "Add New Subject"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-ink-faint hover:text-ink-soft"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {errorMessage && (
                <div className="p-3 bg-red-500/10 border border-red-500/25 text-red-300 text-xs rounded-lg flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-ink-soft mb-1">
                    Subject Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CS401"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-3 py-1.5 border border-line rounded-lg text-xs font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-ink-soft mb-1">
                    Subject Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Operating Systems"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-line rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-soft mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Computer Science"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-1.5 border border-line rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-soft mb-1">
                    Semester
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 4"
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    className="w-full px-3 py-1.5 border border-line rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Optional course or syllabus details..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-1.5 border border-line rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-line-soft">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-line rounded-lg text-xs font-medium text-ink-soft hover:bg-raised"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="px-4 py-2 bg-primary hover:bg-primary-hover text-ground rounded-lg text-xs font-semibold"
                >
                  {saveMutation.isPending ? "Saving..." : "Save Subject"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
