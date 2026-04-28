import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../_app";
import { Card, CardContent } from "@/components/ui/card";
export const Route = createFileRoute("/_app/produtos")({
  component: () => (
    <div>
      <PageHeader title="Produtos" description="Cadastro e gestão do catálogo" />
      <Card><CardContent className="p-8 text-center text-muted-foreground">Em breve nesta tela.</CardContent></Card>
    </div>
  ),
});
