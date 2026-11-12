/**
 * Painel de ferramentas: todas as ações de edição num lugar só.
 *
 * Desktop: uma coluna com seções ("ESTA PÁGINA", "TODAS"), cada botão com
 * ícone e rótulo escrito. Seção de passos ("POSIÇÃO") é um valor entre dois
 * botões, como "‹ 02 / 03 ›". Celular: uma barra na base da tela com as ações
 * essenciais, só ícone, e um botão "mais" que abre uma gaveta com o resto.
 * As duas versões estão sempre no DOM e o CSS mostra uma ou outra.
 *
 * Quem usa descreve as seções como dados (ver toolbox-state.js) e recebe o
 * nome da ação em `aoAcionar`. O painel não sabe o que as ações fazem: serve
 * à galeria hoje e ao editor de PDF depois.
 */

import { icone } from './icons.js';
import { divideAcoes, validaSecoes } from './toolbox-state.js';

let sequencia = 0;

function botao({ acao, icone: nome, rotulo, descricao, perigo }, { comRotulo, secao }) {
    const elemento = document.createElement('button');
    elemento.type = 'button';
    elemento.className = 'painel-botao';
    elemento.dataset.acao = acao;
    elemento.dataset.perigo = String(Boolean(perigo));
    elemento.title = descricao;
    elemento.setAttribute('aria-label', descricao);
    elemento.append(icone(nome));

    if (comRotulo) {
        const texto = document.createElement('span');
        texto.className = 'painel-rotulo';
        texto.textContent = rotulo;
        elemento.append(texto);
    }
    if (secao) {
        const contexto = document.createElement('small');
        contexto.className = 'painel-secao-curta';
        contexto.textContent = secao;
        elemento.append(contexto);
    }

    return elemento;
}

/** "‹ valor ›": o valor fica entre os dois botões e é atualizado por id. */
function passos(secao) {
    const [menos, mais] = secao.acoes;

    const grupo = document.createElement('div');
    grupo.className = 'painel-passos';

    const valor = document.createElement('span');
    valor.className = 'painel-valor';
    valor.dataset.valor = secao.id;

    grupo.append(botao(menos, { comRotulo: false }), valor, botao(mais, { comRotulo: false }));
    return grupo;
}

export function criaPainel(raiz, { secoes, aoAcionar }) {
    validaSecoes(secoes);
    const { barra: daBarra, gaveta } = divideAcoes(secoes);

    sequencia += 1;
    const idDaGaveta = `painel-gaveta-${sequencia}`;

    /* ---------- Desktop: seções ---------- */

    const colunas = document.createElement('div');
    colunas.className = 'painel-secoes';

    secoes.forEach((descrita) => {
        const secao = document.createElement('section');
        secao.className = 'painel-secao';

        const cabecalho = document.createElement('h2');
        cabecalho.className = 'painel-titulo';
        cabecalho.textContent = descrita.titulo;
        secao.append(cabecalho);

        if (descrita.passos) {
            secao.append(passos(descrita));
        } else {
            secao.append(...descrita.acoes.map((acao) => botao(acao, { comRotulo: true })));
        }

        if (descrita.dica) {
            const dica = document.createElement('p');
            dica.className = 'painel-dica';
            dica.textContent = descrita.dica;
            secao.append(dica);
        }

        colunas.append(secao);
    });

    /* ---------- Celular: barra e gaveta ---------- */

    const barra = document.createElement('div');
    barra.className = 'painel-barra';
    barra.append(...daBarra.map((item) => (
        item.tipo === 'passos' ? passos(item.secao) : botao(item.acao, { comRotulo: false })
    )));

    const caixaDaGaveta = document.createElement('div');
    caixaDaGaveta.className = 'painel-gaveta';
    caixaDaGaveta.id = idDaGaveta;
    caixaDaGaveta.hidden = true;
    caixaDaGaveta.append(
        ...gaveta.map((acao) => botao(acao, { comRotulo: true, secao: acao.secao }))
    );

    const mais = document.createElement('button');
    mais.type = 'button';
    mais.className = 'painel-mais';
    mais.title = 'Mais ações';
    mais.setAttribute('aria-label', 'Mais ações');
    mais.setAttribute('aria-expanded', 'false');
    mais.setAttribute('aria-controls', idDaGaveta);
    mais.append(icone('ellipsis'));
    mais.hidden = gaveta.length === 0;
    barra.append(mais);

    const celular = document.createElement('div');
    celular.className = 'painel-celular';
    celular.append(caixaDaGaveta, barra);

    raiz.replaceChildren(colunas, celular);

    /* ---------- Gaveta ---------- */

    const gavetaAberta = () => !caixaDaGaveta.hidden;

    function abreGaveta(aberta) {
        caixaDaGaveta.hidden = !aberta;
        mais.setAttribute('aria-expanded', String(aberta));
        mais.classList.toggle('aberto', aberta);
    }

    mais.addEventListener('click', () => {
        abreGaveta(!gavetaAberta());
        if (gavetaAberta()) caixaDaGaveta.querySelector('button:not(:disabled)')?.focus();
    });

    document.addEventListener('click', (evento) => {
        if (gavetaAberta() && !celular.contains(evento.target)) abreGaveta(false);
    });

    raiz.addEventListener('keydown', (evento) => {
        if (evento.key !== 'Escape' || !gavetaAberta()) return;
        abreGaveta(false);
        mais.focus();
    });

    /* ---------- Ações ---------- */

    raiz.addEventListener('click', (evento) => {
        const alvo = evento.target.closest('[data-acao]');
        if (!alvo || alvo.disabled) return;

        if (caixaDaGaveta.contains(alvo)) abreGaveta(false);
        aoAcionar(alvo.dataset.acao);
    });

    // Cada ação existe em dois botões, um do desktop e um do celular.
    const botoesDe = (acao) => [...raiz.querySelectorAll(`[data-acao="${acao}"]`)];

    const desligadas = new Set();
    let travado = false;

    function aplicaEstado() {
        raiz.querySelectorAll('[data-acao]').forEach((elemento) => {
            elemento.disabled = travado || desligadas.has(elemento.dataset.acao);
        });
        mais.disabled = travado;
        if (travado) abreGaveta(false);
    }

    return {
        el: raiz,

        /** Texto entre os botões de uma seção de passos, nas duas versões. */
        mostraValor(id, texto) {
            raiz.querySelectorAll(`[data-valor="${id}"]`).forEach((elemento) => {
                elemento.textContent = texto;
            });
        },

        /** Liga ou desliga uma ação, nas duas versões. */
        habilita(acao, habilitada) {
            if (habilitada) desligadas.delete(acao);
            else desligadas.add(acao);
            aplicaEstado();
        },

        /** Trava tudo durante a geração, sem perder quem já estava desligado. */
        trava(sim) {
            travado = sim;
            aplicaEstado();
        },

        /**
         * Põe o foco no botão da ação que está na tela. Se ela mora na gaveta
         * fechada do celular, o foco vai para o botão que abre a gaveta.
         */
        foca(acao) {
            const visivel = botoesDe(acao).find((elemento) => elemento.getClientRects().length > 0);
            if (visivel && !visivel.disabled) {
                visivel.focus();
                return;
            }
            if (caixaDaGaveta.contains(botoesDe(acao).at(-1)) && mais.getClientRects().length) {
                mais.focus();
            }
        },
    };
}
