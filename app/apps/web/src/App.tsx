import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { HomePage } from "@/pages/HomePage";
import { AdminPage } from "@/pages/AdminPage";
import { CustomersPage } from "@/pages/CustomersPage";
import { CustomerDetailPage } from "@/pages/CustomerDetailPage";
import { ProductsPage } from "@/pages/ProductsPage";
import { ProductDetailPage } from "@/pages/ProductDetailPage";
import { OfferBuilderPage } from "@/pages/OfferBuilderPage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Authenticated app */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="angebote" element={<OfferBuilderPage />} />
            <Route path="kunden" element={<CustomersPage />} />
            <Route path="kunden/:id" element={<CustomerDetailPage />} />
            <Route path="produkte" element={<ProductsPage />} />
            <Route path="produkte/:articleNumber" element={<ProductDetailPage />} />

            {/* Admin-only subtree */}
            <Route element={<ProtectedRoute adminOnly />}>
              <Route path="admin" element={<AdminPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<PlaceholderPage title="Seite nicht gefunden" />} />
      </Routes>
    </BrowserRouter>
  );
}
