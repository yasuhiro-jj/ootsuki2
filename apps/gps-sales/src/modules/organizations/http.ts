import { handle, requireActor, type HttpDeps } from "@/lib/http";
import { parseInput, readJson } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import {
  createOrganizationSchema,
  inviteMemberSchema,
  updateMemberSchema,
  updateOrganizationSchema,
} from "./schemas";
import {
  acceptInvitation,
  createOrganization,
  inviteMember,
  listMyOrganizations,
  listOrganizationMembers,
  removeMember,
  updateMember,
  updateOrganization,
} from "./service";

export function meHttp(deps: HttpDeps) {
  return handle(async () => {
    const actor = await requireActor(deps);
    const memberships = await listMyOrganizations(deps.db, actor);
    return Response.json({ user: actor, memberships });
  });
}

export function createOrganizationHttp(request: Request, deps: HttpDeps) {
  return handle(async () => {
    const actor = await requireActor(deps);
    const input = parseInput(createOrganizationSchema, await readJson(request));
    const organization = await createOrganization(deps.db, actor, input);
    return Response.json({ organization }, { status: 201 });
  });
}

export function updateOrganizationHttp(request: Request, organizationId: string, deps: HttpDeps) {
  return handle(async () => {
    const actor = await requireActor(deps);
    const input = parseInput(updateOrganizationSchema, await readJson(request));
    const organization = await updateOrganization(deps.db, actor, organizationId, input);
    return Response.json({ organization });
  });
}

export function listMembersHttp(organizationId: string, deps: HttpDeps) {
  return handle(async () => {
    const actor = await requireActor(deps);
    const result = await listOrganizationMembers(deps.db, actor, organizationId);
    return Response.json(result);
  });
}

export function inviteMemberHttp(request: Request, organizationId: string, deps: HttpDeps) {
  return handle(async () => {
    const actor = await requireActor(deps);
    const input = parseInput(inviteMemberSchema, await readJson(request));
    const membership = await inviteMember(deps.db, actor, organizationId, input);
    return Response.json({ membership }, { status: 201 });
  });
}

export function acceptInvitationHttp(organizationId: string, deps: HttpDeps) {
  return handle(async () => {
    const actor = await requireActor(deps);
    const membership = await acceptInvitation(deps.db, actor, organizationId);
    return Response.json({ membership });
  });
}

export function updateMemberHttp(
  request: Request,
  organizationId: string,
  userId: string,
  deps: HttpDeps,
) {
  return handle(async () => {
    const actor = await requireActor(deps);
    assertActorId(userId);
    const input = parseInput(updateMemberSchema, await readJson(request));
    const membership = await updateMember(deps.db, actor, organizationId, userId, input);
    return Response.json({ membership });
  });
}

function assertActorId(userId: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)) {
    throw new AppError(404, "not_found", "メンバーが見つかりません");
  }
}

export function removeMemberHttp(organizationId: string, userId: string, deps: HttpDeps) {
  return handle(async () => {
    const actor = await requireActor(deps);
    assertActorId(userId);
    await removeMember(deps.db, actor, organizationId, userId);
    return new Response(null, { status: 204 });
  });
}
