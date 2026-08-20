"""Testes das paginas servidas: hub, conversor e galeria.

O que vale para as tres -- pagina autocontida, sem JavaScript inline
executavel, CSS referenciado, tema escuro -- e parametrizado aqui, em vez de
copiado em tres arquivos. O que e especifico de cada uma fica na sua classe.
"""

import json
import re

import pytest

import app as appmod
import imgtopdf

ROTAS = ('/', '/convert', '/imgtopdf')


@pytest.fixture(params=ROTAS)
def qualquer_pagina(request, client):
    resposta = client.get(request.param)
    assert resposta.status_code == 200, f'{request.param} nao responde 200'
    return resposta.get_data(as_text=True)


@pytest.fixture
def hub(client):
    return client.get('/').get_data(as_text=True)


@pytest.fixture
def galeria(client):
    return client.get('/imgtopdf').get_data(as_text=True)


@pytest.fixture
def config_galeria(galeria):
    casa = re.search(
        r'<script type="application/json" id="config-galeria">(.*?)</script>',
        galeria, re.S,
    )
    assert casa, 'bloco de configuracao ausente na galeria'
    return json.loads(casa.group(1))


class TestTodasAsPaginas:
    def test_e_autocontida(self, qualquer_pagina):
        """Sem CDN: nada de script, folha de estilo ou fonte externa."""
        assert re.findall(r'(?:src|href)="(?:https?:)?//[^"]+"', qualquer_pagina) == []

    def test_nao_tem_javascript_inline_executavel(self, qualquer_pagina):
        """A configuracao vai num bloco application/json, que o navegador nao
        executa. Assim a pagina funciona sob CSP sem unsafe-inline."""
        for atributos in re.findall(r'<script([^>]*)>', qualquer_pagina):
            assert 'src=' in atributos or 'application/json' in atributos, \
                f'script inline executavel: <script{atributos}>'

    def test_referencia_o_css(self, qualquer_pagina):
        assert 'css/estilo.css' in qualquer_pagina

    def test_declara_o_idioma(self, qualquer_pagina):
        assert 'lang="pt-BR"' in qualquer_pagina


class TestHub:
    def test_leva_para_as_duas_funcoes(self, hub):
        assert 'href="/convert"' in hub
        assert 'href="/imgtopdf"' in hub

    def test_nao_precisa_de_javascript(self, hub):
        """O hub e so dois links. Script nenhum, nem de configuracao."""
        assert '<script' not in hub

    def test_menciona_as_duas_funcoes_em_texto(self, hub):
        assert 'PDF' in hub


class TestGaleria:
    def test_aceita_varios_arquivos(self, galeria):
        casa = re.search(r'<input type="file"[^>]*>', galeria)
        assert casa, 'input de arquivo ausente'
        assert 'multiple' in casa.group(0)

    def test_accept_so_tem_imagem(self, galeria):
        casa = re.search(r'accept="([^"]+)"', galeria)
        assert casa, 'input de arquivo sem accept'

        declarados = {v.strip().lstrip('.').lower() for v in casa.group(1).split(',')}
        assert declarados == appmod.IMAGE_EXTENSIONS

    def test_progresso_e_anunciado_para_leitor_de_tela(self, galeria):
        assert 'role="progressbar"' in galeria
        assert 'aria-live' in galeria

    def test_volta_para_o_inicio(self, galeria):
        assert 'href="/"' in galeria


class TestConfiguracaoDaGaleria:
    """A UI nao pode oferecer o que /api/imgtopdf recusa, entao todo limite
    vem do backend em vez de estar escrito na mao no HTML."""

    def test_extensoes_batem_com_o_backend(self, config_galeria):
        assert set(config_galeria['extensoes']) == appmod.IMAGE_EXTENSIONS

    def test_teto_de_imagens_bate_com_o_backend(self, config_galeria):
        assert config_galeria['maxImagens'] == imgtopdf.MAX_IMAGENS

    def test_teto_de_margem_bate_com_o_backend(self, config_galeria):
        assert config_galeria['margemMax'] == imgtopdf.MARGEM_MAX_MM

    def test_limite_de_bytes_bate_com_o_backend(self, config_galeria):
        assert config_galeria['maxBytes'] == appmod.MAX_CONTENT_LENGTH

    def test_tamanhos_oferecidos_sao_os_que_a_api_aceita(self, config_galeria):
        valores = [t['valor'] for t in config_galeria['tamanhos']]

        assert valores == list(imgtopdf.TAMANHOS)

    def test_todo_tamanho_tem_rotulo_para_o_usuario(self, config_galeria):
        for tamanho in config_galeria['tamanhos']:
            assert tamanho['rotulo'].strip(), f"{tamanho['valor']} sem rotulo"


class TestModulosDaGaleria:
    MODULOS = ('imgtopdf.js', 'gallery.js', 'gallery-ui.js', 'gallery-send.js')

    @pytest.mark.parametrize('modulo', MODULOS)
    def test_sao_servidos(self, client, modulo):
        assert client.get(f'/static/js/{modulo}').status_code == 200

    def test_a_pagina_carrega_o_modulo_de_entrada(self, galeria):
        assert re.search(r'<script type="module" src="[^"]*js/imgtopdf\.js"', galeria)

    def test_todo_import_resolve(self, client):
        """Um import apontando para arquivo inexistente quebra a pagina em
        silencio: o navegador nao executa nada e nao ha erro visivel."""
        fontes = []
        for modulo in self.MODULOS:
            resposta = client.get(f'/static/js/{modulo}')
            assert resposta.status_code == 200, f'{modulo} nao e servido'
            fontes.append(resposta.get_data(as_text=True))

        importados = set(re.findall(r"from '\./([^']+)'", '\n'.join(fontes)))
        assert importados, 'nenhum import encontrado'

        for modulo in importados:
            assert client.get(f'/static/js/{modulo}').status_code == 200, \
                f'{modulo} e importado mas nao e servido'


class TestTema:
    @pytest.fixture
    def css(self, client):
        resposta = client.get('/static/css/estilo.css')
        assert resposta.status_code == 200
        return resposta.get_data(as_text=True)

    def test_tem_tema_escuro(self, css):
        assert 'prefers-color-scheme: dark' in css

    def test_respeita_movimento_reduzido(self, css):
        assert 'prefers-reduced-motion: reduce' in css


class TestMensagensDaGaleria:
    """Todo status que /api/imgtopdf produz precisa de texto proprio, senao o
    usuario recebe 'erro 400' e nao entende nada."""

    @pytest.fixture
    def fonte(self, client):
        resposta = client.get('/static/js/gallery-send.js')
        assert resposta.status_code == 200
        return resposta.get_data(as_text=True)

    @pytest.mark.parametrize('status', [400, 413, 415, 429, 500])
    def test_cada_status_tem_mensagem_propria(self, fonte, status):
        bloco = re.search(r'mensagensDaGaleria\(maxMb\) \{(.*?)\n\}', fonte, re.S)
        assert bloco, 'mapa de mensagens da galeria nao encontrado'

        assert re.search(rf'^\s*{status}:', bloco.group(1), re.M), \
            f'status {status} sem mensagem dedicada'
