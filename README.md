# Lar Doce Lar Sales

Crie um sistema completo de gestão e vendas para a loja Lar Doce Lar - Limpeza e Praticidade, com foco em uso no balcão (PDV) e vitrine online para clientes.

1. Identidade Visual e Design:

Use as cores do logo enviado: Fundo em Azul Marinho, elementos de destaque em Azul Claro e textos em Branco.

O design deve ser moderno, limpo e 'Mobile-First' (otimizado para celular e tablet no balcão).

2. Banco de Dados e Escalabilidade (Supabase):

Configure o banco de dados para suportar cadastro infinito de produtos e categorias.

As categorias iniciais devem ser: Limpeza, Utilidades Domésticas, Higiene, Automotivo e Mercearia (Bomboniere).

3. Lógica de Venda e 'Caderneta' (Diferencial Importante):

O sistema deve permitir vendas à vista (PIX, Cartão, Dinheiro) e venda a prazo (Caderneta).

REGRA DE OURO: Cada venda na caderneta deve ser registrada e contabilizada na DATA REAL em que o produto saiu da loja. Se o cliente comprar no dia 01 e no dia 06, o sistema deve mostrar duas vendas separadas nos relatórios diários de estoque e faturamento, mas somar os valores no saldo devedor (limite) do cliente.

Deve haver uma função para 'Dar Baixa' total ou parcial na dívida do cliente, registrando a entrada do dinheiro no fluxo de caixa do dia do pagamento.

4. Módulo de Relatórios e Gestão:

Tela de Relatórios com filtros por Dia, Mês e Ano.

Visualização de faturamento por Categoria e ranking de Produtos mais vendidos.

Fluxo de caixa completo: Entradas (vendas) e Saídas (pagamentos de fornecedores/despesas).

5. Vitrine Online e Cliente:

Área do cliente onde ele visualiza o catálogo com busca e filtros.

Carrinho de compras que, ao finalizar, gera uma mensagem detalhada para o WhatsApp Business da loja com o pedido e o total.

Área de cadastro de clientes com histórico completo de compras (data, hora e itens comprados).

6. Funcionalidades de Busca:

Adicione uma barra de busca rápida e filtros inteligentes em todas as telas para facilitar o manuseio de um grande volume de produtos."

Dicas para depois que você colar:

Conexão com Banco de Dados: O Lovable vai perguntar se você quer conectar ao Supabase. Diga que SIM. Isso é o que garante que você possa cadastrar "infinitos" produtos e que seus dados fiquem salvos com segurança.

Logo: Após ele criar o visual, clique no ícone de anexo no chat do Lovable e envie novamente a foto do seu logo dizendo: "Coloque este logo no topo do aplicativo e na tela de login".

WhatsApp: Peça para ele: "Configure o botão de WhatsApp para o número [INSIRA SEU NÚMERO AQUI] com uma mensagem automática profissional".

Com esse comando, você terá um sistema muito mais justo e preciso do que o Pindureta para a gestão do seu negócio!

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/bd03c7a5-029e-4d9a-b657-99ef5f241118).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
