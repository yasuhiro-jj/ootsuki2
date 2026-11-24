import { customers, user } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/types";
import { createCustomerHttp, listCustomersHttp, updateCustomerHttp } from "@/modules/customers/http";
import { createOrgCustomer, updateOrgCustomer } from "@/modules/customers/service";
import { removeMemberHttp } from "@/modules/organizations/http";
import {
  createOrganization,
  inviteMember,
  removeMember,
  updateMember,
} from "@/modules/organizations/service";
import { createTestDb } from "@/test/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const actor = (id: string, email: string): CurrentUser => ({
  id,
  email,
  name: email,
});

describe("tenant isolation", () => {
  const dbPromise = createTestDb();
  let db: Awaited<ReturnType<typeof createTestDb>>["db"];
  let close: () => Promise<void>;
  let orgA = "";
  let orgB = "";
  const ownerA = actor("owner-a", "owner-a@example.com");
  const staffA = actor("staff-a", "staff-a@example.com");
  const ownerB = actor("owner-b", "owner-b@example.com");
  let customerB = "";

  beforeAll(async () => {
    const testDb = await dbPromise;
    db = testDb.db;
    close = testDb.close;
    await db.insert(user).values([
      { id: ownerA.id, name: "Owner A", email: ownerA.email, emailVerified: true, updatedAt: new Date() },
      { id: staffA.id, name: "Staff A", email: staffA.email, emailVerified: true, updatedAt: new Date() },
      { id: ownerB.id, name: "Owner B", email: ownerB.email, emailVerified: true, updatedAt: new Date() },
    ]);
    orgA = (await createOrganization(db, ownerA, { name: "会社A", slug: "company-a" })).id;
    orgB = (await createOrganization(db, ownerB, { name: "会社B", slug: "company-b" })).id;
    await inviteMember(db, ownerA, orgA, { email: staffA.email, role: "staff" });
    const created = await createOrgCustomer(db, ownerB, orgB, { name: "B社顧客" });
    customerB = created.customer.id;
    await createOrgCustomer(db, ownerA, orgA, { name: "A社顧客" });
  });

  afterAll(async () => {
    await close();
  });

  it("returns 401 when there is no session", async () => {
    const response = await listCustomersHttp(new Request("http://localhost/customers"), orgA, {
      db,
      getCurrentUser: async () => null,
    });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("postgres");
  });

  it("returns 404 for a user who is not a member and does not list the other company", async () => {
    const response = await listCustomersHttp(new Request("http://localhost/customers"), orgB, {
      db,
      getCurrentUser: async () => ownerA,
    });
    expect(response.status).toBe(404);
  });

  it("does not read or update another company's customer", async () => {
    const listed = await listCustomersHttp(new Request("http://localhost/customers"), orgA, {
      db,
      getCurrentUser: async () => ownerA,
    });
    expect(listed.status).toBe(200);
    const listedBody = await listed.json();
    expect(listedBody.customers).toHaveLength(1);
    expect(listedBody.customers[0].name).toBe("A社顧客");
    expect(JSON.stringify(listedBody)).not.toContain("B社顧客");

    const updated = await updateCustomerHttp(
      new Request("http://localhost/customers", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "書き換え" }),
      }),
      orgA,
      customerB,
      { db, getCurrentUser: async () => ownerA },
    );
    expect(updated.status).toBe(404);

    const crossOrg = await updateCustomerHttp(
      new Request("http://localhost/customers", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "書き換え" }),
      }),
      orgB,
      customerB,
      { db, getCurrentUser: async () => ownerA },
    );
    expect(crossOrg.status).toBe(404);

    const stored = await db.select().from(customers).where(eq(customers.id, customerB));
    expect(stored[0]?.name).toBe("B社顧客");
    expect(stored[0]?.organizationId).toBe(orgB);
  });

  it("refuses to remove or demote the last owner", async () => {
    const removed = await removeMemberHttp(orgB, ownerB.id, {
      db,
      getCurrentUser: async () => ownerB,
    });
    expect(removed.status).toBe(409);
    const body = await removed.json();
    expect(body.error.code).toBe("last_owner");

    await expect(
      updateMember(db, ownerB, orgB, ownerB.id, { role: "admin" }),
    ).rejects.toMatchObject({ code: "last_owner" });
    await expect(removeMember(db, ownerB, orgB, ownerB.id)).rejects.toMatchObject({
      code: "last_owner",
    });
  });

  it("blocks invited, disabled, and suspended access, and blocks staff from inviting", async () => {
    const invited = await listCustomersHttp(new Request("http://localhost/customers"), orgA, {
      db,
      getCurrentUser: async () => staffA,
    });
    expect(invited.status).toBe(403);

    await updateMember(db, ownerA, orgA, staffA.id, { status: "active" });
    const active = await listCustomersHttp(new Request("http://localhost/customers"), orgA, {
      db,
      getCurrentUser: async () => staffA,
    });
    expect(active.status).toBe(200);

    const inviteAttempt = await (
      await import("@/modules/organizations/http")
    ).inviteMemberHttp(
      new Request("http://localhost/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: ownerB.email, role: "staff" }),
      }),
      orgA,
      { db, getCurrentUser: async () => staffA },
    );
    expect(inviteAttempt.status).toBe(403);

    await updateMember(db, ownerA, orgA, staffA.id, { status: "disabled" });
    const disabled = await listCustomersHttp(new Request("http://localhost/customers"), orgA, {
      db,
      getCurrentUser: async () => staffA,
    });
    expect(disabled.status).toBe(403);

    await updateOrgCustomer(db, ownerA, orgA, (
      await db.select().from(customers).where(eq(customers.organizationId, orgA))
    )[0]!.id, { name: "A社顧客" });

    const { organizations } = await import("@/db/schema");
    await db.update(organizations).set({ status: "suspended" }).where(eq(organizations.id, orgA));
    const suspended = await listCustomersHttp(new Request("http://localhost/customers"), orgA, {
      db,
      getCurrentUser: async () => ownerA,
    });
    expect(suspended.status).toBe(403);
    await db.update(organizations).set({ status: "active" }).where(eq(organizations.id, orgA));
  });

  it("replays the same customer id inside one organization and does not attach it to another", async () => {
    const id = "55555555-5555-4555-8555-555555555555";
    const first = await createCustomerHttp(
      new Request("http://localhost/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name: "冪等" }),
      }),
      orgA,
      { db, getCurrentUser: async () => ownerA },
    );
    expect(first.status).toBe(201);
    const second = await createCustomerHttp(
      new Request("http://localhost/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name: "別の名前" }),
      }),
      orgA,
      { db, getCurrentUser: async () => ownerA },
    );
    expect(second.status).toBe(200);
    const replay = await second.json();
    expect(replay.customer.name).toBe("冪等");

    const stolen = await createCustomerHttp(
      new Request("http://localhost/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name: "越境" }),
      }),
      orgB,
      { db, getCurrentUser: async () => ownerB },
    );
    expect(stolen.status).toBe(409);
  });
});
