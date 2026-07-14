import type {
  ProductBrandsResponse,
  ProductCategoriesResponse,
  ProductDetail,
  ProductImagesResponse,
  ProductsListResponse,
} from "@emc2/shared";
import { api } from "@/lib/api";

export const productsApi = {
  list: (params: { q?: string; category?: string; brand?: string; page?: number; pageSize?: number } = {}) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.category) sp.set("category", params.category);
    if (params.brand) sp.set("brand", params.brand);
    if (params.page) sp.set("page", String(params.page));
    if (params.pageSize) sp.set("pageSize", String(params.pageSize));
    const qs = sp.toString();
    return api.get<ProductsListResponse>(`/api/products${qs ? `?${qs}` : ""}`);
  },
  categories: () =>
    api.get<ProductCategoriesResponse>("/api/products/categories").then((r) => r.categories),
  brands: () => api.get<ProductBrandsResponse>("/api/products/brands").then((r) => r.brands),
  images: (ids: string[]) =>
    api
      .get<ProductImagesResponse>(`/api/products/images?ids=${encodeURIComponent(ids.join(","))}`)
      .then((r) => r.images),
  get: (articleNumber: string) =>
    api
      .get<{ product: ProductDetail }>(`/api/products/${encodeURIComponent(articleNumber)}`)
      .then((r) => r.product),
};
