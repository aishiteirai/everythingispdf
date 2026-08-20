/**
 * Transporte: fala com /api/imgtopdf. Sem DOM.
 */

import { mensagemDoErro, nomeDoDownload } from './envio.js';

const NOME_PADRAO = 'imagens.pdf';

/**
 * Uma mensagem por status que /api/imgtopdf produz. Não reaproveita o mapa de
 * /api/convert: aqui não existe 504, e 400 e 415 querem dizer outra coisa —
 * pedido recusado e imagem em formato não aceito, não "o arquivo não chegou".
 */
export function mensagensDaGaleria(maxMb) {
    return {
        400: 'O servidor recusou o pedido. Recarregue a página e tente de novo.',
        413: `As imagens somam mais que o limite de ${maxMb} MB.`,
        415: 'Alguma das imagens está num formato que o servidor não aceita.',
        429: 'Muitos PDFs em pouco tempo. Espere um instante.',
        500: 'O servidor não conseguiu montar o PDF.',
    };
}

/**
 * Envia a galeria e resolve com { blob, nome }. Rejeita com um Error cuja
 * mensagem já está pronta para mostrar ao usuário.
 *
 * `aoProgresso` recebe a porcentagem do upload, ou null quando o upload
 * acabou e o que resta é o servidor montando o PDF.
 */
export function enviaGaleria({ itens, tamanho, margemMm, maxMb, aoProgresso }) {
    return new Promise((resolve, reject) => {
        const dados = new FormData();

        // A ordem em que os arquivos entram no FormData é a ordem das páginas.
        itens.forEach((item) => dados.append('files', item.arquivo, item.arquivo.name));

        // `pages` acompanha `files` por índice; o servidor recusa se os
        // comprimentos divergirem.
        dados.append('options', JSON.stringify({
            pages: itens.map((item) => ({ rotation: item.rotacao })),
            size: tamanho,
            margin_mm: margemMm,
        }));

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/imgtopdf');
        xhr.responseType = 'blob';

        xhr.upload.addEventListener('progress', (evento) => {
            if (!evento.lengthComputable) return;
            const porcentagem = (evento.loaded / evento.total) * 100;
            aoProgresso(porcentagem >= 100 ? null : porcentagem);
        });

        xhr.addEventListener('load', async () => {
            if (xhr.status === 200) {
                resolve({ blob: xhr.response, nome: nomeDoDownload(xhr, NOME_PADRAO) });
            } else {
                reject(new Error(await mensagemDoErro(xhr, mensagensDaGaleria(maxMb))));
            }
        });

        xhr.addEventListener('error', () => {
            reject(new Error('Não foi possível falar com o servidor.'));
        });

        xhr.addEventListener('abort', () => {
            reject(new Error('Envio cancelado.'));
        });

        xhr.send(dados);
    });
}
