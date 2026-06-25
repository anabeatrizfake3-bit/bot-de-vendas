import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { enviarPainelAdmin } from "../handlers/interactions.js";

export const adminCommand = {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Abre o painel administrativo da loja")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction: ChatInputCommandInteraction) {
    await enviarPainelAdmin(interaction);
  },
};
