import { z } from "zod";

const coordinatePair = {
  latitude: z.number().gte(-90).lte(90).nullable().optional(),
  longitude: z.number().gte(-180).lte(180).nullable().optional(),
};

function coordinatesTogether(value: {
  latitude?: number | null;
  longitude?: number | null;
}): boolean {
  const hasLat = value.latitude !== undefined;
  const hasLng = value.longitude !== undefined;
  if (hasLat !== hasLng) return false;
  if (!hasLat && !hasLng) return true;
  return (value.latitude == null) === (value.longitude == null);
}

export const createCustomerSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(200),
    address: z.string().trim().max(500).nullable().optional(),
    contactName: z.string().trim().max(200).nullable().optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    ...coordinatePair,
  })
  .refine(coordinatesTogether, {
    message: "緯度と経度は両方指定するか、両方空にしてください",
  });

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    address: z.string().trim().max(500).nullable().optional(),
    contactName: z.string().trim().max(200).nullable().optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    ...coordinatePair,
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "変更内容がありません",
  })
  .refine(coordinatesTogether, {
    message: "緯度と経度は両方指定するか、両方空にしてください",
  });

export const listCustomersQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
