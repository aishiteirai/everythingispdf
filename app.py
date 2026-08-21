import io
import logging
import os
import shutil
import subprocess
import uuid

from flask import Flask, jsonify, render_template, request, send_file
from flasgger import Swagger
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.utils import secure_filename

import imgtopdf

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s [%(name)s] %(message)s',
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Numero de proxies reversos confiaveis na frente do app. Enquanto for 0, o
# X-Forwarded-For e ignorado e o rate limit usa o IP da conexao. Atras de um
# proxy (Render, nginx) precisa ser 1, senao todo mundo compartilha o mesmo
# balde. Confiar no header sem proxy real deixa qualquer cliente falsificar o
# IP e escapar do limite -- por isso o default e desligado.
TRUSTED_PROXIES = int(os.environ.get('TRUSTED_PROXIES', '0'))
if TRUSTED_PROXIES:
    app.wsgi_app = ProxyFix(
        app.wsgi_app, x_for=TRUSTED_PROXIES, x_proto=TRUSTED_PROXIES
    )

swagger = Swagger(app)

# 32 MB e nao 16: um PDF de varias imagens sobe todas de uma vez, e o limite
# do Flask e do request inteiro, nao por arquivo.
MAX_CONTENT_LENGTH = 32 * 1024 * 1024
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Conversao e caro: cada documento sobe um LibreOffice. Sem limite, um punhado
# de requests derruba o servidor.
RATE_LIMIT = os.environ.get('RATE_LIMIT', '10 per minute;60 per hour')

# memory:// conta por worker do gunicorn, entao o limite efetivo e
# RATE_LIMIT x numero de workers. Para um teto real, aponte
# RATELIMIT_STORAGE_URI para um Redis compartilhado.
RATELIMIT_STORAGE_URI = os.environ.get('RATELIMIT_STORAGE_URI', 'memory://')

limiter = Limiter(
    get_remote_address,
    app=app,
    storage_uri=RATELIMIT_STORAGE_URI,
    strategy='fixed-window',
)

# Segundos maximos para o LibreOffice converter um arquivo. Precisa ser menor
# que o --timeout do gunicorn, senao o worker morre antes do subprocesso.
CONVERSION_TIMEOUT = int(os.environ.get('CONVERSION_TIMEOUT', '90'))

TEMP_FOLDER = os.path.abspath(
    os.environ.get('TEMP_FOLDER') or os.path.join(os.getcwd(), 'temp')
)
os.makedirs(TEMP_FOLDER, exist_ok=True)

IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg'}
DOCUMENT_EXTENSIONS = {'docx', 'doc', 'pptx', 'ppt', 'odt', 'odp', 'xlsx', 'xls'}
ALLOWED_EXTENSIONS = IMAGE_EXTENSIONS | DOCUMENT_EXTENSIONS

# Rotulos dos tamanhos de pagina que /api/imgtopdf aceita. Montado a partir de
# imgtopdf.TAMANHOS para o select nao poder oferecer um tamanho que a API
# recusa -- e para faltar rotulo virar erro no import, nao opcao em branco.
# Quantas bolinhas o hub tem e quanto elas podem se afastar do lugar de
# origem. O limite existe porque a posicao vem de cookie: sem ele um valor
# adulterado joga a bolinha para fora da tela e o link fica inalcancavel.
QUANTIDADE_DE_BOLINHAS = 2
LIMITE_ARRASTO_PX = 400

# Separadores do cookie de posicao: "x_y|x_y". Nao da para usar ';' nem ',':
# em cabecalho HTTP o ';' separa cookies e a RFC 6265 tambem exclui ',', '"',
# espaco e '\\' do valor -- o navegador cortaria o valor no separador e a
# posicao voltaria para a origem a cada carregamento.
SEPARADOR_DE_BOLINHAS = '|'
SEPARADOR_DE_EIXOS = '_'

ROTULOS_DE_TAMANHO = {
    'image': 'Tamanho da imagem',
    'a4': 'A4',
    'letter': 'Carta',
}
TAMANHOS_DE_PAGINA = [
    {'valor': valor, 'rotulo': ROTULOS_DE_TAMANHO[valor]}
    for valor in imgtopdf.TAMANHOS
]


def _limita_arrasto(valor):
    return max(-LIMITE_ARRASTO_PX, min(LIMITE_ARRASTO_PX, valor))


def posicoes_das_bolinhas():
    """Deslocamento (x, y) de cada bolinha do hub, lido do cookie.

    Renderizar a posicao no servidor faz a bolinha nascer no lugar; aplicar
    por JavaScript depois do load faria ela saltar do lugar padrao para o
    escolhido a cada carregamento.

    Qualquer desvio -- contagem errada, valor nao inteiro, campo faltando --
    devolve todas na origem em vez de tentar adivinhar. E melhor a bolinha
    voltar ao lugar do que ir para um lugar errado.
    """
    padrao = [(0, 0)] * QUANTIDADE_DE_BOLINHAS

    partes = (request.cookies.get('bolinhas') or '').split(SEPARADOR_DE_BOLINHAS)
    if len(partes) != QUANTIDADE_DE_BOLINHAS:
        return padrao

    posicoes = []
    for parte in partes:
        eixos = parte.split(SEPARADOR_DE_EIXOS)
        if len(eixos) != 2:
            return padrao
        try:
            x, y = (int(eixo) for eixo in eixos)
        except ValueError:
            return padrao

        posicoes.append((_limita_arrasto(x), _limita_arrasto(y)))

    return posicoes


def get_extension(filename):
    if '.' not in filename:
        return ''
    return filename.rsplit('.', 1)[1].lower()


def allowed_file(filename):
    return get_extension(filename) in ALLOWED_EXTENSIONS


def convert_with_libreoffice(input_path, work_dir):
    """Converte documentos via LibreOffice headless.

    Cada chamada usa um perfil de usuario proprio (-env:UserInstallation).
    Sem isso, duas conversoes simultaneas disputam o perfil default e uma
    delas falha ou trava.
    """
    profile_dir = os.path.join(work_dir, 'lo_profile')
    args = [
        'libreoffice',
        f'-env:UserInstallation=file://{profile_dir}',
        '--headless',
        '--norestore',
        '--convert-to', 'pdf',
        '--outdir', work_dir,
        input_path,
    ]
    subprocess.run(
        args,
        check=True,
        timeout=CONVERSION_TIMEOUT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    for nome in os.listdir(work_dir):
        if nome.lower().endswith('.pdf'):
            return os.path.join(work_dir, nome)

    raise RuntimeError('LibreOffice terminou sem gerar PDF.')


@app.route('/', methods=['GET'])
def index():
    return render_template('home.html', posicoes=posicoes_das_bolinhas())


@app.route('/convert', methods=['GET'])
def pagina_de_conversao():
    # Formatos e limite vem do backend para o formulario nao divergir do que
    # /api/convert realmente aceita.
    return render_template(
        'convert.html',
        extensoes=sorted(ALLOWED_EXTENSIONS),
        max_bytes=MAX_CONTENT_LENGTH,
        max_mb=MAX_CONTENT_LENGTH // (1024 * 1024),
    )


@app.route('/imgtopdf', methods=['GET'])
def pagina_da_galeria():
    # Mesmo motivo: todo limite que a UI mostra ou valida vem daqui, nao
    # escrito na mao no HTML.
    return render_template(
        'imgtopdf.html',
        extensoes=sorted(IMAGE_EXTENSIONS),
        max_bytes=MAX_CONTENT_LENGTH,
        max_mb=MAX_CONTENT_LENGTH // (1024 * 1024),
        max_imagens=imgtopdf.MAX_IMAGENS,
        margem_max=imgtopdf.MARGEM_MAX_MM,
        tamanhos=TAMANHOS_DE_PAGINA,
    )


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


@app.route('/api/convert', methods=['POST'])
@limiter.limit(RATE_LIMIT)
def convert_file():
    """
    Converte Imagens, Word e PowerPoint para PDF (LibreOffice headless).
    ---
    consumes:
      - multipart/form-data
    parameters:
      - name: file
        in: formData
        type: file
        required: true
        description: O arquivo que sera convertido.
    responses:
      200:
        description: Arquivo PDF gerado com sucesso.
      400:
        description: Erro no envio, ou imagem que nao pode ser lida.
      413:
        description: Arquivo maior que o limite permitido.
      415:
        description: Formato nao suportado.
      429:
        description: Limite de requisicoes excedido.
      500:
        description: Erro interno.
      504:
        description: Conversao excedeu o tempo limite.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum arquivo enviado.'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nenhum arquivo selecionado.'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'Formato nao suportado.'}), 415

    extensao = get_extension(file.filename)
    filename = secure_filename(file.filename) or f'arquivo.{extensao}'
    work_dir = os.path.join(TEMP_FOLDER, str(uuid.uuid4()))
    os.makedirs(work_dir, exist_ok=True)

    try:
        if extensao in IMAGE_EXTENSIONS:
            # Mesmo pipeline de /api/imgtopdf: um PDF de uma pagina. Ter duas
            # implementacoes fazia a mesma foto sair diferente em cada rota --
            # esta ignorava a orientacao do EXIF e gravava a 100 DPI.
            #
            # A imagem e lida do stream, entao o nome enviado nao toca o disco.
            output_path = os.path.join(work_dir, 'saida.pdf')
            imgtopdf.monta_pdf(
                [file.stream],
                imgtopdf.Opcoes(tamanho='image', margem_mm=0, rotacoes=[0]),
                output_path,
            )
        else:
            input_path = os.path.join(work_dir, filename)
            file.save(input_path)
            output_path = convert_with_libreoffice(input_path, work_dir)

        # Le o PDF em memoria antes de apagar o diretorio. O limite de upload
        # e 16 MB, entao o custo e aceitavel e a limpeza fica deterministica:
        # nao depende do ciclo de vida da resposta nem do sistema de arquivos.
        with open(output_path, 'rb') as pdf:
            conteudo = pdf.read()

        nome_download = f"{filename.rsplit('.', 1)[0]}.pdf"
        return send_file(
            io.BytesIO(conteudo),
            mimetype='application/pdf',
            as_attachment=True,
            download_name=nome_download,
        )

    except imgtopdf.ImagemInvalida as exc:
        logger.info('Imagem recusada em %s: %s', filename, exc)
        return jsonify({'error': str(exc)}), 400

    except subprocess.TimeoutExpired:
        logger.warning('Conversao excedeu %ss: %s', CONVERSION_TIMEOUT, filename)
        return jsonify({'error': 'A conversao excedeu o tempo limite.'}), 504

    except subprocess.CalledProcessError as exc:
        logger.error('LibreOffice falhou (codigo %s) em %s', exc.returncode, filename)
        return jsonify({'error': 'Erro ao converter o documento no servidor.'}), 500

    except Exception:
        logger.exception('Falha na conversao de %s', filename)
        return jsonify({'error': 'Erro durante a conversao.'}), 500

    finally:
        # Roda em sucesso e em erro. Era o vazamento antigo: o cleanup so
        # existia no caminho de sucesso.
        shutil.rmtree(work_dir, ignore_errors=True)


@app.route('/api/imgtopdf', methods=['POST'])
@limiter.limit(RATE_LIMIT)
def imagens_para_pdf():
    """
    Monta um PDF unico a partir de varias imagens, na ordem enviada.
    ---
    consumes:
      - multipart/form-data
    parameters:
      - name: files
        in: formData
        type: file
        required: true
        description: >
          Imagem a incluir. Repita o campo para cada pagina; a ordem do envio
          e a ordem das paginas. De 1 a 20 imagens.
      - name: options
        in: formData
        type: string
        required: true
        description: >
          JSON com as opcoes. `pages` e uma lista do mesmo tamanho de `files`,
          cada item com `rotation` em 0, 90, 180 ou 270 (graus no sentido
          horario). `size` e "image", "a4" ou "letter". `margin_mm` e um
          inteiro de 0 a 50, ignorado quando `size` e "image". Exemplo:
          {"pages": [{"rotation": 90}], "size": "a4", "margin_mm": 10}
    responses:
      200:
        description: Arquivo PDF gerado com sucesso.
      400:
        description: Opcoes invalidas, quantidade fora da faixa ou imagem ilegivel.
      413:
        description: Envio maior que o limite permitido.
      415:
        description: Formato de imagem nao suportado.
      429:
        description: Limite de requisicoes excedido.
      500:
        description: Erro interno.
    """
    arquivos = [f for f in request.files.getlist('files') if f.filename]
    if not arquivos:
        return jsonify({'error': 'Nenhuma imagem enviada.'}), 400

    for arquivo in arquivos:
        if get_extension(arquivo.filename) not in IMAGE_EXTENSIONS:
            return jsonify({'error': 'Formato de imagem nao suportado.'}), 415

    try:
        opcoes = imgtopdf.valida_opcoes(request.form.get('options'), len(arquivos))
    except imgtopdf.OpcoesInvalidas as exc:
        return jsonify({'error': str(exc)}), 400

    work_dir = os.path.join(TEMP_FOLDER, str(uuid.uuid4()))
    os.makedirs(work_dir, exist_ok=True)

    try:
        # O nome enviado nunca toca o disco: le direto do stream do werkzeug e
        # grava so a saida. Assim path traversal no nome nao tem superficie.
        output_path = os.path.join(work_dir, 'saida.pdf')
        imgtopdf.monta_pdf(
            (arquivo.stream for arquivo in arquivos), opcoes, output_path
        )

        with open(output_path, 'rb') as pdf:
            conteudo = pdf.read()

        # N arquivos de entrada nao tem um nome de saida obvio.
        return send_file(
            io.BytesIO(conteudo),
            mimetype='application/pdf',
            as_attachment=True,
            download_name='imagens.pdf',
        )

    except imgtopdf.ImagemInvalida as exc:
        logger.info('Imagem recusada: %s', exc)
        return jsonify({'error': str(exc)}), 400

    except Exception:
        logger.exception('Falha ao montar PDF de %s imagens', len(arquivos))
        return jsonify({'error': 'Erro ao montar o PDF.'}), 500

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


# Rota temporaria para calibrar TRUSTED_PROXIES. Só e registrada quando
# DEBUG_PROXY esta definido, entao nao existe em producao por padrao. Remova
# junto com este comentario depois de descobrir a contagem de saltos.
if os.environ.get('DEBUG_PROXY'):

    @app.route('/debug/proxy', methods=['GET'])
    @limiter.exempt
    def debug_proxy():
        cadeia = [
            parte.strip()
            for parte in request.headers.get('X-Forwarded-For', '').split(',')
            if parte.strip()
        ]
        cf = request.headers.get('CF-Connecting-IP')

        # ProxyFix com x_for=N le o N-esimo endereco da direita para a
        # esquerda (werkzeug usa values[-N]). Cada chave abaixo e o valor que
        # TRUSTED_PROXIES=N produziria como chave do rate limit.
        candidatos = {str(n): cadeia[-n] for n in range(1, len(cadeia) + 1)}

        # A Cloudflare informa o IP real do cliente em CF-Connecting-IP. Achar
        # esse IP na cadeia da direto a contagem de saltos a confiar.
        recomendado = None
        if cf:
            recomendado = next(
                (int(n) for n, ip in candidatos.items() if ip == cf), None
            )

        return jsonify({
            'remote_addr': request.remote_addr,
            'chave_do_rate_limit_agora': get_remote_address(),
            'x_forwarded_for': request.headers.get('X-Forwarded-For'),
            'cadeia': cadeia,
            'cf_connecting_ip': cf,
            'x_forwarded_proto': request.headers.get('X-Forwarded-Proto'),
            'candidatos_por_trusted_proxies': candidatos,
            'trusted_proxies_atual': TRUSTED_PROXIES,
            'trusted_proxies_recomendado': recomendado,
            'como_ler': (
                'trusted_proxies_recomendado e o valor a usar. Se vier null, '
                'compare os candidatos com o seu IP publico e use a chave '
                'cujo valor bate.'
            ),
        })


@app.errorhandler(413)
def arquivo_muito_grande(_error):
    limite_mb = MAX_CONTENT_LENGTH // (1024 * 1024)
    return jsonify({'error': f'Arquivo maior que o limite de {limite_mb} MB.'}), 413


@app.errorhandler(429)
def limite_excedido(_error):
    return jsonify({
        'error': 'Muitas conversoes em pouco tempo. Tente novamente em instantes.'
    }), 429


if __name__ == '__main__':
    # Servidor de desenvolvimento. Producao roda por gunicorn (ver Dockerfile).
    port = int(os.environ.get('PORT', '5000'))
    app.run(host='127.0.0.1', port=port)
