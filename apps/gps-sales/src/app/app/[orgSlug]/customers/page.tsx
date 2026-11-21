import { CustomerCreateForm } from "@/components/customers/customer-create-form";
import { deleteCustomerAction, updateCustomerAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadOrgPage } from "@/lib/org-page";
import { listOrgCustomers } from "@/modules/customers/service";

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { orgSlug } = await params;
  const loaded = await loadOrgPage(orgSlug);
  const error = (await searchParams).error;
  const result = await listOrgCustomers(loaded.db, loaded.user, loaded.ctx.organization.id, {
    limit: 50,
    offset: 0,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">顧客</h1>
        <p className="text-sm text-muted-foreground">{result.page.total} 件。他社の顧客は表示しません。</p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>追加</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerCreateForm organizationId={loaded.ctx.organization.id} />
        </CardContent>
      </Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名前</TableHead>
            <TableHead>担当</TableHead>
            <TableHead>電話</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.customers.map((customer) => (
            <TableRow key={customer.id}>
              <TableCell>
                <form action={updateCustomerAction.bind(null, loaded.ctx.organization.slug, customer.id)} className="flex gap-2">
                  <Input name="name" defaultValue={customer.name} aria-label={`${customer.name}の名前`} />
                  <Button type="submit" variant="outline">保存</Button>
                </form>
              </TableCell>
              <TableCell>{customer.contactName ?? "—"}</TableCell>
              <TableCell>{customer.phone ?? "—"}</TableCell>
              <TableCell>
                <form action={deleteCustomerAction.bind(null, loaded.ctx.organization.slug, customer.id)}>
                  <Button type="submit" variant="destructive">削除</Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
