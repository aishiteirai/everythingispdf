/**
 * Botão de tema: avança o ciclo, grava o cookie, troca o atributo.
 *
 * Quem aplica o tema no carregamento é o servidor, que lê o cookie e
 * renderiza data-tema no <html>. Aqui só trocamos o atributo para o clique
 * valer na hora, sem recarregar a página.
 */

import { proximoTema } from './tema-estado.js';

const UM_ANO_EM_SEGUNDOS = 60 * 60 * 24 * 365;

const raiz = document.documentElement;
const botao = document.getElementById('tema');

botao.addEventListener('click', () => {
    const escolha = proximoTema(raiz.dataset.tema);
    raiz.dataset.tema = escolha;

    // Sem httpOnly de propósito: o servidor precisa ler e este arquivo precisa
    // escrever. Não guarda nada sensível — é preferência de aparência.
    document.cookie =
        `tema=${escolha}; path=/; max-age=${UM_ANO_EM_SEGUNDOS}; samesite=lax`;
});
