import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../_app";
import { Card, CardContent } from "@/components/ui/card";
export const Route = createFileRoute("/_app/fluxo-caixa")({
  component: () => (
    <div>
      <PageHeader title="Fluxo de Caixa" description="Entradas e saídas" />
      <Card><CardContent className="p-8 text-center text-muted-foreground">Em breve.</CardContent></Card>
    </div>
  ),
});
