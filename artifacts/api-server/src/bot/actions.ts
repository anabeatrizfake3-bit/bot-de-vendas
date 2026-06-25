import { Client, AttachmentBuilder } from "discord.js";
import {
  carregarConfig,
  carregarProdutos,
  salvarProdutos,
  carregarEstoqueAuto,
  salvarEstoqueAuto,
  carregarPedidos,
  salvarPedidos,
} from "./data/storage.js";
import {
  agora,
  limparCodigo,
  obterEstoqueProduto,
  formatarMoeda,
  gerarIdPedido,
  arquivoParaDiscord,
} from "./utils.js";
import { logger } from "../lib/logger.js";
import type { Pedido } from "./data/types.js";
import { EmbedBuilder } from "discord.js";

export async function temEstoqueParaVenda(codigo: string, quantidade: number): Promise<[boolean, string]> {
  const produtos = await carregarProdutos();
  const info = produtos[codigo];
  if (!info) return [false, "Produto não encontrado."];
  if (!info.ativo) return [false, "Produto desativado."];
  const estoque = await obterEstoqueProduto(codigo);
  if (estoque < quantidade) return [false, `Estoque insuficiente. Disponível: ${estoque}.`];
  return [true, "OK"];
}

export async function enviarPagamentoCliente(
  client: Client,
  pedidoId: string,
): Promise<[boolean, string]> {
  const pedidos = await carregarPedidos();
  const pedido = pedidos[pedidoId];
  if (!pedido) return [false, "Pedido não encontrado."];

  const produtos = await carregarProdutos();
  const produto = produtos[pedido.produto_codigo];
  if (!produto) return [false, "Produto não encontrado."];

  let clienteUser;
  try {
    clienteUser = await client.users.fetch(String(pedido.cliente_id));
  } catch {
    return [false, "Cliente não encontrado."];
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("💳 Pagamento do seu pedido")
    .setDescription(
      `**Pedido:** \`${pedidoId}\`\n**Produto:** ${pedido.produto_nome}\n**Quantidade:** ${pedido.quantidade}\n**Total:** ${formatarMoeda(Number(pedido.valor_total ?? 0))}`,
    )
    .setTimestamp();

  if (produto.pix_texto) {
    embed.addFields({ name: "PIX copia e cola / chave PIX", value: `\`${produto.pix_texto}\``.slice(0, 1024) });
  } else {
    embed.addFields({ name: "PIX", value: "Nenhum PIX cadastrado. Chame a equipe." });
  }

  if (produto.mensagem_pagamento) {
    embed.addFields({ name: "Mensagem da loja", value: produto.mensagem_pagamento.slice(0, 1024) });
  }

  embed.addFields({
    name: "Depois de pagar",
    value: "Responda **essa DM do bot** com o comprovante anexado.\nVocê pode escrever uma mensagem junto, por exemplo seu nick Roblox.",
  });

  const file = arquivoParaDiscord(produto.qr_path);
  try {
    if (file) {
      embed.setImage(`attachment://${file.name}`);
      await clienteUser.send({ embeds: [embed], files: [file] });
    } else {
      await clienteUser.send({ embeds: [embed] });
    }
    return [true, "Pagamento enviado no privado do cliente."];
  } catch (err) {
    logger.warn({ err }, "Falha ao enviar DM de pagamento");
    return [false, "Não consegui enviar DM para o cliente. Peça para ele abrir o privado."];
  }
}

export async function criarPedido(
  client: Client,
  opts: {
    clienteId: number;
    produtoCodigo: string;
    quantidade: number;
    confirmadorId: number | null;
    mensagemCliente?: string;
    origem?: "loja" | "admin";
  },
): Promise<[boolean, string, string | null]> {
  const codigo = limparCodigo(opts.produtoCodigo);
  const quantidade = Math.max(1, opts.quantidade);

  const produtos = await carregarProdutos();
  const produto = produtos[codigo];
  if (!produto) return [false, "Produto não encontrado.", null];

  const [ok, msg] = await temEstoqueParaVenda(codigo, quantidade);
  if (!ok) return [false, msg, null];

  const config = await carregarConfig();
  const confirmadorId = opts.confirmadorId ?? config.confirmador_padrao_id;
  if (!confirmadorId) return [false, "Nenhum confirmador configurado. Configure em /admin > Configuração.", null];

  const pedidoId = gerarIdPedido();
  const preco = Number(produto.preco ?? 0);
  const valorTotal = Math.round(preco * quantidade * 100) / 100;

  const pedido: Pedido = {
    id: pedidoId,
    cliente_id: opts.clienteId,
    produto_codigo: codigo,
    produto_nome: produto.nome ?? codigo,
    tipo: produto.tipo,
    quantidade,
    valor_unitario: preco,
    valor_total: valorTotal,
    confirmador_id: confirmadorId,
    status: "aguardando_comprovante",
    mensagem_cliente: opts.mensagemCliente ?? "",
    comprovante_mensagem: undefined,
    comprovantes: [],
    criado_em: agora(),
    origem: opts.origem ?? "loja",
  };

  const pedidos = await carregarPedidos();
  pedidos[pedidoId] = pedido;
  await salvarPedidos(pedidos);

  const [enviado, msgEnvio] = await enviarPagamentoCliente(client, pedidoId);
  if (enviado) {
    const pedidosAtualizados = await carregarPedidos();
    if (pedidosAtualizados[pedidoId]) {
      pedidosAtualizados[pedidoId].pagamento_enviado_em = agora();
      await salvarPedidos(pedidosAtualizados);
    }
  }

  return [enviado, msgEnvio, pedidoId];
}

export async function aprovarPedido(
  client: Client,
  pedidoId: string,
  aprovadoPor: number,
): Promise<[boolean, string]> {
  pedidoId = pedidoId.toUpperCase().trim();
  const pedidos = await carregarPedidos();
  const pedido = pedidos[pedidoId];
  if (!pedido) return [false, "Pedido não encontrado."];
  if (["aprovado", "entregue", "pagamento_confirmado"].includes(pedido.status)) return [false, "Esse pedido já foi aprovado."];
  if (pedido.status === "recusado") return [false, "Esse pedido já foi recusado."];

  const produtos = await carregarProdutos();
  const produto = produtos[pedido.produto_codigo];
  if (!produto) return [false, "Produto não encontrado."];

  const quantidade = Number(pedido.quantidade ?? 1);
  const [ok, msg] = await temEstoqueParaVenda(pedido.produto_codigo, quantidade);
  if (!ok) return [false, msg];

  let clienteUser;
  try {
    clienteUser = await client.users.fetch(String(pedido.cliente_id));
  } catch {
    return [false, "Cliente não encontrado."];
  }

  const tipo = produto.tipo;

  if (tipo === "automatico") {
    const estoqueAuto = await carregarEstoqueAuto();
    const lista = estoqueAuto[pedido.produto_codigo] ?? [];
    if (!Array.isArray(lista) || lista.length < quantidade) return [false, "Estoque automático insuficiente."];

    const entregues = lista.splice(0, quantidade);
    estoqueAuto[pedido.produto_codigo] = lista;
    await salvarEstoqueAuto(estoqueAuto);

    const linhas = entregues.map((item, i) => {
      const login = item.login || item.extra || "N/A";
      const senha = item.senha || "N/A";
      let bloco = `**Conta ${i + 1}**\n👤 Nick/Login: \`${login}\`\n🔑 Senha: \`${senha}\``;
      if (item.extra) bloco += `\n📌 Info: ${item.extra}`;
      return bloco;
    });
    const entregaInfo = linhas.join("\n\n");

    try {
      await clienteUser.send(
        `✅ **Pagamento confirmado! Sua compra foi entregue automaticamente.**\n\n📦 Produto: **${pedido.produto_nome}**\n\n${entregaInfo}\n\nGuarde essa mensagem com segurança.`,
      );
    } catch { /* DMs fechadas */ }

    pedidos[pedidoId] = {
      ...pedido,
      status: "entregue",
      aprovado_em: agora(),
      aprovado_por: aprovadoPor,
      entregue_em: agora(),
      entrega_info: entregaInfo,
    };
    await salvarPedidos(pedidos);
    return [true, "Pedido aprovado e produto entregue automaticamente."];
  }

  // Produto manual
  const produtosAt = await carregarProdutos();
  const estoqueAtual = Number(produtosAt[pedido.produto_codigo]?.estoque_qtd ?? 0);
  produtosAt[pedido.produto_codigo].estoque_qtd = Math.max(0, estoqueAtual - quantidade);
  produtosAt[pedido.produto_codigo].atualizado_em = agora();
  await salvarProdutos(produtosAt);

  const mensagemEntrega =
    produto.mensagem_entrega ||
    "Pagamento confirmado. A equipe vai realizar a entrega manual assim que possível. Fique de olho no servidor ou no seu privado.";

  try {
    await clienteUser.send(
      `✅ **Pagamento confirmado!**\n\n📦 Produto: **${pedido.produto_nome}**\n\n${mensagemEntrega}`,
    );
  } catch { /* DMs fechadas */ }

  pedidos[pedidoId] = {
    ...pedido,
    status: "aprovado",
    aprovado_em: agora(),
    aprovado_por: aprovadoPor,
  };
  await salvarPedidos(pedidos);
  return [true, "Pedido aprovado. Cliente notificado."];
}

export async function recusarPedido(
  client: Client,
  pedidoId: string,
  recusadoPor: number,
  motivo: string,
): Promise<[boolean, string]> {
  pedidoId = pedidoId.toUpperCase().trim();
  const pedidos = await carregarPedidos();
  const pedido = pedidos[pedidoId];
  if (!pedido) return [false, "Pedido não encontrado."];
  if (pedido.status === "recusado") return [false, "Esse pedido já foi recusado."];

  let clienteUser;
  try {
    clienteUser = await client.users.fetch(String(pedido.cliente_id));
  } catch { /* ignore */ }

  if (clienteUser) {
    try {
      await clienteUser.send(
        `❌ **Seu pedido foi recusado.**\n\n📦 Produto: **${pedido.produto_nome}**\n💬 Motivo: ${motivo}`,
      );
    } catch { /* DMs fechadas */ }
  }

  pedidos[pedidoId] = {
    ...pedido,
    status: "recusado",
    recusado_em: agora(),
    recusado_por: recusadoPor,
    motivo_recusa: motivo,
  };
  await salvarPedidos(pedidos);
  return [true, "Pedido recusado. Cliente notificado."];
}

export async function enviarComprovanteparaConfirmador(
  client: Client,
  pedidoId: string,
): Promise<[boolean, string]> {
  const pedidos = await carregarPedidos();
  const pedido = pedidos[pedidoId];
  if (!pedido) return [false, "Pedido não encontrado."];
  if (!pedido.confirmador_id) return [false, "Pedido sem confirmador."];

  let confirmador;
  try {
    confirmador = await client.users.fetch(String(pedido.confirmador_id));
  } catch {
    return [false, "Confirmador não encontrado."];
  }

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");

  const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("📎 Comprovante recebido")
    .setDescription("Confira o comprovante e clique em confirmar se o pagamento estiver correto.")
    .addFields(
      { name: "Pedido", value: `\`${pedidoId}\``, inline: true },
      { name: "Cliente", value: `<@${pedido.cliente_id}> (\`${pedido.cliente_id}\`)`, inline: false },
      { name: "Produto", value: pedido.produto_nome, inline: false },
      { name: "Valor", value: formatarMoeda(Number(pedido.valor_total ?? 0)), inline: true },
      { name: "Quantidade", value: String(pedido.quantidade ?? 1), inline: true },
    )
    .setTimestamp();

  if (pedido.comprovante_mensagem) {
    embed.addFields({ name: "Mensagem do cliente", value: pedido.comprovante_mensagem.slice(0, 1024) });
  }

  const files: AttachmentBuilder[] = [];
  for (const filePath of (pedido.comprovantes ?? []).slice(0, 5)) {
    const f = arquivoParaDiscord(filePath);
    if (f) files.push(f);
  }

  const row = new ActionRowBuilder<typeof ButtonBuilder.prototype>().addComponents(
    new ButtonBuilder()
      .setCustomId(`comprovante:confirmar:${pedidoId}`)
      .setLabel("Confirmar pagamento")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`comprovante:recusar:${pedidoId}`)
      .setLabel("Recusar")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger),
  );

  try {
    await confirmador.send({ embeds: [embed], files, components: [row as never] });
    return [true, "Comprovante enviado ao confirmador."];
  } catch (err) {
    logger.warn({ err }, "Falha ao enviar comprovante ao confirmador");
    return [false, `Erro ao enviar ao confirmador: ${err}`];
  }
}

export function encontrarPedidoPendenteCliente(
  pedidos: Record<string, Pedido>,
  clienteId: number,
): [string, Pedido] | null {
  for (const [id, pedido] of Object.entries(pedidos)) {
    if (
      Number(pedido.cliente_id) === clienteId &&
      pedido.status === "aguardando_comprovante"
    ) {
      return [id, pedido];
    }
  }
  return null;
}
