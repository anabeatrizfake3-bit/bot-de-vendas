import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { embedAjuda } from "../embeds.js";
import { ehAdmin } from "../utils.js";

export const ajudaCommand = {
  data: new SlashCommandBuilder()
    .setName("ajuda")
    .setDescription("Mostra a ajuda da loja"),
  async execute(interaction: ChatInputCommandInteraction) {
    const isAdmin = interaction.member
      ? ehAdmin(interaction.member as { permissions?: { has: (p: bigint) => boolean } })
      : false;
    const embed = embedAjuda(isAdmin);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
