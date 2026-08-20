/**
 * Tudo que toca o DOM. Nada de rede, nada de validação.
 */

import { formataTamanho } from './formato.js';

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

    let urlAnterior = null;

    return {
        el,

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

        mostraErro(texto) {
            el.recado.className = 'recado erro';
            el.recado.textContent = texto;
        },

        /**
         * Monta o recado de sucesso por DOM, não por innerHTML: o nome do
         * arquivo vem do usuário e passaria HTML direto para a página.
         *
         * O link fica na mensagem porque, se o navegador bloquear o download
         * automático, o usuário ainda precisa de um jeito de pegar o arquivo.
         */
        mostraSucesso(url, nomeArquivo) {
            el.recado.className = 'recado sucesso';
            el.recado.textContent = 'Pronto. Se o download não começou, ';

            const link = document.createElement('a');
            link.href = url;
            link.download = nomeArquivo;
            link.textContent = 'baixe aqui';
            el.recado.append(link, '.');
        },

        limpaRecado() {
            el.recado.className = 'recado oculto';
            el.recado.textContent = '';
        },

        mostraProgresso(porcentagem) {
            el.barra.classList.remove('oculto', 'indeterminada');
            el.preenchimento.style.width = `${porcentagem}%`;
            el.barra.setAttribute('aria-valuenow', String(Math.round(porcentagem)));
        },

        mostraConvertendo() {
            el.barra.classList.remove('oculto');
            el.barra.classList.add('indeterminada');
            el.barra.removeAttribute('aria-valuenow');
        },

        escondeProgresso() {
            el.barra.classList.add('oculto');
        },

        marcaEnviando(enviando, temArquivo) {
            el.enviar.textContent = enviando ? 'Convertendo...' : 'Converter para PDF';
            el.enviar.disabled = enviando || !temArquivo;
        },

        marcaArrastando(arrastando) {
            el.area.classList.toggle('arrastando', arrastando);
        },

        baixa(blob, nomeArquivo) {
            if (urlAnterior) URL.revokeObjectURL(urlAnterior);
            urlAnterior = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = urlAnterior;
            link.download = nomeArquivo;
            document.body.appendChild(link);
            link.click();
            link.remove();

            return urlAnterior;
        },
    };
}
