import { withDeps } from "@/lib/live-deps";
import { createOrganizationHttp } from "@/modules/organizations/http";

export function POST(request: Request) {
  return withDeps((deps) => createOrganizationHttp(request, deps));
}
