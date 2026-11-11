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
        galeria, re.DOTALL,
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

    def test_carrega_so_os_modulos_que_precisa(self, hub):
        fontes = re.findall(r'<script[^>]*src="([^"]+)"', hub)

        assert [f.rsplit('/', 1)[-1] for f in fontes] == ['banner.js']

    def test_tem_o_banner_e_o_titulo(self, hub):
        assert 'id="banner"' in hub
        assert 'TUDO<br>VIRA PDF.' in hub

    def test_nomeia_as_duas_funcoes_em_texto(self, hub):
        assert 'aria-label="Arquivos para PDF"' in hub
        assert 'aria-label="Imagens para PDF"' in hub

    def test_o_rotulo_e_abrir_e_nao_soltar(self, hub):
        """A home nao recebe arquivo: "SOLTAR" prometeria o que ela nao
        faz."""
        assert hub.count('ABRIR →') == 2
        assert 'SOLTAR' not in hub

    def test_extensoes_e_limite_vem_do_backend(self, hub):
        for extensao in appmod.ALLOWED_EXTENSIONS:
            assert extensao in hub
        assert f'{appmod.MAX_CONTENT_LENGTH // (1024 * 1024)} MB' in hub
        assert f'até {imgtopdf.MAX_IMAGENS} imagens' in hub


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


class TestMovimentoReduzido:
    def test_o_css_respeita_movimento_reduzido(self, client):
        """A fisica das bolinhas anima; quem pediu menos movimento nao pode
        receber inercia."""
        css = client.get('/static/css/estilo.css').get_data(as_text=True)

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
        bloco = re.search(r'mensagensDaGaleria\(maxMb\) \{(.*?)\n\}', fonte, re.DOTALL)
        assert bloco, 'mapa de mensagens da galeria nao encontrado'

        assert re.search(rf'^\s*{status}:', bloco.group(1), re.MULTILINE), \
            f'status {status} sem mensagem dedicada'


# =============================================================
# Tokens de cor, contraste e fonte
# =============================================================

# (frente, fundo, razao minima). 4.5 para texto, 3.0 para componente grafico
# -- o que a WCAG 2.1 AA exige de cada um.
#
# Texto sobre vermelho e tinta e sobre azul e creme. O amarelo nunca carrega
# texto, mas o par existe porque a selecao da fita e amarela com tinta por
# cima. Vermelho e azul sobre creme sao forma e borda: 3:1 basta.
PARES_DE_CONTRASTE = [
    ('--tinta', '--creme', 4.5),
    ('--tinta', '--mesa', 4.5),
    ('--tinta', '--vermelho', 4.5),
    ('--creme', '--azul', 4.5),
    ('--tinta', '--amarelo', 4.5),
    ('--tinta', '--erro-fundo', 4.5),
    ('--texto-fraco', '--creme', 4.5),
    ('--vermelho', '--creme', 3.0),
    ('--azul', '--creme', 3.0),
]

def _blocos(css):
    """(seletores, corpo) de cada regra do CSS.

    O `[^{}]` das duas partes garante que o envelope de um @media nao case
    como regra: o conteudo dele contem chaves. Sobram as regras de dentro.
    """
    for casa in re.finditer(r'([^{}]+)\{([^{}]*)\}', css):
        yield casa.group(1), casa.group(2)


def tokens(css):
    """Tokens em vigor, varrendo as regras na ordem do arquivo, que e a ordem
    da cascata. O site tem um tema so, entao toda regra conta."""
    valores = {}

    for _seletores, corpo in _blocos(css):
        for nome, valor in re.findall(r'(--[\w-]+)\s*:\s*([^;]+);', corpo):
            valores[nome] = valor.strip()

    return valores


def _canal(valor):
    valor = valor / 255

    return valor / 12.92 if valor <= 0.03928 else ((valor + 0.055) / 1.055) ** 2.4


def luminancia(hexadecimal):
    cor = hexadecimal.lstrip('#')
    if len(cor) == 3:
        cor = ''.join(letra * 2 for letra in cor)

    vermelho, verde, azul = (int(cor[i:i + 2], 16) for i in (0, 2, 4))

    return 0.2126 * _canal(vermelho) + 0.7152 * _canal(verde) + 0.0722 * _canal(azul)


def contraste(frente, fundo):
    clara, escura = sorted((luminancia(frente), luminancia(fundo)), reverse=True)

    return (clara + 0.05) / (escura + 0.05)



@pytest.fixture
def css_do_site(client):
    resposta = client.get('/static/css/estilo.css')
    assert resposta.status_code == 200
    return resposta.get_data(as_text=True)


class TestContraste:
    """Este teste calcula a razao de contraste dos tokens em vez de confiar
    na palavra de quem escolheu."""

    def test_todo_token_existe(self, css_do_site):
        valores = tokens(css_do_site)
        necessarios = {nome for par in PARES_DE_CONTRASTE for nome in par[:2]}

        faltando = sorted(necessarios - valores.keys())
        assert not faltando, f'sem os tokens {faltando}'

    def test_pares_passam_em_aa(self, css_do_site):
        valores = tokens(css_do_site)

        for frente, fundo, minimo in PARES_DE_CONTRASTE:
            razao = contraste(valores[frente], valores[fundo])
            assert razao >= minimo, (
                f'{frente} sobre {fundo} da {razao:.2f}:1, '
                f'precisa de {minimo}:1'
            )


class TestPaleta:
    def test_a_paleta_e_a_da_spec(self, css_do_site):
        valores = tokens(css_do_site)
        nomes = ('--creme', '--tinta', '--vermelho', '--amarelo', '--azul', '--mesa')

        assert {k: valores[k].lower() for k in nomes} == {
            '--creme': '#fffef9', '--tinta': '#000000', '--vermelho': '#e8452c',
            '--amarelo': '#f2b705', '--azul': '#2453d6', '--mesa': '#e9e7e0',
        }

    @pytest.mark.parametrize('rota', ROTAS)
    def test_declara_so_tema_claro(self, client, rota):
        pagina = client.get(rota).get_data(as_text=True)

        assert '<meta name="color-scheme" content="light">' in pagina

    def test_a_fonte_cobre_o_peso_900(self, css_do_site):
        """Os titulos sao Inter 900. Sem o peso no @font-face o navegador
        engrossa o 700 na mao, e fica outra fonte."""
        assert re.search(r'font-weight:\s*\d+\s+900', css_do_site)


class TestClassesQueOJavaScriptLiga:
    """Renomear uma classe que o JavaScript alterna quebra a interface inteira
    sem nenhum outro teste falhar: o CSS fica válido e o JS continua rodando,
    só não pinta nada."""

    MODULOS = (
        'convert.js', 'convert-ui.js', 'feedback.js',
        'imgtopdf.js', 'gallery-ui.js',
        'drag.js', 'banner.js', 'tile-grid.js', 'press.js',
    )

    @pytest.fixture
    def classes_do_javascript(self, client):
        encontradas = set()

        for modulo in self.MODULOS:
            resposta = client.get(f'/static/js/{modulo}')
            assert resposta.status_code == 200, f'{modulo} nao e servido'
            fonte = resposta.get_data(as_text=True)

            chamadas = re.findall(
                r'classList\.(?:add|remove|toggle)\(([^)]*)\)', fonte
            )
            atribuicoes = re.findall(r'className\s*=\s*[\'`]([^\'`]+)', fonte)

            for chamada in chamadas:
                for literal in re.findall(r"'([^']+)'", chamada):
                    encontradas.add(literal)
            for atribuicao in atribuicoes:
                encontradas.update(atribuicao.split())

        assert encontradas, 'nenhuma classe encontrada nos modulos'
        return encontradas

    def test_o_css_define_todas(self, css_do_site, classes_do_javascript):
        faltando = sorted(
            classe for classe in classes_do_javascript
            if not re.search(rf'\.{re.escape(classe)}\b', css_do_site)
        )

        assert not faltando, f'classes ligadas pelo JS e ausentes do CSS: {faltando}'


class TestFonte:
    def test_o_css_declara_font_face(self, css_do_site):
        assert '@font-face' in css_do_site

    def test_nenhuma_fonte_vem_de_host_externo(self, css_do_site):
        """Host externo quebraria a página autocontida e a CSP."""
        externas = [
            url for url in re.findall(r'url\(([^)]+)\)', css_do_site)
            if '//' in url
        ]

        assert externas == [], f'fonte de host externo: {externas}'

    def test_todo_arquivo_de_fonte_e_servido(self, client, css_do_site):
        caminhos = {
            url.strip('\'"') for url in re.findall(r'url\(([^)]+)\)', css_do_site)
        }
        assert caminhos, 'nenhum arquivo de fonte referenciado'

        for caminho in caminhos:
            assert client.get(caminho).status_code == 200, f'{caminho} nao e servido'

    def test_a_licenca_da_fonte_acompanha_o_arquivo(self, client):
        """A OFL exige distribuir a licença junto da fonte."""
        resposta = client.get('/static/fonts/Inter-LICENSE.txt')

        assert resposta.status_code == 200
        assert 'SIL Open Font License' in resposta.get_data(as_text=True)



class TestCabecalho:
    @pytest.mark.parametrize('rota', ROTAS)
    def test_toda_pagina_tem_cabecalho_com_a_marca(self, client, rota):
        pagina = client.get(rota).get_data(as_text=True)

        assert '<header' in pagina, f'{rota} sem cabecalho'
        assert 'everything is pdf' in pagina

    @pytest.mark.parametrize('rota', ROTAS)
    def test_a_marca_leva_ao_inicio(self, client, rota):
        pagina = client.get(rota).get_data(as_text=True)
        marca = re.search(r'<a[^>]*class="[^"]*marca[^"]*"[^>]*>', pagina)

        assert marca, f'{rota} sem link da marca'
        assert 'href="/"' in marca.group(0)

    @pytest.mark.parametrize('rota', ROTAS)
    def test_nenhuma_pagina_tem_link_morto(self, client, rota):
        pagina = client.get(rota).get_data(as_text=True)

        assert 'href="#"' not in pagina


class TestSeguranca:
    @pytest.mark.parametrize('modulo', ['press.js', 'gallery-ui.js', 'convert-ui.js'])
    def test_dado_do_usuario_nunca_vira_html(self, client, modulo):
        """Nome de arquivo como `"><img src=x onerror=alert(1)>.docx` tem de
        aparecer como texto no rotulo da prensa, no palco e na fita."""
        fonte = client.get(f'/static/js/{modulo}').get_data(as_text=True)

        # Regex e nao busca da palavra: comentarios citam innerHTML para dizer
        # que ele nao e usado.
        vira_html = r'\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\('
        assert not re.search(vira_html, fonte)


class TestBolinhasSairam:
    """As bolinhas arremessaveis sairam com o redesenho. O cookie de posicao
    que elas usavam nao pode voltar a ser lido nem a chegar ao HTML."""

    @pytest.mark.parametrize('modulo', ['dots.js', 'dots-state.js'])
    def test_os_modulos_sairam(self, client, modulo):
        assert client.get(f'/static/js/{modulo}').status_code == 404

    def test_o_hub_nao_tem_bolinha(self, hub):
        assert 'data-bolinha' not in hub

    def test_cookie_antigo_e_ignorado(self, client):
        client.set_cookie('bolinhas', '80_-12|-30_40')
        hub = client.get('/').get_data(as_text=True)

        assert '--dx' not in hub
        assert not hasattr(appmod, 'posicoes_das_bolinhas')


class TestRemocoes:
    """O que foi retirado de proposito: rodape, link visual para a API e o
    controle de tema. Sem teste, qualquer um volta sem ninguem notar."""

    @pytest.mark.parametrize('rota', ROTAS)
    def test_nenhuma_pagina_tem_rodape(self, client, rota):
        assert '<footer' not in client.get(rota).get_data(as_text=True)

    @pytest.mark.parametrize('rota', ROTAS)
    def test_nenhuma_pagina_aponta_para_a_documentacao(self, client, rota):
        """A API e acessada por URL, nao por link na interface."""
        assert '/apidocs' not in client.get(rota).get_data(as_text=True)

    def test_a_documentacao_continua_de_pe(self, client):
        """Tirar o link nao e tirar a rota. O flasgger serve em /apidocs/ e
        redireciona de /apidocs, entao o teste segue o redirecionamento."""
        assert client.get('/apidocs', follow_redirects=True).status_code == 200
        assert '/api/imgtopdf' in client.get('/apispec_1.json').get_json()['paths']

    @pytest.mark.parametrize('rota', ROTAS)
    def test_nenhuma_pagina_tem_controle_de_tema(self, client, rota):
        pagina = client.get(rota).get_data(as_text=True)

        assert 'id="tema"' not in pagina
        assert 'data-tema' not in pagina

    @pytest.mark.parametrize('modulo', ['tema.js', 'tema-estado.js'])
    def test_os_modulos_de_tema_sairam(self, client, modulo):
        assert client.get(f'/static/js/{modulo}').status_code == 404

    def test_o_css_nao_tem_mais_tema_escuro(self, css_do_site):
        assert 'prefers-color-scheme: dark' not in css_do_site
        assert 'data-tema' not in css_do_site

    def test_o_hub_nao_tem_botao_de_voltar_ao_lugar(self, client):
        assert 'voltar-bolinhas' not in client.get('/').get_data(as_text=True)


class TestMarca:
    def test_a_marca_usa_o_token_da_tinta(self, css_do_site):
        """Cor em token, e nao solta na regra, para o teste de contraste
        alcancar."""
        assert re.search(r'\.marca\s*\{[^}]*color:\s*var\(--tinta\)', css_do_site)


class TestArrasteUnificado:
    """Quem arrasta usa o modulo compartilhado. A galeria usava drag-and-drop
    HTML5, que nao dispara em toque -- reordenar arrastando nao funcionava no
    celular."""

    MODULOS_QUE_ARRASTAM = ('gallery-ui.js',)

    def fonte(self, client, modulo):
        resposta = client.get(f'/static/js/{modulo}')
        assert resposta.status_code == 200, f'{modulo} nao e servido'
        return resposta.get_data(as_text=True)

    @pytest.mark.parametrize('modulo', ['drag.js', 'drag-state.js'])
    def test_os_modulos_de_arraste_sao_servidos(self, client, modulo):
        assert client.get(f'/static/js/{modulo}').status_code == 200

    @pytest.mark.parametrize('modulo', MODULOS_QUE_ARRASTAM)
    def test_usa_o_modulo_compartilhado(self, client, modulo):
        assert "from './drag.js'" in self.fonte(client, modulo)

    @pytest.mark.parametrize('modulo', MODULOS_QUE_ARRASTAM)
    def test_ninguem_registra_drag_and_drop_html5(self, client, modulo):
        """dragstart e dragover nao disparam em tela de toque. O unico uso
        legitimo e preventDefault no dragstart, para o navegador nao comecar o
        proprio arrasto de link ou imagem -- e isso mora no modulo
        compartilhado."""
        fonte = self.fonte(client, modulo)

        for evento in ('dragover', 'drop', 'dragend', 'dragstart'):
            assert f"'{evento}'" not in fonte, f'{modulo} ainda escuta {evento}'

    @pytest.mark.parametrize('modulo', MODULOS_QUE_ARRASTAM)
    def test_ninguem_repete_a_fiacao_de_ponteiro(self, client, modulo):
        """pointerdown e pointermove ficam num lugar so."""
        fonte = self.fonte(client, modulo)

        for evento in ('pointerdown', 'pointermove', 'pointercancel'):
            assert f"'{evento}'" not in fonte, f'{modulo} refaz a fiacao de {evento}'

    def test_a_galeria_espera_o_toque_ser_segurado(self, client):
        """Na galeria a pagina rola, entao deslizar o dedo num cartao e ambiguo
        entre reordenar e rolar. Segurar desfaz a ambiguidade sem tirar a
        rolagem."""
        assert 'esperaNoToqueMs' in self.fonte(client, 'gallery-ui.js')

class TestFavicon:
    """Sem favicon todo navegador pede /favicon.ico em toda visita e leva 404."""

    @pytest.mark.parametrize('rota', ROTAS)
    def test_toda_pagina_declara_o_icone(self, client, rota):
        pagina = client.get(rota).get_data(as_text=True)

        assert re.search(r'<link[^>]*rel="icon"[^>]*>', pagina), f'{rota} sem icone'

    def test_o_icone_e_servido(self, client):
        assert client.get('/static/favicon.svg').status_code == 200

    def test_o_icone_e_local(self, client):
        """Host externo quebraria a pagina autocontida e a CSP."""
        pagina = client.get('/').get_data(as_text=True)
        icone = re.search(r'<link[^>]*rel="icon"[^>]*href="([^"]+)"', pagina)

        assert icone, 'icone sem href'
        assert '//' not in icone.group(1)

    def test_o_icone_usa_a_paleta(self, client, css_do_site):
        """Cores fora dos tokens sairiam de sincronia com o site na primeira
        mudanca."""
        svg = client.get('/static/favicon.svg').get_data(as_text=True).lower()
        valores = tokens(css_do_site)

        assert valores['--vermelho'] in svg
        assert valores['--azul'] in svg
