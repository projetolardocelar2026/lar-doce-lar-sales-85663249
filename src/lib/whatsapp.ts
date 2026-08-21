// Geração de cupom de venda e abertura do WhatsApp.
import { brl, formaPagamentoLabel, STORE_NAME, PIX_KEY, PIX_TITULAR } from "./format";
import { onlyDigits } from "./validators";

export type CupomItem = { nome: string; quantidade: number; preco: number };
export type CupomVenda = {
  vendaId?: string;
  data: Date;
  clienteNome?: string | null;
  itens: CupomItem[];
  total: number;
  formaPagamento: string;
  saldoCadernetaAtualizado?: number | null;
  catalogoUrl?: string;
};

export function gerarTextoCupom(v: CupomVenda): string {
  const dataStr = v.data.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const linhas: string[] = [];
  linhas.push(`*${STORE_NAME}*`);
  linhas.push(`🧾 *Cupom de Compra*`);
  linhas.push(`📅 ${dataStr}`);
  if (v.clienteNome) linhas.push(`👤 ${v.clienteNome}`);
  linhas.push("");
  linhas.push("*Itens:*");
  for (const it of v.itens) {
    linhas.push(`• ${it.quantidade}x ${it.nome} — ${brl(it.preco * it.quantidade)}`);
  }
  linhas.push("");
  linhas.push(`*Total:* ${brl(v.total)}`);
  linhas.push(`*Pagamento:* ${formaPagamentoLabel[v.formaPagamento] ?? v.formaPagamento}`);
  if (v.formaPagamento === "caderneta" && v.saldoCadernetaAtualizado != null) {
    linhas.push(`*Saldo atualizado da caderneta:* ${brl(v.saldoCadernetaAtualizado)}`);
  }
  if (v.catalogoUrl) {
    linhas.push("");
    linhas.push(`🛍️ Catálogo: ${v.catalogoUrl}`);
  }
  linhas.push("");
  linhas.push("Obrigada pela preferência! 💙");
  return linhas.join("\n");
}

export function abrirWhatsApp(telefone: string | null | undefined, mensagem: string) {
  const tel = onlyDigits(telefone || "");
  const numero = tel ? (tel.startsWith("55") ? tel : `55${tel}`) : "";
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

// ===== Caderneta consolidada =====
export type CadernetaItem = { nome: string; quantidade: number; preco: number };
export type CadernetaCompra = {
  id: string;
  data: Date;
  total: number;
  vencimento?: string | null;
  itens: CadernetaItem[];
};
export type CadernetaPagamento = { data: Date; valor: number; forma: string };

export function gerarTextoCaderneta(params: {
  clienteNome: string;
  compras: CadernetaCompra[];
  pagamentos: CadernetaPagamento[];
  saldoAtual: number;
  catalogoUrl?: string;
}): string {
  const { clienteNome, compras, pagamentos, saldoAtual, catalogoUrl } = params;
  const d = (x: Date) => x.toLocaleDateString("pt-BR");
  const L: string[] = [];
  L.push(`*${STORE_NAME}*`);
  L.push(`📒 *Caderneta de ${clienteNome}*`);
  L.push("");
  L.push(`Saldo anterior: ${brl(0)}`);
  L.push("");
  L.push("*Compras:*");
  if (compras.length === 0) L.push("• Nenhuma compra registrada");
  for (const c of [...compras].sort((a, b) => a.data.getTime() - b.data.getTime())) {
    L.push(`• ${d(c.data)} — + ${brl(c.total)}${c.vencimento ? ` (vence ${new Date(c.vencimento + "T12:00:00").toLocaleDateString("pt-BR")})` : ""}`);
    for (const it of c.itens) {
      L.push(`   - ${it.quantidade}x ${it.nome} — ${brl(it.preco * it.quantidade)}`);
    }
  }
  if (pagamentos.length > 0) {
    L.push("");
    L.push("*Pagamentos:*");
    for (const p of [...pagamentos].sort((a, b) => a.data.getTime() - b.data.getTime())) {
      L.push(`• ${d(p.data)} — − ${brl(p.valor)} (${formaPagamentoLabel[p.forma] ?? p.forma})`);
    }
  }
  L.push("");
  L.push(`*Saldo atual: ${brl(saldoAtual)}*`);
  if (catalogoUrl) {
    L.push("");
    L.push(`🛍️ Catálogo: ${catalogoUrl}`);
  }
  L.push("");
  L.push("Obrigada pela preferência! 💙");
  return L.join("\n");
}
