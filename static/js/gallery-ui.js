/**
 * Tudo que toca o DOM na galeria. Nada de rede, nada de estado.
 *
 * A grade é redesenhada inteira a cada mudança e os cliques são capturados por
 * delegação na lista: assim não há listener por botão para religar depois de
 * cada render.
 */

import { ESPERA_NO_TOQUE_MS, tornaArrastavel } from './drag.js';
import { criaFeedback } from './feedback.js';
import { focoDepoisDe } from './gallery.js';

const ELEMENTOS = {
    formulario: 'formulario',
    area: 'area',
    entrada: 'entrada',
    grade: 'grade',
    opcoes: 'opcoes',
    tamanho: 'tamanho',
    margem: 'margem',
    enviar: 'enviar',
    barra: 'barra',
    preenchimento: 'preenchimento',
    recado: 'recado',
};

/**
 * Os botões são o mecanismo principal de reordenar, não o arrasto:
 * drag-and-drop HTML5 não dispara em toque, e reordenar só por arrasto é
 * inacessível por teclado e por leitor de tela.
 */
const ACOES = [
    { acao: 'giraEsquerda', simbolo: '↺', titulo: 'Girar para a esquerda' },
    { acao: 'giraDireita', simbolo: '↻', titulo: 'Girar para a direita' },
    { acao: 'moveTras', simbolo: '←', titulo: 'Mover para trás' },
    { acao: 'moveFrente', simbolo: '→', titulo: 'Mover para frente' },
    { acao: 'remove', simbolo: '×', titulo: 'Remover imagem' },
];

function botao({ acao, simbolo, titulo }, desabilitado) {
    const elemento = document.createElement('button');
    // Sem type="button" o clique submeteria o formulário.
    elemento.type = 'button';
    // Classe fixa e variacao por data-acao: o CSS diferencia com
    // [data-acao="remove"], sem nome de classe montado em tempo de execucao.
    elemento.className = 'pagina-acao';
    elemento.dataset.acao = acao;
    elemento.textContent = simbolo;
    elemento.title = titulo;
    elemento.setAttribute('aria-label', titulo);
    elemento.disabled = Boolean(desabilitado);
    return elemento;
}

function cartao(item, indice, total) {
    const li = document.createElement('li');
    li.className = 'pagina';
    li.dataset.id = String(item.id);

    const numero = document.createElement('span');
    numero.className = 'pagina-numero';
    numero.textContent = String(indice + 1);

    const caixa = document.createElement('div');
    caixa.className = 'pagina-caixa';

    // Caixa quadrada com object-fit: contain, então girar 90° cabe sem
    // recalcular layout. O byte original nunca é tocado no cliente -- quem
    // gira de verdade é o servidor.
    const imagem = document.createElement('img');
    imagem.className = 'pagina-imagem';
    imagem.src = item.url;
    imagem.alt = item.arquivo.name;
    imagem.style.transform = `rotate(${item.rotacao}deg)`;
    caixa.append(imagem);

    // textContent, não innerHTML: o nome vem do usuário.
    const nome = document.createElement('span');
    nome.className = 'pagina-nome';
    nome.textContent = item.arquivo.name;
    nome.title = item.arquivo.name;

    const acoes = document.createElement('div');
    acoes.className = 'pagina-acoes';
    ACOES.forEach((definicao) => {
        const nosExtremos =
            (definicao.acao === 'moveTras' && indice === 0) ||
            (definicao.acao === 'moveFrente' && indice === total - 1);
        acoes.append(botao(definicao, nosExtremos));
    });

    li.append(numero, caixa, nome, acoes);
    return li;
}

const idDoAlvo = (alvo) => {
    const cartaoDoAlvo = alvo?.closest?.('[data-id]');
    return cartaoDoAlvo ? Number(cartaoDoAlvo.dataset.id) : null;
};

/**
 * Devolve o foco ao destino calculado. Sem destino -- a galeria ficou vazia --
 * manda para o campo de arquivo: e a proxima coisa que o usuario vai fazer, e
 * o :focus-within da area de soltar deixa o foco visivel.
 */
function devolveFoco(el, destino) {
    if (!destino) {
        el.entrada.focus();
        return;
    }

    const seletor = `[data-id="${destino.id}"] [data-acao="${destino.acao}"]`;
    el.grade.querySelector(seletor)?.focus();
}

export function criaInterfaceDaGaleria(acoes) {
    const el = Object.fromEntries(
        Object.entries(ELEMENTOS).map(([chave, id]) => [chave, document.getElementById(id)])
    );

    const feedback = criaFeedback({
        barra: el.barra,
        preenchimento: el.preenchimento,
        recado: el.recado,
    });

    // A grade e redesenhada inteira a cada acao, o que destroi o botao
    // clicado. Guardar qual foi permite devolver o foco depois do redesenho,
    // em vez de largar o teclado no topo da pagina.
    let ultimaAcao = null;
    let itensDesenhados = [];

    el.grade.addEventListener('click', (evento) => {
        const alvo = evento.target.closest('[data-acao]');
        if (!alvo) return;

        const id = idDoAlvo(alvo);
        if (id === null) return;

        ultimaAcao = { id, acao: alvo.dataset.acao };
        acoes[alvo.dataset.acao]?.(id);
    });

    /**
     * Reordenar arrastando. Antes usava drag-and-drop HTML5, que nao dispara
     * em toque -- no celular so os botoes funcionavam.
     *
     * No toque o arrasto so comeca depois de segurar: a pagina da galeria
     * rola, e deslizar o dedo num cartao e ambiguo entre reordenar e rolar.
     */
    function ligaArraste(li, id) {
        let alvo = null;

        const marca = (novo) => {
            if (novo === alvo) return;
            alvo?.classList.remove('alvo');
            alvo = novo;
            alvo?.classList.add('alvo');
        };

        tornaArrastavel(li, {
            esperaNoToqueMs: ESPERA_NO_TOQUE_MS,
            // Ponteiro que desce num botao de acao aciona o botao, nao arrasta
            // o cartao.
            ignorar: '[data-acao]',

            aoMover: ({ dx, dy, evento }) => {
                li.style.transform = `translate(${dx}px, ${dy}px)`;

                // O cartao arrastado tem pointer-events: none pelo CSS, entao
                // o que esta embaixo do dedo e o alvo de verdade.
                const sob = document.elementFromPoint(evento.clientX, evento.clientY);
                const cartaoSob = sob?.closest?.('[data-id]') ?? null;
                marca(cartaoSob === li ? null : cartaoSob);
            },

            aoSoltar: ({ cancelado }) => {
                li.style.transform = '';
                const destino = alvo;
                marca(null);

                if (cancelado || !destino) return;
                acoes.reordena?.(id, Number(destino.dataset.id));
            },
        });
    }

    return {
        el,
        ...feedback,

        // Nome próprio desta página para o estado indeterminado da barra.
        mostraMontando: feedback.mostraTrabalhando,

        desenha(itens) {
            el.grade.replaceChildren(
                ...itens.map((item, indice) => {
                    const li = cartao(item, indice, itens.length);
                    ligaArraste(li, item.id);
                    return li;
                })
            );
            el.grade.classList.toggle('oculto', itens.length === 0);
            el.opcoes.classList.toggle('oculto', itens.length === 0);
            el.entrada.value = '';

            if (ultimaAcao) {
                devolveFoco(el, focoDepoisDe(
                    ultimaAcao.acao, ultimaAcao.id, itensDesenhados, itens
                ));
                ultimaAcao = null;
            }

            itensDesenhados = itens;
        },

        /** A margem não tem efeito quando a página herda o tamanho da imagem. */
        marcaMargemAplicavel(aplicavel) {
            el.margem.disabled = !aplicavel;
        },

        marcaEnviando(enviando, quantidade) {
            const plural = quantidade === 1 ? 'imagem' : 'imagens';
            el.enviar.textContent = enviando
                ? 'Montando PDF...'
                : `Gerar PDF (${quantidade} ${plural})`;
            el.enviar.disabled = enviando || quantidade === 0;
        },

        marcaArrastando(arrastando) {
            el.area.classList.toggle('arrastando', arrastando);
        },
    };
}
