export interface Produto {
  id: string;
  codigo: string;
  nome: string;
  resumo: string;
  descricao: string[];
  detalhes: string[];
  preco: number; // centavos
  ncm: string;
  categoria: string;
  /** Ilustração decorativa da vitrine (sempre escondida dos leitores de tela). */
  icone: string;
  cor: string;
}

export const PRODUTOS: Produto[] = [
  {
    id: "caneca-aurora",
    codigo: "CAN-350",
    nome: "Caneca de cerâmica Aurora 350 ml",
    resumo: "Cerâmica esmaltada, alça confortável e acabamento fosco por fora.",
    descricao: [
      "A Aurora é aquela caneca que vira a favorita da casa: boca larga, parede grossa que segura o calor e uma alça que cabe três dedos.",
      "Esmalte por dentro, acabamento fosco por fora e fundo sem esmalte para não riscar a mesa.",
    ],
    detalhes: ["Capacidade: 350 ml", "Pode ir ao micro-ondas e à lava-louças", "Altura: 9,5 cm", "Cor: areia"],
    preco: 4990,
    ncm: "69120000",
    categoria: "Casa e cozinha",
    icone: "☕",
    cor: "#f2e3c9",
  },
  {
    id: "garrafa-serra",
    codigo: "GAR-750",
    nome: "Garrafa térmica Serra 750 ml",
    resumo: "Aço inox de parede dupla: 12 horas quente, 24 horas gelada.",
    descricao: [
      "Leve na mochila e firme na mão. A Serra tem parede dupla a vácuo, tampa com rosca de volta inteira e anel de silicone que não deixa vazar.",
      "A boca é larga o suficiente para cubos de gelo e para lavar com escovinha.",
    ],
    detalhes: ["Capacidade: 750 ml", "Mantém quente por 12 h e gelado por 24 h", "Aço inox 304", "Não vai à lava-louças"],
    preco: 12990,
    ncm: "96170010",
    categoria: "Esporte e lazer",
    icone: "🧴",
    cor: "#cfe5df",
  },
  {
    id: "fone-pulso",
    codigo: "FON-BT5",
    nome: "Fone de ouvido sem fio Pulso",
    resumo: "Bluetooth 5.3, até 30 horas de bateria e cancelamento de ruído.",
    descricao: [
      "O Pulso tem almofadas macias, arco ajustável e botões físicos fáceis de achar pelo tato: volume, faixa e atender chamada.",
      "Avisos de voz em português informam conexão e nível de bateria.",
    ],
    detalhes: ["Bluetooth 5.3", "Bateria: até 30 horas", "Carregamento USB-C", "Cancelamento ativo de ruído", "Peso: 240 g"],
    preco: 34990,
    ncm: "85183000",
    categoria: "Eletrônicos",
    icone: "🎧",
    cor: "#d9d6f2",
  },
  {
    id: "teclado-tecla-viva",
    codigo: "TEC-75",
    nome: "Teclado mecânico compacto Tecla Viva",
    resumo: "Layout ABNT2 75%, switches táteis e marcação em relevo no F e no J.",
    descricao: [
      "Compacto sem perder as setas e as teclas de função. Os switches táteis dão retorno claro a cada toque, sem o clique barulhento.",
      "Funciona com fio USB-C ou sem fio por Bluetooth, com até três dispositivos pareados.",
    ],
    detalhes: ["Layout ABNT2 (75%)", "Switches táteis", "Conexão USB-C e Bluetooth", "Bateria: até 200 horas sem iluminação"],
    preco: 42990,
    ncm: "84716052",
    categoria: "Eletrônicos",
    icone: "⌨️",
    cor: "#e3e7ea",
  },
  {
    id: "mochila-trilha",
    codigo: "MOC-20",
    nome: "Mochila urbana Trilha 20 L",
    resumo: "Compartimento acolchoado para notebook de até 15,6 polegadas.",
    descricao: [
      "Tecido resistente à água, zíperes que deslizam fácil e alças com espuma respirável.",
      "Bolso frontal organizador, bolso lateral para garrafa e um bolso escondido nas costas para documentos.",
    ],
    detalhes: ["Capacidade: 20 litros", "Notebook de até 15,6\"", "Tecido resistente à água", "Garantia de 1 ano"],
    preco: 23990,
    ncm: "42029200",
    categoria: "Acessórios",
    icone: "🎒",
    cor: "#f6d4c4",
  },
  {
    id: "luminaria-farol",
    codigo: "LUM-LED",
    nome: "Luminária de mesa Farol LED",
    resumo: "Braço articulado, três tons de luz e cinco níveis de brilho.",
    descricao: [
      "A Farol ilumina a mesa sem ofuscar: luz difusa, sem cintilação, com três temperaturas de cor para cada momento do dia.",
      "Controles por toque na base e porta USB para carregar o celular.",
    ],
    detalhes: ["Potência: 8 W", "3 temperaturas de cor", "5 níveis de brilho", "Porta USB-A na base", "Bivolt"],
    preco: 15990,
    ncm: "94052000",
    categoria: "Casa e cozinha",
    icone: "💡",
    cor: "#f7efc2",
  },
  {
    id: "camiseta-basica",
    codigo: "CAM-ALG",
    nome: "Camiseta básica de algodão",
    resumo: "Algodão penteado, gola careca reforçada e caimento reto.",
    descricao: [
      "A básica que combina com tudo: malha de algodão penteado, macia desde a primeira lavagem e com costura dupla na barra.",
      "Etiqueta estampada direto no tecido, para não pinicar.",
    ],
    detalhes: ["100% algodão penteado", "Tamanho único M", "Cor: verde-musgo", "Lavar à máquina em água fria"],
    preco: 6990,
    ncm: "61091000",
    categoria: "Moda",
    icone: "👕",
    cor: "#d6e4cc",
  },
  {
    id: "livro-cafe-coado",
    codigo: "LIV-CAF",
    nome: "Livro: Pequeno guia do café coado",
    resumo: "Do grão à xícara, com receitas e medidas para cada método.",
    descricao: [
      "Um guia curto e direto para quem quer fazer um café coado melhor em casa: moagem, proporção, temperatura da água e tempo de extração.",
      "Inclui tabela de medidas e dez receitas testadas.",
    ],
    detalhes: ["Capa brochura", "128 páginas", "Idioma: português", "Edição fictícia"],
    preco: 5490,
    ncm: "49019900",
    categoria: "Livros",
    icone: "📖",
    cor: "#ead9c6",
  },
];

export const produtoPorId = (id: string) => PRODUTOS.find((p) => p.id === id);

export const UFS: [string, string][] = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"], ["CE", "Ceará"],
  ["DF", "Distrito Federal"], ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"],
  ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"],
  ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"],
  ["SE", "Sergipe"], ["TO", "Tocantins"],
];

export type TipoEntrega = "economica" | "expressa";

export const ENTREGAS: Record<TipoEntrega, { nome: string; prazo: string; preco: number; gratisAcima?: number }> = {
  economica: { nome: "Entrega econômica", prazo: "5 a 8 dias úteis", preco: 1990, gratisAcima: 29900 },
  expressa: { nome: "Entrega expressa", prazo: "1 a 3 dias úteis", preco: 3490 },
};

export function valorFrete(tipo: TipoEntrega, subtotal: number): number {
  const e = ENTREGAS[tipo];
  return e.gratisAcima !== undefined && subtotal >= e.gratisAcima ? 0 : e.preco;
}

export const PAGAMENTOS = {
  pix: "Pix",
  boleto: "Boleto bancário",
  cartao: "Cartão de crédito",
} as const;

export const dinheiro = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
