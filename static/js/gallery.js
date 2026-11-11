/**
 * Estado da galeria: quais imagens, em que ordem, giradas quanto.
 *
 * Sem DOM e sem rede de propósito — é o que torna reordenar e girar
 * testáveis sem navegador (ver tests/js/gallery.test.mjs).
 */

const URLS_DO_NAVEGADOR = {
    cria: (arquivo) => URL.createObjectURL(arquivo),
    revoga: (url) => URL.revokeObjectURL(url),
};

/**
 * `urls` é injetável para o estado não depender do navegador. Quem cria a URL
 * também a revoga: uma URL de objeto que não é revogada segura o arquivo
 * inteiro na memória da aba até a página ser fechada.
 */
export function criaGaleria({ maxImagens, urls = URLS_DO_NAVEGADOR }) {
    let itens = [];
    let sequencia = 0;
    // A página em foco no palco. Null só com a galeria vazia.
    let selecionado = null;

    const vagas = () => Math.max(0, maxImagens - itens.length);
    const posicaoDe = (id) => itens.findIndex((item) => item.id === id);

    return {
        itens: () => itens.slice(),
        total: () => itens.length,
        vagas,
        selecionado: () => selecionado,

        seleciona(id) {
            if (posicaoDe(id) === -1) return false;

            selecionado = id;
            return true;
        },

        /**
         * Adiciona no fim: adicionar não substitui o que já está na lista.
         * Devolve quantos entraram e quantos não couberam no teto.
         */
        adiciona(arquivos) {
            const cabem = arquivos.slice(0, vagas());
            const primeiroNovo = sequencia + 1;

            cabem.forEach((arquivo) => {
                sequencia += 1;
                itens.push({
                    id: sequencia,
                    arquivo,
                    rotacao: 0,
                    url: urls.cria(arquivo),
                });
            });

            // Galeria vazia ganha seleção; adicionar mais não tira o foco de
            // quem estava sendo conferido.
            if (selecionado === null && cabem.length) selecionado = primeiroNovo;

            return { adicionados: cabem.length, recusados: arquivos.length - cabem.length };
        },

        remove(id) {
            const posicao = posicaoDe(id);
            if (posicao === -1) return false;

            urls.revoga(itens[posicao].url);
            itens = itens.filter((item) => item.id !== id);

            // Saiu a selecionada: a seleção vai para quem tomou o lugar dela,
            // ou para a anterior se ela era a última.
            if (selecionado === id) {
                const vizinho = itens[Math.min(posicao, itens.length - 1)];
                selecionado = vizinho ? vizinho.id : null;
            }
            return true;
        },

        limpa() {
            itens.forEach((item) => urls.revoga(item.url));
            itens = [];
            selecionado = null;
        },

        /** Troca com o vizinho. Nos extremos não faz nada e devolve false. */
        move(id, passo) {
            const de = posicaoDe(id);
            if (de === -1) return false;

            const para = de + passo;
            if (para < 0 || para >= itens.length) return false;

            const copia = itens.slice();
            [copia[de], copia[para]] = [copia[para], copia[de]];
            itens = copia;
            return true;
        },

        /** Move `id` para a posição de `destinoId`, empurrando o resto. */
        reordena(id, destinoId) {
            const de = posicaoDe(id);
            const para = posicaoDe(destinoId);
            if (de === -1 || para === -1 || de === para) return false;

            const copia = itens.slice();
            const [movido] = copia.splice(de, 1);
            copia.splice(para, 0, movido);
            itens = copia;
            return true;
        },

        /**
         * Acumula em módulo 360: girar quatro vezes volta ao original, e a API
         * só aceita 0, 90, 180 e 270.
         */
        gira(id, graus) {
            const posicao = posicaoDe(id);
            if (posicao === -1) return false;

            const item = itens[posicao];
            itens[posicao] = { ...item, rotacao: (item.rotacao + graus + 360) % 360 };
            return true;
        },
    };
}

/**
 * Para onde vai o foco depois de uma ação redesenhar a grade.
 *
 * A grade é redesenhada inteira a cada ação, então o botão clicado é destruído
 * e o foco do teclado se perde — quem usa teclado ou leitor de tela volta ao
 * topo a cada rotação. Esta função decide o destino a partir da lista antes e
 * depois; quem aplica é `gallery-ui.js`.
 *
 * Devolve `{ id, acao }`, ou `null` quando não há destino sensato.
 */

const OPOSTO = { moveTras: 'moveFrente', moveFrente: 'moveTras' };

/** Primeira ação da fileira, e não destrutiva. */
const ACAO_NEUTRA = 'giraEsquerda';

export function focoDepoisDe(acao, id, antes, depois) {
    const posicaoDepois = depois.findIndex((item) => item.id === id);

    if (posicaoDepois !== -1) {
        // Nos extremos o botão clicado fica desabilitado: manter o foco nele
        // deixaria o teclado preso num controle inerte.
        const virouInerte =
            (acao === 'moveTras' && posicaoDepois === 0) ||
            (acao === 'moveFrente' && posicaoDepois === depois.length - 1);

        return { id, acao: virouInerte ? OPOSTO[acao] : acao };
    }

    if (depois.length === 0) return null;

    // O item saiu da lista. Foca quem tomou o lugar dele, na mesma posição
    // visual, numa ação que não apaga nada: focar o próprio remover deixaria
    // uma sequência de Enter apagando a galeria inteira.
    const posicaoAntes = antes.findIndex((item) => item.id === id);
    if (posicaoAntes === -1) return null;

    const substituto = depois[Math.min(posicaoAntes, depois.length - 1)];

    return { id: substituto.id, acao: ACAO_NEUTRA };
}

/* ----------------------------------------------------------------
   Geometria da folha no palco

   A prévia mostra a página como o PDF vai sair: mesma proporção, mesma
   margem. As regras espelham imgtopdf.py.
   ---------------------------------------------------------------- */

/** Medidas em mm, em pé. Iguais a imgtopdf.TAMANHOS_MM. */
const TAMANHOS_MM = {
    a4: [210, 297],
    letter: [215.9, 279.4],
};

/** A imagem como fica depois de girar: 90 e 270 trocam os lados. */
function ladosGirados(largura, altura, rotacao) {
    return rotacao % 180 === 0 ? [largura, altura] : [altura, largura];
}

/**
 * Largura sobre altura da folha.
 *
 * No tamanho da imagem a folha é a própria imagem girada. Em A4 e carta o
 * servidor deita a folha quando a imagem girada é mais larga que alta (ver
 * `pagina_em_px` em imgtopdf.py), então a prévia faz o mesmo.
 */
export function proporcaoDaFolha({ tamanho, largura, altura, rotacao }) {
    const [larguraGirada, alturaGirada] = ladosGirados(largura, altura, rotacao);
    const medidas = TAMANHOS_MM[tamanho];

    if (!medidas) return larguraGirada / alturaGirada;

    const [curto, longo] = medidas;
    return larguraGirada > alturaGirada ? longo / curto : curto / longo;
}

/**
 * Margem como fração da largura da folha. Zero no tamanho da imagem, onde o
 * servidor ignora a margem. A fração vertical é esta vezes a proporção.
 */
export function margemEmFracao(margemMm, tamanho, paisagem = false) {
    const medidas = TAMANHOS_MM[tamanho];
    if (!medidas) return 0;

    const [curto, longo] = medidas;
    return margemMm / (paisagem ? longo : curto);
}
