import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../_app";
import { supabase } from "@/integrations/supabase/client";
import { brl, fmtDate, fmtDateOnly } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { downloadCSV, downloadTablePDF } from "@/lib/exporters";
import {
  AlertTriangle, FileSpreadsheet, FileText, History, ShieldAlert, TrendingDown,
} from "lucide-react";

export const Route = createFileRoute("/_app/inadimplencia")({
  component: InadimplenciaPage,
});

type Cliente = {
  id: string;
  nome: string;
  telefone: string | null;
  saldo_devedor: number;
  limite_caderneta: number;
};

type Pagamento = {
  id: string;
  cliente_id: string;
  valor: number;
  forma_pagamento: string;
  data_pagamento: string;
  observacoes: string | null;
};

type Venda = {
  id: string;
  cliente_id: string;
  total: number;
  data_venda: string;
  status: string;
};

const DIAS_VENCIMENTO = 30; // dívida vencida = sem pagamento há mais de 30 dias

function InadimplenciaPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [vendasCaderneta, setVendasCaderneta] = useState<Venda[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [detalhe, setDetalhe] = useState<Cliente | null>(null);

  const carregar = async () => {
    setLoading(true);
    const [{ data: cs }, { data: ps }, { data: vs }] = await Promise.all([
      supabase.from("clientes")
        .select("id,nome,telefone,saldo_devedor,limite_caderneta")
        .eq("ativo", true)
        .gt("saldo_devedor", 0)
        .order("saldo_devedor", { ascending: false }),
      supabase.from("pagamentos_caderneta")
        .select("id,cliente_id,valor,forma_pagamento,data_pagamento,observacoes")
        .order("data_pagamento", { ascending: false }),
      supabase.from("vendas")
        .select("id,cliente_id,total,data_venda,status")
        .eq("forma_pagamento", "caderneta")
        .order("data_venda", { ascending: false }),
    ]);
    setClientes((cs as Cliente[]) || []);
    setPagamentos((ps as Pagamento[]) || []);
    setVendasCaderneta((vs as Venda[]) || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  // Mapas de eventos por cliente
  const eventosPorCliente = useMemo(() => {
    const map = new Map<string, {
      ultimoPagamento: Pagamento | null;
      ultimaVenda: Venda | null;
      qtdBaixas: number;
      totalBaixado: number;
      diasSemPagamento: number | null;
    }>();
    clientes.forEach(c => {
      const pgs = pagamentos.filter(p => p.cliente_id === c.id);
      const vds = vendasCaderneta.filter(v => v.cliente_id === c.id);
      const ultimoPag = pgs[0] ?? null;
      const ultimaVenda = vds[0] ?? null;
      const totalBaixado = pgs.reduce((s, p) => s + Number(p.valor), 0);
      let dias: number | null = null;
      if (ultimoPag) {
        dias = Math.floor((Date.now() - new Date(ultimoPag.data_pagamento).getTime()) / 86400000);
      } else if (ultimaVenda) {
        dias = Math.floor((Date.now() - new Date(ultimaVenda.data_venda).getTime()) / 86400000);
      }
      map.set(c.id, {
        ultimoPagamento: ultimoPag,
        ultimaVenda,
        qtdBaixas: pgs.length,
        totalBaixado,
        diasSemPagamento: dias,
      });
    });
    return map;
  }, [clientes, pagamentos, vendasCaderneta]);

  const ranking = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const arr = clientes
      .map(c => {
        const ev = eventosPorCliente.get(c.id);
        const dias = ev?.diasSemPagamento ?? null;
        const vencido = dias != null && dias > DIAS_VENCIMENTO;
        const valorVencido = vencido ? Number(c.saldo_devedor) : 0;
        return { ...c, ...ev!, vencido, valorVencido };
      })
      .filter(c => !q || c.nome.toLowerCase().includes(q) || (c.telefone ?? "").includes(q));
    return arr.sort((a, b) => Number(b.saldo_devedor) - Number(a.saldo_devedor));
  }, [clientes, eventosPorCliente, busca]);

  const totals = useMemo(() => {
    const total = ranking.reduce((s, c) => s + Number(c.saldo_devedor), 0);
    const vencido = ranking.reduce((s, c) => s + c.valorVencido, 0);
    const totalBaixado = ranking.reduce((s, c) => s + c.totalBaixado, 0);
    const qtdVencidos = ranking.filter(c => c.vencido).length;
    return { total, vencido, totalBaixado, qtdVencidos };
  }, [ranking]);

  const exportarCSV = () => {
    downloadCSV(`inadimplencia-${new Date().toISOString().slice(0, 10)}.csv`,
      ranking.map((c, i) => ({
        Posicao: i + 1,
        Cliente: c.nome,
        Telefone: c.telefone ?? "",
        Saldo_Devedor: Number(c.saldo_devedor).toFixed(2),
        Limite: Number(c.limite_caderneta).toFixed(2),
        Dias_Sem_Pagamento: c.diasSemPagamento ?? "",
        Vencido: c.vencido ? "Sim" : "Não",
        Valor_Vencido: c.valorVencido.toFixed(2),
        Qtd_Baixas: c.qtdBaixas,
        Total_Baixado: c.totalBaixado.toFixed(2),
        Ultimo_Pagamento: c.ultimoPagamento ? fmtDateOnly(c.ultimoPagamento.data_pagamento) : "—",
      })));
  };

  const exportarPDF = () => {
    downloadTablePDF({
      filename: `inadimplencia-${new Date().toISOString().slice(0, 10)}.pdf`,
      title: "Relatório de Inadimplência — Caderneta",
      subtitle: `${ranking.length} devedor(es) • Total: ${brl(totals.total)} • Vencido (>${DIAS_VENCIMENTO} dias): ${brl(totals.vencido)}`,
      headers: ["#", "Cliente", "Telefone", "Saldo", "Vencido?", "Dias", "Baixas", "Último pgto"],
      rows: ranking.map((c, i) => [
        String(i + 1),
        c.nome,
        c.telefone ?? "—",
        brl(c.saldo_devedor),
        c.vencido ? `SIM (${brl(c.valorVencido)})` : "Não",
        c.diasSemPagamento != null ? String(c.diasSemPagamento) : "—",
        String(c.qtdBaixas),
        c.ultimoPagamento ? fmtDateOnly(c.ultimoPagamento.data_pagamento) : "—",
      ]),
      footer: "Lar Doce Lar — Caderneta",
    });
  };

  return (
    <div>
      <PageHeader
        title="Inadimplência"
        description={`Ranking de devedores e histórico de baixas. Vencido após ${DIAS_VENCIMENTO} dias sem pagamento.`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportarCSV}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportarPDF}>
              <FileText className="h-4 w-4 mr-1.5" /> PDF
            </Button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Devedores ativos</div>
            <div className="text-2xl font-bold">{ranking.length}</div>
          </CardContent>
        </Card>
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total devedor</div>
            <div className="text-2xl font-bold text-destructive">{brl(totals.total)}</div>
          </CardContent>
        </Card>
        <Card className={totals.qtdVencidos > 0 ? "border-rose-400 bg-rose-50/40" : ""}>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldAlert className="h-3 w-3" /> Vencido (&gt;{DIAS_VENCIMENTO}d)
            </div>
            <div className={`text-2xl font-bold ${totals.qtdVencidos > 0 ? "text-rose-600" : ""}`}>
              {brl(totals.vencido)}
            </div>
            <div className="text-[10px] text-muted-foreground">{totals.qtdVencidos} cliente(s)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3 w-3" /> Total já baixado
            </div>
            <div className="text-2xl font-bold text-emerald-600">{brl(totals.totalBaixado)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4">
          <Label className="mb-1 block text-xs">Buscar cliente</Label>
          <Input placeholder="Nome ou telefone…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ranking por saldo devedor</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando…</div>
          ) : ranking.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              🎉 Nenhum cliente com saldo devedor.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Limite</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Baixas</TableHead>
                  <TableHead className="text-right">Último pgto</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.map((c, i) => (
                  <TableRow key={c.id} className={c.vencido ? "bg-rose-50/40" : ""}>
                    <TableCell className="font-mono text-xs">{i + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{c.nome}</div>
                      <div className="text-xs text-muted-foreground">{c.telefone ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-destructive">
                      {brl(c.saldo_devedor)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {Number(c.limite_caderneta) > 0 ? brl(c.limite_caderneta) : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {c.vencido ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Vencido {c.diasSemPagamento}d
                        </Badge>
                      ) : c.diasSemPagamento != null && c.diasSemPagamento > 15 ? (
                        <Badge variant="outline" className="border-amber-400 text-amber-700">
                          {c.diasSemPagamento}d
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Em dia</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="text-sm font-medium">{c.qtdBaixas}</div>
                      <div className="text-[10px] text-muted-foreground">{brl(c.totalBaixado)}</div>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {c.ultimoPagamento ? fmtDateOnly(c.ultimoPagamento.data_pagamento) : "—"}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDetalhe(c)}>
                        <History className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DetalheClienteDialog
        cliente={detalhe}
        pagamentos={detalhe ? pagamentos.filter(p => p.cliente_id === detalhe.id) : []}
        vendas={detalhe ? vendasCaderneta.filter(v => v.cliente_id === detalhe.id) : []}
        onClose={() => setDetalhe(null)}
      />
    </div>
  );
}

function DetalheClienteDialog({
  cliente, pagamentos, vendas, onClose,
}: {
  cliente: Cliente | null;
  pagamentos: Pagamento[];
  vendas: Venda[];
  onClose: () => void;
}) {
  if (!cliente) return null;
  const totalBaixado = pagamentos.reduce((s, p) => s + Number(p.valor), 0);
  const totalVendido = vendas.reduce((s, v) => s + Number(v.total), 0);
  return (
    <Dialog open={!!cliente} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> Histórico — {cliente.nome}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2 text-center mb-2">
          <div className="rounded-md bg-destructive/10 p-2">
            <div className="text-[10px] text-muted-foreground">Saldo devedor</div>
            <div className="font-bold text-destructive">{brl(cliente.saldo_devedor)}</div>
          </div>
          <div className="rounded-md bg-muted p-2">
            <div className="text-[10px] text-muted-foreground">Total comprado (caderneta)</div>
            <div className="font-bold">{brl(totalVendido)}</div>
          </div>
          <div className="rounded-md bg-emerald-100/60 p-2">
            <div className="text-[10px] text-muted-foreground">Total baixado</div>
            <div className="font-bold text-emerald-700">{brl(totalBaixado)}</div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Baixas / pagamentos ({pagamentos.length})</CardTitle></CardHeader>
            <CardContent className="p-3">
              {pagamentos.length === 0 ? (
                <div className="text-xs text-muted-foreground">Sem pagamentos registrados.</div>
              ) : (
                <ul className="space-y-1">
                  {pagamentos.map(p => (
                    <li key={p.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-emerald-50/60">
                      <div>
                        <div className="font-medium">{fmtDate(p.data_pagamento)}</div>
                        <div className="text-[10px] text-muted-foreground">{p.forma_pagamento}{p.observacoes ? ` — ${p.observacoes}` : ""}</div>
                      </div>
                      <div className="font-mono font-bold text-emerald-700">+ {brl(p.valor)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Vendas a prazo ({vendas.length})</CardTitle></CardHeader>
            <CardContent className="p-3">
              {vendas.length === 0 ? (
                <div className="text-xs text-muted-foreground">Sem vendas a prazo.</div>
              ) : (
                <ul className="space-y-1">
                  {vendas.map(v => (
                    <li key={v.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-rose-50/60">
                      <div>
                        <div className="font-medium">{fmtDate(v.data_venda)}</div>
                        <div className="text-[10px] text-muted-foreground">#{v.id.slice(0, 8)} • {v.status}</div>
                      </div>
                      <div className="font-mono font-bold text-rose-700">− {brl(v.total)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
