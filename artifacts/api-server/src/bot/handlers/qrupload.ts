import { Message, ChannelType } from "discord.js";
import path from "node:path";
import fsp from "node:fs/promises";
import { aguardandoQR } from "./interactions.js";
import { carregarProdutos, salvarProdutos, QR_DIR } from "../data/storage.js";
import { agora } from "../utils.js";
import { logger } from "../../lib/logger.js";

export async function handleQRMessage(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (message.channel.type === ChannelType.DM) return;

  const userId = message.author.id;
  if (!aguardandoQR.has(userId)) return;
  if (message.attachments.size === 0) return;

  const codigo = aguardandoQR.get(userId)!;
  aguardandoQR.delete(userId);

  const attachment = message.attachments.first()!;
  const ext = path.extname(attachment.name || ".png") || ".png";
  const destino = path.join(QR_DIR, `${codigo}${ext}`);

  try {
    const resp = await fetch(attachment.url);
    const buf = Buffer.from(await resp.arrayBuffer());
    await fsp.writeFile(destino, buf);

    const produtos = await carregarProdutos();
    if (produtos[codigo]) {
      produtos[codigo].qr_path = destino;
      produtos[codigo].atualizado_em = agora();
      await salvarProdutos(produtos);
    }

    await message.reply(`✅ QR Code salvo para o produto \`${codigo}\`!`);
  } catch (err) {
    logger.error({ err }, "Falha ao salvar QR Code");
    await message.reply("❌ Erro ao salvar o QR Code. Tente novamente.");
  }
}
