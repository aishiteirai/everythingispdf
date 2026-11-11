# Redesenho do front (brutalismo + Bauhaus): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o visual das três páginas pela linguagem aprovada: grade crua, formas Bauhaus, banner de ladrilhos que giram, conversão com prensa e página de imagens em esteira. Backend e API não mudam.

**Architecture:** A regra fica em módulos ES sem DOM e com teste em `node --test`: `tiles.js` (ladrilhos), `press-state.js` (máquina de estados da conversão e forma por tipo) e `gallery.js` (seleção e geometria da folha). O DOM fica em módulos finos: `tile-grid.js` (grade de ladrilhos reutilizável), `banner.js` (entrada da home), `press.js` (cena) e as UIs das páginas. O CSS é reescrito em `static/css/estilo.css` com um tema só.

**Tech Stack:** Flask/Jinja, módulos ES nativos (sem bundler), CSS puro, pytest e `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-11-redesign-frontend-design.md`. Os protótipos estão em `docs/superpowers/specs/2026-11-11-redesign-frontend-prototipos/` e são só referência de comportamento: em `conversao.html` vale só o painel 2 e em `imagens.html` vale só o B.

## Global Constraints

- CSP inalterada (`app.py`, `POLITICA_DE_SEGURANCA`): sem script inline, sem CDN, fonte e imagem só da própria origem. `style-src 'unsafe-inline'` continua, e o motivo passa a ser o `style="transform: rotate(...)"` dos ladrilhos.
- Sem dependência JS e sem bundler. Cada página carrega só o seu módulo de entrada.
- Paleta (valores exatos): creme `#fffef9`, tinta `#000000`, vermelho `#e8452c`, amarelo `#f2b705`, azul `#2453d6`, mesa `#e9e7e0`.
- O amarelo nunca carrega texto. Texto sobre vermelho é tinta e texto sobre azul é creme.
- Só tema claro: `<meta name="color-scheme" content="light">`, sem `prefers-color-scheme: dark` no CSS. O teste `test_o_css_nao_tem_mais_tema_escuro` continua.
- Bordas de 3px em tinta, nenhum `border-radius`, sombra dura `8px 8px 0 var(--tinta)` em título e botão principal.
- Inter no peso 900 nos títulos e `ui-monospace, SFMono-Regular, Menlo, monospace` nos detalhes.
- Títulos: "TUDO VIRA PDF.", "ARQUIVOS PARA PDF.", "IMAGENS PARA PDF.".
- Com `prefers-reduced-motion: reduce`, nada gira, quica, bate ou desliza. Os estados só trocam.
- Mensagens de erro por status (`mensagensDeErro`, `mensagensDaGaleria`) não mudam.
- Nomes: inglês em nome de arquivo e rota, português em identificador e texto de tela (padrão do repo).
- Testes: `venv/bin/pytest -q`, `node --test tests/js/*.test.mjs` e `venv/bin/ruff check .`. Os três passam ao fim de toda task.

## Review Focus

1. **Soltar um arquivo com a prensa batendo:** um arquivo solto, colado ou escolhido durante "enviando" ou "convertendo" é ignorado e a cena não reinicia (teste da Task 5: `aceitaArquivo`).
2. **Upload instantâneo:** com arquivo pequeno, o XHR pode ir de 0% direto para `null`. A cena precisa ir de "enviando" para "convertendo" sem passar por porcentagens intermediárias, com a forma já debaixo da prensa (teste da Task 5: transição e `posicaoNaEsteira(100)`).
3. **Nome de arquivo hostil:** `"><img src=x onerror=alert(1)>.docx` aparece como texto no rótulo da prensa, no palco e na fita, nunca como HTML (teste da Task 6 e da Task 9: os módulos não usam `innerHTML` com dado do usuário).
4. **Remover a imagem selecionada:** removendo a última selecionada, a seleção vai para a anterior. Removendo a única, fica `null`, e o palco volta ao estado vazio sem quebrar (teste da Task 8).
5. **Extensão em maiúscula e celular girado:** `FOTO.JPG` vira semicírculo e `RELATORIO.DOCX` vira quadrado (teste da Task 5). Girar o aparelho refaz a grade com 7 colunas abaixo de 600px (teste da Task 3: `colunasDaGrade`).

---

### Task 1: Tirar as bolinhas do hub

**Files:**
- Modify: `app.py` (apagar `QUANTIDADE_DE_BOLINHAS`, `LIMITE_ARRASTO_PX`, `SEPARADOR_DE_BOLINHAS`, `SEPARADOR_DE_EIXOS`, `_limita_arrasto`, `posicoes_das_bolinhas` e o comentário acima; `index()` renderiza `home.html` sem argumento; reescrever o parágrafo do comentário da CSP sobre `style-src`)
- Delete: `static/js/dots.js`, `static/js/dots-state.js`, `tests/js/dots.test.mjs`
- Modify: `templates/home.html` (provisório: as duas `<a>` sem `data-bolinha`, sem `style`, sem o `<script>` de `dots.js`; o layout final vem na Task 4)
- Modify: `static/js/drag.js`, `static/js/drag-state.js` (comentários que citam as bolinhas passam a citar só a galeria)
- Modify: `tests/test_pages.py`, `tests/test_cabecalhos.py`

**Interfaces:**
- Produces: `index()` sem contexto de posição. Nenhum módulo JS a mais no hub.

- [ ] **Step 1: Trocar os testes das bolinhas pelo teste da remoção**

Em `tests/test_pages.py`: apagar `LIMITE_ARRASTO_PX`, `TestBolinhas`, `TestPosicaoDasBolinhas`, `TestCookieDePosicaoNaRede` e `TestArrasteUnificado.test_o_hub_nao_espera`. Mudar `MODULOS_QUE_ARRASTAM` para `('gallery-ui.js',)`, tirar `'dots.js'` de `TestClassesQueOJavaScriptLiga.MODULOS` e, em `TestHub.test_carrega_so_os_modulos_que_precisa`, deixar `permitidos = ()` por enquanto. Adicionar:

```python
class TestBolinhasSairam:
    @pytest.mark.parametrize('modulo', ['dots.js', 'dots-state.js'])
    def test_os_modulos_sairam(self, client, modulo):
        assert client.get(f'/static/js/{modulo}').status_code == 404

    def test_o_hub_nao_tem_bolinha(self, hub):
        assert 'data-bolinha' not in hub

    def test_cookie_antigo_e_ignorado(self, client):
        client.set_cookie('bolinhas', '80_-12|-30_40')
        hub = client.get('/').get_data(as_text=True)

        assert '--dx' not in hub
        assert not hasattr(appmod, 'posicoes_das_bolinhas')
```

Em `tests/test_cabecalhos.py`, `test_estilo_inline_e_permitido_com_motivo` mantém a asserção e a docstring passa a dar o novo motivo: os ladrilhos são SVG gerado com `style="transform: rotate(...)"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/bin/pytest -q tests/test_pages.py -k "BolinhasSairam"`
Expected: FAIL (`dots.js` ainda é servido e o hub ainda tem `data-bolinha`)

- [ ] **Step 3: Remover o código listado em Files**

- [ ] **Step 4: Rodar tudo**

Run: `venv/bin/pytest -q && node --test tests/js/*.test.mjs && venv/bin/ruff check .`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A app.py static/js templates/home.html tests
git commit -m "refactor: remove as bolinhas do hub e o cookie de posicao"
```

---

### Task 2: Fundação visual (tokens, fonte, faixa, favicon)

**Files:**
- Modify: `static/css/estilo.css` (reescrever as seções de fonte, tokens e base; os estilos de componente antigos ficam até as Tasks 4, 7 e 9 trocarem as páginas)
- Modify: `templates/_cabecalho.html`
- Modify: `templates/home.html`, `templates/convert.html`, `templates/imgtopdf.html` (`color-scheme` light, sem classe `tema-*` no `<body>`, `{% set contexto = ... %}` antes do include)
- Modify: `static/favicon.svg`
- Possibly replace: `static/fonts/inter-latin.woff2`, `static/fonts/inter-latin-ext.woff2`
- Test: `tests/test_pages.py`

**Interfaces:**
- Produces: os tokens CSS `--creme`, `--tinta`, `--vermelho`, `--amarelo`, `--azul`, `--mesa`, `--texto-fraco`, `--erro-fundo`, `--borda` (`3px solid var(--tinta)`) e `--sombra` (`8px 8px 0 var(--tinta)`).
- Produces: as classes base `.faixa`, `.marca`, `.faixa-contexto`, `.botao` (com as variantes `.botao-vermelho`, `.botao-azul` e `.botao-creme`), `.mono`, `.oculto` e `.so-leitor` (visualmente oculto).
- Produces: o include `_cabecalho.html`, que lê a variável Jinja `contexto` (`'conversor'`, `'01 · arquivos'` ou `'02 · imagens'`).

- [ ] **Step 1: Atualizar os testes de token, tema e marca**

Em `tests/test_pages.py`:
- Apagar `TEMAS`, `_vale_para_o_tema`, `TestTemaPorPagina` e o parâmetro `tema` de `TestContraste`.
- `tokens(css)` passa a juntar os tokens de todas as regras sem `.tema-`.
- Substituir `PARES_DE_CONTRASTE` por:

```python
PARES_DE_CONTRASTE = [
    ('--tinta', '--creme', 4.5),
    ('--tinta', '--mesa', 4.5),
    ('--tinta', '--vermelho', 4.5),
    ('--creme', '--azul', 4.5),
    ('--tinta', '--amarelo', 4.5),
    ('--tinta', '--erro-fundo', 4.5),
    ('--texto-fraco', '--creme', 4.5),
    ('--vermelho', '--creme', 3.0),
    ('--azul', '--creme', 3.0),
]
```

Adicionar:

```python
def test_a_paleta_e_a_da_spec(css_do_site):
    valores = tokens(css_do_site)
    assert {k: valores[k].lower() for k in
            ('--creme', '--tinta', '--vermelho', '--amarelo', '--azul', '--mesa')} == {
        '--creme': '#fffef9', '--tinta': '#000000', '--vermelho': '#e8452c',
        '--amarelo': '#f2b705', '--azul': '#2453d6', '--mesa': '#e9e7e0'}

@pytest.mark.parametrize('rota', ROTAS)
def test_declara_so_tema_claro(client, rota):
    assert '<meta name="color-scheme" content="light">' in client.get(rota).get_data(as_text=True)

def test_a_fonte_cobre_o_peso_900(css_do_site):
    assert re.search(r'font-weight:\s*\d+\s+900', css_do_site)

```

Mudanças nos testes existentes:
- `TestMarca`: trocar o par de testes por `re.search(r'\.marca\s*\{[^}]*color:\s*var\(--tinta\)', css_do_site)`.
- `TestFavicon.test_o_icone_traz_as_duas_cores_das_funcoes` vira `test_o_icone_usa_a_paleta`: `--vermelho` e `--azul` aparecem em `favicon.svg`.
- `TestCabecalho` continua igual. A marca segue com `class="marca"` e `href="/"`, e o texto continua "everything is pdf" (o CSS põe em caixa alta).

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/bin/pytest -q tests/test_pages.py`
Expected: FAIL nos testes novos de paleta, color-scheme, peso 900, marca e favicon

- [ ] **Step 3: Confirmar o eixo de peso da Inter e trocar o arquivo se precisar**

Run: `python3 -m venv /tmp/ft && /tmp/ft/bin/pip -q install fonttools brotli && /tmp/ft/bin/python -c "from fontTools.ttLib import TTFont; f=TTFont('static/fonts/inter-latin.woff2'); print([(a.axisTag,a.minValue,a.maxValue) for a in f['fvar'].axes] if 'fvar' in f else 'estatica')"`
Expected: `[('wght', 100.0, 900.0)]`, ou algum eixo que chegue a 900. Nesse caso o arquivo fica.

Se o eixo não chegar a 900 ou a fonte for estática, baixar `inter-latin-wght-normal.woff2` e `inter-latin-ext-wght-normal.woff2` do pacote npm `@fontsource-variable/inter@5.1.1` (pela URL do jsDelivr: `https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.1.1/files/<arquivo>`) para os nomes atuais, rodar o comando de novo e esperar `wght` de 100 a 900. A licença OFL que já está lá continua valendo.

- [ ] **Step 4: Escrever a base do CSS, a faixa e o favicon**

- `@font-face` com `font-weight: 100 900`, mantendo os `unicode-range` de hoje.
- `:root` com os tokens de Interfaces. `body` com fundo `--mesa` e `font-family: 'Inter', system-ui, sans-serif`.
- `.faixa`: altura de 50px, células separadas por `--borda` e "pt-br" encostado à direita. No `@media (max-width: 600px)`, `.faixa-contexto` some.
- `.botao`: texto 900 em caixa alta, `--borda` e `--sombra`. No `:active`, `translate(3px, 3px)` com sombra de 5px.
- `favicon.svg`: um ladrilho de 24×24 com fundo creme, quarto de círculo `#e8452c` e quadrado `#2453d6`.

- [ ] **Step 5: Rodar tudo**

Run: `venv/bin/pytest -q && node --test tests/js/*.test.mjs && venv/bin/ruff check .`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A static templates tests
git commit -m "feat: base visual brutalista (paleta, Inter 900, faixa, favicon)"
```

---

### Task 3: Regra dos ladrilhos (`tiles.js`)

**Files:**
- Create: `static/js/tiles.js`
- Test: `tests/js/tiles.test.mjs`

**Interfaces:**
- Produces:
  - `CREME: string` e `CORES: string[]`, com `['#e8452c', '#f2b705', '#2453d6', '#000000']`.
  - `FORMAS: string[]`, com `['cheio', 'circulo', 'quarto', 'meio', 'triangulo', 'metade', 'anel']`.
  - `novoLadrilho(aleatorio = Math.random, chanceDeForma = 1) -> { fundo: string, cor: string, forma: string | null, rot: 0 | 90 | 180 | 270 }`.
  - `marcacaoDoLadrilho({ fundo, cor, forma }) -> string`: o miolo de um `<svg viewBox="0 0 100 100">`, que começa pelo `<rect>` do fundo seguido da forma, só com valores das constantes acima.
  - `colunasDaGrade(largura) -> { colunas: number, tamanho: number }`.
  - `atrasoDaOnda(dx, dy, msPorPx = 1.6) -> number`.
  - `criaPersiana(passoPx = 28) -> { rola(delta: number): number[] }`.

- [ ] **Step 1: Escrever os testes**

```js
import { CORES, CREME, FORMAS, atrasoDaOnda, colunasDaGrade, criaPersiana,
         marcacaoDoLadrilho, novoLadrilho } from '../../static/js/tiles.js';

const sequencia = (...v) => () => (v.length ? v.shift() : 0);

test('fundo e creme quando o sorteio fica abaixo de 0,7', () => {
    assert.equal(novoLadrilho(sequencia(0.1, 0, 0, 0)).fundo, CREME);
});
test('a cor da forma nunca e igual ao fundo', () => {
    for (let i = 0; i < 500; i++) { const l = novoLadrilho(); assert.notEqual(l.cor, l.fundo); }
});
test('rotacao e sempre multiplo de 90', () => {
    for (let i = 0; i < 200; i++) assert.ok([0, 90, 180, 270].includes(novoLadrilho().rot));
});
test('chanceDeForma 0 da ladrilho liso', () => {
    assert.equal(novoLadrilho(Math.random, 0).forma, null);
});
test('a marcacao de cada forma e svg sem script', () => {
    for (const forma of FORMAS) {
        const m = marcacaoDoLadrilho({ fundo: CREME, cor: CORES[0], forma });
        assert.match(m, /^<rect/); assert.doesNotMatch(m, /script|on\w+=/i);
    }
});
test('abaixo de 600px a grade tem 7 colunas', () => {
    assert.deepEqual(colunasDaGrade(375), { colunas: 7, tamanho: 53 });
});
test('no desktop o ladrilho tem 56px', () => {
    assert.deepEqual(colunasDaGrade(1000), { colunas: 18, tamanho: 56 });
});
test('onda: atraso proporcional a distancia', () => {
    assert.equal(atrasoDaOnda(30, 40), 80);
});
test('persiana gira uma fileira a cada 28px e guarda o resto', () => {
    const p = criaPersiana();
    assert.deepEqual(p.rola(27), []);
    assert.deepEqual(p.rola(1), [1]);
    assert.deepEqual(p.rola(-60), [-1, -1]);
    assert.deepEqual(p.rola(-3), []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/js/tiles.test.mjs`
Expected: FAIL (`Cannot find module .../tiles.js`)

- [ ] **Step 3: Implementar `tiles.js`**

- Fundo: creme com sorteio `< 0.7`. Senão, uma cor de `CORES`.
- Forma: `null` se o sorteio for `>= chanceDeForma`.
- Desenhos (no espaço 0..100):
  - `quarto`: arco com centro no canto inferior direito;
  - `meio`: semicírculo na metade de baixo;
  - `triangulo`: metade inferior direita;
  - `metade`: retângulo na metade esquerda;
  - `anel`: círculo de raio 42 com `stroke-width` 14.
- `colunasDaGrade`: abaixo de 600px, `tamanho = floor(largura / 7)`. Senão, `tamanho = 56` e `colunas = ceil(largura / 56)`.

- [ ] **Step 4: Rodar**

Run: `node --test tests/js/*.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add static/js/tiles.js tests/js/tiles.test.mjs
git commit -m "feat: regra dos ladrilhos Bauhaus"
```

---

### Task 4: Home com banner (`tile-grid.js`, `banner.js`)

**Files:**
- Create: `static/js/tile-grid.js`, `static/js/banner.js`
- Modify: `templates/home.html`, `static/css/estilo.css` (seção "Home"), `tests/test_pages.py`

**Interfaces:**
- Consumes: tudo de `tiles.js` (Task 3).
- Produces (`tile-grid.js`):
  - `movimentoReduzido() -> boolean`.
  - `criaGradeDeLadrilhos(raiz: HTMLElement, { chanceDeForma = 1 } = {}) -> Grade`, com:
    - `celulaEm(x, y) -> Celula | null`;
    - `gira(celula, sentido = 1, atrasoMs = 0)`;
    - `onda(x, y, acao = (c) => gira(c))`;
    - `pinta(celula, ladrilho)`;
    - `fileira(indice) -> Celula[]`;
    - `linhas() -> number`;
    - `todas() -> Celula[]`;
    - `refaz()`.
  - `Celula = { el, ladrilho, x, y, linha, coluna, ultimoGiroMs }`.
  - A grade se refaz sozinha por `ResizeObserver`. Os SVGs entram por `innerHTML` só com `marcacaoDoLadrilho`. A classe de cada célula é `ladrilho`.

- [ ] **Step 1: Escrever os testes da home**

Em `tests/test_pages.py`, `TestHub` fica assim:

```python
def test_carrega_so_os_modulos_que_precisa(self, hub):
    fontes = re.findall(r'<script[^>]*src="([^"]+)"', hub)
    assert [f.rsplit('/', 1)[-1] for f in fontes] == ['banner.js']

def test_tem_o_banner_e_o_titulo(self, hub):
    assert 'id="banner"' in hub
    assert 'TUDO<br>VIRA PDF.' in hub

def test_nomeia_as_duas_funcoes_em_texto(self, hub):
    assert 'aria-label="Arquivos para PDF"' in hub
    assert 'aria-label="Imagens para PDF"' in hub

def test_o_rotulo_e_abrir_e_nao_soltar(self, hub):
    assert hub.count('ABRIR →') == 2
    assert 'SOLTAR' not in hub
```

Em `TestClassesQueOJavaScriptLiga.MODULOS`, adicionar `'banner.js'` e `'tile-grid.js'`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/bin/pytest -q tests/test_pages.py -k Hub`
Expected: FAIL

- [ ] **Step 3: Implementar `tile-grid.js`, `banner.js`, o template e o CSS**

`home.html`:
- faixa com `contexto='conversor'`;
- `<section class="banner" id="banner">`, com um `<div class="grade-ladrilhos">` e um `<div class="banner-titulo">` contendo `<h1>TUDO<br>VIRA PDF.</h1>` e `<p class="mono">documentos, planilhas, apresentações e imagens.</p>`;
- `<nav class="funcoes">` com duas `<a class="funcao">` (`aria-label` como no teste, número `01`/`02`, título "Arquivos"/"Imagens", extensões e limite vindos do backend e `<span class="botao botao-vermelho|botao-azul">ABRIR →</span>`).

O índice passa a receber `extensoes_documento`, `extensoes_imagem` e `max_mb` em `index()`.

`banner.js` liga os gestos da tabela da spec:
- mouse: `pointermove` gira a célula sob o ponteiro, com intervalo mínimo de 300ms por célula;
- toque: só gira enquanto o dedo está pressionado, e o banner usa `touch-action: pan-y`;
- `click`: `onda`;
- `scroll` (window): `criaPersiana().rola(delta)` gira a próxima fileira com 22ms entre colunas;
- vida própria: um giro aleatório a cada 900ms, só com `IntersectionObserver` visível e `!document.hidden`.

Com `movimentoReduzido()`, a vida própria e a persiana não ligam.

CSS:
- `.banner` com 340px de altura (300px abaixo de 600px), `.banner-titulo` com `pointer-events: none`;
- `h1` com `clamp(56px, 21vw, 96px)` e `letter-spacing: -0.06em`;
- `.funcoes` em duas colunas, que viram uma abaixo de 600px;
- transição do SVG do ladrilho com `transform .45s cubic-bezier(.3, 1.5, .5, 1)`;
- `@media (prefers-reduced-motion: reduce)` com `transition: none`.

- [ ] **Step 4: Rodar tudo**

Run: `venv/bin/pytest -q && node --test tests/js/*.test.mjs && venv/bin/ruff check .`
Expected: PASS

- [ ] **Step 5: Ver no navegador**

Run: `venv/bin/python app.py`, abrir `http://127.0.0.1:5000/` e conferir com o protótipo `banner.html`:
- o hover gira os ladrilhos;
- o clique solta uma onda;
- rolar gira a persiana;
- a vida própria gira um ladrilho por vez;
- no modo dispositivo de 375px aparecem 7 colunas, as funções empilhadas e deslizar na vertical rola a página.

- [ ] **Step 6: Commit**

```bash
git add -A static templates app.py tests
git commit -m "feat: home com banner de ladrilhos que giram"
```

---

### Task 5: Regra da conversão (`press-state.js`)

**Files:**
- Create: `static/js/press-state.js`
- Test: `tests/js/press-state.test.mjs`

**Interfaces:**
- Produces:
  - `formaDoArquivo(nome: string) -> 'quadrado' | 'triangulo' | 'circulo' | 'meio'`. Documento (`docx doc odt`) é quadrado, planilha (`xlsx xls`) é triângulo, apresentação (`pptx ppt odp`) é círculo e imagem (`png jpg jpeg`) é meio. O que não estiver na lista vira quadrado.
  - `COR_DA_FORMA = { quadrado: '#e8452c', triangulo: '#2453d6', circulo: '#f2b705', meio: '#000000' }`.
  - `transicao(estado, evento) -> estado | null`, com estados `'esperando' | 'enviando' | 'convertendo' | 'pronto' | 'erro'` e eventos `'escolheu' | 'progresso' | 'servidor' | 'sucesso' | 'falha' | 'reinicia'`.
  - `aceitaArquivo(estado) -> boolean`.
  - `posicaoNaEsteira(pct, inicio, fim) -> number`: interpolação linear com `pct` limitado a 0..100.

- [ ] **Step 1: Escrever os testes**

```js
test('forma por tipo, sem diferenciar maiuscula', () => {
    assert.equal(formaDoArquivo('RELATORIO.DOCX'), 'quadrado');
    assert.equal(formaDoArquivo('contas.xls'), 'triangulo');
    assert.equal(formaDoArquivo('aula.odp'), 'circulo');
    assert.equal(formaDoArquivo('FOTO.JPG'), 'meio');
    assert.equal(formaDoArquivo('sem-extensao'), 'quadrado');
});
test('fluxo feliz', () => {
    let e = 'esperando';
    for (const [ev, esperado] of [['escolheu','enviando'],['progresso','enviando'],
        ['servidor','convertendo'],['sucesso','pronto']]) { e = transicao(e, ev); assert.equal(e, esperado); }
});
test('upload instantaneo vai de enviando direto a convertendo', () => {
    assert.equal(transicao('enviando', 'servidor'), 'convertendo');
});
test('falha no envio ou na conversao leva a erro', () => {
    assert.equal(transicao('enviando', 'falha'), 'erro');
    assert.equal(transicao('convertendo', 'falha'), 'erro');
});
test('arquivo novo so entra fora do trabalho', () => {
    assert.deepEqual(['esperando','enviando','convertendo','pronto','erro'].map(aceitaArquivo),
                     [true, false, false, true, true]);
});
test('reinicia volta a esperar so do fim', () => {
    assert.equal(transicao('pronto', 'reinicia'), 'esperando');
    assert.equal(transicao('erro', 'reinicia'), 'esperando');
    assert.equal(transicao('convertendo', 'reinicia'), null);
});
test('posicao na esteira e limitada', () => {
    assert.equal(posicaoNaEsteira(50, 0, 200), 100);
    assert.equal(posicaoNaEsteira(140, 0, 200), 200);
    assert.equal(posicaoNaEsteira(-5, 0, 200), 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/js/press-state.test.mjs`
Expected: FAIL (módulo inexistente)

- [ ] **Step 3: Implementar como uma tabela `{ estado: { evento: proximo } }`**

`extensaoDe` vem de `format.js`, com o resultado em minúscula.

- [ ] **Step 4: Rodar**

Run: `node --test tests/js/*.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add static/js/press-state.js tests/js/press-state.test.mjs
git commit -m "feat: estados da conversao e forma por tipo de arquivo"
```

---

### Task 6: Cena da prensa (`press.js`)

**Files:**
- Create: `static/js/press.js`
- Modify: `static/css/estilo.css` (seção "Prensa"), `tests/test_pages.py`

**Interfaces:**
- Consumes: `criaGradeDeLadrilhos` e `movimentoReduzido` (Task 4), mais `COR_DA_FORMA` (Task 5).
- Produces: `criaPrensa(palco: HTMLElement) -> Prensa`, com:
  - `espera(convite: string)`;
  - `chegou({ forma, rotulo })`;
  - `progresso(pct)`;
  - `convertendo()`;
  - `pronto(rotulo)`;
  - `erro(rotulo)`;
  - `para()`.

  Só faz desenho, sem regra de estado: quem chama é que respeita `transicao`.

- [ ] **Step 1: Escrever os testes**

Em `tests/test_pages.py`:

```python
class TestSeguranca:
    @pytest.mark.parametrize('modulo', ['press.js', 'gallery-ui.js', 'convert-ui.js'])
    def test_dado_do_usuario_nunca_vira_html(self, client, modulo):
        fonte = client.get(f'/static/js/{modulo}').get_data(as_text=True)
        # Regex e nao busca da palavra: comentarios citam innerHTML para dizer
        # que ele nao e usado.
        assert not re.search(r'\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\(', fonte)
```

Adicionar `'press.js'` em `TestClassesQueOJavaScriptLiga.MODULOS`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/bin/pytest -q tests/test_pages.py -k "Seguranca or Classes"`
Expected: FAIL (`press.js` não é servido)

- [ ] **Step 3: Implementar `press.js` e o CSS**

O palco recebe filhos criados por DOM:
- `.prensa-chao`: uma grade com `chanceDeForma: 0.28`;
- `.prensa-bloco`: o bloco preto com a haste, num `::before`;
- `.prensa-forma`: SVG criado com `createElementNS` e a forma desenhada por atributos;
- `.prensa-folha`;
- `.prensa-rotulo`: `textContent`.

Comportamento:
- `progresso` move a forma com `posicaoNaEsteira`;
- `convertendo` bate a cada 900ms: o bloco desce, a forma recebe a classe `esmaga` e sai `onda` a partir do ponto de impacto;
- `pronto` achata a forma (`scale(1.6, .08)`), passa uma onda que pinta tudo de creme liso e a folha sobe com overshoot;
- `erro` passa uma onda que pinta de tinta e a forma recebe `debate`.

Com `movimentoReduzido()`, cada método só aplica o estado final.

O CSS vem do painel 2 de `conversao.html`: bloco de 150×90, folha de 120×156 com `--sombra` e canto dobrado.

- [ ] **Step 4: Rodar tudo**

Run: `venv/bin/pytest -q && node --test tests/js/*.test.mjs && venv/bin/ruff check .`
Expected: PASS (`convert-ui.js` ainda não usa `innerHTML`; se usar, o teste aponta e a Task 7 corrige)

- [ ] **Step 5: Commit**

```bash
git add static/js/press.js static/css/estilo.css tests/test_pages.py
git commit -m "feat: cena da prensa sobre o padrao"
```

---

### Task 7: `/convert` com a prensa e início automático

**Files:**
- Modify: `templates/convert.html`, `static/js/convert.js`, `static/js/convert-ui.js`, `static/css/estilo.css` (seção "Conversor"; apagar o CSS antigo de `.cartao`, `.selecionado`, `.remover` e `.principal`), `tests/test_frontend.py`

**Interfaces:**
- Consumes: `criaPrensa` (Task 6), `transicao`, `aceitaArquivo` e `formaDoArquivo` (Task 5), mais `criaFeedback` (`feedback.js`, que não muda).
- Produces: `criaInterface()` com `el`, os métodos de `criaFeedback`, `prensa`, `mostraFim({ url, nome })` (que cria um `<a class="botao botao-vermelho" download>BAIXAR ↓</a>` e um `<button class="botao botao-creme" id="outro">CONVERTER OUTRO</button>` em `#acoes`), `mostraTentarOutro()` (`TENTAR OUTRO` em `#acoes`), `limpaAcoes()` e `travaEntrada(travada)`.

- [ ] **Step 1: Atualizar os testes**

Em `tests/test_frontend.py`, `TestEstrutura` fica assim:

```python
def test_nao_tem_mais_botao_de_converter_nem_remover(self, pagina):
    assert 'id="enviar"' not in pagina and 'id="remover"' not in pagina

def test_o_palco_e_a_area_de_soltar(self, pagina):
    assert re.search(r'<label[^>]*id="area"[^>]*class="[^"]*palco', pagina) or \
        re.search(r'<label[^>]*class="[^"]*palco[^"]*"[^>]*id="area"', pagina)

def test_titulo(self, pagina):
    assert 'ARQUIVOS PARA PDF.' in pagina
```

`name="file"`, `accept`, `class="formatos"`, `role="progressbar"`, `aria-live` e `href="/"` continuam testados.

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/bin/pytest -q tests/test_frontend.py`
Expected: FAIL

- [ ] **Step 3: Implementar o template, a UI e o fluxo**

Template:
- faixa com `contexto='01 · arquivos'`;
- título `ARQUIVOS PARA PDF.` e `<p class="formatos mono">` com o texto atual;
- `<label class="area palco" id="area">` contendo o `<input type="file" id="entrada" name="file" class="so-leitor" accept=...>`;
- `#barra` (`role="progressbar"`) como barra fina de 6px na base do palco;
- `#recado` (`aria-live="polite"`) com fundo `--erro-fundo` e `--borda`;
- `#acoes`;
- o bloco JSON atual.

`convert.js` mantém um `estado` (começa em `'esperando'`):
- `seleciona(arquivo)`: se `!aceitaArquivo(estado)`, ignora. Se `problemaCom` achar problema, `mostraErro` e o estado não muda. Senão, `transicao(estado, 'escolheu')`, `prensa.chegou({ forma: formaDoArquivo(nome), rotulo: \`${nome} · ${formataTamanho}\` })` e chama `converte()` direto.
- `converte()`: `aoProgresso(pct)` chama `prensa.progresso` ou `prensa.convertendo` (este no `null`). No sucesso, `baixa`, `prensa.pronto(\`${nome} · baixando\`)` e `mostraFim`. Na falha, `mostraErro(erro.message)`, `prensa.erro('não achatou')` e `mostraTentarOutro`.
- "CONVERTER OUTRO" e "TENTAR OUTRO" fazem `transicao(estado, 'reinicia')`, `prensa.espera('SOLTE AQUI')`, `limpaAcoes()`, `limpaRecado()` e `el.entrada.click()`.
- Drop, `change` e `paste` passam por `seleciona`. Ao soltar mais de um arquivo, a mensagem atual aparece e o primeiro é usado.
- `travaEntrada(true)` desabilita o input durante o envio e a conversão.

- [ ] **Step 4: Rodar tudo**

Run: `venv/bin/pytest -q && node --test tests/js/*.test.mjs && venv/bin/ruff check .`
Expected: PASS

- [ ] **Step 5: Ver no navegador**

Run: `venv/bin/python app.py` e abrir `/convert`. Conferir:
- um `.docx` vira quadrado, desliza, a prensa bate e sai a folha com o download;
- um `.txt` mostra a mensagem de formato e o palco continua esperando;
- soltar outro arquivo durante a conversão é ignorado;
- "CONVERTER OUTRO" volta ao início.

- [ ] **Step 6: Commit**

```bash
git add -A templates/convert.html static tests/test_frontend.py
git commit -m "feat: conversor com prensa e inicio automatico"
```

---

### Task 8: Seleção e geometria da folha em `gallery.js`

**Files:**
- Modify: `static/js/gallery.js`
- Test: `tests/js/gallery.test.mjs`

**Interfaces:**
- Produces (novos membros de `criaGaleria`):
  - `selecionado() -> number | null`;
  - `seleciona(id) -> boolean`.
- Produces (funções puras exportadas):
  - `proporcaoDaFolha({ tamanho, largura, altura, rotacao }) -> number` (largura sobre altura);
  - `margemEmFracao(margemMm, tamanho) -> number` (fração da largura da folha).

- [ ] **Step 1: Escrever os testes**

```js
test('adicionar numa galeria vazia seleciona o primeiro adicionado', () => {
    const g = criaGaleria({ maxImagens: 20, urls: urlsDeTeste() });
    g.adiciona([arquivo('a.png'), arquivo('b.png')]);
    assert.equal(g.selecionado(), g.itens()[0].id);
});
test('adicionar mais nao muda a selecao', () => { /* seleciona o 2º, adiciona, continua o 2º */ });
test('remover a selecionada passa para a seguinte', () => { /* a,b,c; sel b; remove b -> c */ });
test('remover a ultima selecionada passa para a anterior', () => { /* a,b,c; sel c; remove c -> b */ });
test('remover a unica deixa a selecao nula', () => { /* a; remove a -> null */ });
test('limpa zera a selecao', () => { /* ... -> null */ });
test('seleciona id inexistente devolve false e nao muda', () => { /* ... */ });
test('folha A4 e carta tem proporcao fixa', () => {
    assert.equal(proporcaoDaFolha({ tamanho: 'a4', largura: 4000, altura: 3000, rotacao: 0 }), 210 / 297);
    assert.equal(proporcaoDaFolha({ tamanho: 'letter', largura: 1, altura: 1, rotacao: 0 }), 215.9 / 279.4);
});
test('folha no tamanho da imagem segue a imagem e a rotacao', () => {
    assert.equal(proporcaoDaFolha({ tamanho: 'image', largura: 400, altura: 300, rotacao: 90 }), 300 / 400);
});
test('margem em fracao da largura e zero no tamanho da imagem', () => {
    assert.equal(margemEmFracao(21, 'a4'), 0.1);
    assert.equal(margemEmFracao(21, 'image'), 0);
});
```

Os corpos com comentário seguem o padrão dos testes existentes no arquivo (`urlsDeTeste`, `arquivo`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/js/gallery.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implementar**

`remove` calcula a nova seleção antes de filtrar: o item no mesmo índice da lista nova, senão o anterior, senão `null`. Os testes atuais de `gallery.test.mjs` continuam passando sem mudança.

- [ ] **Step 4: Rodar**

Run: `node --test tests/js/*.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add static/js/gallery.js tests/js/gallery.test.mjs
git commit -m "feat: selecao e geometria da folha na galeria"
```

---

### Task 9: `/imgtopdf` em esteira

**Files:**
- Modify: `templates/imgtopdf.html`, `static/js/gallery-ui.js`, `static/js/imgtopdf.js`, `static/css/estilo.css` (seção "Imagens"; apagar o CSS antigo de `.cartao-largo`, `.grade` e `.pagina`), `tests/test_pages.py`

**Interfaces:**
- Consumes: `selecionado`, `seleciona`, `proporcaoDaFolha` e `margemEmFracao` (Task 8), mais `criaPrensa` (Task 6) e `criaGradeDeLadrilhos` (Task 4, para o bloco "+ SOLTE MAIS" e o palco vazio). `tornaArrastavel` e `ESPERA_NO_TOQUE_MS` continuam vindo de `drag.js`.
- Produces: `criaInterfaceDaGaleria(acoes)`. Às ações atuais soma-se `seleciona(id)`. Devolve:
  - `el`, os métodos de feedback e `mostraMontando`;
  - `desenha(itens, selecionadoId, { tamanho, margemMm })`;
  - `marcaEnviando(enviando, quantidade)`, que trava a fita e os controles com a classe `travada`;
  - `marcaMargemAplicavel(aplicavel)`;
  - `marcaArrastando`;
  - `prensa`;
  - `mostraCena(visivel)`;
  - `mostraFim({ url, nome })` (BAIXAR ↓ e `<button id="novo">NOVO PDF</button>` em `#acoes`);
  - `mostraTentarOutro()`;
  - `limpaAcoes()`.

- [ ] **Step 1: Atualizar os testes**

Em `tests/test_pages.py`:
- `TestGaleria` ganha:

```python
def test_titulo(self, galeria):
    assert 'IMAGENS PARA PDF.' in galeria

def test_tem_palco_e_fita(self, galeria):
    assert 'id="palco"' in galeria and 'id="fita"' in galeria

def test_tamanho_e_escolha_unica_com_as_opcoes_do_backend(self, galeria, config_galeria):
    valores = re.findall(r'<input type="radio" name="tamanho" value="([^"]+)"', galeria)
    assert valores == [t['valor'] for t in config_galeria['tamanhos']]
```

- `TestModulosDaGaleria.MODULOS` ganha `'press.js'`, `'press-state.js'`, `'tile-grid.js'` e `'tiles.js'`.
- `TestArrasteUnificado` continua valendo para `gallery-ui.js` (sem drag-and-drop HTML5, sem fiação própria de ponteiro, com `esperaNoToqueMs`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/bin/pytest -q tests/test_pages.py -k "Galeria or Modulos"`
Expected: FAIL

- [ ] **Step 3: Implementar o template**

- Faixa com `contexto='02 · imagens'`.
- Título `IMAGENS PARA PDF.` ao lado dos controles:
  - `<fieldset id="opcoes">` com rádios `name="tamanho"` (um por `tamanhos`, rótulos em caixa alta, `a4` marcado);
  - margem com `<button data-margem="-1">−</button>`, `<input type="number" id="margem" min="0" max="{{ margem_max }}">` e `<button data-margem="1">+</button>`;
  - `<button type="submit" id="enviar" class="botao botao-vermelho">`.
- `<section id="palco">` com a folha grande, `#numero` ("03 de 06"), `#nome-arquivo`, os botões `data-acao` (↺ ↻ ← → ×, iguais a `ACOES` de hoje) e `<div id="cena">` (oculto) para a prensa.
- `<ol id="fita">`.
- `<label class="area" id="area">` com o input `multiple`, que é o bloco "+ SOLTE MAIS" no fim da fita. Com a galeria vazia, o body ganha a classe `vazia` e o CSS estica a área no palco com "SOLTE IMAGENS AQUI".
- `#barra`, `#recado`, `#acoes` e o JSON atual.

- [ ] **Step 4: Implementar `gallery-ui.js`**

- A folha grande usa `<img src={item.url}>` (blob), com `transform: rotate(rotacao)`, `aspect-ratio` vindo de `proporcaoDaFolha` (as dimensões vêm de `naturalWidth` e `naturalHeight` no `load`) e `padding` em % vindo de `margemEmFracao`.
- Cada item da fita é um `<li data-id>` com miniatura `<img>` e número. Clicar seleciona. O arrasto reordena como hoje (`ligaArraste`).
- O nome do arquivo entra por `textContent`. Nada de `innerHTML`.
- O foco depois de uma ação continua com `focoDepoisDe`.

- [ ] **Step 5: Implementar `imgtopdf.js`**

- `redesenha()` chama `ui.desenha(galeria.itens(), galeria.selecionado(), opcoes)`.
- Os botões de margem somam e limitam a `0..margemMax`. Os rádios de tamanho chamam `marcaMargemAplicavel(tamanho !== 'image')` e `redesenha`.
- `gera()`:
  - `ui.mostraCena(true)`;
  - `prensa.chegou({ forma: 'meio', rotulo: \`${n} imagens\` })`;
  - `aoProgresso` igual à Task 7.
- No sucesso: `baixa`, `prensa.pronto(nome)` e `mostraFim`. **Não chama `galeria.limpa()`.** "NOVO PDF" faz `galeria.limpa()`, `ui.mostraCena(false)`, `limpaAcoes()` e `redesenha()`.
- Na falha: `mostraErro`, `prensa.erro(...)` e `mostraTentarOutro`. "TENTAR OUTRO" faz `ui.mostraCena(false)`, `limpaAcoes()` e `redesenha()`, com a galeria intacta.
- Adicionar, colar e soltar continuam passando por `adiciona`, ignorados enquanto `enviando`.

- [ ] **Step 6: Rodar tudo**

Run: `venv/bin/pytest -q && node --test tests/js/*.test.mjs && venv/bin/ruff check .`
Expected: PASS

- [ ] **Step 7: Ver no navegador**

Abrir `/imgtopdf` e conferir:
- três imagens: a primeira fica selecionada, ↻ gira o palco, ← → reordenam, clicar na fita seleciona e o arrasto na fita reordena;
- A4 com 20 mm mostra a margem e "IMAGEM" desabilita a margem;
- gerar mostra a cena e baixa o PDF, as imagens continuam na fita e "NOVO PDF" limpa tudo;
- com o servidor parado, gerar dá erro e "TENTAR OUTRO" devolve a esteira intacta;
- em 375px, o palco fica em cima, os botões numa linha e a fita rola com o dedo.

- [ ] **Step 8: Commit**

```bash
git add -A templates/imgtopdf.html static tests/test_pages.py
git commit -m "feat: pagina de imagens em esteira com a prensa"
```

---

### Task 10: Limpeza e documentação

**Files:**
- Modify: `static/css/estilo.css` (remover regras sem uso: `.bolinha*`, `.tema-*`, `--acento*`, `.cartao*`, `.selo`), `tests/test_pages.py`, `README.md` (a seção "Testando num celular" passa a falar do banner, da prensa e da fita em vez da física das bolinhas)

- [ ] **Step 1: Travar o "nada arredondado" e procurar sobras**

Em `tests/test_pages.py`:

```python
def test_nada_e_arredondado(css_do_site):
    assert re.findall(r'border-radius:\s*(?!0)[^;]+', css_do_site) == []
```

Run: `grep -nE "bolinha|tema-|--acento|cartao|selo|dots" static/css/estilo.css static/js/*.js templates/*.html README.md`
Expected: nenhuma linha (o README só cita o que existe)

- [ ] **Step 2: Rodar tudo**

Run: `venv/bin/pytest -q && node --test tests/js/*.test.mjs && venv/bin/ruff check .`
Expected: PASS

- [ ] **Step 3: Conferir as três páginas com movimento reduzido**

No DevTools, em Rendering, emular `prefers-reduced-motion: reduce`. Esperado:
- o banner não gira sozinho nem com a rolagem;
- a conversão troca de estado sem animação;
- o arquivo continua baixando.

- [ ] **Step 4: Commit**

```bash
git add -A static README.md
git commit -m "chore: limpa estilos antigos e atualiza o README"
```
