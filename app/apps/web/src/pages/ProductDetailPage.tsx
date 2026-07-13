import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Package, ExternalLink } from "lucide-react";
import type { ProductDetail } from "@emc2/shared";
import { productsApi } from "@/features/products/api";
import { StockBadge } from "@/features/products/StockBadge";
import { formatEUR, categoryLabel } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

export function ProductDetailPage() {
  const { articleNumber = "" } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    productsApi
      .get(articleNumber)
      .then((p) => !cancelled && setProduct(p))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [articleNumber]);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("/produkte")}>
        <ArrowLeft /> Zurück zum Katalog
      </Button>

      {loading ? (
        <p className="text-muted-foreground">Wird geladen …</p>
      ) : error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : product ? (
        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
          {/* Image */}
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-white p-4">
            {product.images[0] ? (
              <img
                src={product.images[0]}
                alt={product.name}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <Package className="size-12 text-muted-foreground" />
            )}
          </div>

          <div className="space-y-6">
            <header className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{product.articleNumber}</span>
                {product.category && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {categoryLabel(product.category)}
                  </span>
                )}
                {product.isSpecialOffer && (
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    Angebot
                  </span>
                )}
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight">{product.name}</h1>
              {product.finish && <p className="text-muted-foreground">{product.finish}</p>}
            </header>

            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Netto</p>
                <p className="font-display text-2xl font-bold tabular-nums">
                  {formatEUR(product.netPrice, product.currency)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Brutto</p>
                <p className="text-lg font-semibold tabular-nums text-muted-foreground">
                  {formatEUR(product.grossPrice, product.currency)}
                </p>
              </div>
              {product.originalPrice != null && product.originalPrice > product.netPrice && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Statt</p>
                  <p className="text-lg tabular-nums text-muted-foreground line-through">
                    {formatEUR(product.originalPrice, product.currency)}
                  </p>
                </div>
              )}
              <StockBadge inStock={product.inStock} quantity={product.stockQuantity} className="mb-1" />
            </div>

            {product.stockText && (
              <p className="text-sm text-muted-foreground">{product.stockText}</p>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Einheit" value={product.unit} />
                <Field label="Materialnummer" value={product.materialNumber} />
                <Field label="Verpackungseinheit" value={product.packageUnits?.toString() ?? ""} />
                <Field label="Rabattgruppe" value={product.discountGroup} />
                <Field
                  label="Preis aktualisiert"
                  value={product.priceUpdatedAt ? dateFmt.format(new Date(product.priceUpdatedAt)) : ""}
                />
                <Field
                  label="Zuletzt gesehen"
                  value={product.lastSeenAt ? dateFmt.format(new Date(product.lastSeenAt)) : ""}
                />
                {product.sourceUrl && (
                  <div className="grid grid-cols-[10rem_1fr] gap-2 text-sm">
                    <span className="text-muted-foreground">Quelle</span>
                    <a
                      href={product.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      Vigor <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium break-words">{value || "—"}</span>
    </div>
  );
}
