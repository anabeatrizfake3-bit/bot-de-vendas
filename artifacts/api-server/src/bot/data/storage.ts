import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { logger } from "../../lib/logger.js";
import type { Config, Produtos, EstoqueAuto, Pedidos } from "./types.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
export const QR_DIR = path.join(DATA_DIR, "qrcodes");
export const COMPROVANTES_DIR = path.join(DATA_DIR, "comprovantes");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const PRODUTOS_FILE = path.join(DATA_DIR, "produtos.json");
const ESTOQUE_AUTO_FILE = path.join(DATA_DIR, "estoque_automatico.json");
const PEDIDOS_FILE = path.join(DATA_DIR, "pedidos.json");

export const COR_PADRAO = 0x8e44ad;

function garantirPastas() {
  for (const dir of [DATA_DIR, QR_DIR, COMPROVANTES_DIR, BACKUP_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function agoraArquivo() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function salvarJson<T>(caminho: string, dados: T): Promise<void> {
  garantirPastas();
  if (fs.existsSync(caminho)) {
    try {
      const nome = path.basename(caminho);
      await fsp.copyFile(caminho, path.join(BACKUP_DIR, `${nome}_${agoraArquivo()}.bak`));
    } catch { /* ignore */ }
  }
  const temp = caminho + ".tmp";
  await fsp.writeFile(temp, JSON.stringify(dados, null, 2), "utf-8");
  await fsp.rename(temp, caminho);
}

async function carregarJson<T>(caminho: string, padrao: T): Promise<T> {
  garantirPastas();
  if (!fs.existsSync(caminho)) {
    await salvarJson(caminho, padrao);
    return JSON.parse(JSON.stringify(padrao)) as T;
  }
  try {
    const conteudo = (await fsp.readFile(caminho, "utf-8")).trim();
    if (!conteudo) return JSON.parse(JSON.stringify(padrao)) as T;
    return JSON.parse(conteudo) as T;
  } catch (err) {
    logger.error({ err, caminho }, "JSON corrompido, usando padrão");
    await salvarJson(caminho, padrao);
    return JSON.parse(JSON.stringify(padrao)) as T;
  }
}

const configPadrao: Config = {
  nome_loja: "Loja",
  cor_embed: COR_PADRAO,
  confirmador_padrao_id: null,
};

export async function carregarConfig(): Promise<Config> {
  const data = await carregarJson<Config>(CONFIG_FILE, configPadrao);
  for (const [k, v] of Object.entries(configPadrao)) {
    if (!(k in data)) (data as unknown as Record<string, unknown>)[k] = v;
  }
  return data;
}
export async function salvarConfig(data: Config): Promise<void> {
  await salvarJson(CONFIG_FILE, data);
}

export async function carregarProdutos(): Promise<Produtos> {
  return carregarJson<Produtos>(PRODUTOS_FILE, {});
}
export async function salvarProdutos(data: Produtos): Promise<void> {
  await salvarJson(PRODUTOS_FILE, data);
}

export async function carregarEstoqueAuto(): Promise<EstoqueAuto> {
  return carregarJson<EstoqueAuto>(ESTOQUE_AUTO_FILE, {});
}
export async function salvarEstoqueAuto(data: EstoqueAuto): Promise<void> {
  await salvarJson(ESTOQUE_AUTO_FILE, data);
}

export async function carregarPedidos(): Promise<Pedidos> {
  return carregarJson<Pedidos>(PEDIDOS_FILE, {});
}
export async function salvarPedidos(data: Pedidos): Promise<void> {
  await salvarJson(PEDIDOS_FILE, data);
}
