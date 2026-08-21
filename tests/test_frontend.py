"""Testes da página de conversão de arquivo único (/convert).

O que vale para as três páginas do site -- autocontida, sem JavaScript inline
executável, CSS referenciado, tema -- está parametrizado em test_pages.py. Aqui
fica só o que é específico desta página.

O formulário declarava a lista de formatos na mão e ela divergiu do backend
(a API aceitava .doc e .ppt, o input não). Agora os valores vêm do backend
num bloco JSON e os testes abaixo travam isso.

CSS e JavaScript vivem em static/, então os testes leem os arquivos como o
navegador leria: pela rota que os serve.
"""

import json
import re

import pytest

import app as appmod


@pytest.fixture
def pagina(client):
    return client.get('/convert').get_data(as_text=True)


@pytest.fixture
def configuracao(pagina):
    """A configuração que o backend injeta na página."""
    casa = re.search(
        r'<script type="application/json" id="config-conversor">(.*?)</script>',
        pagina, re.S,
    )
    assert casa, 'bloco de configuração ausente na página'
    return json.loads(casa.group(1))


@pytest.fixture
def javascript(client):
    """Todos os módulos concatenados, para asserções sobre o conjunto."""
    modulos = ['main.js', 'formato.js', 'envio.js', 'interface.js']
    partes = []
    for modulo in modulos:
        resposta = client.get(f'/static/js/{modulo}')
        assert resposta.status_code == 200, f'{modulo} não é servido'
        partes.append(resposta.get_data(as_text=True))
    return '\n'.join(partes)


class TestFormatosDeclarados:
    def test_accept_bate_com_o_backend(self, pagina):
        casa = re.search(r'accept="([^"]+)"', pagina)
        assert casa, 'input de arquivo sem atributo accept'

        declarados = {v.strip().lstrip('.').lower() for v in casa.group(1).split(',')}
        assert declarados == appmod.ALLOWED_EXTENSIONS

    def test_configuracao_injetada_bate_com_o_backend(self, configuracao):
        assert set(configuracao['extensoes']) == appmod.ALLOWED_EXTENSIONS

    def test_toda_extensao_aparece_para_o_usuario(self, pagina):
        visivel = re.search(r'class="formatos"[^>]*>([^<]+)<', pagina)
        assert visivel, 'lista visível de formatos ausente'

        listados = {v.strip() for v in visivel.group(1).split(',')}
        assert listados == appmod.ALLOWED_EXTENSIONS


class TestLimiteDeTamanho:
    def test_limite_em_bytes_bate_com_a_config(self, configuracao):
        assert configuracao['maxBytes'] == appmod.MAX_CONTENT_LENGTH

    def test_limite_em_mb_e_coerente(self, configuracao):
        assert configuracao['maxMb'] == appmod.MAX_CONTENT_LENGTH // (1024 * 1024)

    def test_limite_aparece_no_texto(self, pagina, configuracao):
        assert f"{configuracao['maxMb']} MB" in pagina


class TestArquivosEstaticos:
    @pytest.mark.parametrize('caminho', [
        '/static/css/estilo.css',
        '/static/js/main.js',
        '/static/js/formato.js',
        '/static/js/envio.js',
        '/static/js/interface.js',
    ])
    def test_sao_servidos(self, client, caminho):
        assert client.get(caminho).status_code == 200

    def test_a_pagina_carrega_o_javascript_como_modulo(self, pagina):
        assert re.search(r'<script type="module" src="[^"]*js/main\.js"', pagina)

    def test_todo_import_do_javascript_resolve(self, client, javascript):
        """Um import apontando para arquivo inexistente quebra a página em
        silêncio: o navegador não executa nada e não há erro visível."""
        importados = set(re.findall(r"from '\./([^']+)'", javascript))
        assert importados, 'nenhum import encontrado nos módulos'

        for modulo in importados:
            assert client.get(f'/static/js/{modulo}').status_code == 200, \
                f'{modulo} é importado mas não é servido'


class TestEstrutura:
    def test_campo_tem_o_nome_que_a_api_espera(self, pagina):
        assert 'name="file"' in pagina

    def test_volta_para_o_inicio(self, pagina):
        assert 'href="/"' in pagina

    def test_progresso_e_anunciado_para_leitor_de_tela(self, pagina):
        assert 'role="progressbar"' in pagina
        assert 'aria-live' in pagina


class TestMensagensDeErro:
    @pytest.mark.parametrize('status', [400, 413, 415, 429, 500, 504])
    def test_cada_status_da_api_tem_mensagem_propria(self, javascript, status):
        """Toda resposta de erro que /api/convert produz precisa de texto
        próprio, senão o usuário recebe 'erro 429' e não entende nada."""
        bloco = re.search(r'mensagensDeErro\(maxMb\) \{\s*return \{(.*?)\};', javascript, re.S)
        assert bloco, 'mapa de mensagens não encontrado'

        assert re.search(rf'^\s*{status}:', bloco.group(1), re.M), \
            f'status {status} sem mensagem dedicada'
