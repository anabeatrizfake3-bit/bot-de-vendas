import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  ActivityType,
} from "discord.js";
import { logger } from "../lib/logger.js";
import { commands, commandMap } from "./commands/index.js";
import { handleInteraction } from "./handlers/interactions.js";
import { handleDM } from "./handlers/dm.js";
import { handleQRMessage } from "./handlers/qrupload.js";

export async function startBot() {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN não configurado — bot não vai iniciar");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
  });

  client.once(Events.ClientReady, async (readyClient) => {
    logger.info({ tag: readyClient.user.tag }, "Bot de vendas pronto!");

    readyClient.user.setActivity("a loja", { type: ActivityType.Watching });

    const rest = new REST().setToken(token);
    const commandData = commands.map((c) => c.data.toJSON());

    try {
      logger.info("Registrando slash commands...");
      await rest.put(Routes.applicationCommands(readyClient.user.id), { body: commandData });
      logger.info({ count: commandData.length }, "Slash commands registrados");
    } catch (err) {
      logger.error({ err }, "Falha ao registrar slash commands");
    }
  });

  // Slash commands
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      const command = commandMap.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (err) {
        logger.error({ err, commandName: interaction.commandName }, "Erro no comando");
        const msg = { content: "❌ Ocorreu um erro ao executar esse comando.", ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => null);
        } else {
          await interaction.reply(msg).catch(() => null);
        }
      }
      return;
    }

    // Buttons, modals, select menus
    await handleInteraction(interaction);
  });

  // DMs (comprovantes)
  client.on(Events.MessageCreate, async (message) => {
    await handleDM(message);
    await handleQRMessage(message);
  });

  client.on(Events.GuildCreate, (guild) => {
    logger.info({ guildName: guild.name, guildId: guild.id }, "Bot adicionado a um servidor");
  });

  await client.login(token);
}
