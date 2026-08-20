# everythingispdf

Serviço web que converte documentos e imagens para PDF. Upload de um arquivo,
download do PDF.

Documentos passam pelo LibreOffice em modo headless; imagens vão pelo Pillow.

## Formatos aceitos

| Categoria | Extensões |
|---|---|
| Texto | `docx`, `doc`, `odt` |
| Apresentação | `pptx`, `ppt`, `odp` |
| Planilha | `xlsx`, `xls` |
| Imagem | `png`, `jpg`, `jpeg` |

Limite de 16 MB por arquivo.

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
| `400` | Campo `file` ausente ou nome vazio |
| `413` | Arquivo acima de 16 MB |
| `415` | Extensão não suportada |
| `429` | Rate limit excedido |
| `500` | Falha na conversão |
| `504` | Conversão passou do tempo limite |

Erros vêm como JSON: `{"error": "..."}`.

### Outras rotas

- `GET /` — página de upload (arrastar e soltar, colar imagem com Ctrl+V,
  validação de formato e tamanho antes de enviar, barra de progresso, tema
  claro e escuro)
- `GET /health` — `{"status": "ok"}`
- `GET /apidocs` — Swagger UI

## Configuração

Tudo por variável de ambiente.

| Variável | Default | Para quê |
|---|---|---|
| `PORT` | `5000` | Porta do servidor de desenvolvimento |
| `TEMP_FOLDER` | `./temp` | Diretório de trabalho das conversões |
| `CONVERSION_TIMEOUT` | `90` | Segundos até abortar o LibreOffice |
| `RATE_LIMIT` | `10 per minute;60 per hour` | Limite por IP em `/api/convert` |
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
```

A suíte não precisa de LibreOffice instalado: documentos passam por um dublê
(`tests/bin/libreoffice`) que simula sucesso, falha, saída sem PDF e
travamento. O dublê também recusa a chamada se faltar o
`-env:UserInstallation`, o que trava o isolamento de perfil no lugar.

## Notas de implementação

**Limpeza de temporários.** Cada request ganha um `temp/{uuid}/` próprio. O
PDF é lido em memória e o diretório é removido num `finally` — sucesso, erro
e timeout. Antes o cleanup vivia num `@after_this_request` registrado só no
caminho de sucesso, então toda exceção deixava arquivo para trás.

**Conversões simultâneas.** Cada chamada ao LibreOffice recebe um
`-env:UserInstallation` próprio. Sem isso duas conversões concorrentes
disputam o perfil default e uma delas falha ou trava.
