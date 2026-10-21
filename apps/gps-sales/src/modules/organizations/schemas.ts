import { z } from "zod";
import { ROLES } from "@/lib/auth/roles";

const slug = z
  .string()
  .trim()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug,
});

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const inviteMemberSchema = z.object({
  email: z.email().max(200),
  role: z.enum(ROLES),
});

export const updateMemberSchema = z
  .object({
    role: z.enum(ROLES).optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    message: "変更内容がありません",
  });

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
