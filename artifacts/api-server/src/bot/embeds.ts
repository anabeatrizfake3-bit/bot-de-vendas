import { EmbedBuilder, ColorResolvable } from "discord.js";
import { carregarConfig, carregarProdutos, COR_PADRAO } from "./data/storage.js";
import { obterEstoqueProduto, formatarMoeda } from "./utils.js";
import type { Pedido } from "./data/types.js";

export async function embedProdutosPublico(): Promise<EmbedBuilder> {
  const config = await carregarConfig();
  const produtos = await carregarProdutos();
  const cor = (config.cor_embed ?? COR_PADRAO) as ColorResolvable;

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`🛒 ${config.nome_loja ?? "Loja"}`)
    .setDescription("Escolha um produto no menu abaixo para comprar.")
    .setTimestamp();

  const linhas: string[] = [];
  for (const [codigo, info] of Object.entries(produtos).sort()) {
    if (!info.ativo) continue;
    const estoque = await obterEstoqueProduto(codigo);
    if (estoque <= 0) continue;
    const tipo = info.tipo === "manual" ? "Manual" : "Automático";
    linhas.push(
      `📦 **${info.nome}** (\`${codigo}\`)\n💰 ${formatarMoeda(Number(info.preco ?? 0))} | ⚙️ ${tipo} | 📊 Estoque: ${estoque}`,
    );
  }

  if (linhas.length === 0) {
    embed.setDescription("Nenhum produto disponível no momento.");
  } else {
    const texto = linhas.join("\n\n");
    for (let i = 0, n = 1; i < texto.length; i += 1000, n++) {
      embed.addFields({ name: `Produtos ${n}`, value: texto.slice(i, i + 1000), inline: false });
    }
  }

  embed.setFooter({ text: "Produtos manuais dependem da equipe. Produtos automáticos são entregues após confirmação." });
  return embed;
}

export function embedPedidoResumo(pedidoId: string, pedido: Pedido): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("🧾 Pedido")
    .addFields(
      { name: "ID", value: `\`${pedidoId}\``, inline: true },
      { name: "Status", value: `\`${pedido.status ?? "N/A"}\``, inline: true },
      { name: "Produto", value: pedido.produto_nome ?? "N/A", inline: false },
      { name: "Cliente", value: `<@${pedido.cliente_id}>`, inline: true },
      { name: "Confirmador", value: pedido.confirmador_id ? `<@${pedido.confirmador_id}>` : "N/A", inline: true },
      { name: "Quantidade", value: String(pedido.quantidade ?? 1), inline: true },
      { name: "Valor", value: formatarMoeda(Number(pedido.valor_total ?? 0)), inline: true },
      { name: "Criado em", value: pedido.criado_em ?? "N/A", inline: false },
    )
    .setTimestamp();

  if (pedido.mensagem_cliente) {
    embed.addFields({ name: "Mensagem do cliente/admin", value: pedido.mensagem_cliente.slice(0, 1024) });
  }
  if (pedido.comprovante_mensagem) {
    embed.addFields({ name: "Mensagem junto com comprovante", value: pedido.comprovante_mensagem.slice(0, 1024) });
  }
  return embed;
}

export function embedAjuda(staff: boolean): EmbedBuilder {
  if (!staff) {
    return new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🛒 Ajuda da loja")
      .addFields(
        {
          name: "Como comprar",
          value:
            "1. Use `/loja`.\n2. Escolha o produto no menu.\n3. Informe a quantidade e, se precisar, seu nick Roblox.\n4. Pague pelo PIX/QR enviado no privado.\n5. Responda a DM do bot com o comprovante anexado.\n6. Aguarde a equipe confirmar.",
        },
        {
          name: "Tipos de entrega",
          value:
            "**Manual:** a equipe entrega dentro do jogo, como gamepass TVL2.\n**Automática:** o bot envia nick/senha ou dados do produto após a confirmação.",
        },
        {
          name: "Problemas comuns",
          value:
            "Se você não receber a mensagem do bot, abra seu privado/DM.\nSe enviou o comprovante errado, chame a equipe da loja.",
        },
      );
  }

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🛠 Ajuda da staff")
    .setDescription("Guia completo dos painéis e funções do bot.")
    .addFields(
      {
        name: "Comandos principais",
        value:
          "`/loja` — mostra os produtos ativos e permite o cliente comprar.\n`/admin` — abre o painel da equipe.\n`/ajuda` — mostra ajuda para cliente e staff.",
      },
      {
        name: "/admin → Produtos / Estoque",
        value:
          "**Criar/editar produto:** cadastra ou altera nome, preço, tipo e estoque.\n**PIX/QR do produto:** salva o PIX e aguarda imagem do QR.\n**Adicionar conta automática:** coloca nick/senha no estoque automático.\n**Remover conta automática:** apaga uma conta específica.\n**Listar contas automáticas:** mostra posições e logins cadastrados.\n**Ajustar estoque manual:** define, soma ou remove quantidade.\n**Listar produtos:** mostra produtos, tipo, preço e estoque.\n**Excluir produto:** remove produto, QR e estoque automático.",
      },
      {
        name: "/admin → Pedidos",
        value:
          "**Nova venda:** cria pedido manualmente.\n**Ver pedido:** mostra status, cliente, produto, valor e mensagens.\n**Reenviar PIX/QR:** manda novamente o pagamento para o cliente.\n**Aprovar por ID:** confirma pagamento manualmente.\n**Recusar por ID:** recusa o pedido e avisa o cliente.",
      },
      {
        name: "Comprovantes",
        value:
          "O cliente responde a DM do bot com imagem do comprovante. O confirmador recebe tudo no privado com botões **Confirmar** e **Recusar**.",
      },
    );
}

export async function embedListaProdutos(): Promise<EmbedBuilder> {
  const produtos = await carregarProdutos();
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📋 Produtos cadastrados")
    .setTimestamp();

  if (Object.keys(produtos).length === 0) {
    embed.setDescription("Nenhum produto cadastrado.");
    return embed;
  }

  const linhas: string[] = [];
  for (const [codigo, info] of Object.entries(produtos).sort()) {
    const estoque = await obterEstoqueProduto(codigo);
    const tipo = info.tipo === "manual" ? "Manual" : "Automático";
    const ativo = info.ativo ? "✅" : "❌";
    linhas.push(
      `${ativo} **${info.nome}** (\`${codigo}\`)\nTipo: ${tipo} | Preço: ${formatarMoeda(Number(info.preco ?? 0))} | Estoque: ${estoque}`,
    );
  }

  const conteudo = linhas.join("\n\n");
  for (let i = 0, n = 1; i < conteudo.length; i += 1000, n++) {
    embed.addFields({ name: `Lista ${n}`, value: conteudo.slice(i, i + 1000), inline: false });
  }
  return embed;
}
