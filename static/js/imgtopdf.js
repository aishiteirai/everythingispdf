/**
 * Amarra a galeria: lê a configuração, valida, mantém o estado, envia.
 */

import { problemaCom, problemaComConjunto } from './format.js';
import { criaGaleria } from './gallery.js';
import { criaInterfaceDaGaleria } from './gallery-ui.js';
import { enviaGaleria } from './gallery-send.js';

// Vem do backend num bloco <script type="application/json">, então a UI não
// pode divergir do que /api/imgtopdf aceita.
const config = JSON.parse(document.getElementById('config-galeria').textContent);

const galeria = criaGaleria({ maxImagens: config.maxImagens });

let enviando = false;

const ui = criaInterfaceDaGaleria({
    giraEsquerda: (id) => aplica(() => galeria.gira(id, -90)),
    giraDireita: (id) => aplica(() => galeria.gira(id, 90)),
    moveTras: (id) => aplica(() => galeria.move(id, -1)),
    moveFrente: (id) => aplica(() => galeria.move(id, 1)),
    remove: (id) => aplica(() => galeria.remove(id)),
    reordena: (id, destino) => aplica(() => galeria.reordena(id, destino)),
});

function aplica(operacao) {
    if (enviando) return;
    if (operacao()) redesenha();
}

function redesenha() {
    ui.desenha(galeria.itens());
    ui.marcaEnviando(enviando, galeria.total());
}

function tamanhoEscolhido() {
    return ui.el.tamanho.value;
}

function margemEscolhida() {
    const valor = Number.parseInt(ui.el.margem.value, 10);
    if (Number.isNaN(valor)) return 0;

    return Math.min(Math.max(valor, 0), config.margemMax);
}

/**
 * Valida arquivo por arquivo antes de adicionar: erra rápido, sem gastar
 * upload nem cota de rate limit. O primeiro problema é o que aparece —
 * cinco recados de uma vez não ajudam ninguém.
 */
function adiciona(candidatos) {
    const arquivos = [...candidatos];
    if (!arquivos.length) return;

    const invalido = arquivos.find((arquivo) => problemaCom(arquivo, config));
    if (invalido) {
        ui.mostraErro(problemaCom(invalido, config));
        return;
    }

    const { recusados } = galeria.adiciona(arquivos);
    redesenha();

    if (recusados) {
        ui.mostraErro(
            `Cabem ${config.maxImagens} imagens por PDF; ${recusados} não entraram.`
        );
    } else {
        ui.limpaRecado();
    }
}

async function gera() {
    if (enviando) return;

    const itens = galeria.itens();
    const problema = problemaComConjunto(itens, config);
    if (problema) {
        ui.mostraErro(problema);
        return;
    }

    enviando = true;
    ui.marcaEnviando(true, itens.length);
    ui.limpaRecado();
    ui.mostraProgresso(0);

    try {
        const { blob, nome } = await enviaGaleria({
            itens,
            tamanho: tamanhoEscolhido(),
            margemMm: margemEscolhida(),
            maxMb: config.maxMb,
            // null = upload acabou, agora é o servidor montando o PDF.
            aoProgresso: (pct) => (pct === null ? ui.mostraMontando() : ui.mostraProgresso(pct)),
        });

        const url = ui.baixa(blob, nome);
        galeria.limpa();
        ui.escondeProgresso();
        redesenha();
        ui.mostraSucesso(url, nome);
    } catch (erro) {
        ui.mostraErro(erro.message);
        ui.escondeProgresso();
    } finally {
        enviando = false;
        ui.marcaEnviando(false, galeria.total());
    }
}

/* ----------------------------------------------------------------
   Eventos
   ---------------------------------------------------------------- */

ui.el.formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    gera();
});

ui.el.entrada.addEventListener('change', () => adiciona(ui.el.entrada.files));

ui.el.tamanho.addEventListener('change', () => {
    ui.marcaMargemAplicavel(tamanhoEscolhido() !== 'image');
});

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
    if (soltos?.length) adiciona(soltos);
});

// Sem isso o navegador abre o arquivo soltado fora da área -- exceto na grade,
// onde soltar é reordenar.
['dragover', 'drop'].forEach((tipo) => {
    document.addEventListener(tipo, (evento) => {
        const dentro =
            ui.el.area.contains(evento.target) || ui.el.grade.contains(evento.target);
        if (!dentro) evento.preventDefault();
    });
});

document.addEventListener('paste', (evento) => {
    if (enviando) return;

    const colado = [...(evento.clipboardData?.files || [])];
    if (colado.length) {
        evento.preventDefault();
        adiciona(colado);
    }
});

ui.marcaMargemAplicavel(tamanhoEscolhido() !== 'image');
redesenha();
