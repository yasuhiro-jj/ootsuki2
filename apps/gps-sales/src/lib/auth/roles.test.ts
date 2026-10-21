import { canEditVisit, canManageMembers } from "./roles";
import { describe, expect, it } from "vitest";

describe("roles", () => {
  it("lets staff edit only their own visits", () => {
    expect(canEditVisit("staff", "staff-a", "staff-a")).toBe(true);
    expect(canEditVisit("staff", "staff-b", "staff-a")).toBe(false);
    expect(canEditVisit("manager", "staff-b", "manager-a")).toBe(true);
  });

  it("limits member management to owner and admin", () => {
    expect(canManageMembers("owner")).toBe(true);
    expect(canManageMembers("admin")).toBe(true);
    expect(canManageMembers("manager")).toBe(false);
    expect(canManageMembers("staff")).toBe(false);
  });
});
