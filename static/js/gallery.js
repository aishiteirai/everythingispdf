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

    const vagas = () => Math.max(0, maxImagens - itens.length);
    const posicaoDe = (id) => itens.findIndex((item) => item.id === id);

    return {
        itens: () => itens.slice(),
        total: () => itens.length,
        vagas,

        /**
         * Adiciona no fim: adicionar não substitui o que já está na lista.
         * Devolve quantos entraram e quantos não couberam no teto.
         */
        adiciona(arquivos) {
            const cabem = arquivos.slice(0, vagas());

            cabem.forEach((arquivo) => {
                sequencia += 1;
                itens.push({
                    id: sequencia,
                    arquivo,
                    rotacao: 0,
                    url: urls.cria(arquivo),
                });
            });

            return { adicionados: cabem.length, recusados: arquivos.length - cabem.length };
        },

        remove(id) {
            const posicao = posicaoDe(id);
            if (posicao === -1) return false;

            urls.revoga(itens[posicao].url);
            itens = itens.filter((item) => item.id !== id);
            return true;
        },

        limpa() {
            itens.forEach((item) => urls.revoga(item.url));
            itens = [];
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
