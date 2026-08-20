/**
 * Funções puras de formato e validação. Sem DOM, sem rede.
 */

export function formataTamanho(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function extensaoDe(nomeArquivo) {
    const ponto = nomeArquivo.lastIndexOf('.');
    return ponto === -1 ? '' : nomeArquivo.slice(ponto + 1).toLowerCase();
}

export function semExtensao(nomeArquivo) {
    const ponto = nomeArquivo.lastIndexOf('.');
    return ponto <= 0 ? nomeArquivo : nomeArquivo.slice(0, ponto);
}

/**
 * Valida antes de subir: erra rápido, sem gastar upload nem cota de rate
 * limit. Devolve a mensagem do problema, ou null se o arquivo serve.
 */
export function problemaCom(arquivo, { extensoes, maxBytes, maxMb }) {
    const extensao = extensaoDe(arquivo.name);

    if (!extensoes.includes(extensao)) {
        return extensao
            ? `Arquivos .${extensao} não são aceitos.`
            : 'O arquivo precisa ter uma extensão.';
    }

    if (arquivo.size > maxBytes) {
        return `O arquivo tem ${formataTamanho(arquivo.size)}, acima do limite de ${maxMb} MB.`;
    }

    if (arquivo.size === 0) {
        return 'O arquivo está vazio.';
    }

    return null;
}
