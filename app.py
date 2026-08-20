import io
import logging
import os
import shutil
import subprocess
import uuid

from flask import Flask, jsonify, render_template, request, send_file
from flasgger import Swagger
from PIL import Image
from werkzeug.utils import secure_filename

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s [%(name)s] %(message)s',
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
swagger = Swagger(app)

MAX_CONTENT_LENGTH = 16 * 1024 * 1024
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

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


def convert_image(input_path, work_dir):
    output_path = os.path.join(work_dir, 'output.pdf')
    with Image.open(input_path) as image:
        if image.mode in ('RGBA', 'P', 'LA'):
            image = image.convert('RGB')
        image.save(output_path, 'PDF', resolution=100.0)
    return output_path


@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


@app.route('/api/convert', methods=['POST'])
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
        description: Erro no envio.
      413:
        description: Arquivo maior que o limite permitido.
      415:
        description: Formato nao suportado.
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
        input_path = os.path.join(work_dir, filename)
        file.save(input_path)

        if extensao in IMAGE_EXTENSIONS:
            output_path = convert_image(input_path, work_dir)
        else:
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


@app.errorhandler(413)
def arquivo_muito_grande(_error):
    limite_mb = MAX_CONTENT_LENGTH // (1024 * 1024)
    return jsonify({'error': f'Arquivo maior que o limite de {limite_mb} MB.'}), 413


if __name__ == '__main__':
    # Servidor de desenvolvimento. Producao roda por gunicorn (ver Dockerfile).
    port = int(os.environ.get('PORT', '5000'))
    app.run(host='127.0.0.1', port=port)
