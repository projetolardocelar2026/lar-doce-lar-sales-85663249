import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../_app";
import { supabase } from "@/integrations/supabase/client";
import { brl, fmtDate, fmtDateOnly, formaPagamentoLabel } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  ArrowDownCircle, ArrowUpCircle, Plus, Wallet, TrendingUp, TrendingDown,
  FileSpreadsheet, FileText, Eye,
} from "lucide-react";
import { downloadCSV, downloadTablePDF } from "@/lib/exporters";

export const Route = createFileRoute("/_app/fluxo-caixa")({
  component: FluxoCaixa,
});

type Mov = {
  id: string;
  tipo: string;
  valor: number;
  descricao: string;
  data_movimento: string;
  venda_id: string | null;
  pagamento_id: string | null;
  usuario_id: string | null;
};

const TIPO_LABEL: Record<string, string> = {
  entrada_venda: "Venda",
  entrada_pagamento_caderneta: "Pagto. Caderneta",
  saida_conta_pagar: "Conta Paga",
  saida_fornecedor: "Fornecedor",
  saida_despesa: "Despesa",
  entrada_outras: "Entrada Manual",
  saida_outras: "Saída Manual",
  entrada_suprimento: "Suprimento de Caixa",
  saida_sangria: "Sangria de Caixa",
  entrada_troco_inicial: "Troco Inicial",
  saida_credito_garrafas: "Abate por Crédito",
};

function ehEntrada(tipo: string) {
  return tipo.startsWith("entrada");
}

function FluxoCaixa() {
  const hoje = new Date();
  const [inicio, setInicio] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10));
  const [fim, setFim] = useState(() => hoje.toISOString().slice(0, 10));
  const [movs, setMovs] = useState<Mov[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [detalhe, setDetalhe] = useState<Mov | null>(null);

  // Form lançamento manual
  const [tipo, setTipo] = useState<"entrada_outras" | "saida_outras">("entrada_outras");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(() => hoje.toISOString().slice(0, 10));
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const ini = new Date(inicio + "T00:00:00").toISOString();
    const fimISO = new Date(fim + "T23:59:59").toISOString();
    const { data: d, error } = await supabase
      .from("fluxo_caixa")
      .select("id,tipo,valor,descricao,data_movimento,venda_id,pagamento_id,usuario_id")
      .gte("data_movimento", ini)
      .lte("data_movimento", fimISO)
      .order("data_movimento", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    setMovs((d as Mov[]) || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, []);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("fluxo-caixa-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "fluxo_caixa" }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [inicio, fim]);

  const totals = useMemo(() => {
    let entradas = 0, saidas = 0;
    movs.forEach(m => {
      const v = Number(m.valor);
      if (ehEntrada(m.tipo)) entradas += v; else saidas += v;
    });
    return { entradas, saidas, saldo: entradas - saidas };
  }, [movs]);

  const porDia = useMemo(() => {
    const map = new Map<string, { data: string; entradas: number; saidas: number }>();
    movs.forEach(m => {
      const d = new Date(m.data_movimento).toISOString().slice(0, 10);
      const cur = map.get(d) || { data: d, entradas: 0, saidas: 0 };
      if (ehEntrada(m.tipo)) cur.entradas += Number(m.valor);
      else cur.saidas += Number(m.valor);
      map.set(d, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => a.data.localeCompare(b.data))
      .map(d => ({ ...d, label: d.data.slice(5) }));
  }, [movs]);

  const salvar = async () => {
    const v = parseFloat((valor || "0").replace(",", "."));
    if (!v || v <= 0) { toast.error("Valor inválido"); return; }
    if (!descricao.trim()) { toast.error("Descrição obrigatória"); return; }
    setSalvando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("fluxo_caixa").insert({
        tipo,
        valor: v,
        descricao: descricao.trim(),
        data_movimento: new Date(data + "T12:00:00").toISOString(),
        usuario_id: user?.id,
      });
      if (error) throw error;
      toast.success("Lançamento registrado!");
      setValor(""); setDescricao(""); setOpen(false);
      carregar();
    } catch (e: any) {
      toast.error(e.message || "Erro ao lançar");
    } finally { setSalvando(false); }
  };

  const exportarCSV = () => {
    downloadCSV(`fluxo-caixa-${inicio}-${fim}.csv`, movs.map(m => ({
      Data: fmtDate(m.data_movimento),
      Tipo: TIPO_LABEL[m.tipo] || m.tipo,
      Categoria: ehEntrada(m.tipo) ? "Entrada" : "Saída",
      Valor: Number(m.valor).toFixed(2),
      Descricao: m.descricao,
    })));
  };

  const exportarPDF = () => {
    // Resumo por dia
    const resumoRows = porDia.map(d => [
      fmtDateOnly(d.data),
      brl(d.entradas),
      brl(d.saidas),
      brl(d.entradas - d.saidas),
    ]);
    resumoRows.push([
      "TOTAL", brl(totals.entradas), brl(totals.saidas), brl(totals.saldo),
    ]);

    const lancamentosRows = movs.map(m => [
      fmtDate(m.data_movimento),
      TIPO_LABEL[m.tipo] || m.tipo,
      ehEntrada(m.tipo) ? "Entrada" : "Saída",
      m.descricao,
      `${ehEntrada(m.tipo) ? "+" : "−"} ${brl(Number(m.valor))}`,
    ]);

    // Gera 2 documentos consolidados em 1 PDF — usamos jspdf direto via helper
    // (downloadTablePDF imprime UMA tabela). Para 2 tabelas, geramos manualmente.
    import("jspdf").then(({ default: jsPDF }) => {
      import("jspdf-autotable").then(({ default: autoTable }) => {
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(15, 38, 76);
        doc.text("Fluxo de Caixa", 14, 16);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(80);
        doc.text(
          `Período: ${fmtDateOnly(inicio)} a ${fmtDateOnly(fim)}`,
          14, 22,
        );
        doc.text(
          `Entradas: ${brl(totals.entradas)} • Saídas: ${brl(totals.saidas)} • Saldo: ${brl(totals.saldo)}`,
          14, 27,
        );

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(15, 38, 76);
        doc.text("Resumo por dia", 14, 35);

        autoTable(doc, {
          head: [["Data", "Entradas", "Saídas", "Saldo"]],
          body: resumoRows,
          startY: 38,
          styles: { fontSize: 9, cellPadding: 2 },
          headStyles: { fillColor: [15, 38, 76], textColor: 255 },
          alternateRowStyles: { fillColor: [240, 247, 255] },
          didParseCell: (cell) => {
            if (cell.row.index === resumoRows.length - 1) {
              cell.cell.styles.fontStyle = "bold";
              cell.cell.styles.fillColor = [220, 235, 250];
            }
          },
        });

        const finalY = (doc as any).lastAutoTable?.finalY ?? 50;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(15, 38, 76);
        doc.text(`Lançamentos (${movs.length})`, 14, finalY + 8);

        autoTable(doc, {
          head: [["Data/hora", "Tipo", "Natureza", "Descrição", "Valor"]],
          body: lancamentosRows,
          startY: finalY + 11,
          styles: { fontSize: 8, cellPadding: 1.5 },
          headStyles: { fillColor: [15, 38, 76], textColor: 255 },
          alternateRowStyles: { fillColor: [240, 247, 255] },
          columnStyles: { 4: { halign: "right" } },
        });

        const pages = doc.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
          doc.setPage(i);
          doc.setFontSize(8);
          doc.setTextColor(120);
          doc.text(
            `Lar Doce Lar — Fluxo de Caixa — pág. ${i}/${pages}`,
            14, doc.internal.pageSize.getHeight() - 6,
          );
        }
        doc.save(`fluxo-caixa-${inicio}-${fim}.pdf`);
      });
    });
  };

  return (
    <div>
      <PageHeader
        title="Fluxo de Caixa"
        description="Entradas e saídas do período"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportarCSV}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportarPDF}>
              <FileText className="h-4 w-4 mr-1.5" /> PDF
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1.5" /> Lançamento</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Novo lançamento manual</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="mb-1 block">Tipo</Label>
                    <Select value={tipo} onValueChange={(v) => setTipo(v as "entrada_outras" | "saida_outras")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entrada_outras">Entrada</SelectItem>
                        <SelectItem value="saida_outras">Saída</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-1 block">Valor (R$)</Label>
                      <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
                    </div>
                    <div>
                      <Label className="mb-1 block">Data</Label>
                      <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1 block">Descrição</Label>
                    <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)}
                      placeholder="Ex: Sangria, recebimento avulso, troco inicial…" />
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={salvando}>Cancelar</Button>
                  <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Lançar"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <Label className="mb-1 block text-xs">Início</Label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Fim</Label>
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <Button onClick={carregar} disabled={loading}>{loading ? "Carregando…" : "Atualizar"}</Button>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Entradas</div>
              <div className="text-xl font-bold text-emerald-600">{brl(totals.entradas)}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-rose-200 bg-rose-50/50 dark:bg-rose-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-rose-500/10 flex items-center justify-center">
              <TrendingDown className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Saídas</div>
              <div className="text-xl font-bold text-rose-600">{brl(totals.saidas)}</div>
            </div>
          </CardContent>
        </Card>
        <Card className={totals.saldo >= 0 ? "border-primary/40 bg-primary/5" : "border-rose-300 bg-rose-100/40"}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Saldo do período</div>
              <div className={`text-xl font-bold ${totals.saldo >= 0 ? "text-primary" : "text-rose-600"}`}>
                {brl(totals.saldo)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Movimentação diária</CardTitle></CardHeader>
        <CardContent className="h-72">
          {porDia.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">Sem movimentações.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porDia}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => brl(v)} />
                <Legend />
                <Bar dataKey="entradas" fill="#22C55E" name="Entradas" />
                <Bar dataKey="saidas" fill="#EF4444" name="Saídas" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardHeader><CardTitle className="text-base">Histórico ({movs.length})</CardTitle></CardHeader>
        <CardContent>
          {movs.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">Nenhum movimento no período.</div>
          ) : (
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {movs.map(m => {
                const entrada = ehEntrada(m.tipo);
                return (
                  <button
                    key={m.id}
                    onClick={() => setDetalhe(m)}
                    className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {entrada
                        ? <ArrowUpCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                        : <ArrowDownCircle className="h-5 w-5 text-rose-600 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{m.descricao}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] py-0 h-4">
                            {TIPO_LABEL[m.tipo] || m.tipo}
                          </Badge>
                          {fmtDate(m.data_movimento)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`font-mono font-bold text-sm ${entrada ? "text-emerald-600" : "text-rose-600"}`}>
                        {entrada ? "+" : "−"} {brl(Number(m.valor))}
                      </div>
                      <Eye className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <DetalheMovDialog mov={detalhe} movsDoDia={movs} onClose={() => setDetalhe(null)} />
    </div>
  );
}

// ===== Modal de detalhes =====
type Detalhes = {
  venda?: {
    id: string;
    total: number;
    forma_pagamento: string;
    status: string;
    cliente_nome: string | null;
    observacoes: string | null;
    itens: { produto_nome: string; quantidade: number; subtotal: number }[];
  };
  pagamento?: {
    id: string;
    valor: number;
    forma_pagamento: string;
    cliente_nome: string | null;
    observacoes: string | null;
  };
  conta?: {
    descricao: string;
    fornecedor: string | null;
    categoria: string | null;
    vencimento: string;
    status: string;
  };
};

function DetalheMovDialog({
  mov, movsDoDia, onClose,
}: { mov: Mov | null; movsDoDia: Mov[]; onClose: () => void }) {
  const [det, setDet] = useState<Detalhes>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!mov) return;
    setDet({});
    setLoading(true);
    (async () => {
      const novo: Detalhes = {};
      try {
        if (mov.venda_id) {
          const [{ data: v }, { data: it }] = await Promise.all([
            supabase.from("vendas")
              .select("id,total,forma_pagamento,status,observacoes,cliente_id")
              .eq("id", mov.venda_id).maybeSingle(),
            supabase.from("itens_venda")
              .select("produto_nome,quantidade,subtotal")
              .eq("venda_id", mov.venda_id),
          ]);
          if (v) {
            let cliNome: string | null = null;
            if ((v as any).cliente_id) {
              const { data: c } = await supabase.from("clientes").select("nome").eq("id", (v as any).cliente_id).maybeSingle();
              cliNome = c?.nome ?? null;
            }
            novo.venda = {
              id: (v as any).id,
              total: Number((v as any).total),
              forma_pagamento: (v as any).forma_pagamento,
              status: (v as any).status,
              cliente_nome: cliNome,
              observacoes: (v as any).observacoes,
              itens: (it as any[]) || [],
            };
          }
        }
        if (mov.pagamento_id) {
          const { data: p } = await supabase.from("pagamentos_caderneta")
            .select("id,valor,forma_pagamento,observacoes,cliente_id")
            .eq("id", mov.pagamento_id).maybeSingle();
          if (p) {
            let cliNome: string | null = null;
            if ((p as any).cliente_id) {
              const { data: c } = await supabase.from("clientes").select("nome").eq("id", (p as any).cliente_id).maybeSingle();
              cliNome = c?.nome ?? null;
            }
            novo.pagamento = {
              id: (p as any).id,
              valor: Number((p as any).valor),
              forma_pagamento: (p as any).forma_pagamento,
              cliente_nome: cliNome,
              observacoes: (p as any).observacoes,
            };
          }
        }
        if (mov.tipo === "saida_conta_pagar") {
          // descrição: "Conta paga: <descricao> — <fornecedor>"
          const desc = mov.descricao.replace(/^Conta paga:\s*/, "");
          const [d0, forn] = desc.split(" — ");
          const { data: cs } = await supabase.from("contas_pagar")
            .select("descricao,fornecedor,categoria,vencimento,status")
            .eq("descricao", d0.trim())
            .order("data_pagamento", { ascending: false })
            .limit(1);
          const c = cs?.[0];
          if (c) {
            novo.conta = {
              descricao: c.descricao,
              fornecedor: c.fornecedor ?? forn ?? null,
              categoria: c.categoria,
              vencimento: c.vencimento,
              status: c.status,
            };
          }
        }
      } catch (e) {
        console.warn(e);
      } finally {
        setDet(novo);
        setLoading(false);
      }
    })();
  }, [mov]);

  const histDoDia = useMemo(() => {
    if (!mov) return { entradas: 0, saidas: 0, qtde: 0 };
    const dia = new Date(mov.data_movimento).toISOString().slice(0, 10);
    let e = 0, s = 0, q = 0;
    movsDoDia.forEach(m => {
      const d = new Date(m.data_movimento).toISOString().slice(0, 10);
      if (d !== dia) return;
      q++;
      if (ehEntrada(m.tipo)) e += Number(m.valor);
      else s += Number(m.valor);
    });
    return { entradas: e, saidas: s, qtde: q };
  }, [mov, movsDoDia]);

  if (!mov) return null;
  const entrada = ehEntrada(mov.tipo);

  return (
    <Dialog open={!!mov} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {entrada
              ? <ArrowUpCircle className="h-5 w-5 text-emerald-600" />
              : <ArrowDownCircle className="h-5 w-5 text-rose-600" />}
            Detalhes do lançamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md bg-muted/50 p-3">
            <div>
              <div className="text-xs text-muted-foreground">{TIPO_LABEL[mov.tipo] || mov.tipo}</div>
              <div className="font-medium">{mov.descricao}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{fmtDate(mov.data_movimento)}</div>
            </div>
            <div className={`font-mono font-bold text-lg ${entrada ? "text-emerald-600" : "text-rose-600"}`}>
              {entrada ? "+" : "−"} {brl(Number(mov.valor))}
            </div>
          </div>

          {loading && <div className="text-sm text-muted-foreground">Buscando referência…</div>}

          {det.venda && (
            <div className="rounded-md border p-3">
              <div className="font-semibold text-sm mb-2">📦 Venda relacionada</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">ID:</span> {det.venda.id.slice(0, 8)}</div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className="text-[10px]">{det.venda.status}</Badge></div>
                <div><span className="text-muted-foreground">Pagamento:</span> {formaPagamentoLabel[det.venda.forma_pagamento] || det.venda.forma_pagamento}</div>
                <div><span className="text-muted-foreground">Cliente:</span> {det.venda.cliente_nome || "Avulso"}</div>
              </div>
              {det.venda.itens.length > 0 && (
                <div className="mt-2 border-t pt-2">
                  <div className="text-xs font-medium mb-1">Itens:</div>
                  <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
                    {det.venda.itens.map((i, idx) => (
                      <li key={idx} className="flex justify-between">
                        <span>{i.quantidade}× {i.produto_nome}</span>
                        <span className="font-mono">{brl(Number(i.subtotal))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {det.venda.observacoes && (
                <div className="mt-2 text-xs text-muted-foreground italic">{det.venda.observacoes}</div>
              )}
            </div>
          )}

          {det.pagamento && (
            <div className="rounded-md border p-3">
              <div className="font-semibold text-sm mb-2">💵 Pagamento de caderneta</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Cliente:</span> {det.pagamento.cliente_nome || "—"}</div>
                <div><span className="text-muted-foreground">Forma:</span> {formaPagamentoLabel[det.pagamento.forma_pagamento] || det.pagamento.forma_pagamento}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Valor:</span> <strong>{brl(det.pagamento.valor)}</strong></div>
              </div>
              {det.pagamento.observacoes && (
                <div className="mt-2 text-xs text-muted-foreground italic">{det.pagamento.observacoes}</div>
              )}
            </div>
          )}

          {det.conta && (
            <div className="rounded-md border p-3">
              <div className="font-semibold text-sm mb-2">📄 Conta paga</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="col-span-2"><span className="text-muted-foreground">Descrição:</span> {det.conta.descricao}</div>
                {det.conta.fornecedor && <div><span className="text-muted-foreground">Fornecedor:</span> {det.conta.fornecedor}</div>}
                {det.conta.categoria && <div><span className="text-muted-foreground">Categoria:</span> {det.conta.categoria}</div>}
                <div><span className="text-muted-foreground">Vencimento:</span> {fmtDateOnly(det.conta.vencimento)}</div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className="text-[10px]">{det.conta.status}</Badge></div>
              </div>
            </div>
          )}

          {!det.venda && !det.pagamento && !det.conta && !loading && (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              Sem referência adicional — lançamento manual ou avulso.
            </div>
          )}

          <div className="rounded-md bg-muted/40 p-3 text-xs">
            <div className="font-medium mb-1">Histórico do dia ({fmtDateOnly(mov.data_movimento)})</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-muted-foreground">Lançamentos</div>
                <div className="font-mono font-bold">{histDoDia.qtde}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Entradas</div>
                <div className="font-mono font-bold text-emerald-600">{brl(histDoDia.entradas)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Saídas</div>
                <div className="font-mono font-bold text-rose-600">{brl(histDoDia.saidas)}</div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
