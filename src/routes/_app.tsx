import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import {
  LayoutDashboard, ShoppingCart, Package, Tags, Users, Notebook,
  BarChart3, Wallet, LogOut, Store, Menu, FileText, Receipt, AlertTriangle, ClipboardList, Recycle, DoorOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

type NavItem = { to: string; label: string; icon: typeof Store; adminOnly?: boolean };

const NAV: NavItem[] = [
  { to: "/pdv", label: "Vendas — Nova Venda", icon: ShoppingCart },
  { to: "/vendas/historico", label: "Vendas — Histórico", icon: ClipboardList },
  { to: "/caixa", label: "Caixa (Abertura/Fechamento)", icon: DoorOpen },
  { to: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { to: "/produtos", label: "Produtos", icon: Package },
  { to: "/categorias", label: "Categorias", icon: Tags, adminOnly: true },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/garrafas", label: "Garrafas / Cashback", icon: Recycle },
  { to: "/caderneta", label: "Caderneta", icon: Notebook },
  { to: "/inadimplencia", label: "Inadimplência", icon: AlertTriangle, adminOnly: true },
  { to: "/orcamentos", label: "Orçamentos", icon: FileText },
  { to: "/contas-pagar", label: "Contas a Pagar", icon: Receipt, adminOnly: true },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, adminOnly: true },
  { to: "/fluxo-caixa", label: "Fluxo de Caixa", icon: Wallet, adminOnly: true },
];

function AppLayout() {
  const { user, role, loading, isAdmin, signOut } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
    if (!loading && user && !role) nav({ to: "/login" });
  }, [loading, user, role, nav]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar mobile */}
      <header className="lg:hidden sticky top-0 z-40 bg-sidebar text-sidebar-foreground border-b border-sidebar-border shadow-soft">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 bg-sidebar text-sidebar-foreground border-sidebar-border w-72">
                <SidebarContent isAdmin={isAdmin} onNavigate={() => setOpen(false)} onSignOut={signOut} />
              </SheetContent>
            </Sheet>
            <Logo size={32} />
            <div className="font-bold text-sm">Lar Doce Lar</div>
          </div>
          <Link to="/" className="text-xs opacity-80 hover:opacity-100">Vitrine ↗</Link>
        </div>
      </header>

      <div className="flex min-h-screen">
        {/* Sidebar desktop */}
        <aside className="hidden lg:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
          <SidebarContent isAdmin={isAdmin} onSignOut={signOut} />
        </aside>

        <main className="flex-1 min-w-0">
          <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  isAdmin, onNavigate, onSignOut,
}: { isAdmin: boolean; onNavigate?: () => void; onSignOut: () => void }) {
  const { location } = useRouterState();
  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  return (
    <>
      <div className="p-5 border-b border-sidebar-border flex items-center gap-3">
        <Logo size={44} />
        <div>
          <div className="font-bold leading-tight">Lar Doce Lar</div>
          <div className="text-xs opacity-80">Limpeza e Praticidade</div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const active = location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={[
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-smooth",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-soft"
                  : "hover:bg-sidebar-accent text-sidebar-foreground/90",
              ].join(" ")}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border space-y-1">
        <Link to="/" onClick={onNavigate} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-sidebar-accent">
          <Store className="h-5 w-5" /> <span>Ver vitrine</span>
        </Link>
        <button
          onClick={() => { onNavigate?.(); onSignOut(); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-sidebar-accent"
        >
          <LogOut className="h-5 w-5" /> <span>Sair</span>
        </button>
      </div>
    </>
  );
}

export function PageHeader({
  title, description, actions,
}: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
