import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../_app";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { brl, formaPagamentoLabel } from "@/lib/format";
import { abrirWhatsApp, gerarTextoCupom } from "@/lib/whatsapp";
import { toast } from "sonner";
import { Ban, Eye, Search, Receipt, Send } from "lucide-react";

export const Route = createFileRoute("/_app/vendas/historico")({
  component: HistoricoVendas,
});

type Venda = {
  id: string;
  data_venda: string;
  total: number;
  forma_pagamento: string;
  status: string;
  observacoes: string | null;
  cliente_id: string | null;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
};
type Item = { produto_nome: string; quantidade: number; preco_unitario: number; subtotal: number };

function HistoricoVendas() {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("todas");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [detalhe, setDetalhe] = useState<Venda | null>(null);
  const [itens, setItens] = useState<Item[]>([]);

  async function carregar() {
    setLoading(true);
    const { data, error } = await supabase
      .from("vendas")
      .select("id,data_venda,total,forma_pagamento,status,observacoes,cliente_id,clientes(nome)")
      .order("data_venda", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setVendas(((data as any[]) || []).map((v) => ({ ...v, cliente_nome: v.clientes?.nome ?? null })));
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return vendas.filter((v) => {
      if (statusFiltro !== "todas" && v.status !== statusFiltro) return false;
      if (q) {
        if (!(v.cliente_nome ?? "").toLowerCase().includes(q)
            && !v.id.startsWith(q)
            && !v.forma_pagamento.includes(q)) return false;
      }
      return true;
    });
  }, [vendas, busca, statusFiltro]);

  async function abrirDetalhe(v: Venda) {
    setDetalhe(v);
    const { data } = await supabase
      .from("itens_venda")
      .select("produto_nome,quantidade,preco_unitario,subtotal")
      .eq("venda_id", v.id);
    setItens((data as Item[]) || []);
  }

  async function cancelar() {
    if (!confirmId) return;
    setCancelando(true);
    const { error } = await supabase.rpc("cancelar_venda", { _venda_id: confirmId });
    setCancelando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Venda cancelada — produtos retornaram ao estoque");
    setConfirmId(null);
    carregar();
  }

  return (
    <div>
      <PageHeader title="Vendas — Histórico" description="Consulta e cancelamento de vendas registradas" />

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por cliente, ID ou forma de pagamento"
              className="pl-9"
            />
          </div>
          <Select value={statusFiltro} onValueChange={setStatusFiltro}>
            <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos status</SelectItem>
              <SelectItem value="paga">Pagas</SelectItem>
              <SelectItem value="pendente">Pendentes (caderneta)</SelectItem>
              <SelectItem value="cancelada">Canceladas</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhuma venda encontrada.
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((v) => {
                const dt = new Date(v.data_venda);
                const cancelada = v.status === "cancelada";
                return (
                  <div key={v.id} className="flex items-center gap-3 p-3 sm:p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          #{v.id.slice(0, 8)}
                        </span>
                        <Badge variant={cancelada ? "destructive" : v.status === "pendente" ? "secondary" : "default"}>
                          {cancelada ? "Cancelada" : v.status === "pendente" ? "Caderneta" : "Paga"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {dt.toLocaleDateString("pt-BR")} {dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {v.cliente_nome ?? "Venda avulsa"} · {formaPagamentoLabel[v.forma_pagamento] ?? v.forma_pagamento}
                      </div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <div className={`font-semibold ${cancelada ? "line-through text-muted-foreground" : "text-primary"}`}>
                        {brl(v.total)}
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => abrirDetalhe(v)} title="Ver detalhes">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={cancelada}
                      onClick={() => setConfirmId(v.id)}
                      title="Cancelar venda"
                    >
                      <Ban className={`h-4 w-4 ${cancelada ? "text-muted-foreground" : "text-destructive"}`} />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar venda?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente cancelar esta venda? Os produtos retornarão ao estoque e o valor sairá do caixa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelando}>Manter venda</AlertDialogCancel>
            <AlertDialogAction onClick={cancelar} disabled={cancelando} className="bg-destructive hover:bg-destructive/90">
              {cancelando ? "Cancelando…" : "Confirmar cancelamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes da venda</DialogTitle>
          </DialogHeader>
          {detalhe && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-xs text-muted-foreground">ID</div>#{detalhe.id.slice(0, 8)}</div>
                <div><div className="text-xs text-muted-foreground">Data</div>{new Date(detalhe.data_venda).toLocaleString("pt-BR")}</div>
                <div><div className="text-xs text-muted-foreground">Cliente</div>{detalhe.cliente_nome ?? "Avulsa"}</div>
                <div><div className="text-xs text-muted-foreground">Pagamento</div>{formaPagamentoLabel[detalhe.forma_pagamento] ?? detalhe.forma_pagamento}</div>
              </div>
              <div className="border-t pt-2">
                <div className="text-xs text-muted-foreground mb-1">Itens</div>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {itens.map((i, idx) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <span>{i.quantidade}× {i.produto_nome}</span>
                      <span>{brl(i.subtotal)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Total</span><span>{brl(detalhe.total)}</span>
              </div>
              {detalhe.observacoes && (
                <div className="text-xs text-muted-foreground border-t pt-2">
                  Obs.: {detalhe.observacoes}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
