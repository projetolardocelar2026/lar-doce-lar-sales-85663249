import { supabase } from "@/integrations/supabase/client";

// Prefixo 200-299 é reservado para uso interno da loja (não conflita com EAN de fábrica)
const PREFIXO = "200";

function digitoVerificadorEAN13(base12: string): number {
  let soma = 0;
  for (let i = 0; i < 12; i++) {
    soma += Number(base12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (soma % 10)) % 10;
}

/** Gera um código interno EAN-13 único e sequencial (200 + sequência + dígito verificador). */
export async function gerarCodigoInterno(): Promise<string> {
  const { data } = await supabase
    .from("produtos")
    .select("codigo_barras")
    .like("codigo_barras", `${PREFIXO}%`)
    .order("codigo_barras", { ascending: false })
    .limit(1);

  const ultimo = data?.[0]?.codigo_barras ?? null;
  let seq = 1;
  if (ultimo && /^\d{13}$/.test(ultimo)) {
    seq = Number(ultimo.slice(3, 12)) + 1;
  }

  for (let tentativa = 0; tentativa < 50; tentativa++) {
    const base = PREFIXO + String(seq).padStart(9, "0");
    const codigo = base + digitoVerificadorEAN13(base);
    const { data: existe } = await supabase
      .from("produtos")
      .select("id")
      .eq("codigo_barras", codigo)
      .maybeSingle();
    if (!existe) return codigo;
    seq += 1;
  }
  throw new Error("Não foi possível gerar um código único");
}
