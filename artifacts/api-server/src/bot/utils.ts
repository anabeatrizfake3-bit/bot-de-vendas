import fs from "node:fs";
import path from "node:path";
import { AttachmentBuilder } from "discord.js";
import { carregarProdutos, carregarEstoqueAuto } from "./data/storage.js";

export function agora(): string {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function limparCodigo(texto: string): string {
  return (texto ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "produto";
}

export function parseIdUsuario(texto: string): number | null {
  if (!texto) return null;
  const m = texto.match(/\d{15,25}/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return isNaN(n) ? null : n;
}

export function converterValor(valor: string): number | null {
  if (!valor) return null;
  const texto = valor.trim().replace(/R\$\s?/g, "").replace(/\s/g, "");
  if (!texto) return null;
  const normalizado = texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto;
  const n = parseFloat(normalizado);
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function converterInt(valor: string, padrao = 1): number {
  const n = parseInt(valor?.trim() ?? "", 10);
  return isNaN(n) ? padrao : Math.max(1, n);
}

export function formatarMoeda(valor: number): string {
  return `R$${valor.toFixed(2)}`.replace(".", ",");
}

export function gerarIdPedido(): string {
  const hex = [...Array(8)].map(() => Math.floor(Math.random() * 16).toString(16)).join("").toUpperCase();
  return `PED-${hex}`;
}

export function ehAdmin(member: { permissions?: { has: (p: bigint) => boolean } }): boolean {
  return Boolean(member?.permissions?.has(8n));
}

export function arquivoParaDiscord(filePath: string | undefined | null): AttachmentBuilder | null {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return new AttachmentBuilder(filePath, { name: path.basename(filePath) });
  } catch {
    return null;
  }
}

export async function obterEstoqueProduto(codigo: string): Promise<number> {
  const produtos = await carregarProdutos();
  const info = produtos[codigo];
  if (!info) return 0;
  if (info.tipo === "automatico") {
    const estoque = await carregarEstoqueAuto();
    const lista = estoque[codigo];
    return Array.isArray(lista) ? lista.length : 0;
  }
  return Number(info.estoque_qtd ?? 0);
}
