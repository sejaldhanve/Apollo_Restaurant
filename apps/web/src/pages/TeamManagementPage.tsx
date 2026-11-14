import React, { useState, useEffect } from "react";
import { apiClient } from "../lib/api-client";
import { useAuthStore } from "../stores/authStore";
import type {
  TeamMemberDto,
  RoleDto,
  LocationSummaryDto,
} from "@apollo/shared-types";
import {
  Users,
  UserPlus,
  RefreshCw,
  Shield,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Mail,
  Lock,
} from "lucide-react";

export function TeamManagementPage() {
  const { currentOrgId, user: currentUser } = useAuthStore();

  const [members, setMembers] = useState<TeamMemberDto[]>([]);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [locations, setLocations] = useState<LocationSummaryDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & search
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("ALL");

  // Invite Modal
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [inviteFirstName, setInviteFirstName] = useState<string>("");
  const [inviteLastName, setInviteLastName] = useState<string>("");
  const [inviteRoleId, setInviteRoleId] = useState<string>("");
  const [inviteLocationIds, setInviteLocationIds] = useState<string[]>([]);
  const [inviteTempPassword, setInviteTempPassword] = useState<string>("");

  // Edit Role/Location Modal
  const [editingMember, setEditingMember] = useState<TeamMemberDto | null>(
    null,
  );
  const [editRoleId, setEditRoleId] = useState<string>("");
  const [editLocationIds, setEditLocationIds] = useState<string[]>([]);

  const loadTeamData = async () => {
    if (!currentOrgId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [membersRes, rolesRes, locationsRes] = await Promise.all([
        apiClient.get<TeamMemberDto[]>("/api/v1/team"),
        apiClient.get<RoleDto[]>("/api/v1/team/roles"),
        apiClient.get<LocationSummaryDto[]>("/api/v1/team/locations"),
      ]);

      setMembers(membersRes);
      setRoles(rolesRes);
      setLocations(locationsRes);

      if (rolesRes.length > 0 && !inviteRoleId) {
        // Default invite role to Server if present, or first role
        const defaultRole =
          rolesRes.find((r) => r.name === "Server") || rolesRes[0];
        setInviteRoleId(defaultRole?.id || "");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load team data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTeamData();
  }, [currentOrgId]);

  // Handle Invite / Add Staff
  const handleInviteStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !inviteEmail.trim() ||
      !inviteFirstName.trim() ||
      !inviteLastName.trim() ||
      !inviteRoleId
    ) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.post("/api/v1/team/invite", {
        email: inviteEmail.trim().toLowerCase(),
        firstName: inviteFirstName.trim(),
        lastName: inviteLastName.trim(),
        roleId: inviteRoleId,
        locationIds: inviteLocationIds,
        temporaryPassword: inviteTempPassword || undefined,
      });

      setShowInviteModal(false);
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      setInviteTempPassword("");
      setInviteLocationIds([]);
      setSuccessMessage("Staff member enrolled successfully!");
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadTeamData();
    } catch (err: any) {
      setError(err.message || "Failed to add staff member");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Role Change
  const handleUpdateRole = async (membershipId: string, newRoleId: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.patch(`/api/v1/team/${membershipId}/role`, {
        roleId: newRoleId,
      });
      setEditingMember(null);
      setSuccessMessage("Staff role updated successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadTeamData();
    } catch (err: any) {
      setError(err.message || "Failed to update role");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Status Toggle (Activate/Suspend)
  const handleToggleStatus = async (member: TeamMemberDto) => {
    const nextStatus = member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.patch(`/api/v1/team/${member.id}/status`, {
        status: nextStatus,
      });
      setSuccessMessage(
        nextStatus === "ACTIVE"
          ? `${member.firstName} activated`
          : `${member.firstName} suspended`,
      );
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadTeamData();
    } catch (err: any) {
      setError(err.message || "Failed to update status");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Location Memberships Update
  const handleSaveLocations = async (membershipId: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.put(`/api/v1/team/${membershipId}/locations`, {
        locationIds: editLocationIds,
      });
      setEditingMember(null);
      setSuccessMessage("Location access updated");
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadTeamData();
    } catch (err: any) {
      setError(err.message || "Failed to update location access");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Role Badge Styling
  const getRoleBadgeStyle = (roleName: string) => {
    switch (roleName) {
      case "Owner":
        return "bg-indigo-100 text-indigo-800 border-indigo-200";
      case "Admin":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "Manager":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "Server":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "Kitchen":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "Viewer":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  // Status Badge Styling
  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-emerald-50 text-emerald-700 border-emerald-300";
      case "SUSPENDED":
        return "bg-rose-50 text-rose-700 border-rose-300";
      case "INVITED":
        return "bg-amber-50 text-amber-700 border-amber-300";
      default:
        return "bg-gray-50 text-gray-700 border-gray-300";
    }
  };

  // Filtered members
  const filteredMembers = members.filter((m) => {
    const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
    const email = m.email.toLowerCase();
    const query = searchQuery.toLowerCase();
    const matchesQuery = fullName.includes(query) || email.includes(query);
    const matchesRole =
      selectedRoleFilter === "ALL" || m.role.name === selectedRoleFilter;
    return matchesQuery && matchesRole;
  });

  // Summary counts
  const totalStaff = members.length;
  const activeStaff = members.filter((m) => m.status === "ACTIVE").length;
  const serversCount = members.filter((m) => m.role.name === "Server").length;
  const kitchenCount = members.filter((m) => m.role.name === "Kitchen").length;
  const managersCount = members.filter(
    (m) =>
      m.role.name === "Manager" ||
      m.role.name === "Admin" ||
      m.role.name === "Owner",
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">
              Team & Staff Management
            </h2>
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800 border border-indigo-200">
              Phase 2 • Staff
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Enrol staff members, assign organization roles, control location
            access, and manage server availability.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadTeamData}
            disabled={isLoading}
            className="rounded-lg border border-gray-300 bg-white p-2 text-gray-600 shadow-xs hover:bg-gray-50 disabled:opacity-50"
            title="Refresh Staff List"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>

          <button
            onClick={() => {
              setShowInviteModal(true);
              setInviteLocationIds(locations.map((l) => l.id));
            }}
            className="flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500"
          >
            <UserPlus className="h-4 w-4" />
            <span>Add Staff Member</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="flex items-center space-x-2.5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center space-x-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-2xs">
          <p className="text-2xs font-bold uppercase tracking-wider text-gray-500">
            Total Staff
          </p>
          <p className="mt-1 text-2xl font-extrabold text-gray-900">
            {totalStaff}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 shadow-2xs">
          <p className="text-2xs font-bold uppercase tracking-wider text-emerald-800">
            Active Staff
          </p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-900">
            {activeStaff}
          </p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 shadow-2xs">
          <p className="text-2xs font-bold uppercase tracking-wider text-blue-800">
            Servers (FoH)
          </p>
          <p className="mt-1 text-2xl font-extrabold text-blue-900">
            {serversCount}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 shadow-2xs">
          <p className="text-2xs font-bold uppercase tracking-wider text-amber-800">
            Kitchen (BoH)
          </p>
          <p className="mt-1 text-2xl font-extrabold text-amber-900">
            {kitchenCount}
          </p>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3.5 shadow-2xs">
          <p className="text-2xs font-bold uppercase tracking-wider text-purple-800">
            Management
          </p>
          <p className="mt-1 text-2xl font-extrabold text-purple-900">
            {managersCount}
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by staff name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            "ALL",
            "Owner",
            "Admin",
            "Manager",
            "Server",
            "Kitchen",
            "Viewer",
          ].map((roleName) => (
            <button
              key={roleName}
              onClick={() => setSelectedRoleFilter(roleName)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                selectedRoleFilter === roleName
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {roleName}
            </button>
          ))}
        </div>
      </div>

      {/* Staff Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xs">
        {filteredMembers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-bold text-gray-900">
              No staff members found
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              {searchQuery || selectedRoleFilter !== "ALL"
                ? "Try clearing your search or filter."
                : "Add staff members to assign servers to dining sections and tables."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50/80 text-xs font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th scope="col" className="py-3.5 pl-6 pr-3">
                    Staff Member
                  </th>
                  <th scope="col" className="px-3 py-3.5">
                    Role
                  </th>
                  <th scope="col" className="px-3 py-3.5">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-3.5">
                    Assigned Locations
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-right pr-6">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredMembers.map((member) => {
                  const isCurrent = currentUser?.id === member.userId;
                  const isSoleOwner =
                    member.role.name === "Owner" &&
                    members.filter((m) => m.role.name === "Owner").length === 1;

                  return (
                    <tr
                      key={member.id}
                      className="hover:bg-gray-50/60 transition"
                    >
                      {/* Name & Email */}
                      <td className="whitespace-nowrap py-4 pl-6 pr-3">
                        <div className="flex items-center space-x-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-700 text-xs border border-slate-200">
                            {member.firstName[0]}
                            {member.lastName[0]}
                          </div>
                          <div>
                            <div className="flex items-center space-x-1.5 font-bold text-gray-900">
                              <span>
                                {member.firstName} {member.lastName}
                              </span>
                              {isCurrent && (
                                <span className="rounded bg-indigo-50 px-1.5 py-0.2 text-2xs font-semibold text-indigo-700 border border-indigo-200">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              {member.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="whitespace-nowrap px-3 py-4">
                        <span
                          className={`inline-flex items-center space-x-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${getRoleBadgeStyle(
                            member.role.name,
                          )}`}
                        >
                          <Shield className="h-3 w-3 shrink-0" />
                          <span>{member.role.name}</span>
                        </span>
                      </td>

                      {/* Status */}
                      <td className="whitespace-nowrap px-3 py-4">
                        <span
                          className={`inline-flex items-center space-x-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${getStatusBadgeStyle(
                            member.status,
                          )}`}
                        >
                          {member.status === "ACTIVE" ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3 w-3 text-rose-500" />
                          )}
                          <span>{member.status}</span>
                        </span>
                      </td>

                      {/* Locations */}
                      <td className="px-3 py-4 text-xs text-gray-600">
                        {member.locations.length === 0 ? (
                          <span className="text-gray-400 italic">
                            All locations
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {member.locations.map((loc) => (
                              <span
                                key={loc.id}
                                className="inline-flex items-center space-x-1 rounded bg-slate-100 px-2 py-0.5 text-2xs font-medium text-slate-700 border border-slate-200"
                              >
                                <MapPin className="h-2.5 w-2.5 text-slate-500" />
                                <span>{loc.name}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="whitespace-nowrap py-4 pr-6 pl-3 text-right text-xs font-medium space-x-2">
                        {/* Edit Role / Location */}
                        <button
                          onClick={() => {
                            setEditingMember(member);
                            setEditRoleId(member.role.id);
                            setEditLocationIds(
                              member.locations.map((l) => l.id),
                            );
                          }}
                          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-gray-700 shadow-2xs hover:bg-gray-50 font-semibold"
                        >
                          Edit
                        </button>

                        {/* Status Toggle (Suspend / Activate) */}
                        {!isSoleOwner && (
                          <button
                            onClick={() => handleToggleStatus(member)}
                            disabled={isSubmitting}
                            className={`rounded-lg px-2.5 py-1 font-semibold shadow-2xs transition ${
                              member.status === "ACTIVE"
                                ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            }`}
                          >
                            {member.status === "ACTIVE"
                              ? "Suspend"
                              : "Activate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: INVITE / ADD STAFF */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Add Staff Member
                </h3>
                <p className="text-xs text-gray-500">
                  Enrol a team member into your organization with assigned roles
                  and station access.
                </p>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInviteStaff} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700">
                    First Name
                  </label>
                  <input
                    type="text"
                    required
                    value={inviteFirstName}
                    onChange={(e) => setInviteFirstName(e.target.value)}
                    placeholder="e.g. Auguste"
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700">
                    Last Name
                  </label>
                  <input
                    type="text"
                    required
                    value={inviteLastName}
                    onChange={(e) => setInviteLastName(e.target.value)}
                    placeholder="e.g. Gusteau"
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700">
                  Email Address
                </label>
                <div className="relative mt-1">
                  <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="server@restaurant.com"
                    className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700">
                  Organization Role
                </label>
                <select
                  required
                  value={inviteRoleId}
                  onChange={(e) => setInviteRoleId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} — {r.description || r.scope}
                    </option>
                  ))}
                </select>
              </div>

              {locations.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-700">
                    Location Access
                  </label>
                  <div className="mt-1.5 space-y-1.5 rounded-lg border border-gray-200 p-2.5 bg-gray-50/50">
                    {locations.map((loc) => (
                      <label
                        key={loc.id}
                        className="flex items-center space-x-2 text-xs font-medium text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={inviteLocationIds.includes(loc.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setInviteLocationIds([
                                ...inviteLocationIds,
                                loc.id,
                              ]);
                            } else {
                              setInviteLocationIds(
                                inviteLocationIds.filter((id) => id !== loc.id),
                              );
                            }
                          }}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>
                          {loc.name} ({loc.code})
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700">
                  Initial Password{" "}
                  <span className="font-normal text-gray-400">
                    (Optional, min 8 chars)
                  </span>
                </label>
                <div className="relative mt-1">
                  <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="password"
                    value={inviteTempPassword}
                    onChange={(e) => setInviteTempPassword(e.target.value)}
                    placeholder="Leave blank to auto-generate"
                    className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isSubmitting ? "Enrolling..." : "Confirm & Add Staff"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT ROLE & LOCATIONS */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Edit Staff: {editingMember.firstName} {editingMember.lastName}
                </h3>
                <p className="text-xs text-gray-500">{editingMember.email}</p>
              </div>
              <button
                onClick={() => setEditingMember(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700">
                  Change Role
                </label>
                <select
                  value={editRoleId}
                  onChange={(e) => setEditRoleId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} — {r.description || r.scope}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleUpdateRole(editingMember.id, editRoleId)}
                  disabled={
                    isSubmitting || editRoleId === editingMember.role.id
                  }
                  className="mt-2 w-full rounded-lg bg-indigo-600 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  Save Role
                </button>
              </div>

              {locations.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <label className="block text-xs font-bold text-gray-700">
                    Location Access
                  </label>
                  <div className="mt-1.5 space-y-1.5 rounded-lg border border-gray-200 p-2.5 bg-gray-50/50">
                    {locations.map((loc) => (
                      <label
                        key={loc.id}
                        className="flex items-center space-x-2 text-xs font-medium text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={editLocationIds.includes(loc.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditLocationIds([...editLocationIds, loc.id]);
                            } else {
                              setEditLocationIds(
                                editLocationIds.filter((id) => id !== loc.id),
                              );
                            }
                          }}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>
                          {loc.name} ({loc.code})
                        </span>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => handleSaveLocations(editingMember.id)}
                    disabled={isSubmitting}
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-2xs"
                  >
                    Save Location Access
                  </button>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
