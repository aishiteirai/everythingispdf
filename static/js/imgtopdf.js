/**
 * Amarra a galeria: lê a configuração, valida, mantém o estado, envia e
 * conduz a cena da prensa.
 *
 * O trabalho do usuário nunca é descartado por um erro: "TENTAR OUTRO" volta
 * à esteira com imagens, ordem, giros e opções intactos. Depois do sucesso as
 * imagens também ficam, para gerar de novo com outro tamanho ou margem; só
 * "NOVO PDF" limpa.
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
    seleciona: (id) => aplica(() => galeria.seleciona(id)),
    giraEsquerda: (id) => aplica(() => galeria.gira(id, -90)),
    giraDireita: (id) => aplica(() => galeria.gira(id, 90)),
    giraTodas: (graus) => aplica(() => galeria.giraTodas(graus)),
    moveTras: (id) => aplica(() => galeria.move(id, -1)),
    moveFrente: (id) => aplica(() => galeria.move(id, 1)),
    remove: (id) => aplica(() => galeria.remove(id)),
    reordena: (id, destino) => aplica(() => galeria.reordena(id, destino)),
});

const { prensa } = ui;

function aplica(operacao) {
    if (enviando) return;
    if (operacao()) redesenha();
}

function tamanhoEscolhido() {
    return ui.el.opcoes.querySelector('input[name="tamanho"]:checked')?.value ?? 'a4';
}

function margemEscolhida() {
    const valor = Number.parseInt(ui.el.margem.value, 10);
    if (Number.isNaN(valor)) return 0;

    return Math.min(Math.max(valor, 0), config.margemMax);
}

/**
 * Mexer na esteira depois de um PDF pronto tira a folha do palco e devolve a
 * página. As ações (BAIXAR, NOVO PDF) ficam: o arquivo continua valendo.
 */
function redesenha() {
    if (!enviando && ui.cenaVisivel()) {
        prensa.para();
        ui.mostraCena(false);
    }

    ui.desenha(galeria.itens(), galeria.selecionado(), {
        tamanho: tamanhoEscolhido(),
        margemMm: margemEscolhida(),
    });
    ui.marcaEnviando(enviando, galeria.total());
}

/**
 * Valida arquivo por arquivo antes de adicionar: erra rápido, sem gastar
 * upload nem cota de rate limit. O primeiro problema é o que aparece —
 * cinco recados de uma vez não ajudam ninguém.
 */
function adiciona(candidatos) {
    if (enviando) return;

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

function aoProgresso(pct) {
    // null = upload acabou, agora é o servidor montando o PDF.
    if (pct === null) {
        ui.mostraMontando();
        prensa.convertendo();
        return;
    }

    ui.mostraProgresso(pct);
    prensa.progresso(pct);
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
    ui.limpaAcoes();
    ui.mostraProgresso(0);
    ui.mostraCena(true);
    prensa.chegou({
        forma: 'meio',
        rotulo: `${itens.length} ${itens.length === 1 ? 'imagem' : 'imagens'}`,
    });

    try {
        const { blob, nome } = await enviaGaleria({
            itens,
            tamanho: tamanhoEscolhido(),
            margemMm: margemEscolhida(),
            maxMb: config.maxMb,
            aoProgresso,
        });

        const url = ui.baixa(blob, nome);
        prensa.pronto(`${nome} · baixando`);
        ui.mostraFim({ url, nome });
    } catch (erro) {
        ui.mostraErro(erro.message);
        prensa.erro('não achatou');
        ui.mostraTentarOutro();
    } finally {
        enviando = false;
        ui.escondeProgresso();
        ui.marcaEnviando(false, galeria.total());
    }
}

/** Volta à esteira sem tocar nas imagens. */
function voltaParaAEsteira() {
    prensa.para();
    ui.mostraCena(false);
    ui.limpaAcoes();
    ui.limpaRecado();
    redesenha();
}

/* ----------------------------------------------------------------
   Eventos
   ---------------------------------------------------------------- */

ui.el.formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    gera();
});

ui.el.entrada.addEventListener('change', () => {
    adiciona(ui.el.entrada.files);
    ui.el.entrada.value = '';
});

ui.el.opcoes.addEventListener('change', (evento) => {
    if (evento.target.name === 'tamanho') {
        ui.marcaMargemAplicavel(tamanhoEscolhido() !== 'image');
    }
    redesenha();
});

ui.el.margem.addEventListener('input', redesenha);

ui.el.opcoes.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-margem]');
    if (!botao) return;

    const passo = Number(botao.dataset.margem);
    ui.el.margem.value = String(
        Math.min(Math.max(margemEscolhida() + passo, 0), config.margemMax)
    );
    redesenha();
});

ui.el.acoes.addEventListener('click', (evento) => {
    if (evento.target.closest('#novo')) {
        galeria.limpa();
        voltaParaAEsteira();
        ui.el.entrada.focus();
    } else if (evento.target.closest('#outro')) {
        voltaParaAEsteira();
    }
});

// Soltar vale em toda a página da galeria, não só no bloco "+ SOLTE MAIS":
// com imagens na fita, o palco é o alvo mais óbvio.
['dragenter', 'dragover'].forEach((tipo) => {
    ui.el.galeria.addEventListener(tipo, (evento) => {
        if (!evento.dataTransfer?.types?.includes('Files')) return;
        evento.preventDefault();
        if (!enviando) ui.marcaArrastando(true);
    });
});

['dragleave', 'dragend'].forEach((tipo) => {
    ui.el.galeria.addEventListener(tipo, (evento) => {
        if (!ui.el.galeria.contains(evento.relatedTarget)) ui.marcaArrastando(false);
    });
});

ui.el.galeria.addEventListener('drop', (evento) => {
    evento.preventDefault();
    ui.marcaArrastando(false);

    const soltos = evento.dataTransfer?.files;
    if (soltos?.length) adiciona(soltos);
});

// Sem isso o navegador abre o arquivo soltado fora da galeria.
['dragover', 'drop'].forEach((tipo) => {
    document.addEventListener(tipo, (evento) => {
        if (!ui.el.galeria.contains(evento.target)) evento.preventDefault();
    });
});

document.addEventListener('paste', (evento) => {
    const colado = [...(evento.clipboardData?.files || [])];
    if (!colado.length) return;

    evento.preventDefault();
    adiciona(colado);
});

ui.marcaMargemAplicavel(tamanhoEscolhido() !== 'image');
redesenha();
