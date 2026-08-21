/**
 * Tudo que toca o DOM na página de conversão. Nada de rede, nada de validação.
 */

import { formataTamanho } from './format.js';
import { criaFeedback } from './feedback.js';

const ELEMENTOS = {
    formulario: 'formulario',
    area: 'area',
    entrada: 'entrada',
    selecionado: 'selecionado',
    nome: 'nome',
    tamanho: 'tamanho',
    remover: 'remover',
    enviar: 'enviar',
    barra: 'barra',
    preenchimento: 'preenchimento',
    recado: 'recado',
};

export function criaInterface() {
    const el = Object.fromEntries(
        Object.entries(ELEMENTOS).map(([chave, id]) => [chave, document.getElementById(id)])
    );

    const feedback = criaFeedback({
        barra: el.barra,
        preenchimento: el.preenchimento,
        recado: el.recado,
    });

    return {
        el,
        ...feedback,

        // Nome próprio desta página para o estado indeterminado da barra.
        mostraConvertendo: feedback.mostraTrabalhando,

        mostraArquivo(arquivo) {
            el.nome.textContent = arquivo.name;
            el.tamanho.textContent = formataTamanho(arquivo.size);
            el.selecionado.classList.remove('oculto');
            el.enviar.disabled = false;
        },

        escondeArquivo() {
            el.entrada.value = '';
            el.selecionado.classList.add('oculto');
            el.enviar.disabled = true;
        },

        marcaEnviando(enviando, temArquivo) {
            el.enviar.textContent = enviando ? 'Convertendo...' : 'Converter para PDF';
            el.enviar.disabled = enviando || !temArquivo;
        },

        marcaArrastando(arrastando) {
            el.area.classList.toggle('arrastando', arrastando);
        },
    };
}
