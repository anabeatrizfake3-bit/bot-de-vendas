import { Message, ChannelType } from "discord.js";
import path from "node:path";
import fsp from "node:fs/promises";
import { carregarPedidos, salvarPedidos, COMPROVANTES_DIR } from "../data/storage.js";
import { agora } from "../utils.js";
import { enviarComprovanteparaConfirmador, encontrarPedidoPendenteCliente } from "../actions.js";
import { logger } from "../../lib/logger.js";

export async function handleDM(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (message.channel.type !== ChannelType.DM) return;

  const clienteId = message.author.id;
  const pedidos = await carregarPedidos();
  const resultado = encontrarPedidoPendenteCliente(pedidos, Number(clienteId));

  if (!resultado) return;

  const [pedidoId, pedido] = resultado;
  const temAnexo = message.attachments.size > 0;
  if (!temAnexo) return;

  // Salvar comprovantes
  const caminhos: string[] = [...(pedido.comprovantes ?? [])];
  for (const attachment of message.attachments.values()) {
    const ext = path.extname(attachment.name || ".png") || ".png";
    const destino = path.join(COMPROVANTES_DIR, `${pedidoId}_${Date.now()}${ext}`);
    try {
      const resp = await fetch(attachment.url);
      const buf = Buffer.from(await resp.arrayBuffer());
      await fsp.writeFile(destino, buf);
      caminhos.push(destino);
    } catch (err) {
      logger.warn({ err }, "Falha ao salvar comprovante");
    }
  }

  const pedidosAt = await carregarPedidos();
  if (pedidosAt[pedidoId]) {
    pedidosAt[pedidoId].comprovantes = caminhos;
    pedidosAt[pedidoId].comprovante_mensagem = message.content || undefined;
    pedidosAt[pedidoId].status = "aguardando_confirmacao";
    pedidosAt[pedidoId].comprovante_enviado_em = agora();
    await salvarPedidos(pedidosAt);
  }

  await message.reply("✅ Comprovante recebido! Estamos verificando seu pagamento. Aguarde a confirmação da equipe.");

  const [ok, msg] = await enviarComprovanteparaConfirmador(message.client, pedidoId);
  if (!ok) {
    logger.warn({ pedidoId, msg }, "Falha ao encaminhar comprovante");
  }
}
