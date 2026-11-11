/**
 * Regra da cena da prensa: em que estado a conversão está, o que cada
 * evento faz com ela e que forma cada tipo de arquivo vira.
 *
 * Sem DOM: quem desenha é `press.js`. A tabela fica aqui, com teste, porque
 * é nela que moram os casos traiçoeiros — arquivo solto com a prensa
 * batendo, upload que vai de 0% direto ao fim.
 */

import { extensaoDe } from './format.js';

const FORMA_POR_EXTENSAO = {
    docx: 'quadrado', doc: 'quadrado', odt: 'quadrado',
    xlsx: 'triangulo', xls: 'triangulo',
    pptx: 'circulo', ppt: 'circulo', odp: 'circulo',
    png: 'meio', jpg: 'meio', jpeg: 'meio',
};

export const COR_DA_FORMA = {
    quadrado: '#e8452c',
    triangulo: '#2453d6',
    circulo: '#f2b705',
    meio: '#000000',
};

/** Documento é quadrado, planilha triângulo, apresentação círculo, imagem
 *  semicírculo. O que não estiver na lista cai no quadrado. */
export function formaDoArquivo(nome) {
    return FORMA_POR_EXTENSAO[extensaoDe(nome)] ?? 'quadrado';
}

/*
 * `servidor` é o upload terminado: o XHR passou a esperar a resposta. Pode
 * chegar sem nenhum `progresso` antes — arquivo pequeno vai de 0% ao fim
 * num evento só.
 */
const TRANSICOES = {
    esperando: { escolheu: 'enviando' },
    enviando: { progresso: 'enviando', servidor: 'convertendo', sucesso: 'pronto', falha: 'erro' },
    convertendo: { servidor: 'convertendo', sucesso: 'pronto', falha: 'erro' },
    pronto: { escolheu: 'enviando', reinicia: 'esperando' },
    erro: { escolheu: 'enviando', reinicia: 'esperando' },
};

/** Próximo estado, ou null se o evento não vale nesse estado. */
export function transicao(estado, evento) {
    return TRANSICOES[estado]?.[evento] ?? null;
}

/** Arquivo novo só entra fora do trabalho: com a prensa batendo, é
 *  ignorado e a cena não reinicia. */
export function aceitaArquivo(estado) {
    return transicao(estado, 'escolheu') !== null;
}

/** Posição da forma na esteira, de `inicio` (0%) a `fim` (100%). */
export function posicaoNaEsteira(pct, inicio, fim) {
    const limitado = Math.min(100, Math.max(0, pct));
    return inicio + (fim - inicio) * (limitado / 100);
}
