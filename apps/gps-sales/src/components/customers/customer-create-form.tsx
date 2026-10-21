"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).optional(),
  contactName: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
});

type FormValues = z.infer<typeof schema>;

export function CustomerCreateForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<FormValues>({
    defaultValues: { name: "", address: "", contactName: "", phone: "" },
  });

  async function onSubmit(values: FormValues) {
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setMessage("入力内容を確認してください");
      return;
    }
    setMessage(null);
    const response = await fetch(`/api/orgs/${organizationId}/customers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: parsed.data.name,
        address: parsed.data.address || null,
        contactName: parsed.data.contactName || null,
        phone: parsed.data.phone || null,
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setMessage(body?.error?.message ?? "顧客を作成できませんでした");
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="customer-name">顧客名</Label>
        <Input id="customer-name" {...form.register("name")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="customer-contact">担当者</Label>
        <Input id="customer-contact" {...form.register("contactName")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="customer-phone">電話</Label>
        <Input id="customer-phone" {...form.register("phone")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="customer-address">住所</Label>
        <Input id="customer-address" {...form.register("address")} />
      </div>
      {message ? <p className="text-sm text-destructive md:col-span-2">{message}</p> : null}
      <Button type="submit" disabled={form.formState.isSubmitting} className="md:col-span-2 w-fit">
        顧客を追加
      </Button>
    </form>
  );
}
