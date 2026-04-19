import { NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { getProductEstimatedCosts } from "@/lib/notion/ootsuki";

interface ProductCostRequestBody {
  products?: Array<{
    productCode?: string;
    productName?: string;
  }>;
}

export async function POST(request: Request) {
  const access = await requireTenantAccess(request, "read");
  if (!access.ok) return access.response;

  let body: ProductCostRequestBody;
  try {
    body = (await request.json()) as ProductCostRequestBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSONの形式が正しくありません。" }, { status: 400 });
  }

  const products = Array.isArray(body.products)
    ? body.products.filter(
        (product): product is { productCode?: string; productName?: string } =>
          typeof product === "object" &&
          product !== null &&
          (typeof product.productCode === "string" || typeof product.productName === "string"),
      )
    : [];

  if (products.length === 0) {
    return NextResponse.json({ ok: true, byCode: {}, byName: {}, matched: 0 });
  }

  try {
    const costMap = await getProductEstimatedCosts(products);

    return NextResponse.json({
      ok: true,
      byCode: costMap.byCode,
      byName: costMap.byName,
      matched: Object.keys(costMap.byCode).length + Object.keys(costMap.byName).length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? `想定原価の取得に失敗しました: ${error.message}` : "想定原価の取得に失敗しました。",
      },
      { status: 500 },
    );
  }
}
