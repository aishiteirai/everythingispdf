/**
 * Amarra o formulário: lê a configuração, valida, envia, mostra o resultado.
 */

import { problemaCom } from './formato.js';
import { envia } from './envio.js';
import { criaInterface } from './interface.js';

// Vem do backend num bloco <script type="application/json">, então o
// formulário não pode divergir do que /api/convert aceita. Bloco JSON em vez
// de JavaScript inline: não é executado, e sobrevive a CSP sem unsafe-inline.
const config = JSON.parse(document.getElementById('config-conversor').textContent);

const ui = criaInterface();

let arquivo = null;
let enviando = false;

function seleciona(candidato) {
    const problema = problemaCom(candidato, config);

    if (problema) {
        arquivo = null;
        ui.escondeArquivo();
        ui.mostraErro(problema);
        return;
    }

    arquivo = candidato;
    ui.mostraArquivo(candidato);
    ui.limpaRecado();
}

function limpa() {
    arquivo = null;
    ui.escondeArquivo();
    ui.escondeProgresso();
    ui.limpaRecado();
}

async function converte() {
    if (!arquivo || enviando) return;

    enviando = true;
    ui.marcaEnviando(true, true);
    ui.limpaRecado();
    ui.mostraProgresso(0);

    try {
        const { blob, nome } = await envia({
            arquivo,
            maxMb: config.maxMb,
            // null = upload acabou, agora é o LibreOffice trabalhando.
            aoProgresso: (pct) => (pct === null ? ui.mostraConvertendo() : ui.mostraProgresso(pct)),
        });

        const url = ui.baixa(blob, nome);
        limpa();
        ui.mostraSucesso(url, nome);
    } catch (erro) {
        ui.mostraErro(erro.message);
        ui.escondeProgresso();
    } finally {
        enviando = false;
        ui.marcaEnviando(false, Boolean(arquivo));
    }
}

/* ----------------------------------------------------------------
   Eventos
   ---------------------------------------------------------------- */

ui.el.formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    converte();
});

ui.el.entrada.addEventListener('change', () => {
    if (ui.el.entrada.files.length) seleciona(ui.el.entrada.files[0]);
});

ui.el.remover.addEventListener('click', limpa);

['dragenter', 'dragover'].forEach((tipo) => {
    ui.el.area.addEventListener(tipo, (evento) => {
        evento.preventDefault();
        if (!enviando) ui.marcaArrastando(true);
    });
});

['dragleave', 'dragend'].forEach((tipo) => {
    ui.el.area.addEventListener(tipo, () => ui.marcaArrastando(false));
});

ui.el.area.addEventListener('drop', (evento) => {
    evento.preventDefault();
    ui.marcaArrastando(false);
    if (enviando) return;

    const soltos = evento.dataTransfer?.files;
    if (!soltos?.length) return;

    if (soltos.length > 1) {
        ui.mostraErro('Um arquivo por vez. Usei o primeiro.');
    }
    seleciona(soltos[0]);
});

// Sem isso o navegador abre o arquivo soltado fora da área.
['dragover', 'drop'].forEach((tipo) => {
    document.addEventListener(tipo, (evento) => {
        if (!ui.el.area.contains(evento.target)) evento.preventDefault();
    });
});

document.addEventListener('paste', (evento) => {
    if (enviando) return;

    const colado = [...(evento.clipboardData?.files || [])];
    if (colado.length) {
        evento.preventDefault();
        seleciona(colado[0]);
    }
});
