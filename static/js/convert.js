/**
 * Amarra a página: lê a configuração, valida, envia e conduz a cena.
 *
 * A conversão começa sozinha quando um arquivo válido chega — escolhido,
 * solto ou colado. Não há botão de converter: a prensa é a resposta ao
 * gesto. O estado segue a tabela de press-state.js.
 */

import { formataTamanho, problemaCom } from './format.js';
import { envia } from './convert-send.js';
import { criaInterface } from './convert-ui.js';
import { aceitaArquivo, formaDoArquivo, transicao } from './press-state.js';

// Vem do backend num bloco <script type="application/json">, então a página
// não pode divergir do que /api/convert aceita.
const config = JSON.parse(document.getElementById('config-conversor').textContent);

const CONVITE = 'SOLTE AQUI';

const ui = criaInterface();
const { prensa } = ui;

let estado = 'esperando';

/** Aplica o evento se ele vale no estado atual. */
function muda(evento) {
    const proximo = transicao(estado, evento);
    if (proximo) estado = proximo;
    return proximo !== null;
}

function reinicia() {
    if (!muda('reinicia')) return;

    prensa.espera(CONVITE);
    ui.limpaAcoes();
    ui.limpaRecado();
}

/**
 * Recebe um candidato. Devolve true se a conversão começou.
 *
 * Erro pego aqui — formato, tamanho, vazio — não passa pela cena: vira
 * recado abaixo do palco, e o palco volta a esperar.
 */
function seleciona(arquivo) {
    if (!aceitaArquivo(estado)) return false;

    const problema = problemaCom(arquivo, config);
    if (problema) {
        reinicia();
        ui.mostraErro(problema);
        return false;
    }

    muda('escolheu');
    ui.limpaRecado();
    ui.limpaAcoes();
    prensa.chegou({
        forma: formaDoArquivo(arquivo.name),
        rotulo: `${arquivo.name} · ${formataTamanho(arquivo.size)}`,
    });

    converte(arquivo);
    return true;
}

function aoProgresso(pct) {
    // null = upload acabou, agora é o LibreOffice trabalhando. Pode chegar
    // sem nenhuma porcentagem antes, com arquivo pequeno.
    if (pct === null) {
        muda('servidor');
        ui.mostraConvertendo();
        prensa.convertendo();
        return;
    }

    muda('progresso');
    ui.mostraProgresso(pct);
    prensa.progresso(pct);
}

async function converte(arquivo) {
    ui.travaEntrada(true);
    ui.mostraProgresso(0);

    try {
        const { blob, nome } = await envia({ arquivo, maxMb: config.maxMb, aoProgresso });

        const url = ui.baixa(blob, nome);
        muda('sucesso');
        ui.escondeProgresso();
        prensa.pronto(`${nome} · baixando`);
        ui.mostraFim({ url, nome });
    } catch (erro) {
        muda('falha');
        ui.escondeProgresso();
        ui.mostraErro(erro.message);
        prensa.erro('não achatou');
        ui.mostraTentarOutro();
    } finally {
        ui.travaEntrada(false);
        ui.el.entrada.value = '';
    }
}

/* ----------------------------------------------------------------
   Eventos
   ---------------------------------------------------------------- */

ui.el.entrada.addEventListener('change', () => {
    const [arquivo] = ui.el.entrada.files;
    if (arquivo) seleciona(arquivo);
    ui.el.entrada.value = '';
});

// "CONVERTER OUTRO" e "TENTAR OUTRO" voltam a esperar e já abrem o seletor.
ui.el.acoes.addEventListener('click', (evento) => {
    if (!evento.target.closest('#outro')) return;

    reinicia();
    ui.el.entrada.click();
});

['dragenter', 'dragover'].forEach((tipo) => {
    ui.el.area.addEventListener(tipo, (evento) => {
        evento.preventDefault();
        if (aceitaArquivo(estado)) ui.marcaArrastando(true);
    });
});

['dragleave', 'dragend'].forEach((tipo) => {
    ui.el.area.addEventListener(tipo, () => ui.marcaArrastando(false));
});

ui.el.area.addEventListener('drop', (evento) => {
    evento.preventDefault();
    ui.marcaArrastando(false);

    const soltos = evento.dataTransfer?.files;
    if (!soltos?.length) return;

    if (seleciona(soltos[0]) && soltos.length > 1) {
        ui.mostraErro('Um arquivo por vez. Usei o primeiro.');
    }
});

// Sem isso o navegador abre o arquivo soltado fora da área.
['dragover', 'drop'].forEach((tipo) => {
    document.addEventListener(tipo, (evento) => {
        if (!ui.el.area.contains(evento.target)) evento.preventDefault();
    });
});

document.addEventListener('paste', (evento) => {
    const [colado] = evento.clipboardData?.files || [];
    if (!colado) return;

    evento.preventDefault();
    seleciona(colado);
});

prensa.espera(CONVITE);
