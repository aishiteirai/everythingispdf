"""Testes dos cabecalhos de seguranca.

O frontend foi construido para viver sob CSP sem 'unsafe-inline' em script: a
configuracao vai num bloco application/json que o navegador nao executa, as
fontes sao auto-hospedadas e nao existe CDN. Sem o cabecalho, esse trabalho
nao protege nada.
"""

import pytest

PAGINAS = ('/', '/convert', '/imgtopdf')

# O flasgger serve a propria pagina com script inline e Google Fonts de host
# externo. CSP estrita ali quebraria a documentacao, entao a excecao e
# deliberada -- e estreita, so estes dois prefixos.
ISENTOS = ('/apidocs/', '/flasgger_static/swagger-ui.css')


def diretivas(resposta):
    """A CSP como dicionario diretiva -> lista de fontes."""
    politica = resposta.headers.get('Content-Security-Policy')
    assert politica, 'resposta sem Content-Security-Policy'

    encontradas = {}
    for parte in politica.split(';'):
        parte = parte.strip()
        if not parte:
            continue
        nome, *fontes = parte.split()
        encontradas[nome] = fontes

    return encontradas


class TestPresenca:
    @pytest.mark.parametrize('rota', PAGINAS)
    def test_toda_pagina_tem_os_tres_cabecalhos(self, client, rota):
        r = client.get(rota)

        assert r.headers.get('Content-Security-Policy')
        assert r.headers.get('X-Content-Type-Options') == 'nosniff'
        assert r.headers.get('Referrer-Policy')

    def test_a_resposta_da_api_tambem_tem(self, client, upload, imagem):
        """Um PDF servido sem nosniff pode ser reinterpretado pelo navegador."""
        r = client.post('/api/convert', **upload(imagem(40, 40), 'foto.png'))

        assert r.status_code == 200
        assert r.headers.get('X-Content-Type-Options') == 'nosniff'

    def test_a_resposta_de_erro_tambem_tem(self, client):
        r = client.post('/api/imgtopdf', data={}, content_type='multipart/form-data')

        assert r.status_code == 400
        assert r.headers.get('X-Content-Type-Options') == 'nosniff'


class TestPoliticaDeScript:
    """A parte que importa: script inline e eval barrados."""

    @pytest.mark.parametrize('rota', PAGINAS)
    def test_script_nao_permite_inline_nem_eval(self, client, rota):
        script = diretivas(client.get(rota))['script-src']

        assert "'unsafe-inline'" not in script
        assert "'unsafe-eval'" not in script

    @pytest.mark.parametrize('rota', PAGINAS)
    def test_script_so_da_propria_origem(self, client, rota):
        assert diretivas(client.get(rota))['script-src'] == ["'self'"]

    @pytest.mark.parametrize('rota', PAGINAS)
    def test_nada_de_plugin_nem_de_iframe_alheio(self, client, rota):
        atual = diretivas(client.get(rota))

        assert atual['object-src'] == ["'none'"]
        assert atual['frame-ancestors'] == ["'none'"]
        assert atual['base-uri'] == ["'self'"]


class TestPoliticaNaoQuebraOSite:
    """CSP que barra o proprio site e pior que CSP nenhuma: some em silencio."""

    def test_miniatura_da_galeria_e_permitida(self, client):
        """As miniaturas vem de URL.createObjectURL, que produz blob:. Sem
        blob: em img-src, a galeria fica sem preview nenhum."""
        assert 'blob:' in diretivas(client.get('/imgtopdf'))['img-src']

    def test_fonte_da_propria_origem_e_permitida(self, client):
        assert "'self'" in diretivas(client.get('/'))['font-src']

    def test_o_xhr_para_a_propria_api_e_permitido(self, client):
        assert "'self'" in diretivas(client.get('/imgtopdf'))['connect-src']

    def test_estilo_inline_e_permitido_com_motivo(self, client):
        """O servidor renderiza a posicao das bolinhas em style="--dx: ...",
        que e atributo inline. Sem 'unsafe-inline' em style-src elas nascem
        todas na origem. Style inline nao e vetor da mesma classe que script
        inline -- por isso a excecao para no estilo."""
        assert "'unsafe-inline'" in diretivas(client.get('/'))['style-src']


class TestExcecaoDaDocumentacao:
    @pytest.mark.parametrize('rota', ISENTOS)
    def test_a_documentacao_nao_recebe_csp(self, client, rota):
        """O Swagger UI usa script inline e Google Fonts. CSP estrita ali
        quebraria a pagina."""
        r = client.get(rota)

        assert r.status_code == 200
        assert r.headers.get('Content-Security-Policy') is None

    @pytest.mark.parametrize('rota', ISENTOS)
    def test_mas_ainda_recebe_o_resto(self, client, rota):
        assert client.get(rota).headers.get('X-Content-Type-Options') == 'nosniff'

    def test_a_excecao_nao_vaza_para_as_paginas_do_site(self, client):
        for rota in PAGINAS:
            assert client.get(rota).headers.get('Content-Security-Policy'), rota
