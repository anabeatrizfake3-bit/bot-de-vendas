export interface Config {
  nome_loja: string;
  cor_embed: number;
  confirmador_padrao_id: number | null;
}

export interface Produto {
  nome: string;
  preco: number;
  tipo: "manual" | "automatico";
  ativo: boolean;
  estoque_qtd: number;
  pix_texto?: string;
  mensagem_pagamento?: string;
  mensagem_entrega?: string;
  qr_path?: string;
  criado_em?: string;
  atualizado_em?: string;
}

export interface ContaAutomatica {
  login: string;
  senha: string;
  extra?: string;
  adicionado_em?: string;
  adicionado_por?: number;
}

export interface Pedido {
  id: string;
  cliente_id: number;
  produto_codigo: string;
  produto_nome: string;
  tipo: "manual" | "automatico";
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  confirmador_id: number;
  status: "aguardando_comprovante" | "aguardando_confirmacao" | "aprovado" | "entregue" | "recusado";
  mensagem_cliente?: string;
  comprovante_mensagem?: string;
  comprovantes: string[];
  criado_em: string;
  origem: "loja" | "admin";
  pagamento_enviado_em?: string;
  comprovante_enviado_em?: string;
  aprovado_em?: string;
  aprovado_por?: number;
  recusado_em?: string;
  recusado_por?: number;
  motivo_recusa?: string;
  entregue_em?: string;
  entrega_info?: string;
}

export type Produtos = Record<string, Produto>;
export type EstoqueAuto = Record<string, ContaAutomatica[]>;
export type Pedidos = Record<string, Pedido>;
