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
docker build -t everythingispdf .
docker run --rm -p 10000:10000 everythingispdf
```

Abra <http://localhost:10000>.

## Rodando local

Precisa de Python 3.10+ e do binário `libreoffice` no `PATH`.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py                 # http://127.0.0.1:5000
```

O servidor de desenvolvimento escuta só em `127.0.0.1`. Produção roda por
gunicorn (ver `Dockerfile`).

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
| `TEMP_FOLDER` | `./temp` | Diretório de trabalho das conversões |
| `CONVERSION_TIMEOUT` | `90` | Segundos até abortar o LibreOffice |
| `RATE_LIMIT` | `10 per minute;60 per hour` | Limite por IP nos dois endpoints |
| `RATELIMIT_STORAGE_URI` | `memory://` | Onde guardar os contadores |
| `TRUSTED_PROXIES` | `0` | Quantos proxies reversos confiar |

### Atrás de um proxy reverso

Com `TRUSTED_PROXIES=0` o rate limit usa o IP da conexão. Atrás de um proxy
(Render, nginx) isso agrupa todo mundo no mesmo balde, porque a conexão vem
sempre do proxy — configure `TRUSTED_PROXIES=1` para o `X-Forwarded-For` ser
considerado.

**Não ligue essa variável sem um proxy real na frente.** O cliente controla o
`X-Forwarded-For`; confiar nele sem proxy deixa qualquer um falsificar o IP e
escapar do limite.

### Rate limit com mais de um worker

`memory://` conta por processo, então o limite efetivo é `RATE_LIMIT` ×
número de workers do gunicorn. Para um teto real, aponte
`RATELIMIT_STORAGE_URI` para um Redis compartilhado:

```bash
RATELIMIT_STORAGE_URI=redis://localhost:6379/0
```

### Timeouts

`CONVERSION_TIMEOUT` precisa ficar abaixo do `--timeout` do gunicorn (120s no
`Dockerfile`). Se inverter, o worker morre antes de o app conseguir responder
`504`.

## Testes

```bash
pip install -r requirements-dev.txt
python -m pytest tests/ -q
node --test tests/js/*.test.mjs
```

A suíte não precisa de LibreOffice instalado: documentos passam por um dublê
(`tests/bin/libreoffice`) que simula sucesso, falha, saída sem PDF e
travamento. O dublê também recusa a chamada se faltar o
`-env:UserInstallation`, o que trava o isolamento de perfil no lugar.

Também não precisa de biblioteca de PDF: `/MediaBox` fica em texto claro nos
bytes do arquivo, e com `size: "image"` a página herda o tamanho da imagem —
então imagens de tamanhos diferentes tornam ordem e rotação verificáveis por
expressão regular.

`static/js/gallery.js` não toca DOM nem rede, então o estado da galeria
(reordenar, girar, teto de imagens, revogar URL de objeto) é testado pelo
runner nativo do Node, sem dependência e sem navegador.

## Notas de implementação

**Cor por função, dois tons.** Todo o CSS colorido referencia só `--acento`,
`--acento-forte`, `--acento-fraco` e `--acento-contraste`. Quem define os
valores é uma classe no `<body>` (`tema-convert`, `tema-imgtopdf`), e no hub cada
bolinha sobrescreve a sua. Assim existe uma folha de estilo e a cor entra por
variável, em vez de uma cópia das mesmas regras por página.

São dois tons porque a cor da bolinha foi mantida clara de propósito: `--acento`
é bolinha, borda e anel de foco, componente gráfico, onde 3:1 basta;
`--acento-forte` carrega texto e vira preenchimento de botão, onde são
necessários 4,5:1 nos dois sentidos. O texto sobre os dois vem de
`--acento-contraste`: branco no claro, preto no escuro, onde o acento é a cor
clara.

`tests/test_pages.py` calcula a razão de contraste de treze pares de tokens em
três modos e três temas, e falha se alguma cor reprovar. Outro teste lê os nomes
de classe que o JavaScript alterna e exige que o CSS os defina: renomear
`.oculto` num redesign quebraria a interface inteira sem nenhum outro teste
falhar.

**Bolinhas com física.** No hub, as duas bolinhas são arrastáveis e podem ser
arremessadas: ao soltar com movimento elas saem com velocidade, rebatem nas
paredes da tela e vão perdendo energia até parar. Atrito de 0,94 por quadro de
referência, restituição de 0,7 na parede, e repouso abaixo de 0,05 px/ms — aí o
`requestAnimationFrame` desliga, porque loop eterno queima bateria no celular.

O atrito é elevado a `dt / QUADRO_MS`, então depende do tempo e não da taxa de
quadros: sem isso a bolinha andaria bem menos numa tela de 120Hz que numa de
60Hz. O intervalo entre quadros tem teto de 48ms, senão uma aba que voltou do
segundo plano daria um salto de tela inteira.

A velocidade do arremesso vem da média das amostras dos últimos 80ms, não do
último par de pontos: um tremor no fim do arrasto daria arremesso torto, e
arrastar, parar com o dedo na tela e soltar tem que largar a bolinha parada.

Pointer events cobrem mouse e toque num caminho só, com limiar de arrasto de
6px no ponteiro fino e 12px no toque — dedo treme mais que mouse, e com o mesmo
limiar tocar para navegar viraria arrasto e o link nunca abriria no celular.

A caixa é o `<main>`, medida com `getBoundingClientRect` e recalculada no
`resize`: ao girar o celular a posição é reenquadrada, senão uma posição salva
numa tela larga deixaria a bolinha fora da tela estreita e o link inalcançável.
A posição de repouso vive num cookie que o Flask lê e renderiza em `--dx` e
`--dy` no style do elemento, então a bolinha nasce onde ficou em vez de saltar
quando o JavaScript roda. O backend converte para inteiro e limita a faixa como
rede de segurança.

Sob `prefers-reduced-motion` não há inércia: soltar deixa a bolinha onde o dedo
soltou.

As duas bolinhas não colidem entre si — colisão elástica entre círculos é bem
mais código e mais teste para um encontro que quase não acontece.

O separador do cookie é `x_y|x_y`, não `x,y;x,y`. Em cabeçalho HTTP o `;`
encerra o cookie e a RFC 6265 também exclui `,`, `"`, espaço e `\` do valor — com
`;` a segunda bolinha nunca chegava ao servidor. O `set_cookie` do cliente de
teste escreve direto no jar e esconde isso, então o teste que cobre o caso usa
`test_client(use_cookies=False)` e monta o cabeçalho na mão.

Arrastar é enriquecimento: o link continua focável e ativável por teclado, e
mover a bolinha não muda a ordem de tabulação. Teclado não reposiciona — é
cosmético, não funcional.

`static/js/bolinhas-estado.js` não toca DOM, então rebote, atrito, repouso e
limiar de arrasto são testados no runner do Node. Um dos testes simula a
trajetória inteira em 60Hz e em 120Hz e exige que a distância percorrida seja a
mesma; outro exige que a bolinha convirja para o repouso em menos de 600
quadros, o que trava o risco de alguém mexer no atrito e o loop virar eterno.

**Sem framework de CSS.** O layout veio de um mockup em Tailwind por CDN. O CDN
do Tailwind compila CSS no navegador a cada carregamento, é ferramenta de
desenvolvimento, e tanto ele quanto o Google Fonts são host externo — o que
quebra a página autocontida e exigiria exceção na CSP. O bloco
`tailwind.config` era script inline executável, proibido pelo mesmo motivo. Tudo
virou CSS comum sobre os tokens acima, e os ícones do Material Symbols viraram
SVG inline: a fonte de ícones traria milhares de glifos para usar meia dúzia.

**Fonte auto-hospedada.** Inter variável em `static/fonts/`, subsets latin
(48 KB) e latin-ext (85 KB) separados por `unicode-range` — o caso comum paga só
a latin. Um host externo quebraria a página autocontida e precisaria de exceção
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
