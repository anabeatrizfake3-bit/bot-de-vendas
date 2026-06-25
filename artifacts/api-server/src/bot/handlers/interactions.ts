import {
  Interaction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} from "discord.js";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  carregarConfig, salvarConfig,
  carregarProdutos, salvarProdutos,
  carregarEstoqueAuto, salvarEstoqueAuto,
  carregarPedidos,
  QR_DIR,
} from "../data/storage.js";
import {
  limparCodigo, parseIdUsuario, converterValor, converterInt,
  formatarMoeda, agora, obterEstoqueProduto, arquivoParaDiscord,
} from "../utils.js";
import {
  criarPedido, aprovarPedido, recusarPedido,
  enviarPagamentoCliente, temEstoqueParaVenda,
} from "../actions.js";
import {
  embedProdutosPublico, embedPedidoResumo, embedListaProdutos,
} from "../embeds.js";
import { logger } from "../../lib/logger.js";

// Map<userId, produtoCodigo> — aguardando upload de QR
export const aguardandoQR = new Map<string, string>();

function modal(customId: string, title: string, inputs: TextInputBuilder[]): ModalBuilder {
  const m = new ModalBuilder().setCustomId(customId).setTitle(title);
  for (const input of inputs) {
    m.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }
  return m;
}

function txt(id: string, label: string, opts: {
  placeholder?: string; required?: boolean; style?: TextInputStyle;
  maxLength?: number; value?: string;
} = {}): TextInputBuilder {
  const t = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(opts.style ?? TextInputStyle.Short)
    .setRequired(opts.required ?? true);
  if (opts.placeholder) t.setPlaceholder(opts.placeholder);
  if (opts.maxLength) t.setMaxLength(opts.maxLength);
  if (opts.value) t.setValue(opts.value);
  return t;
}

// ─── PAINEL /LOJA ────────────────────────────────────────────────────────────

export async function handleLojaSelect(interaction: Interaction) {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== "loja:select") return;

  const codigo = limparCodigo(interaction.values[0]);
  const produtos = await carregarProdutos();
  const produto = produtos[codigo];
  if (!produto) { await interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true }); return; }

  const estoque = await obterEstoqueProduto(codigo);
  if (estoque <= 0) { await interaction.reply({ content: "❌ Produto sem estoque.", ephemeral: true }); return; }

  const m = modal(`loja:comprar:${codigo}`, `Comprar: ${produto.nome}`, [
    txt("quantidade", "Quantidade", { placeholder: "1", value: "1", maxLength: 5 }),
    txt("mensagem", "Nick Roblox / mensagem opcional", { placeholder: "Seu nick ou obs...", required: false, style: TextInputStyle.Paragraph, maxLength: 500 }),
  ]);
  await interaction.showModal(m);
}

export async function handleLojaComprarModal(interaction: Interaction) {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith("loja:comprar:")) return;

  const codigo = interaction.customId.replace("loja:comprar:", "");
  const quantidade = converterInt(interaction.fields.getTextInputValue("quantidade"), 1);
  const mensagem = interaction.fields.getTextInputValue("mensagem") || "";

  await interaction.deferReply({ ephemeral: true });

  const [ok, msg, pedidoId] = await criarPedido(interaction.client, {
    clienteId: Number(interaction.user.id),
    produtoCodigo: codigo,
    quantidade,
    confirmadorId: null,
    mensagemCliente: mensagem,
    origem: "loja",
  });

  if (pedidoId) {
    await interaction.editReply(`✅ Pedido \`${pedidoId}\` criado! ${msg}`);
  } else {
    await interaction.editReply(`❌ ${msg}`);
  }
}

// ─── PAINEL /ADMIN – MENU PRINCIPAL ──────────────────────────────────────────

export async function enviarPainelAdmin(interaction: Interaction) {
  if (!interaction.isRepliable()) return;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🛠 Painel Admin")
    .setDescription("Escolha uma seção:");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("admin:produtos").setLabel("Produtos / Estoque").setEmoji("📦").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("admin:pedidos").setLabel("Pedidos").setEmoji("🧾").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("admin:config").setLabel("Configuração").setEmoji("⚙️").setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({ embeds: [embed], components: [row as never], ephemeral: true });
}

// ─── PAINEL ADMIN – PRODUTOS / ESTOQUE ───────────────────────────────────────

async function enviarPainelProdutos(interaction: Interaction) {
  if (!interaction.isButton()) return;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📦 Produtos / Estoque");

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("admin:criar_produto").setLabel("Criar/Editar produto").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("admin:pix_qr").setLabel("PIX / QR do produto").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("admin:listar_produtos").setLabel("Listar produtos").setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("admin:estoque_auto_add").setLabel("Adicionar conta auto").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("admin:estoque_auto_rem").setLabel("Remover conta auto").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("admin:estoque_auto_list").setLabel("Listar contas auto").setStyle(ButtonStyle.Secondary),
  );
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("admin:estoque_manual").setLabel("Ajustar estoque manual").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("admin:excluir_produto").setLabel("Excluir produto").setStyle(ButtonStyle.Danger),
  );

  await interaction.update({ embeds: [embed], components: [row1 as never, row2 as never, row3 as never] });
}

// ─── PAINEL ADMIN – PEDIDOS ───────────────────────────────────────────────────

async function enviarPainelPedidos(interaction: Interaction) {
  if (!interaction.isButton()) return;

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🧾 Pedidos")
    .setDescription("Crie venda manualmente, veja pedido, reenvie PIX/QR, aprove ou recuse por ID.");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("admin:nova_venda").setLabel("Nova venda").setEmoji("🛒").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("admin:ver_pedido").setLabel("Ver pedido").setEmoji("🔎").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("admin:reenviar_pix").setLabel("Reenviar PIX/QR").setEmoji("💳").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("admin:aprovar_id").setLabel("Aprovar por ID").setEmoji("✅").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("admin:recusar_id").setLabel("Recusar por ID").setEmoji("❌").setStyle(ButtonStyle.Danger),
  );

  await interaction.update({ embeds: [embed], components: [row as never] });
}

// ─── ROTEADOR PRINCIPAL ───────────────────────────────────────────────────────

export async function handleInteraction(interaction: Interaction) {
  try {
    // Select menus
    if (interaction.isStringSelectMenu() && interaction.customId === "loja:select") {
      return await handleLojaSelect(interaction);
    }

    // Modal submits
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("loja:comprar:")) return await handleLojaComprarModal(interaction);
      if (interaction.customId === "admin:criar_produto_modal") return await handleCriarProdutoModal(interaction);
      if (interaction.customId === "admin:pix_qr_modal") return await handlePixQrModal(interaction);
      if (interaction.customId === "admin:estoque_auto_add_modal") return await handleEstoqueAutoAddModal(interaction);
      if (interaction.customId === "admin:estoque_auto_rem_modal") return await handleEstoqueAutoRemModal(interaction);
      if (interaction.customId === "admin:estoque_auto_list_modal") return await handleEstoqueAutoListModal(interaction);
      if (interaction.customId === "admin:estoque_manual_modal") return await handleEstoqueManualModal(interaction);
      if (interaction.customId === "admin:excluir_produto_modal") return await handleExcluirProdutoModal(interaction);
      if (interaction.customId === "admin:nova_venda_modal") return await handleNovaVendaModal(interaction);
      if (interaction.customId === "admin:ver_pedido_modal") return await handleVerPedidoModal(interaction);
      if (interaction.customId === "admin:reenviar_pix_modal") return await handleReenviarPixModal(interaction);
      if (interaction.customId === "admin:aprovar_id_modal") return await handleAprovarIdModal(interaction);
      if (interaction.customId === "admin:recusar_id_modal") return await handleRecusarIdModal(interaction);
      if (interaction.customId === "admin:config_modal") return await handleConfigModal(interaction);
    }

    // Buttons
    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === "admin:produtos") return await enviarPainelProdutos(interaction);
      if (id === "admin:pedidos") return await enviarPainelPedidos(interaction);
      if (id === "admin:config") return await interaction.showModal(await buildConfigModal());

      if (id === "admin:criar_produto") return await interaction.showModal(buildCriarProdutoModal());
      if (id === "admin:pix_qr") return await interaction.showModal(buildPixQrModal());
      if (id === "admin:estoque_auto_add") return await interaction.showModal(buildEstoqueAutoAddModal());
      if (id === "admin:estoque_auto_rem") return await interaction.showModal(buildEstoqueAutoRemModal());
      if (id === "admin:estoque_auto_list") return await interaction.showModal(buildEstoqueAutoListModal());
      if (id === "admin:estoque_manual") return await interaction.showModal(buildEstoqueManualModal());
      if (id === "admin:excluir_produto") return await interaction.showModal(buildExcluirProdutoModal());
      if (id === "admin:nova_venda") return await interaction.showModal(buildNovaVendaModal());
      if (id === "admin:ver_pedido") return await interaction.showModal(buildVerPedidoModal());
      if (id === "admin:reenviar_pix") return await interaction.showModal(buildReenviarPixModal());
      if (id === "admin:aprovar_id") return await interaction.showModal(buildAprovarIdModal());
      if (id === "admin:recusar_id") return await interaction.showModal(buildRecusarIdModal());

      if (id === "admin:listar_produtos") {
        const embed = await embedListaProdutos();
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (id.startsWith("comprovante:confirmar:")) {
        const pedidoId = id.replace("comprovante:confirmar:", "");
        const [ok, msg] = await aprovarPedido(interaction.client, pedidoId, Number(interaction.user.id));
        await interaction.update({ content: (ok ? "✅ " : "❌ ") + msg, embeds: [], components: [], files: [] });
        return;
      }

      if (id.startsWith("comprovante:recusar:")) {
        const pedidoId = id.replace("comprovante:recusar:", "");
        const [ok, msg] = await recusarPedido(interaction.client, pedidoId, Number(interaction.user.id), "Recusado pelo confirmador.");
        await interaction.update({ content: (ok ? "✅ " : "❌ ") + msg, embeds: [], components: [], files: [] });
        return;
      }
    }

    // Handle image upload for QR (MessageCreate handles this via DM handler)
  } catch (err) {
    logger.error({ err, customId: (interaction as { customId?: string }).customId }, "Erro ao processar interação");
  }
}

// ─── MODAL BUILDERS ───────────────────────────────────────────────────────────

function buildCriarProdutoModal() {
  return modal("admin:criar_produto_modal", "Criar / Editar produto", [
    txt("codigo", "Código único", { placeholder: "gamepass_tvl2", maxLength: 60 }),
    txt("nome", "Nome do produto", { placeholder: "Gamepass TVL2", maxLength: 100 }),
    txt("preco", "Preço", { placeholder: "Ex: 15,00 ou 15.00", maxLength: 20 }),
    txt("tipo", "Tipo: manual ou automatico", { placeholder: "manual", maxLength: 10 }),
    txt("estoque", "Estoque inicial (manual) / 0 para automático", { placeholder: "10", maxLength: 10 }),
  ]);
}

function buildPixQrModal() {
  return modal("admin:pix_qr_modal", "PIX / QR do produto", [
    txt("codigo", "Código do produto", { placeholder: "gamepass_tvl2", maxLength: 60 }),
    txt("pix", "PIX copia e cola / chave", { placeholder: "Cole o PIX aqui", required: false, style: TextInputStyle.Paragraph, maxLength: 1000 }),
    txt("msg_pagamento", "Mensagem junto com QR", { placeholder: "Ex: Após pagar, envie comprovante + nick Roblox.", required: false, style: TextInputStyle.Paragraph, maxLength: 1000 }),
  ]);
}

function buildEstoqueAutoAddModal() {
  return modal("admin:estoque_auto_add_modal", "Adicionar conta automática", [
    txt("codigo", "Código do produto automático", { placeholder: "conta_roblox", maxLength: 60 }),
    txt("login", "Nick/Login", { placeholder: "nick_da_conta", maxLength: 200 }),
    txt("senha", "Senha", { placeholder: "senha_da_conta", maxLength: 200 }),
    txt("extra", "Info extra opcional", { placeholder: "Email, observação, etc", required: false, style: TextInputStyle.Paragraph, maxLength: 600 }),
  ]);
}

function buildEstoqueAutoRemModal() {
  return modal("admin:estoque_auto_rem_modal", "Remover conta automática", [
    txt("codigo", "Código do produto automático", { placeholder: "conta_roblox", maxLength: 60 }),
    txt("alvo", "Número ou nick/login", { placeholder: "Ex: 1 ou nick_da_conta", maxLength: 200 }),
  ]);
}

function buildEstoqueAutoListModal() {
  return modal("admin:estoque_auto_list_modal", "Listar contas automáticas", [
    txt("codigo", "Código do produto automático", { placeholder: "conta_roblox", maxLength: 60 }),
  ]);
}

function buildEstoqueManualModal() {
  return modal("admin:estoque_manual_modal", "Ajustar estoque manual", [
    txt("codigo", "Código do produto manual", { placeholder: "gamepass_tvl2", maxLength: 60 }),
    txt("quantidade", "Quantidade (Ex: 10, +5 ou -2)", { placeholder: "10", maxLength: 20 }),
  ]);
}

function buildExcluirProdutoModal() {
  return modal("admin:excluir_produto_modal", "Excluir produto", [
    txt("codigo", "Código do produto", { placeholder: "gamepass_tvl2", maxLength: 60 }),
    txt("confirmacao", "Digite EXCLUIR para confirmar", { placeholder: "EXCLUIR", maxLength: 20 }),
  ]);
}

function buildNovaVendaModal() {
  return modal("admin:nova_venda_modal", "Nova venda", [
    txt("cliente", "Cliente", { placeholder: "@cliente ou ID", maxLength: 100 }),
    txt("produto", "Produto", { placeholder: "codigo_do_produto", maxLength: 60 }),
    txt("confirmador", "Confirmador (vazio = você)", { placeholder: "@pessoa ou ID", required: false, maxLength: 100 }),
    txt("quantidade", "Quantidade", { placeholder: "1", value: "1", maxLength: 5 }),
    txt("mensagem", "Mensagem opcional para o pedido", { placeholder: "Ex: cliente pediu tal variação", required: false, style: TextInputStyle.Paragraph, maxLength: 800 }),
  ]);
}

function buildVerPedidoModal() {
  return modal("admin:ver_pedido_modal", "Ver pedido", [
    txt("pedido", "ID do pedido", { placeholder: "PED-XXXX", maxLength: 30 }),
  ]);
}

function buildReenviarPixModal() {
  return modal("admin:reenviar_pix_modal", "Reenviar PIX/QR", [
    txt("pedido", "ID do pedido", { placeholder: "PED-XXXX", maxLength: 30 }),
  ]);
}

function buildAprovarIdModal() {
  return modal("admin:aprovar_id_modal", "Aprovar pedido por ID", [
    txt("pedido", "ID do pedido", { placeholder: "PED-XXXX", maxLength: 30 }),
  ]);
}

function buildRecusarIdModal() {
  return modal("admin:recusar_id_modal", "Recusar pedido por ID", [
    txt("pedido", "ID do pedido", { placeholder: "PED-XXXX", maxLength: 30 }),
    txt("motivo", "Motivo", { placeholder: "Comprovante inválido", required: false, style: TextInputStyle.Paragraph, maxLength: 500 }),
  ]);
}

async function buildConfigModal() {
  const config = await carregarConfig();
  return modal("admin:config_modal", "Configuração da loja", [
    txt("nome", "Nome da loja", { placeholder: "Loja", value: config.nome_loja ?? "Loja", maxLength: 100 }),
    txt("confirmador", "Confirmador padrão (ID)", { placeholder: "ID do usuário", required: false, value: config.confirmador_padrao_id ? String(config.confirmador_padrao_id) : "", maxLength: 30 }),
  ]);
}

// ─── MODAL HANDLERS ───────────────────────────────────────────────────────────

async function handleCriarProdutoModal(interaction: Interaction) {
  if (!interaction.isModalSubmit()) return;

  const codigo = limparCodigo(interaction.fields.getTextInputValue("codigo"));
  const nome = interaction.fields.getTextInputValue("nome").trim();
  const precoStr = interaction.fields.getTextInputValue("preco");
  const tipoRaw = interaction.fields.getTextInputValue("tipo").trim().toLowerCase();
  const estoqueStr = interaction.fields.getTextInputValue("estoque");

  const preco = converterValor(precoStr);
  if (preco === null) { await interaction.reply({ content: "❌ Preço inválido.", ephemeral: true }); return; }

  const tipo = tipoRaw === "automatico" ? "automatico" : "manual";
  const estoqueQtd = Math.max(0, converterInt(estoqueStr, 0));

  const produtos = await carregarProdutos();
  const isEdicao = Boolean(produtos[codigo]);
  const atual = produtos[codigo] ?? {};

  produtos[codigo] = {
    ...atual,
    nome,
    preco,
    tipo,
    ativo: atual.ativo ?? true,
    estoque_qtd: tipo === "manual" ? estoqueQtd : 0,
    atualizado_em: agora(),
    criado_em: atual.criado_em ?? agora(),
  };
  await salvarProdutos(produtos);

  await interaction.reply({
    content: `✅ Produto \`${codigo}\` ${isEdicao ? "editado" : "criado"}!\n📦 Nome: **${nome}** | Preço: ${formatarMoeda(preco)} | Tipo: ${tipo}${tipo === "manual" ? ` | Estoque: ${estoqueQtd}` : ""}`,
    ephemeral: true,
  });
}

async function handlePixQrModal(interaction: Interaction) {
  if (!interaction.isModalSubmit()) return;

  const codigo = limparCodigo(interaction.fields.getTextInputValue("codigo"));
  const pix = interaction.fields.getTextInputValue("pix") || "";
  const msgPagamento = interaction.fields.getTextInputValue("msg_pagamento") || "";

  const produtos = await carregarProdutos();
  if (!produtos[codigo]) { await interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true }); return; }

  produtos[codigo].pix_texto = pix;
  produtos[codigo].mensagem_pagamento = msgPagamento;
  produtos[codigo].atualizado_em = agora();
  await salvarProdutos(produtos);

  aguardandoQR.set(interaction.user.id, codigo);

  await interaction.reply({
    content: `✅ PIX/mensagem salvos para \`${codigo}\`.\nAgora envie **a imagem do QR Code** aqui no chat (neste canal ou em DM com o bot). O próximo anexo seu será salvo nesse produto.`,
    ephemeral: true,
  });
}

async function handleEstoqueAutoAddModal(interaction: Interaction) {
  if (!interaction.isModalSubmit()) return;

  const codigo = limparCodigo(interaction.fields.getTextInputValue("codigo"));
  const login = interaction.fields.getTextInputValue("login");
  const senha = interaction.fields.getTextInputValue("senha");
  const extra = interaction.fields.getTextInputValue("extra") || "";

  const produtos = await carregarProdutos();
  if (!produtos[codigo]) { await interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true }); return; }
  if (produtos[codigo].tipo !== "automatico") { await interaction.reply({ content: "❌ Esse produto não é automático.", ephemeral: true }); return; }

  const estoque = await carregarEstoqueAuto();
  if (!estoque[codigo]) estoque[codigo] = [];
  estoque[codigo].push({ login, senha, extra, adicionado_em: agora(), adicionado_por: Number(interaction.user.id) });
  await salvarEstoqueAuto(estoque);

  await interaction.reply({ content: `✅ Conta adicionada ao estoque de \`${codigo}\`. Estoque atual: **${estoque[codigo].length}**`, ephemeral: true });
}

async function handleEstoqueAutoRemModal(interaction: Interaction) {
  if (!interaction.isModalSubmit()) return;

  const codigo = limparCodigo(interaction.fields.getTextInputValue("codigo"));
  const alvo = interaction.fields.getTextInputValue("alvo").trim();

  const produtos = await carregarProdutos();
  if (!produtos[codigo]) { await interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true }); return; }
  if (produtos[codigo].tipo !== "automatico") { await interaction.reply({ content: "❌ Esse produto não é automático.", ephemeral: true }); return; }

  const estoque = await carregarEstoqueAuto();
  const lista = estoque[codigo] ?? [];
  if (!lista.length) { await interaction.reply({ content: "❌ Esse produto não possui contas no estoque.", ephemeral: true }); return; }

  let indice: number | null = null;
  if (/^\d+$/.test(alvo)) {
    const pos = parseInt(alvo, 10);
    if (pos >= 1 && pos <= lista.length) indice = pos - 1;
  } else {
    const alvoLower = alvo.toLowerCase();
    indice = lista.findIndex((item) => (item.login || "").toLowerCase() === alvoLower);
    if (indice === -1) indice = null;
  }

  if (indice === null) { await interaction.reply({ content: "❌ Conta não encontrada. Use o número mostrado em **Listar contas automáticas** ou o nick/login exato.", ephemeral: true }); return; }

  const [removida] = lista.splice(indice, 1);
  estoque[codigo] = lista;
  await salvarEstoqueAuto(estoque);

  await interaction.reply({ content: `✅ Conta removida de \`${codigo}\`.\n👤 Login removido: \`${removida.login || "N/A"}\`\n📦 Estoque atual: **${lista.length}**`, ephemeral: true });
}

async function handleEstoqueAutoListModal(interaction: Interaction) {
  if (!interaction.isModalSubmit()) return;

  const codigo = limparCodigo(interaction.fields.getTextInputValue("codigo"));
  const produtos = await carregarProdutos();
  if (!produtos[codigo]) { await interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true }); return; }
  if (produtos[codigo].tipo !== "automatico") { await interaction.reply({ content: "❌ Esse produto não é automático.", ephemeral: true }); return; }

  const lista = (await carregarEstoqueAuto())[codigo] ?? [];
  if (!lista.length) { await interaction.reply({ content: `📦 \`${codigo}\` não possui contas cadastradas.`, ephemeral: true }); return; }

  const linhas = lista.slice(0, 30).map((item, i) => {
    const login = item.login || "N/A";
    const extra = item.extra ? ` — ${item.extra.slice(0, 80)}` : "";
    return `\`${i + 1}\` — 👤 \`${login}\`${extra}`;
  });
  if (lista.length > 30) linhas.push(`... e mais ${lista.length - 30} conta(s).`);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📑 Estoque automático - ${codigo}`)
    .setDescription("Use o número da conta no botão **Remover conta automática**.")
    .addFields({ name: "Contas", value: linhas.join("\n").slice(0, 1024) })
    .setFooter({ text: `Total: ${lista.length} conta(s)` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleEstoqueManualModal(interaction: Interaction) {
  if (!interaction.isModalSubmit()) return;

  const codigo = limparCodigo(interaction.fields.getTextInputValue("codigo"));
  const quantidadeStr = interaction.fields.getTextInputValue("quantidade").trim();

  const produtos = await carregarProdutos();
  if (!produtos[codigo]) { await interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true }); return; }
  if (produtos[codigo].tipo !== "manual") { await interaction.reply({ content: "❌ Esse produto não é manual.", ephemeral: true }); return; }

  const atual = Number(produtos[codigo].estoque_qtd ?? 0);
  let novo: number;
  try {
    if (quantidadeStr.startsWith("+") || quantidadeStr.startsWith("-")) {
      novo = atual + parseInt(quantidadeStr, 10);
    } else {
      novo = parseInt(quantidadeStr, 10);
    }
    if (isNaN(novo)) throw new Error();
  } catch {
    await interaction.reply({ content: "❌ Quantidade inválida.", ephemeral: true }); return;
  }

  novo = Math.max(0, novo);
  produtos[codigo].estoque_qtd = novo;
  produtos[codigo].atualizado_em = agora();
  await salvarProdutos(produtos);

  await interaction.reply({ content: `✅ Estoque de \`${codigo}\` atualizado: **${novo}**`, ephemeral: true });
}

async function handleExcluirProdutoModal(interaction: Interaction) {
  if (!interaction.isModalSubmit()) return;

  const codigo = limparCodigo(interaction.fields.getTextInputValue("codigo"));
  const confirmacao = interaction.fields.getTextInputValue("confirmacao").trim().toUpperCase();

  if (confirmacao !== "EXCLUIR") { await interaction.reply({ content: "❌ Exclusão cancelada. Você precisa digitar `EXCLUIR`.", ephemeral: true }); return; }

  const produtos = await carregarProdutos();
  if (!produtos[codigo]) { await interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true }); return; }

  const produto = produtos[codigo];
  delete produtos[codigo];
  await salvarProdutos(produtos);

  if (produto.qr_path) {
    try { await fsp.unlink(produto.qr_path); } catch { /* ignore */ }
  }

  const estoque = await carregarEstoqueAuto();
  const removidas = Array.isArray(estoque[codigo]) ? estoque[codigo].length : 0;
  delete estoque[codigo];
  await salvarEstoqueAuto(estoque);

  aguardandoQR.delete(interaction.user.id);

  await interaction.reply({ content: `✅ Produto \`${codigo}\` excluído.\n🤖 Contas automáticas removidas: **${removidas}**`, ephemeral: true });
}

async function handleNovaVendaModal(interaction: Interaction) {
  if (!interaction.isModalSubmit()) return;

  const clienteId = parseIdUsuario(interaction.fields.getTextInputValue("cliente"));
  if (!clienteId) { await interaction.reply({ content: "❌ Cliente inválido. Use menção ou ID.", ephemeral: true }); return; }

  const confirmadorStr = interaction.fields.getTextInputValue("confirmador").trim();
  const confirmadorId = confirmadorStr ? parseIdUsuario(confirmadorStr) : Number(interaction.user.id);
  const quantidade = converterInt(interaction.fields.getTextInputValue("quantidade"), 1);
  const mensagem = interaction.fields.getTextInputValue("mensagem") || "";
  const produto = interaction.fields.getTextInputValue("produto").trim();

  await interaction.deferReply({ ephemeral: true });

  const [ok, msg, pedidoId] = await criarPedido(interaction.client, {
    clienteId,
    produtoCodigo: produto,
    quantidade,
    confirmadorId: confirmadorId ?? Number(interaction.user.id),
    mensagemCliente: mensagem,
    origem: "admin",
  });

  await interaction.editReply(pedidoId ? `✅ Venda \`${pedidoId}\` criada. ${msg}` : `❌ ${msg}`);
}

async function handleVerPedidoModal(interaction: Interaction) {
  if (!interaction.isModalSubmit()) return;
  const pedidoId = interaction.fields.getTextInputValue("pedido").toUpperCase().trim();
  const pedidos = await carregarPedidos();
  const pedido = pedidos[pedidoId];
  if (!pedido) { await interaction.reply({ content: "❌ Pedido não encontrado.", ephemeral: true }); return; }
  await interaction.reply({ embeds: [embedPedidoResumo(pedidoId, pedido)], ephemeral: true });
}

async function handleReenviarPixModal(interaction: Interaction) {
  if (!interaction.isModalSubmit()) return;
  const pedidoId = interaction.fields.getTextInputValue("pedido").toUpperCase().trim();
  const [ok, msg] = await enviarPagamentoCliente(interaction.client, pedidoId);
  await interaction.reply({ content: (ok ? "✅ " : "❌ ") + msg, ephemeral: true });
}

async function handleAprovarIdModal(interaction: Interaction) {
  if (!interaction.isModalSubmit()) return;
  const pedidoId = interaction.fields.getTextInputValue("pedido").toUpperCase().trim();
  await interaction.deferReply({ ephemeral: true });
  const [ok, msg] = await aprovarPedido(interaction.client, pedidoId, Number(interaction.user.id));
  await interaction.editReply((ok ? "✅ " : "❌ ") + msg);
}

async function handleRecusarIdModal(interaction: Interaction) {
  if (!interaction.isModalSubmit()) return;
  const pedidoId = interaction.fields.getTextInputValue("pedido").toUpperCase().trim();
  const motivo = interaction.fields.getTextInputValue("motivo") || "Recusado pela equipe.";
  await interaction.deferReply({ ephemeral: true });
  const [ok, msg] = await recusarPedido(interaction.client, pedidoId, Number(interaction.user.id), motivo);
  await interaction.editReply((ok ? "✅ " : "❌ ") + msg);
}

async function handleConfigModal(interaction: Interaction) {
  if (!interaction.isModalSubmit()) return;
  const nome = interaction.fields.getTextInputValue("nome").trim() || "Loja";
  const confirmadorStr = interaction.fields.getTextInputValue("confirmador").trim();
  const confirmadorId = parseIdUsuario(confirmadorStr);
  const config = await carregarConfig();
  config.nome_loja = nome;
  config.confirmador_padrao_id = confirmadorId;
  await salvarConfig(config);
  await interaction.reply({ content: "✅ Configuração salva.", ephemeral: true });
}

// ─── HANDLER DE UPLOAD DE QR ──────────────────────────────────────────────────
export async function handleQRUpload(interaction: Interaction) {
  // QR uploads are handled via messageCreate in the guild channels
  // This is a no-op placeholder
}
