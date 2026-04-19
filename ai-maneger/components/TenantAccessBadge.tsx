import { getCurrentAccessContext } from "@/lib/api/tenant-access";

function roleTone(role: string | null) {
  switch (role) {
    case "owner":
    case "admin":
      return "bg-emerald-100 text-emerald-900";
    case "editor":
      return "bg-blue-100 text-blue-900";
    case "viewer":
      return "bg-stone-200 text-stone-800";
    default:
      return "bg-stone-100 text-stone-600";
  }
}

export async function TenantAccessBadge() {
  const access = await getCurrentAccessContext();
  if (!access.tenant && !access.principalId) return null;

  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-stone-900/10 bg-stone-50 px-3 py-2 text-xs text-stone-700">
      <span className="font-semibold text-stone-900">Tenant</span>
      <span className="rounded-full bg-stone-900 px-2 py-0.5 font-semibold text-white">
        {access.tenant || "unknown"}
      </span>
      <span className="font-semibold text-stone-900">User</span>
      <span className="rounded-full bg-white px-2 py-0.5">{access.principalId || "unknown"}</span>
      <span className={`rounded-full px-2 py-0.5 font-semibold ${roleTone(access.role)}`}>
        role: {access.role || "none"}
      </span>
    </div>
  );
}
