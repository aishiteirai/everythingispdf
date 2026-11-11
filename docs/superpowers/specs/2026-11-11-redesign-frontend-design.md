# Redesenho do front: brutalismo com formas Bauhaus

Data: 2026-11-11
Status: aprovado, pronto para plano de implementação

## Intenção

Hoje o site parece um conversor de PDF genérico e competente: papel claro,
cartões arredondados, bolinhas arrastáveis no hub. A ideia é que a pessoa entre
esperando mais um conversor e leve um susto bom. O site deve parecer arte
contemporânea minimalista: autêntico, com personalidade e divertido de usar.

A referência é a **atitude** do jogo *Big Walk*, não a aparência dele. O jogo
junta linguagens que não deveriam combinar e o resultado só existe ali. Aqui a
colisão é:

- **brutalismo de web**: grade crua exposta, bordas pretas grossas, nada
  arredondado, grotesca pesada, detalhes em monoespaçada;
- **geometria Bauhaus**: quadrado, círculo, triângulo e frações de círculo em
  cores primárias chapadas;
- **comportamento de brinquedo**: as formas giram, levam pancada e achatam. O
  humor está no comportamento, não em texto engraçadinho.

O conceito que amarra tudo é que **tudo vira PDF, ou seja, tudo fica plano**:
o arquivo vira uma forma, a forma é prensada e sai uma folha.

## Objetivos

- Causar estranhamento bom no primeiro segundo e ser lembrado.
- Ser divertido de mexer no desktop e no celular, com dinâmicas próprias para
  toque em vez de hover adaptado.
- Manter tudo o que funciona hoje: as mesmas funções, limites, mensagens de
  erro, acessibilidade e testes de contrato com o backend.

## Não-objetivos

- Mudar backend, API, rotas, limites ou formatos aceitos.
- Mudar as mensagens de erro (os textos por status continuam; só a
  apresentação muda).
- Adicionar bundler, framework ou dependência JavaScript.

## Anti-objetivos (falha mesmo funcionando)

- **Bonito mas chato:** se nada responde ao toque, perdeu o sentido.
- **Estranho a ponto de confundir:** em nenhum momento a pessoa pode ficar sem
  saber onde soltar o arquivo ou como baixar o PDF.
- **Cara de "tech" clichê:** nada de neon, glitch, matrix ou gradiente
  futurista. A tecnologia aparece no comportamento.
- **Museu literal:** a referência a arte é de atitude. Sem pedestal, plaqueta,
  "acervo" ou "sala".
- **Movimento sem motivo:** formas em loop de animação ensaiada pareceram
  esquisitas no protótipo. Tudo o que se mexe reage a algo (ponteiro, rolagem,
  estado da conversão). A única exceção é a "vida própria" do banner, que é
  esparsa e discreta.

## Restrições do projeto

- **CSP** (`app.py`, `POLITICA_DE_SEGURANCA`): `script-src 'self'` impede
  script inline; `style-src` permite `unsafe-inline`; fontes e imagens só da
  própria origem. Nada de CDN.
- **Sem bundler:** módulos ES nativos em `static/js/`, cada página carrega só o
  que usa (há teste para isso em `tests/test_pages.py`).
- **Fonte auto-hospedada:** a Inter fica em `static/fonts/`. O arquivo atual só
  cobre os pesos 400 a 700, e o design precisa de 900 (ver abaixo).
- **Testes que continuam valendo:** contraste dos tokens em AA
  (`PARES_DE_CONTRASTE`), `prefers-reduced-motion` presente no CSS, progresso
  anunciado para leitor de tela, `accept` e limites batendo com o backend,
  todo import resolvido, sintaxe do JS (`tests/js/sintaxe.test.mjs`), toda
  classe usada no JS definida no CSS.
- **Movimento reduzido:** com `prefers-reduced-motion: reduce`, nada gira,
  quica ou bate. Os estados só trocam.

## Protótipos de referência

Os protótipos aprovados ficam em
`docs/superpowers/specs/2026-11-11-redesign-frontend-prototipos/`. São
descartáveis e servem para mostrar comportamento, sem ser código de produção.

| Arquivo | O que mostra | O que vale |
|---|---|---|
| `banner.html` | Home no desktop e num quadro de celular | Layout da home, banner e dinâmica "gira + vida própria", gestos de toque e rolagem |
| `conversao.html` | Três variantes do momento da conversão | **Só o painel 2, "Prensa sobre o padrão"**. Os painéis 1 e 3 foram descartados |
| `imagens.html` | Três layouts da página de imagens | **Só o B, "Esteira"**. A e C foram descartados |

## Linguagem visual

### Paleta

| Papel | Cor |
|---|---|
| Fundo (creme) | `#fffef9` |
| Linhas, texto, sombra dura | `#000` |
| Vermelho | `#e8452c` |
| Amarelo | `#f2b705` |
| Azul | `#2453d6` |
| Fundo da página atrás do conteúdo / quadriculado | `#e9e7e0` |

O amarelo nunca carrega texto. Ele é cor de forma e de destaque de seleção com
texto preto por cima. Texto sobre vermelho é preto e texto sobre azul é branco.
Os pares entram em `PARES_DE_CONTRASTE` e precisam passar em AA.

### Modo escuro

É um tema invertido: fundo preto, linhas e texto creme, sombras duras em creme.
As três primárias continuam iguais. Segue o padrão atual de `color-scheme:
light dark` e de tokens em `:root` sobrescritos por
`prefers-color-scheme: dark`.

O banner, o palco da prensa, o palco da esteira e o bloco "+ SOLTE MAIS"
**não invertem**. Eles continuam como ilhas claras (creme, preto e primárias,
com cores fixas e não de token de tema), como folhas de papel sobre uma mesa
escura, e mantêm a borda e a sombra dura do tema escuro em volta. Assim a
prensa preta, a onda branca do sucesso e a onda escura do erro funcionam igual
nos dois modos. *(Decidido com o usuário.)*

### Tipografia

- Grotesca pesada para títulos: a Inter no peso 900, com espaçamento negativo
  forte (o protótipo usa cerca de -0,06em nos títulos grandes).
- Monoespaçada para detalhes técnicos (extensões, limites, estados, cotas). Usa
  a pilha do sistema (`ui-monospace, SFMono-Regular, Menlo, monospace`), sem
  arquivo novo.
- Títulos em caixa alta terminando em ponto: "TUDO VIRA PDF.", "ARQUIVOS PARA
  PDF.", "IMAGENS PARA PDF.".

### Estrutura

- Bordas de 3px pretas, cantos retos, nenhum `border-radius`.
- Sombra dura deslocada (`8px 8px 0 #000`) em títulos e botões principais. O
  botão "afunda" ao ser pressionado: anda na direção da sombra e a sombra
  encolhe.
- A página é uma grade de células separadas por bordas. Os rótulos de ação
  ("SOLTAR ↓", "BAIXAR ↓") encostam no canto da célula.

### Ladrilhos

O ladrilho é a unidade visual do site, usada no banner, na área de soltar e no
"adicionar mais". É um quadrado com fundo creme (cerca de 70% das vezes) ou de
cor, e uma destas formas por cima: quadrado cheio, círculo, quarto de círculo,
meio círculo, triângulo, metade, anel. A rotação é um múltiplo de 90°. A
geração é aleatória a cada carregamento.

## Componentes compartilhados

### Faixa do topo

Fica em todas as páginas (substitui `_cabecalho.html`). Tem células separadas
por borda: "EVERYTHING IS PDF" (link para `/`, em 900), um rótulo de contexto
em monoespaçada ("conversor", "01 · arquivos", "02 · imagens") e, na ponta,
"pt-br". No celular, o rótulo do meio some.

### Botão de ação principal

Fundo de cor primária, borda de 3px, sombra dura, texto 900 em caixa alta.
Exemplos: "GERAR PDF · 6 PÁGS", "BAIXAR ↓", "TENTAR OUTRO".

## Home (`/`)

De cima para baixo:

1. **Faixa do topo.**
2. **Banner:** grade de ladrilhos ocupando a largura toda, com cerca de 340px de
   altura no desktop e 300px no celular. Por cima, no canto inferior esquerdo,
   fica um bloco sólido creme com borda e sombra dura contendo "TUDO VIRA PDF."
   e a linha "documentos, planilhas, apresentações e imagens." O bloco não
   intercepta o ponteiro (`pointer-events: none`), para a interação com o
   banner continuar embaixo dele.
3. **Duas células lado a lado:** "01 Arquivos" e "02 Imagens", com as extensões
   aceitas e o limite em monoespaçada, mais um rótulo-botão no canto ("SOLTAR
   ↓", vermelho na 01 e azul na 02). A célula inteira é o link para `/convert`
   ou `/imgtopdf`.
   O rótulo do canto é "ABRIR →", não "SOLTAR ↓": a home não recebe arquivo, e
   soltar ali não faz nada. *(Decisão do redator.)*

As bolinhas arremessáveis saem. Ver "O que sai".

### Dinâmica do banner: gira + vida própria

| Gesto | Efeito |
|---|---|
| Mouse passando por cima | O ladrilho sob o ponteiro gira 90°, com leve overshoot (cerca de 0,45s). Um ladrilho só gira de novo depois de cerca de 300ms |
| Clique ou toque | Uma onda de giros parte do ponto e o atraso de cada ladrilho é proporcional à distância |
| Deslizar o dedo na horizontal | Risca um rastro de giros. O banner usa `touch-action: pan-y`, então deslizar na vertical continua rolando a página |
| Rolar a página | As fileiras giram em cascata, como uma persiana, a cada cerca de 28px rolados. Descer gira num sentido e subir no outro |
| Vida própria | Um ladrilho aleatório gira a cada cerca de 900ms |

A vida própria pausa quando o banner está fora da tela
(`IntersectionObserver`) ou a aba está oculta. Com movimento reduzido, a vida
própria e a persiana desligam. Os giros por gesto viram troca instantânea.

No celular, a grade tem 7 colunas (ladrilho grande o bastante para o dedo). No
desktop, o ladrilho tem cerca de 56px. A grade se refaz quando o banner muda de
tamanho.

## Arquivos para PDF (`/convert`)

- Faixa do topo e título "ARQUIVOS PARA PDF." com as extensões e o limite em
  monoespaçada.
- O **palco da prensa** ocupa a largura toda e é a própria área de soltar
  (arrastar, clicar para escolher e Ctrl+V continuam como hoje).
- **A conversão começa sozinha** assim que um arquivo válido é escolhido,
  solto ou colado. Não existe mais botão "Converter para PDF" nem o × para
  remover o arquivo antes do envio. Para trocar de arquivo, basta soltar outro
  depois do fim. *(Decidido com o usuário: a cena da prensa é a resposta ao
  gesto de soltar.)* Os testes que olham o botão de envio de `/convert` mudam
  junto.

### O momento da conversão: prensa sobre o padrão

O fluxo real do site tem três fases: o envio, com porcentagem de verdade
vinda do XHR; a conversão, de duração desconhecida e sem porcentagem; e o fim,
com o download automático. A cena acompanha essas fases:

| Estado | Cena |
|---|---|
| Esperando | Chão de ladrilhos esparsos (cerca de 28% com forma), prensa recolhida no alto e convite "SOLTE AQUI / ou toque para escolher" bem legível |
| Arquivo escolhido | Aparece a forma do tipo, com nome e tamanho do arquivo num rótulo. É um instante, não um estado de repouso: o envio começa sozinho |
| Enviando | A forma desliza até debaixo da prensa, com a posição igual à porcentagem do upload. O estado mostra "ENVIANDO 42%" |
| Convertendo | A prensa (bloco preto com haste) bate em loop, cerca de 1 pancada por 0,9s. Cada pancada esmaga a forma (achata e volta) e solta uma onda de giros no chão a partir do ponto de impacto. O estado mostra "CONVERTENDO…" |
| Pronto | A forma achata até virar uma linha, uma onda deixa o chão branco e uma folha com sombra dura e canto dobrado sobe de baixo, com o nome do PDF. O download começa sozinho e "BAIXAR ↓" fica como reserva |
| Erro | Uma onda escurece o chão, a forma se debate e não achata, e aparece a mensagem do status (as mesmas de hoje) com "TENTAR OUTRO" |

**Depois do fim** *(decisão do redator)*:
- O palco continua sendo área de soltar em todos os estados. Soltar um arquivo
  novo sobre a folha pronta ou sobre o chão escuro do erro recomeça o fluxo.
- Em "Pronto", além de "BAIXAR ↓", há "CONVERTER OUTRO", que volta para
  "Esperando" e abre o seletor.

**Erros antes do envio** *(decisão do redator)*: extensão errada, arquivo
grande demais e "Um arquivo por vez. Usei o primeiro." são detectados no
navegador e não passam pela cena. Eles aparecem como mensagem de texto numa
faixa logo abaixo do palco (o `#recado` de hoje), com borda preta e fundo de
erro, e o palco continua em "Esperando".

**Forma por tipo:**

| Tipo | Forma |
|---|---|
| Documento (docx, doc, odt) | quadrado vermelho |
| Planilha (xlsx, xls) | triângulo azul |
| Apresentação (pptx, ppt, odp) | círculo amarelo |
| Imagem (png, jpg, jpeg) | semicírculo preto |

O texto de estado continua num elemento anunciado para leitor de tela, e a
barra de progresso existente vira esse texto mais a cena. O `role="progressbar"`
e os atributos `aria-*` continuam valendo para quem não vê a cena. Com
movimento reduzido, não há deslize, pancada nem onda: a cena troca direto de um
estado para o outro.

## Imagens para PDF (`/imgtopdf`): esteira

- **Topo:** faixa e título "IMAGENS PARA PDF." ao lado dos controles da página,
  que são:
  - tamanho em botões segmentados com as opções do backend (IMAGEM / A4 /
    CARTA);
  - margem com − e + mostrando "N mm" e respeitando `margemMax`;
  - botão vermelho "GERAR PDF · N PÁGS".
- **Palco:** a página selecionada em tamanho grande sobre fundo quadriculado,
  com sombra dura e tamanho e margem reais. Ao lado, o número gigante "03 de
  06", o nome do arquivo e os botões GIRAR, ANTES, DEPOIS e REMOVER. No
  celular, o palco fica em cima e os botões numa linha abaixo dele.
- **Fita:** todas as páginas numeradas numa faixa horizontal com rolagem (com o
  dedo no celular). Um toque seleciona e a selecionada fica com fundo amarelo.
  O último item é um bloco de ladrilhos "+ SOLTE MAIS" que abre o seletor e
  aceita soltar. Os ladrilhos dele giram ao passar o mouse.
- **Vazio:** sem imagens, o palco vira um chão de ladrilhos grande com "SOLTE
  IMAGENS AQUI". Adicionar não substitui, e Ctrl+V continua funcionando.
- **Reordenar:** os botões ANTES e DEPOIS são o mecanismo principal, como hoje.
  O arrasto na fita fica como atalho, reaproveitando `drag.js`/`drag-state.js`
  (que já tratam toque com espera para não brigar com a rolagem).
- **Gerar** *(decisão do redator)*: a cena da prensa toma o lugar do palco.
  A fita e os controles ficam visíveis, mas travados, enquanto ela roda.
  - **Erro:** "TENTAR OUTRO" volta para a esteira com todas as imagens, ordem,
    giros e opções intactos. O trabalho do usuário nunca é descartado por um
    erro.
  - **Sucesso:** a folha aparece no palco com "BAIXAR ↓" e "NOVO PDF". As
    imagens continuam na fita até "NOVO PDF", que limpa tudo. Isso troca o
    `galeria.limpa()` automático de hoje, para dar para gerar de novo com outro
    tamanho ou margem.
  - Erros detectados no navegador (formato, tamanho, mais de 20 imagens) seguem
    como mensagem de texto abaixo do palco, sem cena.
- **Cena da geração:** A forma usada é o semicírculo preto
  da imagem, com rótulo "N imagens".

## O que sai

- **As bolinhas do hub:** `dots.js`, `dots-state.js` e
  `tests/js/dots.test.mjs`; a função `posicoes_das_bolinhas`, o cookie
  `bolinhas`, `LIMITE_ARRASTO_PX`, `SEPARADOR_DE_BOLINHAS`, `_limita_arrasto` e
  o argumento `posicoes` em `index()`; os testes Python que cobrem o cookie.
- O tema por função (`tema-convert`, `tema-imgtopdf`, `--acento*`) dá lugar à
  paleta única. Os testes de tema e contraste mudam para os novos tokens, mas
  continuam existindo.
- `estilo.css` é reescrito.

## Deixado para quem implementar

- Nome e organização dos novos módulos JS (por exemplo, um módulo de ladrilhos
  compartilhado pelo banner, pela prensa e pelo "adicionar mais").
- Obter um arquivo da Inter que cubra o peso 900, mantendo o subset latin e
  latin-ext e a licença.
- Curvas e tempos exatos das animações. Os valores do protótipo são ponto de
  partida.
- Se a vida própria e a persiana pausam durante a conversão.
- Ajustes finos de layout entre o celular (375px) e o desktop (cerca de
  1000px).
