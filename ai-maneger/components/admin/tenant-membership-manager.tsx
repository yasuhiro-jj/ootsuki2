 "use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { TenantKey, TenantMembershipRecord, TenantRole } from "@/lib/tenant-config/types";

type TenantMembershipManagerProps = {
  currentTenant: TenantKey;
  initialMemberships: TenantMembershipRecord[];
};

const roleOptions: TenantRole[] = ["viewer", "editor", "admin", "owner"];
const tenantOptions: TenantKey[] = ["ootsuki", "demo"];

export function TenantMembershipManager({
  currentTenant,
  initialMemberships,
}: TenantMembershipManagerProps) {
  const router = useRouter();
  const [tenantKey, setTenantKey] = useState<TenantKey>("demo");
  const [principalId, setPrincipalId] = useState("");
  const [role, setRole] = useState<TenantRole>("viewer");
  const [isActive, setIsActive] = useState(true);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const groupedMemberships = useMemo(() => {
    return tenantOptions.map((tenant) => ({
      tenant,
      records: initialMemberships.filter((record) => record.tenantKey === tenant),
    }));
  }, [initialMemberships]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/tenant-memberships?tenant=${currentTenant}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantKey,
          principalId,
          role,
          isActive,
        }),
      });

      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !data.ok) {
        setMessage(data.message || "保存に失敗しました。");
        return;
      }

      setMessage("保存しました。");
      setPrincipalId("");
      setRole("viewer");
      setIsActive(true);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="overflow-x-auto rounded-2xl border border-stone-900/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Tenant</th>
              <th className="px-4 py-3 font-medium">Principal</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">状態</th>
            </tr>
          </thead>
          <tbody>
            {groupedMemberships.flatMap((group) =>
              group.records.map((record) => (
                <tr key={`${record.tenantKey}:${record.principalId}`} className="border-t border-stone-900/5">
                  <td className="px-4 py-3 font-medium">{record.tenantKey}</td>
                  <td className="px-4 py-3">{record.principalId}</td>
                  <td className="px-4 py-3">{record.role}</td>
                  <td className="px-4 py-3">{record.isActive ? "active" : "inactive"}</td>
                </tr>
              )),
            )}
            {initialMemberships.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-stone-500">
                  membership はまだありません。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 rounded-2xl border border-stone-900/10 bg-stone-50 p-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Tenant</label>
          <select
            value={tenantKey}
            onChange={(event) => setTenantKey(event.target.value as TenantKey)}
            className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm outline-none"
          >
            {tenantOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Principal ID</label>
          <input
            value={principalId}
            onChange={(event) => setPrincipalId(event.target.value)}
            placeholder="local-dev / basic auth user など"
            className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm outline-none"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Role</label>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as TenantRole)}
            className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm outline-none"
          >
            {roleOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            className="h-4 w-4 rounded border-stone-300"
          />
          active にする
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex justify-center rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "保存中..." : "membership を保存"}
        </button>

        {message ? <p className="text-sm text-stone-600">{message}</p> : null}
      </form>
    </div>
  );
}
