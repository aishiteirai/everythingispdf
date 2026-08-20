# Montador de PDF a partir de imagens (`/imgtopdf`)

Data: 2026-08-20
Status: aprovado, pronto para plano de implementação

## Objetivo

Permitir que o usuário envie várias imagens, reordene, gire e gere **um único
PDF**. O conversor de arquivo único que já existe continua funcionando sem
mudança de comportamento. A raiz do site passa a ser um hub com dois caminhos.

## Decisões tomadas

| Questão | Decisão |
|---|---|
| Onde a função vive | `/` vira hub com duas células clicáveis; conversor atual em `/convert`; galeria em `/imgtopdf` |
| Layout da página | Escolha do usuário na tela: tamanho da imagem, A4 ou Carta, mais margem |
| Limites | 20 imagens por PDF, 32 MB no request inteiro |
| Onde a rotação acontece | No servidor. Cliente manda originais + metadados; Pillow transforma |
| Idioma dos nomes | Inglês na superfície pública (rotas, paths de API, chaves de JSON, nomes de arquivo); português nos identificadores internos e no texto de tela |

### Por que a rotação é no servidor

As alternativas eram reencodar no `<canvas>` e mandar bytes prontos, ou gerar
o PDF inteiro no navegador com `pdf-lib`.

Reencodar no canvas perde qualidade, infla o peso do upload, transforma EXIF
em problema do cliente e faz o PDF depender do navegador — `toBlob` divergindo
entre Safari e Firefox seria um bug irreproduzível. Gerar no navegador exigiria
uma dependência JavaScript de terceiro num projeto que hoje não tem bundler nem
`node_modules`, e deixaria o recurso sem API, com o `/apidocs` mentindo.

Com a transformação no servidor, o PDF é reproduzível a partir de
originais + metadados, o EXIF é resolvido num lugar só, e Pillow já é
dependência: nada novo entra no `requirements.txt`.

### Por que não entra biblioteca de PDF

Montar as páginas todas de uma vez com `Image.save(append_images=[...])` carrega
todas as imagens transformadas em memória ao mesmo tempo — o `PdfImagePlugin` do
Pillow materializa `append_images` numa lista antes de escrever, então nem
generator ajuda. Com 20 páginas em tamanho original isso passa de 500 MB e mata
o worker.

Pillow aceita `im.save(caminho, 'PDF', append=True)`. Verificado: três imagens
salvas uma a uma produzem um PDF com `/Count 3`. Então o PDF é montado **página
por página**, liberando cada imagem antes da próxima. O pico de memória não
escala com a contagem de páginas, e `pypdf` fica de fora.

## Superfície pública

| Rota | Método | O quê |
|---|---|---|
| `/` | GET | Hub novo (`templates/home.html`) |
| `/convert` | GET | Página atual (`templates/index.html` renomeado para `convert.html`) |
| `/imgtopdf` | GET | Editor de galeria (`templates/imgtopdf.html`) |
| `/api/convert` | POST | Intocado |
| `/api/imgtopdf` | POST | Novo |
| `/health`, `/apidocs`, `/apispec_1.json` | GET | Intocados |

### `POST /api/imgtopdf`

`multipart/form-data`:

- `files` — campo repetido, 1 a 20 imagens. **A ordem do envio é a ordem das
  páginas.** Extensões aceitas: as de `IMAGE_EXTENSIONS` (`png`, `jpg`, `jpeg`).
- `options` — campo de texto com JSON:

```json
{
  "pages": [{"rotation": 0}, {"rotation": 90}],
  "size": "image",
  "margin_mm": 10
}
```

| Chave | Regra |
|---|---|
| `pages` | Lista do mesmo comprimento de `files`. Comprimento diferente é 400: sem isso, ordem e rotação desalinham em silêncio e o PDF sai errado sem ninguém perceber |
| `pages[].rotation` | Inteiro em `{0, 90, 180, 270}`, graus **no sentido horário**. Ângulo livre é 400 — múltiplo de 90 dispensa reamostragem e não deixa canto vazio para preencher |
| `size` | `"image"`, `"a4"` ou `"letter"` |
| `margin_mm` | Inteiro de 0 a 50. Ignorado quando `size` é `"image"`, onde não tem efeito |

`options` ausente ou que não parseia como JSON é 400.

Resposta 200: `application/pdf`, `Content-Disposition: attachment;
filename="imagens.pdf"`. O nome é fixo porque N arquivos de entrada não têm um
nome de saída óbvio.

| Status | Quando |
|---|---|
| 200 | PDF gerado |
| 400 | `options` inválido, contagem fora de 1..20, `pages` desalinhado, imagem ilegível, imagem acima do teto de pixels |
| 413 | Request acima de 32 MB |
| 415 | Extensão fora de `IMAGE_EXTENSIONS` |
| 429 | Rate limit |
| 500 | Falha interna |

Não existe 504: não há LibreOffice neste caminho.

Imagem ilegível dá **400**, e não o 500 que o `/api/convert` devolve hoje para
um PNG corrompido. A divergência é intencional: aqui o Pillow é o único
executor, então bytes que ele não abre são entrada inválida do cliente, não
falha do servidor. O comportamento do `/api/convert` não muda — mexer nele
seria quebrar contrato já testado por um ganho de consistência que ninguém
pediu.

O endpoint ganha docstring no formato do flasgger, como o `/api/convert`, para
o `/apidocs` continuar descrevendo a API de verdade.

## Backend

### Configuração

| Constante | Valor | Observação |
|---|---|---|
| `MAX_CONTENT_LENGTH` | 32 MB | Sobe de 16 MB. Vale para os dois endpoints |
| `MAX_IMAGENS` | 20 | Teto de imagens por PDF |
| `MARGEM_MAX_MM` | 50 | Teto da margem |
| `DPI_PAGINA` | 150 | Densidade de composição e do PDF |
| `LADO_MAXIMO_PX` | 2200 | Teto do lado maior no modo `image` |
| `Image.MAX_IMAGE_PIXELS` | 64 000 000 | Guarda contra bomba de descompressão; mais estrito que o default do Pillow |

Rate limit reusa `RATE_LIMIT`. Montar imagens é muito mais barato que subir um
LibreOffice; uma variável de ambiente separada seria configuração sem ganho.

### Módulo novo: `imgtopdf.py`

Funções puras, sem Flask e sem HTTP, para o pipeline ser testável direto. O
`app.py` fica só com a rota, a validação do payload e o tratamento de erro.
O `app.py` já tem quase 300 linhas — a rota nova sem essa separação o empurraria
para além do que se lê de uma vez.

Nada do que já existe é movido: `convert_image` e `convert_with_libreoffice`
ficam onde estão. O escopo é a função nova.

### Pipeline, por imagem

1. `Image.open(file.stream)` — lê direto do stream do werkzeug. **O nome do
   arquivo enviado nunca toca o disco**, então path traversal não tem
   superfície: só a extensão é lida, para validar.
2. `ImageOps.exif_transpose` — foto de celular chega deitada. A rotação do
   usuário tem que somar **em cima** da orientação já corrigida, senão o preview
   e o PDF discordam.
3. Rotação por `transpose`, não por `rotate`: `90` horário é
   `Image.Transpose.ROTATE_270`, `180` é `ROTATE_180`, `270` horário é
   `ROTATE_90`. `transpose` não reamostra — é exato e mais rápido que
   `rotate(expand=True)`, e não exige matemática de expansão.
4. Converte para RGB quando o modo é `RGBA`, `P` ou `LA`, como `convert_image`
   já faz hoje. PDF não tem canal alfa.
5. Compõe conforme `size`:
   - `image`: reduz o lado maior para no máximo `LADO_MAXIMO_PX`, preservando
     proporção. Sem canvas, sem margem.
   - `a4` / `letter`: canvas branco no tamanho da página a 150 DPI — A4
     1240×1754 px, Carta 1275×1650 px — com **orientação automática**: os lados
     trocam quando a imagem é paisagem. A imagem é escalada para caber em
     `página − 2 × margem` preservando proporção e colada centralizada.
6. `imagem.save(pdf_path, 'PDF', resolution=150.0, append=(indice > 0))` e
   libera a imagem antes de abrir a próxima.

A 150 DPI, o MediaBox sai em ≈595×842 pt para A4 e 612×792 pt para Carta.

`margin_mm` vira pixels por `mm / 25.4 * DPI_PAGINA`. Margem grande em página
pequena não pode produzir lado zero — a área útil tem piso de 1 px em cada
dimensão.

### Arquivos temporários

Mesmo padrão do `/api/convert`: um `work_dir` por UUID dentro de `TEMP_FOLDER`,
só para o PDF de saída; o PDF é lido em memória antes de apagar; `finally:
shutil.rmtree(work_dir, ignore_errors=True)` roda no sucesso e em todo erro.

## Frontend

Sem bundler, `<script type="module">` como hoje.

### `GET /` — hub (`templates/home.html`)

Duas `<a class="celula">`, cada uma com ícone, título e uma linha de descrição:
"Converter um arquivo" para `/convert`, "Montar PDF de imagens" para
`/imgtopdf`. Zero JavaScript — são links.

### `GET /convert`

A página de hoje, sem mudança de comportamento. Ganha um link "← início".

### `GET /imgtopdf` — editor

Três blocos:

1. **Área de soltar** — o mesmo componente de hoje, com `multiple` e `accept`
   restrito às extensões de imagem. Adicionar **não** substitui: as novas entram
   no fim da lista.
2. **Grade de páginas** — um cartão por imagem, com thumbnail, número da página,
   girar ↺ / ↻, mover ← / →, e remover ×.
3. **Opções e envio** — `select` de tamanho (Tamanho da imagem / A4 / Carta),
   `input type="number"` de margem, desabilitado quando o tamanho é
   "Tamanho da imagem" porque ali não tem efeito, e o botão
   "Gerar PDF (N imagens)". Barra de progresso e área de recado são as que já
   existem.

**Reordenar: os botões são o mecanismo principal, o arrasto é enriquecimento.**
Drag-and-drop HTML5 não dispara em toque, e reordenar só por arrasto é
inacessível por teclado e por leitor de tela. Mover ← / → sempre funciona;
`draggable` entra por cima para quem está no mouse.

**Preview da rotação é CSS**: `transform: rotate(Ndeg)` no `<img>`, dentro de
caixa quadrada com `object-fit: contain`, para que 90° caiba sem recalcular
layout. O byte original nunca é tocado no cliente.

### Módulos

| Arquivo | Responsabilidade | Toca DOM? |
|---|---|---|
| `static/js/gallery.js` | Estado: lista de `{id, arquivo, rotacao, url}` e as operações `adiciona`, `remove`, `move`, `gira` | Não |
| `static/js/gallery-ui.js` | Desenha a grade e liga os botões | Sim |
| `static/js/gallery-send.js` | Monta o `FormData` (`files` na ordem, `options` em JSON) e faz o XHR com progresso | Não |
| `static/js/imgtopdf.js` | Entrada da página; amarra os três | — |

`gallery.js` sem DOM é o que torna reordenar e girar testáveis sem navegador.

### Reuso de `formato.js` e `envio.js`

`problemaCom` continua validando um arquivo (extensão, vazio, tamanho). Entra
`problemaComConjunto(itens, config)` para o teto de 20 imagens e a soma de bytes
— o limite do servidor é do request inteiro, não por arquivo, então a checagem
tem que ser do conjunto.

`mensagensDeErro` de `envio.js` passa a ser exportada e estendida com o 400 de
payload inválido, para o usuário não receber "erro 400" sem explicação.

### Configuração injetada

Mesmo bloco `<script type="application/json">` de hoje, que não é executado e
sobrevive a CSP sem `unsafe-inline`. O `/convert` mantém o id
`config-conversor`, que a suíte atual já procura; o `/imgtopdf` usa
`config-galeria`, para as duas páginas não competirem pelo mesmo id. O hub não
injeta configuração — não tem formulário.

Em `/imgtopdf`: `{extensoes, maxBytes, maxMb, maxImagens, margemMax, tamanhos}`,
tudo vindo do backend, para a UI não divergir do que a API aceita. `tamanhos` é
uma lista de `{valor, rotulo}` — `valor` é o que vai em `options.size`, `rotulo`
é o texto do `<option>`. Assim o `select` não pode oferecer um tamanho que a API
recusa.

### CSS

`estilo.css` ganha as seções do hub e da grade, usando os tokens que já existem.
O `body` hoje é flex centralizado, o que estrangula uma página alta de galeria:
entra a classe de página `pagina-alta` com `align-items: flex-start`. A grade é
`grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))`.

## Testes

### Quebras a consertar primeiro

A suíte atual assume que `/` é a página de upload:

- `tests/test_frontend.py`: a fixture `pagina` passa a buscar `/convert`; a
  fixture `javascript` tem lista fixa de módulos e ganha os novos.
- `tests/test_convert.py::TestRotasDeApoio::test_index_responde` afirma que `/`
  contém "Conversor". Vira teste do hub; a asserção da página de conversão
  migra para `/convert`.
- `tests/test_convert.py::TestValidacaoDeEntrada::test_acima_do_limite_da_413_em_json`
  monta um buffer de `MAX_CONTENT_LENGTH + 1024`. Com o teto em 32 MB ele dobra
  de tamanho. Continua passando, mas para não alocar 32 MB por teste o limite
  passa a vir de um override de `MAX_CONTENT_LENGTH` na config do app de teste,
  em vez do valor de produção.

### Verificar o PDF sem biblioteca de PDF

`/MediaBox` aparece em texto claro nos bytes do PDF. Com `size: "image"` cada
página herda as dimensões da imagem, então imagens de tamanhos distintos viram
MediaBoxes distintos — e **ordem e rotação ficam verificáveis por regex**, sem
`pypdf` e sem renderizar nada.

### `tests/test_imgtopdf.py` — contrato da API

| Teste | Como |
|---|---|
| 3 imagens viram PDF de 3 páginas | `/Count 3`, magic `%PDF-`, mimetype `application/pdf` |
| Ordem é respeitada | Imagens 100×200, 300×100 e 50×50 → a sequência de MediaBox bate com a ordem enviada |
| Rotação é aplicada no servidor | 100×200 com `rotation: 90` → MediaBox invertido, 200×100 |
| Os quatro valores de rotação | `180` não inverte, `90` e `270` invertem, `0` não mexe |
| `size: "a4"` uniformiza | Todo MediaBox ≈ 595×842 pt; imagem paisagem → 842×595, pela orientação automática |
| `size: "letter"` | MediaBox ≈ 612×792 pt |
| EXIF é honrado | JPEG com `Orientation=6` gravado pelo Pillow → página sai retrato, e a rotação do usuário soma em cima |
| Bomba de descompressão | `Image.MAX_IMAGE_PIXELS` baixado por monkeypatch → 400, não estouro do worker |
| Não deixa resto | A fixture `restos()` devolve `[]` no sucesso **e** em cada caminho de erro |
| Rate limit | Reusa a fixture `rate_limit`, mesmo par de asserções do `/api/convert` |
| Nome do download | `Content-Disposition` com `imagens.pdf`, inclusive quando o nome enviado tem `../` |

Validação, todos esperando 400: sem campo `files`; 21 imagens; `len(pages)`
diferente de `len(files)`; `rotation: 45`; `size: "oficio"`; `margin_mm` 51 e
−1; `options` que não é JSON; `options` ausente; arquivo vazio; imagem ilegível.
Mais `.docx` no endpoint de imagem esperando **415**, e um request acima de
32 MB esperando **413** em JSON.

### `tests/test_imgtopdf_unit.py` — funções puras

Sem Flask e sem HTTP. É onde a margem fica testável de verdade, já que ela não
muda o MediaBox: a função de encaixe devolve as dimensões coladas, então dá para
afirmar proporção preservada, margem respeitada, imagem nunca ultrapassando a
área útil, e margem grande em imagem pequena não gerando lado zero. Também
cobre o tamanho de página em pixels por nome e DPI, a orientação automática, e o
mapa de rotação para `transpose`.

### `tests/test_pages.py` — as três rotas

Os testes genéricos que hoje existem uma vez — página autocontida sem CDN, sem
JavaScript inline executável, CSS referenciado, tema escuro, movimento reduzido
— viram **parametrizados sobre `/`, `/convert` e `/imgtopdf`**, em vez de
copiados três vezes.

Específicos: o hub aponta para os dois destinos; `/imgtopdf` injeta config que
bate com `IMAGE_EXTENSIONS`, `MAX_IMAGENS`, `MARGEM_MAX_MM` e os tamanhos
aceitos; o `accept` só tem extensões de imagem; o input tem `multiple`; todo
import dos módulos novos resolve.

### `tests/js/gallery.test.mjs` — estado da galeria

`node --test` do Node 18 ou mais novo, zero dependência. `move` nos extremos não
sai do array; `gira` acumula em módulo 360; `remove` revoga a URL do objeto;
`adiciona` põe no fim e respeita o teto de 20. Sem isso, a alegação de que
`gallery.js` é testável fica vazia.

### CI

- Job `tests`: mais um passo com `node --test tests/js/`. O runner de Ubuntu já
  traz Node.
- Job `docker`: mais um smoke test contra o container real — duas PNGs por
  `curl -F`, `size=a4`, uma com `rotation=90`, verificando `%PDF-` e `/Count 2`.
  É o que prova o caminho real, já que a suíte de pytest roda sem container. A
  checagem de `/app/temp` vazio que já existe passa a cobrir os dois endpoints.

## Fora de escopo

- Misturar documentos e imagens na mesma galeria.
- Reordenar por arrasto em telas de toque (os botões cobrem esse caso).
- Comprimir imagem no navegador antes de subir.
- Renomear `formato.js`, `envio.js`, `interface.js` e `main.js` para inglês.
  Fica a assimetria de `envio.js` ao lado de `gallery.js`; se for para
  padronizar, é um commit separado e anterior a este trabalho.
- Reordenar ou girar páginas de um PDF já existente.
