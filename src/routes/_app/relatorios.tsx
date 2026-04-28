import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../_app";
import { Card, CardContent } from "@/components/ui/card";
export const Route = createFileRoute("/_app/relatorios")({
  component: () => (
    <div>
      <PageHeader title="Relatórios" description="Faturamento por dia, mês e ano" />
      <Card><CardContent className="p-8 text-center text-muted-foreground">Em breve.</CardContent></Card>
    </div>
  ),
});
