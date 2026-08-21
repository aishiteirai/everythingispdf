"""Testes do TRUSTED_PROXIES.

Confiar no X-Forwarded-For sem um proxy reverso real deixa qualquer cliente
falsificar o IP de origem e escapar do rate limit. Estes testes fixam as duas
pontas: desligado o header e ignorado, ligado ele e respeitado.

TRUSTED_PROXIES e lido no import, entao cada teste carrega uma instancia
propria do modulo em vez de reusar a importada pelo conftest.
"""

import importlib.util
import io
import os

import pytest
from conftest import REPO_ROOT
from PIL import Image


def carrega_app(nome, **env):
    """Importa uma copia isolada de app.py com o ambiente dado."""
    anterior = {k: os.environ.get(k) for k in env}
    os.environ.update(env)
    try:
        spec = importlib.util.spec_from_file_location(
            nome, os.path.join(REPO_ROOT, 'app.py')
        )
        modulo = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(modulo)
        return modulo
    finally:
        for k, v in anterior.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


@pytest.fixture
def png():
    buf = io.BytesIO()
    Image.new('RGB', (10, 10), 'red').save(buf, 'PNG')
    return buf.getvalue()


def upload(conteudo, filename='foto.png'):
    return {
        'data': {'file': (io.BytesIO(conteudo), filename)},
        'content_type': 'multipart/form-data',
    }


def gasta_limite(client, png, vezes, forwarded_for=None):
    headers = {'X-Forwarded-For': forwarded_for} if forwarded_for else {}
    codigos = []
    for _ in range(vezes):
        r = client.post('/api/convert', headers=headers, **upload(png))
        codigos.append(r.status_code)
    return codigos


def test_desligado_ignora_forwarded_for(png):
    """Sem proxy declarado, trocar o X-Forwarded-For nao renova o limite."""
    modulo = carrega_app(
        'app_sem_proxy', TRUSTED_PROXIES='0', RATE_LIMIT='3 per minute'
    )
    client = modulo.app.test_client()

    gasta_limite(client, png, 3, forwarded_for='1.1.1.1')
    codigos = gasta_limite(client, png, 1, forwarded_for='2.2.2.2')

    assert codigos == [429]


def test_ligado_respeita_forwarded_for(png):
    """Atras de um proxy, cada IP real tem seu proprio balde."""
    modulo = carrega_app(
        'app_com_proxy', TRUSTED_PROXIES='1', RATE_LIMIT='3 per minute'
    )
    client = modulo.app.test_client()

    primeiro = gasta_limite(client, png, 4, forwarded_for='1.1.1.1')
    segundo = gasta_limite(client, png, 1, forwarded_for='2.2.2.2')

    assert primeiro == [200, 200, 200, 429]
    assert segundo == [200]


def test_default_e_desligado():
    modulo = carrega_app('app_default')

    assert modulo.TRUSTED_PROXIES == 0


class TestRotaDeDiagnosticoRemovida:
    """A rota /debug/proxy existiu para calibrar TRUSTED_PROXIES e foi
    removida depois disso. Nao pode voltar nem com DEBUG_PROXY definido."""

    def test_ausente_mesmo_com_debug_proxy(self):
        modulo = carrega_app('app_debug_removido', DEBUG_PROXY='1')
        client = modulo.app.test_client()

        assert client.get('/debug/proxy').status_code == 404


class TestSemanticaDoProxyFix:
    """Documenta a regra que a rota de diagnóstico assume: ProxyFix com
    x_for=N usa o N-ésimo endereço da direita para a esquerda."""

    def test_x_for_1_usa_o_endereco_mais_a_direita(self, png):
        modulo = carrega_app(
            'app_semantica', TRUSTED_PROXIES='1', RATE_LIMIT='2 per minute'
        )
        client = modulo.app.test_client()

        # Mesmo ultimo salto nas duas cadeias: compartilham o balde.
        gasta_limite(client, png, 2, forwarded_for='1.1.1.1, 9.9.9.9')
        codigos = gasta_limite(client, png, 1, forwarded_for='2.2.2.2, 9.9.9.9')

        assert codigos == [429]

    def test_x_for_2_usa_o_penultimo(self, png):
        modulo = carrega_app(
            'app_semantica2', TRUSTED_PROXIES='2', RATE_LIMIT='2 per minute'
        )
        client = modulo.app.test_client()

        # Agora o que separa e o primeiro endereco, nao o ultimo.
        gasta_limite(client, png, 2, forwarded_for='1.1.1.1, 9.9.9.9')
        codigos = gasta_limite(client, png, 1, forwarded_for='2.2.2.2, 9.9.9.9')

        assert codigos == [200]
