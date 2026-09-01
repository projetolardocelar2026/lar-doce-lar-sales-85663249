import { createServerFn } from "@tanstack/react-start";

export type AnaliseProduto = {
  nome: string;
  categoria: string;
  marca: string;
  descricao: string;
  codigo_barras: string;
};

export const analisarProdutoImagem = createServerFn({ method: "POST" })
  .inputValidator((input: { imageBase64: string; categorias: string[] }) => {
    if (!input?.imageBase64 || typeof input.imageBase64 !== "string") {
      throw new Error("Imagem inválida");
    }
    return {
      imageBase64: input.imageBase64,
      categorias: Array.isArray(input.categorias) ? input.categorias.slice(0, 50) : [],
    };
  })
  .handler(async ({ data }): Promise<AnaliseProduto> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("IA indisponível no momento");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você identifica produtos de mercado/loja a partir de fotos do produto ou do código de barras. " +
              "Responda SEMPRE chamando a função preencher_produto, em português do Brasil. " +
              (data.categorias.length
                ? `Escolha a categoria entre: ${data.categorias.join(", ")}. Se nenhuma servir, use "".`
                : ""),
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Identifique este produto e preencha os campos." },
              { type: "image_url", image_url: { url: data.imageBase64 } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "preencher_produto",
              description: "Preenche os dados do produto identificado",
              parameters: {
                type: "object",
                properties: {
                  nome: { type: "string", description: "Nome comercial do produto com peso/volume" },
                  categoria: { type: "string" },
                  marca: { type: "string" },
                  descricao: { type: "string", description: "Descrição curta de venda" },
                  codigo_barras: { type: "string", description: "Código de barras se visível, senão vazio" },
                },
                required: ["nome", "categoria", "marca", "descricao", "codigo_barras"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "preencher_produto" } },
      }),
    });

    if (res.status === 429) throw new Error("Muitas requisições de IA. Tente novamente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados.");
    if (!res.ok) throw new Error("Não foi possível analisar a imagem");

    const json = (await res.json()) as any;
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) throw new Error("A IA não conseguiu identificar o produto");
    const args = JSON.parse(call.function.arguments) as Partial<AnaliseProduto>;
    return {
      nome: args.nome ?? "",
      categoria: args.categoria ?? "",
      marca: args.marca ?? "",
      descricao: args.descricao ?? "",
      codigo_barras: args.codigo_barras ?? "",
    };
  });
