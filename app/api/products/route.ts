import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { parseBody } from "@/lib/http/form";
import { created, pageParams, paginated } from "@/lib/http/respond";
import { saveUpload } from "@/lib/http/upload";
import { productsForUser } from "@/lib/selectors";
import { serializeProduct } from "@/lib/serializers";
import { createProduct } from "@/lib/services/catalog";

// GET /api/products?branch_id=|branch=&brand=&search=&category=
// req #11 — `search`, `category` and the `branch` alias were previously ignored
// (the customer menu page sends all three), so its search box did nothing and
// the list was not branch-scoped. All three are now honoured SERVER-SIDE, and
// visibility rules (req #9) stay in productsForUser — a direct API call can
// never surface an inactive/deleted/ineligible product.
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const url = new URL(req.url);
  const branchParam = url.searchParams.get("branch_id") ?? url.searchParams.get("branch");
  const parsedBranch = branchParam ? Number(branchParam) : undefined;
  const branchId =
    parsedBranch !== undefined &&
    Number.isSafeInteger(parsedBranch) &&
    parsedBranch > 0
      ? parsedBranch
      : undefined;
  const brand = url.searchParams.get("brand") ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;
  const categoryParam = url.searchParams.get("category");
  const parsedCategory = categoryParam ? Number(categoryParam) : undefined;
  const categoryId =
    parsedCategory !== undefined &&
    Number.isSafeInteger(parsedCategory) &&
    parsedCategory > 0
      ? parsedCategory
      : undefined;
  const { skip, take, page, pageSize } = pageParams(url);
  const rows = await productsForUser(me, branchId, brand, {
    search,
    categoryId,
  });
  const count = rows.length;
  return paginated(rows.slice(skip, skip + take).map(serializeProduct), {
    page,
    pageSize,
    count,
  });
});

// POST /api/products — super admin (any branch, explicit branch_id) or the
// assigned branch manager (own branch). All permission + brand + variation
// logic lives in the catalog service; the handler stays thin (multipart w/
// optional image, `variations` field is a JSON string).
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  const { fields, file } = await parseBody(req);
  const image = file("image");
  const product = await createProduct(me, {
    branchId: fields.branch_id ? Number(fields.branch_id) : undefined,
    name: fields.name ?? "",
    description: fields.description ?? "",
    brand: fields.brand ?? null,
    discount: fields.discount ? Number(fields.discount) : 0,
    categoryId: fields.category ? Number(fields.category) : null,
    isAvailable: fields.is_available ? fields.is_available === "true" : true,
    preparationTime: fields.preparation_time ? Number(fields.preparation_time) : 20,
    isPopular: fields.is_popular === "true",
    isRecommended: fields.is_recommended === "true",
    variationType: fields.variation_type, // req #4 — mandatory crust policy
    image: image ? await saveUpload(image, "products", "image") : null,
    variations: fields.variations ?? "[]",
  });
  return created(serializeProduct(product));
});
