import { AppError } from "../errors";
import { assertObjectKeyInOrg, visitPhotoObjectKey } from "./object-key";
import { describe, expect, it } from "vitest";

const orgA = "11111111-1111-4111-8111-111111111111";
const orgB = "22222222-2222-4222-8222-222222222222";
const visitId = "33333333-3333-4333-8333-333333333333";
const photoId = "44444444-4444-4444-8444-444444444444";

describe("visit photo object keys", () => {
  it("prefixes the key with the organization", () => {
    expect(visitPhotoObjectKey(orgA, visitId, photoId)).toBe(
      `org/${orgA}/visits/${visitId}/${photoId}`,
    );
  });

  it("rejects another organization's key", () => {
    const key = visitPhotoObjectKey(orgA, visitId, photoId);
    expect(() => assertObjectKeyInOrg(key, orgB)).toThrow(AppError);
    expect(() => assertObjectKeyInOrg(`org/${orgB}/../${orgA}/secret`, orgB)).toThrow(AppError);
  });
});
