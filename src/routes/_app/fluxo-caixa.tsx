import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../_app";
import { supabase } from "@/integrations/supabase/client";
import { brl, fmtDate } from "@/lib/format";
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
  FileSpreadsheet,
} from "lucide-react";
import { downloadCSV } from "@/lib/exporters";

export const Route = createFileRoute("/_app/fluxo-caixa")({
  component: FluxoCaixa,
});

type Mov = {
  id: string;
  tipo: string;
  valor: number;
  descricao: string;
  data_movimento: string;
};

const TIPO_LABEL: Record<string, string> = {
  entrada_venda: "Venda",
  entrada_pagamento_caderneta: "Pagto. Caderneta",
  saida_conta_pagar: "Conta Paga",
  saida_fornecedor: "Fornecedor",
  saida_despesa: "Despesa",
  entrada_outras: "Entrada Manual",
  saida_outras: "Saída Manual",
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
      .select("id,tipo,valor,descricao,data_movimento")
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

  const exportar = () => {
    downloadCSV(`fluxo-caixa-${inicio}-${fim}.csv`, movs.map(m => ({
      Data: fmtDate(m.data_movimento),
      Tipo: TIPO_LABEL[m.tipo] || m.tipo,
      Categoria: ehEntrada(m.tipo) ? "Entrada" : "Saída",
      Valor: Number(m.valor).toFixed(2),
      Descricao: m.descricao,
    })));
  };

  return (
    <div>
      <PageHeader
        title="Fluxo de Caixa"
        description="Entradas e saídas do período"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportar}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> CSV
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
                  <div key={m.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
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
                    <div className={`font-mono font-bold text-sm ${entrada ? "text-emerald-600" : "text-rose-600"}`}>
                      {entrada ? "+" : "−"} {brl(Number(m.valor))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
