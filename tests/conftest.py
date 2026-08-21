"""Fixtures da suite.

O ambiente precisa estar montado antes de qualquer import de `app`: o modulo
resolve TEMP_FOLDER e CONVERSION_TIMEOUT no momento do import. O pytest carrega
o conftest antes dos modulos de teste, entao a preparacao acontece aqui no
nivel do modulo, nao numa fixture.
"""

import io
import os
import shutil
import sys
import tempfile

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STUB_BIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bin')

# Diretorio de trabalho isolado, para nao sujar o temp/ do projeto.
_TEMP_FOLDER = tempfile.mkdtemp(prefix='everythingispdf-tests-')
os.environ['TEMP_FOLDER'] = _TEMP_FOLDER

# Timeout curto: o modo `hang` do dublê dorme 30s.
os.environ['CONVERSION_TIMEOUT'] = '2'

# O dublê de libreoffice tem que vir antes de um LibreOffice de verdade.
os.environ['PATH'] = STUB_BIN + os.pathsep + os.environ.get('PATH', '')

sys.path.insert(0, REPO_ROOT)

import app as appmod  # noqa: E402  (import depois do setup, de proposito)

# O rate limit atrapalha os testes de contrato, que disparam varios requests
# na mesma sessao. Fica desligado por default e e religado pela fixture
# `rate_limit` nos testes que exercitam o 429.
appmod.limiter.enabled = False


def pytest_unconfigure(config):
    shutil.rmtree(_TEMP_FOLDER, ignore_errors=True)


@pytest.fixture(scope='session')
def flask_app():
    appmod.app.config['TESTING'] = True
    return appmod.app


@pytest.fixture
def client(flask_app):
    return flask_app.test_client()


@pytest.fixture
def temp_folder():
    """Diretorio de trabalho do app, sempre vazio no inicio do teste."""
    for nome in os.listdir(appmod.TEMP_FOLDER):
        shutil.rmtree(os.path.join(appmod.TEMP_FOLDER, nome), ignore_errors=True)
    return appmod.TEMP_FOLDER


@pytest.fixture
def restos(temp_folder):
    """Callable que lista o que sobrou no diretorio de trabalho.

    Um resultado nao-vazio depois da resposta significa vazamento de arquivo
    temporario -- foi exatamente o bug do cleanup antigo.
    """
    return lambda: sorted(os.listdir(temp_folder))


@pytest.fixture
def lo_mode():
    """Escolhe o comportamento do dublê de libreoffice. Reseta no teardown."""
    def _set(modo):
        os.environ['LO_STUB_MODE'] = modo

    yield _set
    os.environ.pop('LO_STUB_MODE', None)


@pytest.fixture
def png():
    """Bytes de um PNG RGBA, para exercitar a conversao de modo de cor."""
    from PIL import Image

    buf = io.BytesIO()
    Image.new('RGBA', (40, 40), (255, 0, 0, 128)).save(buf, 'PNG')
    return buf.getvalue()


@pytest.fixture
def upload():
    """Monta o payload multipart de um upload."""
    def _upload(conteudo, filename):
        return {
            'data': {'file': (io.BytesIO(conteudo), filename)},
            'content_type': 'multipart/form-data',
        }

    return _upload


@pytest.fixture
def rate_limit():
    """Liga o rate limit para o teste e zera os contadores no inicio e no fim."""
    appmod.limiter.reset()
    appmod.limiter.enabled = True

    yield appmod.RATE_LIMIT

    appmod.limiter.enabled = False
    appmod.limiter.reset()


@pytest.fixture
def imagem():
    """Fabrica bytes de imagem no tamanho, formato e modo pedidos."""
    from PIL import Image

    def _imagem(largura, altura, formato='PNG', cor=(200, 30, 30), modo='RGB', **extra):
        buf = io.BytesIO()
        Image.new(modo, (largura, altura), cor).save(buf, formato, **extra)
        return buf.getvalue()

    return _imagem


@pytest.fixture
def paginas():
    """Dimensoes em pontos de cada pagina do PDF, na ordem do arquivo.

    Exige exatamente um MediaBox por pagina. A implementacao anterior montava
    o PDF com append incremental, o que deixava as arvores de paginas antigas
    no arquivo -- um PDF de 3 paginas tinha 6 MediaBox gravados. Voltar para
    aquele caminho quebra esta asercao em vez de passar silenciosamente.
    """
    import re

    def _paginas(dados):
        contagens = re.findall(rb'/Count\s+(\d+)', dados)
        assert contagens, 'PDF sem /Count'
        total = int(contagens[-1])

        # Espacos frouxos de proposito: o formato exato e detalhe do escritor
        # de PDF do Pillow, e a pin do requirements muda com o tempo.
        caixas = re.findall(
            rb'/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]', dados
        )
        assert len(caixas) == total, (
            f'{len(caixas)} MediaBox para {total} paginas -- sobra de arvore de '
            f'paginas antiga indica volta ao append incremental'
        )

        return [(float(l), float(a)) for l, a in caixas]

    return _paginas


@pytest.fixture
def opcoes():
    """Monta o JSON do campo `options` de /api/imgtopdf."""
    import json

    def _opcoes(quantidade=1, size='image', rotations=None, **extra):
        giros = rotations if rotations is not None else [0] * quantidade
        corpo = {'pages': [{'rotation': giro} for giro in giros], 'size': size}
        corpo.update(extra)
        return json.dumps(corpo)

    return _opcoes


@pytest.fixture
def envio():
    """Payload multipart de /api/imgtopdf.

    `arquivos` e uma lista de (bytes, nome). `options=None` omite o campo, para
    exercitar o payload incompleto.
    """
    def _envio(arquivos, options=None):
        dados = {
            'files': [(io.BytesIO(conteudo), nome) for conteudo, nome in arquivos],
        }
        if options is not None:
            dados['options'] = options

        return {'data': dados, 'content_type': 'multipart/form-data'}

    return _envio


@pytest.fixture
def limite_pequeno(flask_app):
    """Baixa MAX_CONTENT_LENGTH para o teste de 413.

    O teto de producao e 32 MB e alocar isso por teste e desperdicio; o que
    importa e o comportamento no estouro, nao o valor exato.
    """
    original = flask_app.config['MAX_CONTENT_LENGTH']
    flask_app.config['MAX_CONTENT_LENGTH'] = 4096

    yield 4096

    flask_app.config['MAX_CONTENT_LENGTH'] = original
