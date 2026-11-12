/**
 * Tudo que toca o DOM na galeria. Nada de rede, nada de estado.
 *
 * Três partes: o palco, com a página selecionada em tamanho real e os botões
 * dela; a fita, com todas as páginas na ordem do PDF; e o bloco "+ SOLTE
 * MAIS" no fim da fita. A fita é redesenhada inteira a cada mudança; os
 * botões do palco são fixos e só mudam de estado.
 *
 * Nome de arquivo vem do usuário: entra por textContent e atributo, nunca
 * como HTML.
 */

import { ESPERA_NO_TOQUE_MS, tornaArrastavel } from './drag.js';
import { criaFeedback } from './feedback.js';
import { anguloNaTela, focoDepoisDe, margemEmFracao, proporcaoDaFolha } from './gallery.js';
import { criaPrensa } from './press.js';
import { criaGradeDeLadrilhos } from './tile-grid.js';
import { colunasDaGrade } from './tiles.js';

const ELEMENTOS = {
    galeria: 'galeria',
    formulario: 'formulario',
    area: 'area',
    entrada: 'entrada',
    opcoes: 'opcoes',
    margem: 'margem',
    enviar: 'enviar',
    palco: 'palco',
    folha: 'folha',
    folhaImagem: 'folha-imagem',
    lado: 'lado',
    numeroAtual: 'numero-atual',
    numeroTotal: 'numero-total',
    nomeArquivo: 'nome-arquivo',
    cena: 'cena',
    fita: 'fita',
    maisLadrilhos: 'mais-ladrilhos',
    girarTodas: 'girar-todas',
    barra: 'barra',
    preenchimento: 'preenchimento',
    recado: 'recado',
    acoes: 'acoes',
};

const INTERVALO_POR_LADRILHO_MS = 300;

const doisDigitos = (n) => String(n).padStart(2, '0');

/**
 * Bloco de soltar estreito na fita: 3 colunas. Esticado no palco vazio:
 * a medida do banner.
 */
const medidaDoMais = (largura) =>
    largura < 200 ? { colunas: 3, tamanho: Math.ceil(largura / 3) } : colunasDaGrade(largura);

export function criaInterfaceDaGaleria(acoes) {
    const el = Object.fromEntries(
        Object.entries(ELEMENTOS).map(([chave, id]) => [chave, document.getElementById(id)])
    );

    const feedback = criaFeedback({
        barra: el.barra,
        preenchimento: el.preenchimento,
        recado: el.recado,
    });

    /* Dimensões naturais de cada imagem, por id. A proporção da folha
       depende delas e só se sabe depois do load. */
    const dimensoes = new Map();

    /* Último ângulo desenhado de cada imagem, por id. A rotação guardada
       volta a 0 depois de 270; o ângulo na tela continua andando para a
       imagem não girar para trás (ver anguloNaTela). */
    const angulos = new Map();

    let itensDesenhados = [];
    let selecionadoAtual = null;
    let opcoesAtuais = { tamanho: 'a4', margemMm: 0 };
    let ultimaAcao = null;

    /* ----------------------------------------------------------------
       Geometria da folha: proporção e margem como o PDF vai sair
       ---------------------------------------------------------------- */

    function aplicaFolha(folha, imagem, item) {
        const [largura, altura] = dimensoes.get(item.id) ?? [1, 1];
        const proporcao = proporcaoDaFolha({
            tamanho: opcoesAtuais.tamanho, largura, altura, rotacao: item.rotacao,
        });
        const horizontal = margemEmFracao(opcoesAtuais.margemMm, opcoesAtuais.tamanho, proporcao > 1);

        folha.style.setProperty('--proporcao', String(proporcao));
        folha.style.setProperty('--margem-x', `${horizontal * 100}%`);
        folha.style.setProperty('--margem-y', `${horizontal * proporcao * 100}%`);

        // Quem gira de verdade é o servidor; aqui é só a prévia.
        const angulo = anguloNaTela(angulos.get(item.id), item.rotacao);
        angulos.set(item.id, angulo);
        imagem.dataset.deitada = String(item.rotacao % 180 !== 0);
        imagem.style.setProperty('--rotacao', `${angulo}deg`);
    }

    function lembraDimensoes(imagem, id) {
        imagem.addEventListener('load', () => {
            if (dimensoes.has(id)) return;
            dimensoes.set(id, [imagem.naturalWidth, imagem.naturalHeight]);
            reaplicaGeometria();
        }, { once: true });
    }

    function reaplicaGeometria() {
        const porId = new Map(itensDesenhados.map((item) => [item.id, item]));

        el.fita.querySelectorAll('[data-id]').forEach((li) => {
            const item = porId.get(Number(li.dataset.id));
            if (item) aplicaFolha(li.querySelector('.folha'), li.querySelector('img'), item);
        });

        const selecionado = porId.get(selecionadoAtual);
        if (selecionado) aplicaFolha(el.folha, el.folhaImagem, selecionado);
    }

    /* ----------------------------------------------------------------
       Fita
       ---------------------------------------------------------------- */

    function itemDaFita(item, indice, selecionado) {
        const li = document.createElement('li');
        li.className = 'fita-item';
        li.dataset.id = String(item.id);
        li.classList.toggle('selecionado', selecionado);

        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'fita-botao';
        botao.setAttribute('aria-label', `Página ${indice + 1}: ${item.arquivo.name}`);
        if (selecionado) botao.setAttribute('aria-current', 'true');

        const numero = document.createElement('span');
        numero.className = 'fita-numero mono';
        numero.textContent = doisDigitos(indice + 1);

        const folha = document.createElement('span');
        folha.className = 'folha';
        const area = document.createElement('span');
        area.className = 'folha-area';
        const imagem = document.createElement('img');
        imagem.alt = '';
        imagem.draggable = false;
        lembraDimensoes(imagem, item.id);
        imagem.src = item.url;
        area.append(imagem);
        folha.append(area);

        // A fita é recriada a cada desenho, então a miniatura nasce já no
        // ângulo novo e não gira. Nascer no ângulo de antes e trocar no
        // quadro seguinte faz ela girar junto com a página do palco.
        const antes = angulos.get(item.id);
        aplicaFolha(folha, imagem, item);
        const depois = angulos.get(item.id);
        if (antes !== undefined && antes !== depois) {
            imagem.style.setProperty('--rotacao', `${antes}deg`);
            requestAnimationFrame(() => requestAnimationFrame(() => {
                imagem.style.setProperty('--rotacao', `${depois}deg`);
            }));
        }

        botao.append(numero, folha);
        li.append(botao);
        return li;
    }

    el.girarTodas.addEventListener('click', (evento) => {
        const botao = evento.target.closest('[data-gira-todas]');
        if (botao) acoes.giraTodas?.(Number(botao.dataset.giraTodas));
    });

    el.fita.addEventListener('click', (evento) => {
        const li = evento.target.closest('[data-id]');
        if (li) acoes.seleciona?.(Number(li.dataset.id));
    });

    /**
     * Reordenar arrastando, como atalho dos botões ANTES e DEPOIS. No toque
     * o arrasto só começa depois de segurar: a fita rola com o dedo, e
     * deslizar num item é ambíguo entre reordenar e rolar.
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

            aoMover: ({ dx, dy, evento }) => {
                li.style.transform = `translate(${dx}px, ${dy}px)`;

                // O item arrastado tem pointer-events: none pelo CSS, então o
                // que está embaixo do dedo é o alvo de verdade.
                const sob = document.elementFromPoint(evento.clientX, evento.clientY);
                const itemSob = sob?.closest?.('.fita [data-id]') ?? null;
                marca(itemSob === li ? null : itemSob);
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

    /* ----------------------------------------------------------------
       Palco
       ---------------------------------------------------------------- */

    const botoesDoLado = [...el.lado.querySelectorAll('[data-acao]')];

    el.lado.addEventListener('click', (evento) => {
        const alvo = evento.target.closest('[data-acao]');
        if (!alvo || selecionadoAtual === null) return;

        ultimaAcao = { id: selecionadoAtual, acao: alvo.dataset.acao };
        acoes[alvo.dataset.acao]?.(selecionadoAtual);
    });

    function desenhaPalco(itens, selecionado) {
        const indice = itens.findIndex((item) => item.id === selecionado);
        if (indice === -1) return;

        const item = itens[indice];
        el.folhaImagem.alt = item.arquivo.name;
        if (el.folhaImagem.dataset.id !== String(item.id)) {
            el.folhaImagem.dataset.id = String(item.id);
            lembraDimensoes(el.folhaImagem, item.id);
            el.folhaImagem.src = item.url;
        }
        aplicaFolha(el.folha, el.folhaImagem, item);

        el.numeroAtual.textContent = doisDigitos(indice + 1);
        el.numeroTotal.textContent = doisDigitos(itens.length);
        el.nomeArquivo.textContent = item.arquivo.name;
        el.nomeArquivo.title = item.arquivo.name;

        botoesDoLado.forEach((botao) => {
            const acao = botao.dataset.acao;
            botao.disabled =
                (acao === 'moveTras' && indice === 0) ||
                (acao === 'moveFrente' && indice === itens.length - 1);
        });
    }

    /**
     * Devolve o foco depois de uma ação. Os botões do palco não são
     * destruídos, mas ANTES e DEPOIS ficam desabilitados nos extremos, e
     * remover troca a página: focoDepoisDe decide o destino.
     */
    function devolveFoco(destino) {
        if (!destino) {
            el.entrada.focus();
            return;
        }
        el.lado.querySelector(`[data-acao="${destino.acao}"]`)?.focus();
    }

    /* ----------------------------------------------------------------
       "+ SOLTE MAIS": ladrilhos que giram quando o mouse passa
       ---------------------------------------------------------------- */

    const mais = criaGradeDeLadrilhos(el.maisLadrilhos, { chanceDeForma: 0.55, medida: medidaDoMais });

    el.area.addEventListener('pointerover', (evento) => {
        if (evento.pointerType !== 'mouse') return;

        const alvo = evento.target.closest?.('.ladrilho');
        const celula = alvo && mais.todas().find((c) => c.el === alvo);
        if (!celula) return;

        const agora = performance.now();
        if (agora - celula.ultimoGiroMs < INTERVALO_POR_LADRILHO_MS) return;
        celula.ultimoGiroMs = agora;
        mais.gira(celula);
    });

    return {
        el,
        ...feedback,
        prensa: criaPrensa(el.cena),

        // Nome próprio desta página para o estado indeterminado da barra.
        mostraMontando: feedback.mostraTrabalhando,

        desenha(itens, selecionado, opcoes) {
            opcoesAtuais = opcoes;
            selecionadoAtual = selecionado;

            el.galeria.classList.toggle('vazia', itens.length === 0);
            // Com uma imagem só, girar todas é o mesmo que girar a do palco.
            el.girarTodas.hidden = itens.length < 2;
            el.fita.replaceChildren(
                ...itens.map((item, indice) => {
                    const li = itemDaFita(item, indice, item.id === selecionado);
                    ligaArraste(li, item.id);
                    return li;
                })
            );
            desenhaPalco(itens, selecionado);
            el.fita.querySelector('.selecionado')?.scrollIntoView?.({
                block: 'nearest', inline: 'nearest',
            });

            // Dimensões de quem saiu não servem mais.
            const vivos = new Set(itens.map((item) => item.id));
            [...dimensoes.keys()].forEach((id) => vivos.has(id) || dimensoes.delete(id));
            [...angulos.keys()].forEach((id) => vivos.has(id) || angulos.delete(id));

            if (ultimaAcao) {
                devolveFoco(focoDepoisDe(ultimaAcao.acao, ultimaAcao.id, itensDesenhados, itens));
                ultimaAcao = null;
            }

            itensDesenhados = itens;
        },

        /** A margem não tem efeito quando a página herda o tamanho da imagem. */
        marcaMargemAplicavel(aplicavel) {
            el.margem.disabled = !aplicavel;
            el.opcoes.querySelectorAll('[data-margem]').forEach((botao) => {
                botao.disabled = !aplicavel;
            });
        },

        marcaEnviando(enviando, quantidade) {
            const paginas = quantidade === 1 ? 'PÁG' : 'PÁGS';
            el.enviar.textContent = enviando ? 'MONTANDO…' : `GERAR PDF · ${quantidade} ${paginas}`;
            el.enviar.disabled = enviando || quantidade === 0;
            // Fieldset desabilitado trava tamanho, margem e o botão de uma
            // vez, e devolve cada um ao estado de antes quando reabre.
            el.opcoes.disabled = enviando;
            el.fita.classList.toggle('travada', enviando);
            el.entrada.disabled = enviando;
            el.girarTodas.querySelectorAll('button').forEach((botao) => {
                botao.disabled = enviando;
            });
        },

        marcaArrastando(arrastando) {
            el.area.classList.toggle('arrastando', arrastando);
        },

        /** A cena da prensa toma o lugar da página no palco. */
        mostraCena(visivel) {
            el.palco.classList.toggle('com-cena', visivel);
            el.cena.classList.toggle('oculto', !visivel);
        },

        cenaVisivel: () => !el.cena.classList.contains('oculto'),

        mostraFim({ url, nome }) {
            const baixar = document.createElement('a');
            baixar.className = 'botao botao-vermelho';
            baixar.href = url;
            baixar.download = nome;
            baixar.textContent = 'BAIXAR ↓';

            const novo = document.createElement('button');
            novo.type = 'button';
            novo.className = 'botao botao-creme';
            novo.id = 'novo';
            novo.textContent = 'NOVO PDF';

            el.acoes.replaceChildren(baixar, novo);
        },

        mostraTentarOutro() {
            const outro = document.createElement('button');
            outro.type = 'button';
            outro.className = 'botao botao-creme';
            outro.id = 'outro';
            outro.textContent = 'TENTAR OUTRO';

            el.acoes.replaceChildren(outro);
            outro.focus();
        },

        limpaAcoes() {
            el.acoes.replaceChildren();
        },
    };
}
