# everythingispdf

Serviço web que gera PDF de duas formas:

- **Converter um arquivo** — um documento ou imagem entra, um PDF sai.
- **Montar PDF de imagens** — várias imagens viram um PDF único, com ordem e
  rotação escolhidas na tela.

Documentos passam pelo LibreOffice em modo headless; imagens vão pelo Pillow.

## Formatos aceitos

| Categoria | Extensões |
|---|---|
| Texto | `docx`, `doc`, `odt` |
| Apresentação | `pptx`, `ppt`, `odp` |
| Planilha | `xlsx`, `xls` |
| Imagem | `png`, `jpg`, `jpeg` |

Limite de 32 MB por envio. É o limite do request inteiro, então na montagem de
imagens vale para a soma dos arquivos, não para cada um. Até 20 imagens por PDF.

## Rodando com Docker

O LibreOffice já vem na imagem. É o caminho recomendado — sem Docker você
precisa instalar o LibreOffice na mão.

```bash
docker compose up --build
```

Abra <http://localhost:10000>. A composição sobe o serviço mais um Redis para o
contador de rate limit — sem ele o limite efetivo fica multiplicado pelo número
de workers do gunicorn (ver abaixo).

Só a imagem, sem Redis, também funciona:

```bash
docker build -t everythingispdf .
docker run --rm -p 10000:10000 everythingispdf
```

## Rodando local

Precisa de Python 3.10+ e do binário `libreoffice` no `PATH`.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py                 # http://127.0.0.1:5000
```

O servidor de desenvolvimento escuta só em `127.0.0.1`. Produção roda por
gunicorn (ver `Dockerfile`).

### Testando num celular na mesma rede

O banner que gira com o dedo, a cena da prensa e a fita da galeria (rolar
com o dedo, segurar para reordenar) só se verificam num aparelho de verdade.
Para alcançar o servidor pelo celular:

```bash
HOST=0.0.0.0 python app.py
```

Depois abra `http://<ip-da-maquina>:5000` no celular. Não precisa de HTTPS —
nada aqui exige contexto seguro.

**Com o servidor no WSL2 há um passo a mais.** Em modo NAT, que é o padrão, o
WSL fica numa sub-rede própria e o celular não alcança nem com `0.0.0.0`. No
Windows 11 build 22621 ou mais novo, a saída limpa é ativar rede espelhada —
criar `%UserProfile%\.wslconfig` com:

```ini
[wsl2]
networkingMode=mirrored
```

e depois `wsl --shutdown`. A partir daí o WSL compartilha a pilha de rede do
Windows e o endereço da LAN funciona direto.

Sem rede espelhada, a alternativa é redirecionar a porta no Windows, num
PowerShell como administrador:

```powershell
netsh interface portproxy add v4tov4 listenport=5000 listenaddress=0.0.0.0 `
  connectport=5000 connectaddress=<ip-do-wsl>
New-NetFirewallRule -DisplayName "everythingispdf dev" -Direction Inbound `
  -LocalPort 5000 -Protocol TCP -Action Allow
```

O IP do WSL muda a cada reinício, então o redirecionamento precisa ser refeito.
Rodar por Docker Desktop evita o problema: a publicação de porta passa pelo
Windows e a LAN funciona sem redirecionar nada.

**Lembre que isso expõe um servidor de desenvolvimento na sua rede.** Qualquer
aparelho no wifi pode enviar arquivos para ele enquanto estiver de pé.

## API

### `POST /api/convert`

`multipart/form-data` com um campo `file`. Devolve o PDF como anexo.

```bash
curl -F 'file=@relatorio.docx' http://localhost:10000/api/convert -o saida.pdf
```

| Status | Significado |
|---|---|
| `200` | PDF no corpo da resposta |
| `400` | Campo `file` ausente, nome vazio, ou imagem que não pode ser lida |
| `413` | Arquivo acima de 32 MB |
| `415` | Extensão não suportada |
| `429` | Rate limit excedido |
| `500` | Falha na conversão do documento (LibreOffice) |
| `504` | Conversão passou do tempo limite |

Erros vêm como JSON: `{"error": "..."}`.

Imagem ilegível dá `400` e não `500`: no caminho de imagem o Pillow é o único
executor, então bytes que ele não abre são entrada inválida do cliente. `500`
fica para falha do LibreOffice, que é do servidor.

Imagens neste endpoint passam pelo mesmo pipeline de `/api/imgtopdf`: a
orientação do EXIF é corrigida, a página é gravada a 150 DPI e o lado maior é
limitado a 2200 px. Antes eram 100 DPI, sem limite e sem EXIF — a mesma foto de
celular saía deitada aqui e em pé lá.

### `POST /api/imgtopdf`

`multipart/form-data` com o campo `files` repetido — **a ordem do envio é a
ordem das páginas** — e um campo `options` com JSON.

```bash
curl -F 'files=@p1.png' -F 'files=@p2.png' \
  -F 'options={"pages":[{"rotation":0},{"rotation":90}],"size":"a4","margin_mm":10}' \
  http://localhost:10000/api/imgtopdf -o galeria.pdf
```

| Campo de `options` | Regra |
|---|---|
| `pages` | Lista do mesmo tamanho de `files`. Comprimento diferente é `400`: ordem e rotação desalinhariam em silêncio |
| `pages[].rotation` | `0`, `90`, `180` ou `270`, graus no sentido horário |
| `size` | `image` (a página herda o tamanho da imagem), `a4` ou `letter`. Com `a4` e `letter` a orientação é automática por imagem |
| `margin_mm` | Inteiro de 0 a 50. Ignorado quando `size` é `image` |

| Status | Significado |
|---|---|
| `200` | PDF no corpo da resposta |
| `400` | `options` inválido, quantidade fora de 1..20 ou imagem ilegível |
| `413` | Envio acima de 32 MB |
| `415` | Extensão que não é de imagem |
| `429` | Rate limit excedido |
| `500` | Falha ao montar o PDF |

Não existe `504` aqui: não há LibreOffice neste caminho.

Imagem ilegível dá `400`, e não o `500` de `/api/convert`. A diferença é
intencional: aqui o Pillow é o único executor, então bytes que ele não abre são
entrada inválida do cliente, não falha do servidor.

### Outras rotas

- `GET /` — hub com as duas funções
- `GET /convert` — página de conversão de arquivo único (arrastar e soltar,
  colar imagem com Ctrl+V, validação de formato e tamanho antes de enviar,
  barra de progresso, tema claro e escuro)
- `GET /imgtopdf` — montador de PDF de imagens (adicionar sem substituir,
  reordenar por botão ou arrasto, girar, escolher tamanho de página e margem)
- `GET /health` — `{"status": "ok"}`
- `GET /apidocs` — Swagger UI. Não há link para ela na interface: a API é
  acessada por URL

## Configuração

Tudo por variável de ambiente.

| Variável | Default | Para quê |
|---|---|---|
| `PORT` | `5000` | Porta do servidor de desenvolvimento |
| `HOST` | `127.0.0.1` | Interface do servidor de desenvolvimento |
| `TEMP_FOLDER` | `./temp` | Diretório de trabalho das conversões |
| `CONVERSION_TIMEOUT` | `90` | Segundos até abortar o LibreOffice |
| `RATE_LIMIT` | `10 per minute;60 per hour` | Limite por IP nos dois endpoints |
| `RATELIMIT_STORAGE_URI` | `memory://` | Onde guardar os contadores |
| `TRUSTED_PROXIES` | `0` | Quantos proxies reversos confiar |

A rota `/debug/proxy`, que existia atrás de `DEBUG_PROXY` para calibrar
`TRUSTED_PROXIES`, foi removida depois de servir ao propósito. Um teste garante
que ela não volta nem com a variável definida.

### Atrás de um proxy reverso

Com `TRUSTED_PROXIES=0` o rate limit usa o IP da conexão. Atrás de um proxy
(Render, nginx) isso agrupa todo mundo no mesmo balde, porque a conexão vem
sempre do proxy — configure `TRUSTED_PROXIES=1` para o `X-Forwarded-For` ser
considerado.

**Não ligue essa variável sem um proxy real na frente.** O cliente controla o
`X-Forwarded-For`; confiar nele sem proxy deixa qualquer um falsificar o IP e
escapar do limite.

### Rate limit com mais de um worker

`memory://` conta por processo, então o limite efetivo é `RATE_LIMIT` × número
de workers do gunicorn — com os dois workers do `Dockerfile`, o dobro do que a
variável diz. O `docker-compose.yml` resolve isso apontando
`RATELIMIT_STORAGE_URI` para um Redis compartilhado:

```bash
RATELIMIT_STORAGE_URI=redis://redis:6379/0
```

O default segue `memory://` para `python app.py` subir sem depender de nada.

O Redis da composição não publica porta — quem precisa alcançá-lo é o app, pela
rede interna — e roda sem persistência, com teto de 64 MB e política `allkeys-lru`.
Contador de rate limit é descartável: perdê-lo custa uma janela de contagem, e
não vale o risco de o Redis ser o motivo de a máquina encher.

**Queda do Redis não derruba o serviço.** `in_memory_fallback_enabled` faz o
limite voltar a contar por processo, com um aviso no log, em vez de recusar toda
requisição. Rate limit é proteção, não correção: falhar fechado transformaria
uma piscada do contador em indisponibilidade total. Dois passos do CI cobrem as
duas pontas — que o contador realmente vai para o Redis, e que parar o Redis
deixa o serviço de pé.

### Timeouts

`CONVERSION_TIMEOUT` precisa ficar abaixo do `--timeout` do gunicorn (120s no
`Dockerfile`). Se inverter, o worker morre antes de o app conseguir responder
`504`.

## Testes

```bash
pip install -r requirements-dev.txt
ruff check .
python -m pytest tests/ -q
node --test tests/js/*.test.mjs
```

O `ruff.toml` liga `B` (bugbear) de propósito: é a regra que pega argumento
mutável como default — a classe de defeito que quebrou a montagem de PDF acima
de quatro páginas, dentro do próprio Pillow.

`tests/js/sintaxe.test.mjs` importa **todo** módulo de `static/js` e reprova só
em `SyntaxError`. Existe porque os módulos de entrada — `convert.js`,
`imgtopdf.js`, `banner.js` — não são importados por nenhum outro teste, então
um erro de sintaxe neles chegaria ao navegador em silêncio. E `node --check` não
serve para isso: num arquivo ESM genuinamente quebrado ele devolve zero.

A suíte não precisa de LibreOffice instalado: documentos passam por um dublê
(`tests/bin/libreoffice`) que simula sucesso, falha, saída sem PDF e
travamento. O dublê também recusa a chamada se faltar o
`-env:UserInstallation`, o que trava o isolamento de perfil no lugar.

Também não precisa de biblioteca de PDF: `/MediaBox` fica em texto claro nos
bytes do arquivo, e com `size: "image"` a página herda o tamanho da imagem —
então imagens de tamanhos diferentes tornam ordem e rotação verificáveis por
expressão regular.

`static/js/gallery.js` não toca DOM nem rede, então o estado da galeria
(reordenar, girar, selecionar, teto de imagens, revogar URL de objeto, a
proporção e a margem da folha) é testado pelo runner nativo do Node, sem
dependência e sem navegador. O mesmo vale para `tiles.js` (sorteio dos
ladrilhos, onda, persiana) e `press-state.js` (estados da conversão).

## Cabeçalhos de segurança

Toda resposta leva `X-Content-Type-Options: nosniff` e
`Referrer-Policy: strict-origin-when-cross-origin`. As páginas do site levam
também uma CSP estrita:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' blob:; font-src 'self'; connect-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

`script-src 'self'` sem `unsafe-inline` nem `unsafe-eval` é a parte que importa,
e o frontend foi construído para isso: a configuração vai num bloco
`application/json` que o navegador não executa, as fontes são auto-hospedadas e
não há CDN.

Duas frouxidões, com motivo:

- **`style-src` aceita `'unsafe-inline'`** porque os ladrilhos são SVG gerado
  com `style="transform: rotate(…)"`, e a folha da galeria recebe proporção e
  margem em variáveis CSS no `style`. Sem isso nada gira. Estilo inline não é
  vetor da mesma classe que script inline — a exceção para no estilo.
- **`img-src` aceita `blob:`** porque as miniaturas da galeria vêm de
  `URL.createObjectURL`. Sem isso a galeria fica sem preview nenhum.

`/apidocs` e `/flasgger_static` ficam **isentos da CSP**: o Swagger UI usa script
inline e busca Google Fonts de host externo, então a política estrita quebraria a
documentação. A isenção é só da CSP — os outros cabeçalhos continuam — e um teste
garante que ela não vaza para as páginas do site.

## Notas de implementação

**Uma paleta, brutalismo com formas Bauhaus.** Creme, tinta e as três
primárias chapadas, em tokens no `:root` de `estilo.css`. O amarelo nunca
carrega texto: é cor de forma e de seleção, com tinta por cima. Texto sobre
vermelho é tinta; sobre azul, creme. Bordas de 3px, nada arredondado, sombra
dura. Só tema claro — o modo escuro saiu de propósito.

`tests/test_pages.py` calcula a razão de contraste de cada par de tokens e
falha se alguma cor reprovar em AA. Outro teste lê os nomes de classe que o
JavaScript alterna e exige que o CSS os defina: renomear `.oculto` num redesign
quebraria a interface inteira sem nenhum outro teste falhar. Um terceiro trava
o "nada arredondado".

**Ladrilhos.** O ladrilho é a unidade visual do site: um quadrado creme (ou de
cor) com uma forma por cima — quadrado, círculo, quarto, meio, triângulo,
metade, anel — num múltiplo de 90°. `tiles.js` sorteia e desenha, sem DOM;
`tile-grid.js` põe a grade na tela e a refaz quando o contêiner muda de
tamanho (7 colunas no celular, ladrilho de 56px no desktop).

No banner da home, o ladrilho sob o mouse gira; clicar solta uma onda de giros
com atraso proporcional à distância; deslizar o dedo na horizontal risca um
rastro (o banner tem `touch-action: pan-y`, então deslizar na vertical continua
rolando); rolar a página gira as fileiras em cascata, como uma persiana. Um
ladrilho aleatório gira sozinho a cada 900ms, só com o banner à vista e a aba
visível.

**A prensa.** Em `/convert` a conversão começa sozinha quando um arquivo válido
chega — não há botão de converter. O arquivo vira uma forma pelo tipo
(documento quadrado vermelho, planilha triângulo azul, apresentação círculo
amarelo, imagem semicírculo preto), desliza com a porcentagem real do upload,
a prensa bate enquanto o servidor converte e sai uma folha. Erro escurece o
chão e a forma se debate. A tabela de estados mora em `press-state.js`, com
teste: arquivo solto com a prensa batendo é ignorado, e upload que vai de 0%
direto ao fim leva a forma para debaixo da prensa sem passar pelo meio.

**Esteira.** Em `/imgtopdf` a página selecionada aparece grande, com a
proporção e a margem que o PDF vai ter — inclusive a folha A4 deitada quando a
imagem girada é mais larga que alta, como `pagina_em_px` faz no servidor. A
fita embaixo tem todas as páginas na ordem do PDF. A geração usa a mesma cena
da prensa; erro devolve a esteira intacta e, depois do sucesso, as imagens
ficam até "NOVO PDF", para gerar de novo com outro tamanho ou margem.

Sob `prefers-reduced-motion` nada gira, bate ou desliza: os estados só trocam,
e a vida própria e a persiana do banner não ligam.

**Arrasto por ponteiro.** Reordenar a fita da galeria arrastando usa
`static/js/drag.js`, sobre Pointer Events. A galeria usava drag-and-drop HTML5,
que **não dispara em tela de toque**: no celular só os botões reordenavam. Os
botões ANTES e DEPOIS continuam sendo o mecanismo principal — arrastar é
atalho, e não serve a teclado nem a leitor de tela.

A parte difícil é que a fita rola com o dedo, então deslizar num item é ambíguo
entre reordenar e rolar. A galeria resolve exigindo que o dedo **segure
300ms** antes de o arrasto começar; se ele desliza antes disso, é rolagem e
não interferimos.

Cancelar a rolagem é feito com `touchmove` e `passive: false`, e não com
`touch-action: none` no CSS: o CSS teria de valer antes do gesto começar, e aí a
lista nunca rolaria. A decisão de quando começar mora em `drag-state.js`,
que não toca DOM e tem doze testes no Node.

**Nomes de arquivo em inglês, identificadores em português.** A regra vale para
a superfície pública — rotas, caminhos de API, chaves de JSON e nomes de
arquivo — enquanto os identificadores internos e o texto de tela ficam em
português. Os módulos que sobraram do começo do projeto foram renomeados para
seguir isso: `format.js`, `convert.js`, `convert-ui.js`, `convert-send.js`,
`drag.js`, `drag-state.js`.

**Sem framework de CSS.** O layout veio de um mockup em Tailwind por CDN. O CDN
do Tailwind compila CSS no navegador a cada carregamento, é ferramenta de
desenvolvimento, e tanto ele quanto o Google Fonts são host externo — o que
quebra a página autocontida e exigiria exceção na CSP. O bloco
`tailwind.config` era script inline executável, proibido pelo mesmo motivo. Tudo
virou CSS comum sobre os tokens acima, e os ícones do Material Symbols viraram
SVG inline: a fonte de ícones traria milhares de glifos para usar meia dúzia.

**Fonte auto-hospedada.** Inter variável em `static/fonts/`, com eixo de peso
de 100 a 900 — o 900 dos títulos sai do mesmo arquivo. Subsets latin (48 KB) e
latin-ext (85 KB) separados por `unicode-range` — o caso comum paga só a
latin. Um host externo quebraria a página autocontida e precisaria de exceção
na CSP. A licença OFL acompanha o arquivo, como ela exige.

**Limpeza de temporários.** Cada request ganha um `temp/{uuid}/` próprio. O
PDF é lido em memória e o diretório é removido num `finally` — sucesso, erro
e timeout. Antes o cleanup vivia num `@after_this_request` registrado só no
caminho de sucesso, então toda exceção deixava arquivo para trás.

**PDF montado página por página.** Cada imagem vira um PDF de uma página em
memória e é liberada antes da próxima; o `pypdf` junta tudo no fim. O pico
guarda uma imagem decodificada mais bytes de PDF já comprimidos, e o custo é
linear: ~0,07s por página, independente da contagem.

Duas alternativas foram descartadas. `save(append_images=[...])` manteria todas
as imagens transformadas em memória ao mesmo tempo — o `PdfImagePlugin` do
Pillow materializa a lista antes de escrever, então nem generator ajuda — e 20
páginas em tamanho original passariam de 500 MB.

`save(append=True)` foi a primeira implementação e tinha dois problemas. Relia o
PDF inteiro a cada página, custo quadrático na contagem. E batia num defeito do
`PdfParser` do Pillow: `processed_offsets` é um argumento mutável com default de
lista, então os offsets de cada releitura se acumulam e a **quinta** página
dispara um falso `trailer loop found`. A cadeia de `/Prev` do arquivo estava
correta — o laço era do parser. No Pillow 10.4 não havia a guarda e a recursão
era infinita, o que tem CVE própria (`CVE-2026-42310`).

Com o `pypdf` o `PdfParser` do Pillow deixa de ser usado: o Pillow só escreve, e
quem lê PDF é o pypdf.

**Um pipeline de imagem, não dois.** `/api/convert` e `/api/imgtopdf` usam a
mesma função para transformar imagem em página. Existiam duas
implementações, e elas discordavam: uma corrigia a orientação do EXIF e a outra
não, uma gravava a 150 DPI e a outra a 100. A mesma foto saía diferente em cada
rota. Um teste envia a mesma foto deitada nos dois endpoints e exige o mesmo
`MediaBox`, então divergir de novo quebra a suíte.

**Foco preservado na galeria.** A grade é redesenhada inteira a cada ação, o que
destrói o botão clicado — sem tratamento, quem usa teclado ou leitor de tela
volta ao topo da página a cada rotação. `focoDepoisDe` em
`static/js/gallery.js` decide o destino a partir da lista antes e depois: mantém
o mesmo botão quando ele ainda existe, passa para o botão oposto quando o
clicado fica desabilitado num extremo, e depois de remover foca uma ação **não
destrutiva** do item que tomou o lugar — focar o próprio remover deixaria uma
sequência de Enter apagando a galeria inteira. É lógica pura sobre a lista,
então tem teste no runner do Node.

**Rotação sem reamostragem.** Só múltiplos de 90 são aceitos, então a rotação
usa `transpose` em vez de `rotate`: sai exata, sem interpolação e sem canto
vazio para preencher. A orientação do EXIF é corrigida antes, para a rotação
escolhida pelo usuário somar em cima da orientação real da foto — senão o
preview na tela e o PDF discordariam.

**Conversões simultâneas.** Cada chamada ao LibreOffice recebe um
`-env:UserInstallation` próprio. Sem isso duas conversões concorrentes
disputam o perfil default e uma delas falha ou trava.
