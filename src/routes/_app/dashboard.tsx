import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../_app";
import { Card, CardContent } from "@/components/ui/card";
import { ShoppingCart, Package, Users, Notebook } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const cards = [
    { to: "/pdv", icon: ShoppingCart, label: "Abrir PDV", desc: "Registrar nova venda" },
    { to: "/produtos", icon: Package, label: "Produtos", desc: "Gerenciar catálogo" },
    { to: "/clientes", icon: Users, label: "Clientes", desc: "Cadastros e histórico" },
    { to: "/caderneta", icon: Notebook, label: "Caderneta", desc: "Saldos e pagamentos" },
  ];
  return (
    <div>
      <PageHeader title="Painel" description="Bem-vindo(a) ao Lar Doce Lar" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.to} to={c.to}>
              <Card className="bg-gradient-card hover:shadow-elevated transition-smooth h-full">
                <CardContent className="p-5 space-y-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-brand flex items-center justify-center text-white">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="font-bold">{c.label}</div>
                    <div className="text-xs text-muted-foreground">{c.desc}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      <Card className="mt-6">
        <CardContent className="p-6">
          <h2 className="font-bold mb-2">Em construção nesta versão</h2>
          <p className="text-sm text-muted-foreground">
            O sistema base está pronto: banco de dados, autenticação, vitrine pública e WhatsApp.
            As telas operacionais (PDV, Caderneta, Relatórios, etc.) serão habilitadas nas próximas mensagens.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
