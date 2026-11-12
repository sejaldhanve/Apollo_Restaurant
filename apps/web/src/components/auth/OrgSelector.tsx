import React from "react";
import { useAuthStore } from "../../stores/authStore";
import { Building2, ChevronDown } from "lucide-react";

export function OrgSelector() {
  const { organizations, currentOrgId, selectOrg } = useAuthStore();

  if (organizations.length === 0) return null;

  const currentOrg = organizations.find(
    (o) => o.organizationId === currentOrgId,
  );

  if (organizations.length === 1) {
    return (
      <div className="flex items-center space-x-2 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700">
        <Building2 className="h-4 w-4 text-gray-500" />
        <span>{currentOrg?.organizationName || "Restaurant Organization"}</span>
        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
          {currentOrg?.role}
        </span>
      </div>
    );
  }

  return (
    <div className="relative inline-block text-left">
      <div className="flex items-center space-x-1.5">
        <Building2 className="h-4 w-4 text-gray-500" />
        <select
          value={currentOrgId || ""}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            selectOrg(e.target.value)
          }
          aria-label="Select Restaurant Organization"
          className="rounded-md border border-gray-300 bg-white py-1.5 pr-8 pl-2 text-xs font-medium text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {organizations.map((org) => (
            <option key={org.organizationId} value={org.organizationId}>
              {org.organizationName} ({org.role})
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none -ml-6 h-3.5 w-3.5 text-gray-400" />
      </div>
    </div>
  );
}
