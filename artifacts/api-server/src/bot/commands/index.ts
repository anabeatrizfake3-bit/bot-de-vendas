import { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from "discord.js";
import { lojaCommand } from "./loja.js";
import { adminCommand } from "./admin.js";
import { ajudaCommand } from "./ajuda.js";

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands: Command[] = [
  lojaCommand,
  adminCommand,
  ajudaCommand,
];

export const commandMap = new Map<string, Command>(
  commands.map((cmd) => [cmd.data.name, cmd]),
);
