import { z } from "zod";
import { productMediaSchema } from "./product";

export const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens"),
  parentId: z.string().nullable(),
  description: z.string().trim().max(600).nullable().optional(),
  icon: z.string().trim().max(8).nullable().optional(),
  media: productMediaSchema.nullable(),
  sortOrder: z.number().int().min(0),
  status: z.enum(["active", "hidden"]),
});

export type CategoryInput = z.infer<typeof categorySchema>;
