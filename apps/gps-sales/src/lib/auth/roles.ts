export const ROLES = ["owner", "admin", "manager", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "オーナー",
  admin: "管理者",
  manager: "マネージャー",
  staff: "スタッフ",
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function canManageMembers(role: Role): boolean {
  return role === "owner" || role === "admin";
}

/** Staff edit only their own visits. Other active roles may edit any visit in the org. */
export function canEditVisit(
  role: Role,
  visitStaffUserId: string,
  actorUserId: string,
): boolean {
  if (role === "staff") return visitStaffUserId === actorUserId;
  return role === "owner" || role === "admin" || role === "manager";
}
