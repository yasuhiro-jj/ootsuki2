import { withDeps } from "@/lib/live-deps";
import { meHttp } from "@/modules/organizations/http";

export function GET() {
  return withDeps((deps) => meHttp(deps));
}
