// Geração de cupom de venda e abertura do WhatsApp.
import { brl, formaPagamentoLabel, STORE_NAME } from "./format";
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
