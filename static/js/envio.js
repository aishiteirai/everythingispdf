/**
 * Transporte: fala com /api/convert. Sem DOM.
 */

import { semExtensao } from './formato.js';

/**
 * Uma mensagem por status que a API produz. Sem isso o usuário recebe
 * "erro 429" e não entende nada.
 */
export function mensagensDeErro(maxMb) {
    return {
        400: 'O servidor não recebeu o arquivo. Tente de novo.',
        413: `Arquivo acima do limite de ${maxMb} MB.`,
        415: 'Formato não suportado pelo servidor.',
        429: 'Muitas conversões em pouco tempo. Espere um instante.',
        500: 'O servidor não conseguiu converter este arquivo.',
        504: 'A conversão passou do tempo limite. Tente um arquivo menor.',
    };
}

/**
 * O nome vem do Content-Disposition, que o backend já monta. Cai em `padrao`
 * só se o header não vier.
 */
export function nomeDoDownload(xhr, padrao) {
    const header = xhr.getResponseHeader('Content-Disposition') || '';
    const casa = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);

    if (casa) {
        try {
            return decodeURIComponent(casa[1]);
        } catch {
            return casa[1];
        }
    }

    return padrao;
}

/**
 * A resposta chega como blob. Num erro o corpo é JSON, então lê como texto.
 *
 * `mensagens` é o mapa de status daquele endpoint: /api/convert e
 * /api/imgtopdf produzem conjuntos diferentes de erro.
 */
export async function mensagemDoErro(xhr, mensagens) {
    if (mensagens[xhr.status]) return mensagens[xhr.status];

    try {
        const dados = JSON.parse(await xhr.response.text());
        if (dados.error) return dados.error;
    } catch {
        /* corpo não era JSON: cai no texto genérico abaixo */
    }

    return `O servidor respondeu com erro ${xhr.status}.`;
}

/**
 * Envia o arquivo e resolve com { blob, nome }. Rejeita com um Error cuja
 * mensagem já está pronta para mostrar ao usuário.
 *
 * `aoProgresso` recebe a porcentagem do upload, ou null quando o upload
 * acabou e o que resta é o servidor convertendo — aí não há mais progresso
 * mensurável.
 */
export function envia({ arquivo, maxMb, aoProgresso }) {
    return new Promise((resolve, reject) => {
        const dados = new FormData();
        dados.append('file', arquivo);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/convert');
        xhr.responseType = 'blob';

        xhr.upload.addEventListener('progress', (evento) => {
            if (!evento.lengthComputable) return;
            const porcentagem = (evento.loaded / evento.total) * 100;
            aoProgresso(porcentagem >= 100 ? null : porcentagem);
        });

        xhr.addEventListener('load', async () => {
            if (xhr.status === 200) {
                const padrao = `${semExtensao(arquivo.name)}.pdf`;
                resolve({ blob: xhr.response, nome: nomeDoDownload(xhr, padrao) });
            } else {
                reject(new Error(await mensagemDoErro(xhr, mensagensDeErro(maxMb))));
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
