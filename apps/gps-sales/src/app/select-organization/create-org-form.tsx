"use client";

import { createOrganizationAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionState } from "react";

export function CreateOrgForm() {
  const [state, action, pending] = useActionState(createOrganizationAction, { error: "" });
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="org-name">企業名</Label>
        <Input id="org-name" name="name" required maxLength={100} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="org-slug">スラッグ（英数字とハイフン）</Label>
        <Input id="org-slug" name="slug" required maxLength={63} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        企業を作成してオーナーになる
      </Button>
    </form>
  );
}
