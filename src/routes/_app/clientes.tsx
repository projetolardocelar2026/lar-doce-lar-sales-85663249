import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../_app";
import { Card, CardContent } from "@/components/ui/card";
export const Route = createFileRoute("/_app/clientes")({
  component: () => (
    <div>
      <PageHeader title="Clientes" description="Cadastros e histórico de compras" />
      <Card><CardContent className="p-8 text-center text-muted-foreground">Em breve.</CardContent></Card>
    </div>
  ),
});
