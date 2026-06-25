import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { carregarProdutos } from "../data/storage.js";
import { obterEstoqueProduto, limparCodigo } from "../utils.js";
import { embedProdutosPublico } from "../embeds.js";

export const lojaCommand = {
  data: new SlashCommandBuilder()
    .setName("loja")
    .setDescription("Abre a loja e mostra os produtos disponíveis"),
  async execute(interaction: ChatInputCommandInteraction) {
    const produtos = await carregarProdutos();
    const embed = await embedProdutosPublico();

    const opcoes: StringSelectMenuOptionBuilder[] = [];
    for (const [codigo, info] of Object.entries(produtos).sort()) {
      if (!info.ativo) continue;
      const estoque = await obterEstoqueProduto(codigo);
      if (estoque <= 0) continue;
      opcoes.push(
        new StringSelectMenuOptionBuilder()
          .setValue(codigo)
          .setLabel(info.nome.slice(0, 100))
          .setDescription(`R$${Number(info.preco ?? 0).toFixed(2)} — Estoque: ${estoque}`.slice(0, 100)),
      );
    }

    if (opcoes.length === 0) {
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId("loja:select")
      .setPlaceholder("Selecione um produto para comprar...")
      .addOptions(opcoes.slice(0, 25));

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    await interaction.reply({ embeds: [embed], components: [row as never], ephemeral: true });
  },
};
