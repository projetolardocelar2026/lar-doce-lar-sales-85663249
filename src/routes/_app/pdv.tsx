import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../_app";
import { Card, CardContent } from "@/components/ui/card";

function Stub({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <PageHeader title={title} description={desc} />
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        Esta tela será implementada na próxima mensagem.
      </CardContent></Card>
    </div>
  );
}

export const Route = createFileRoute("/_app/pdv")({
  component: () => <Stub title="PDV — Caixa" desc="Vendas à vista e na caderneta" />,
});
