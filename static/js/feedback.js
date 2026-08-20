/**
 * Barra de progresso, recado e download.
 *
 * Compartilhado pelas duas páginas: converter um arquivo e montar um PDF de
 * imagens precisam exatamente do mesmo comportamento aqui, e duas cópias iam
 * divergir na primeira correção.
 */

export function criaFeedback({ barra, preenchimento, recado }) {
    let urlAnterior = null;

    return {
        mostraErro(texto) {
            recado.className = 'recado erro';
            recado.textContent = texto;
        },

        /**
         * Monta o recado de sucesso por DOM, não por innerHTML: o nome do
         * arquivo vem do usuário e passaria HTML direto para a página.
         *
         * O link fica na mensagem porque, se o navegador bloquear o download
         * automático, o usuário ainda precisa de um jeito de pegar o arquivo.
         */
        mostraSucesso(url, nomeArquivo) {
            recado.className = 'recado sucesso';
            recado.textContent = 'Pronto. Se o download não começou, ';

            const link = document.createElement('a');
            link.href = url;
            link.download = nomeArquivo;
            link.textContent = 'baixe aqui';
            recado.append(link, '.');
        },

        limpaRecado() {
            recado.className = 'recado oculto';
            recado.textContent = '';
        },

        mostraProgresso(porcentagem) {
            barra.classList.remove('oculto', 'indeterminada');
            preenchimento.style.width = `${porcentagem}%`;
            barra.setAttribute('aria-valuenow', String(Math.round(porcentagem)));
        },

        /** Upload acabou; o que resta é o servidor trabalhando, sem progresso
         *  mensurável. */
        mostraTrabalhando() {
            barra.classList.remove('oculto');
            barra.classList.add('indeterminada');
            barra.removeAttribute('aria-valuenow');
        },

        escondeProgresso() {
            barra.classList.add('oculto');
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
