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
