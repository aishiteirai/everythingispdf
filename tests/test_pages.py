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

    def test_so_carrega_o_modulo_de_tema(self, hub):
        """O hub e so dois links mais o botao de tema: nenhum outro script."""
        fontes = re.findall(r'<script[^>]*src="([^"]+)"', hub)

        assert [f for f in fontes if not f.endswith('js/tema.js')] == []

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


# =============================================================
# Tokens de cor, contraste e fonte
# =============================================================

TEMAS = {
    '/': 'tema-neutro',
    '/convert': 'tema-convert',
    '/imgtopdf': 'tema-imgtopdf',
}

# (frente, fundo, razao minima). 4.5 para texto, 3.0 para componente grafico
# -- o que a WCAG 2.1 AA exige de cada um.
PARES_DE_CONTRASTE = [
    ('--texto', '--fundo', 4.5),
    ('--texto', '--superficie', 4.5),
    ('--texto-fraco', '--superficie', 4.5),
    ('--acento-contraste', '--acento', 4.5),
    ('--acento', '--superficie', 3.0),
    ('--erro', '--erro-fundo', 4.5),
    ('--sucesso', '--sucesso-fundo', 4.5),
]

MODOS = ('claro', 'escuro-sistema', 'escuro-manual')

MARCADOR_ESCURO = '@media (prefers-color-scheme: dark)'
MARCADOR_MANUAL = '[data-tema="escuro"]'


def _faixas_do_media_escuro(css):
    """(inicio, fim) de cada @media (prefers-color-scheme: dark), com as chaves
    balanceadas -- regex sozinha nao fecha bloco aninhado."""
    faixas = []

    inicio = css.find(MARCADOR_ESCURO)
    while inicio != -1:
        abertura = css.find('{', inicio)
        profundidade = 0
        for posicao in range(abertura, len(css)):
            if css[posicao] == '{':
                profundidade += 1
            elif css[posicao] == '}':
                profundidade -= 1
                if profundidade == 0:
                    faixas.append((abertura, posicao))
                    break
        inicio = css.find(MARCADOR_ESCURO, abertura)

    return faixas


def _blocos(css):
    """(no_media_escuro, seletores, corpo) de cada regra do CSS.

    O `[^{}]` das duas partes garante que o envelope do @media nao case como
    regra: o conteudo dele contem chaves. Sobram as regras de dentro, e a
    posicao diz se elas estao no bloco escuro.
    """
    faixas = _faixas_do_media_escuro(css)

    for casa in re.finditer(r'([^{}]+)\{([^{}]*)\}', css):
        dentro = any(inicio < casa.start() < fim for inicio, fim in faixas)
        yield dentro, casa.group(1), casa.group(2)


def _vale_para_o_tema(seletores, tema):
    """Bloco que nomeia algum .tema-* serve so ao tema que ele nomeia; bloco
    que nao nomeia nenhum e base e serve a todos."""
    if '.tema-' not in seletores:
        return True

    return f'.{tema}' in seletores


def tokens(css, tema, modo):
    """Tokens em vigor para um tema e um modo.

    Varre as regras na ordem do arquivo, que e a ordem da cascata: base
    primeiro, sobrescrita do modo depois. Um bloco no @media escuro só conta
    no modo automatico; um bloco com [data-tema="escuro"] só conta no modo
    manual.
    """
    valores = {}

    for dentro, seletores, corpo in _blocos(css):
        if dentro and modo != 'escuro-sistema':
            continue
        if MARCADOR_MANUAL in seletores and modo != 'escuro-manual':
            continue
        if not _vale_para_o_tema(seletores, tema):
            continue

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
    """Cor por função só serve se der para ler. Este teste calcula a razão de
    contraste dos tokens em vez de confiar na palavra de quem escolheu."""

    @pytest.mark.parametrize('tema', sorted(set(TEMAS.values())))
    @pytest.mark.parametrize('modo', MODOS)
    def test_todo_token_do_tema_existe(self, css_do_site, tema, modo):
        valores = tokens(css_do_site, tema, modo)
        necessarios = {nome for par in PARES_DE_CONTRASTE for nome in par[:2]}

        faltando = sorted(necessarios - valores.keys())
        assert not faltando, f'{tema}/{modo} sem os tokens {faltando}'

    @pytest.mark.parametrize('tema', sorted(set(TEMAS.values())))
    @pytest.mark.parametrize('modo', MODOS)
    def test_pares_passam_em_aa(self, css_do_site, tema, modo):
        valores = tokens(css_do_site, tema, modo)

        for frente, fundo, minimo in PARES_DE_CONTRASTE:
            razao = contraste(valores[frente], valores[fundo])
            assert razao >= minimo, (
                f'{tema}/{modo}: {frente} sobre {fundo} da {razao:.2f}:1, '
                f'precisa de {minimo}:1'
            )


class TestTemaPorPagina:
    @pytest.mark.parametrize('rota, tema', sorted(TEMAS.items()))
    def test_body_declara_o_tema_da_pagina(self, client, rota, tema):
        pagina = client.get(rota).get_data(as_text=True)
        corpo = re.search(r'<body([^>]*)>', pagina)

        assert corpo, f'{rota} sem <body>'
        assert tema in corpo.group(1), f'{rota} sem a classe {tema}'


class TestClassesQueOJavaScriptLiga:
    """Renomear uma classe que o JavaScript alterna quebra a interface inteira
    sem nenhum outro teste falhar: o CSS fica válido e o JS continua rodando,
    só não pinta nada."""

    MODULOS = (
        'main.js', 'interface.js', 'feedback.js',
        'imgtopdf.js', 'gallery-ui.js',
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


class TestModoManual:
    """O tema escuro manual precisa ser um escopo próprio no CSS. Sem ele os
    testes de contraste do modo manual passariam lendo as cores do claro, o
    que não prova nada."""

    @pytest.mark.parametrize('tema', sorted(set(TEMAS.values())))
    def test_o_escuro_manual_nao_e_o_claro(self, css_do_site, tema):
        assert tokens(css_do_site, tema, 'escuro-manual') != \
            tokens(css_do_site, tema, 'claro'), \
            f'{tema} sem bloco {MARCADOR_MANUAL} -- o modo manual cai no claro'

    @pytest.mark.parametrize('tema', sorted(set(TEMAS.values())))
    def test_os_dois_escuros_sao_identicos(self, css_do_site, tema):
        """O bloco escuro aparece duas vezes -- CSS puro não junta um @media
        com um seletor fora dele. Divergir os dois daria temas diferentes
        conforme o usuário escolheu na mão ou herdou do sistema."""
        automatico = tokens(css_do_site, tema, 'escuro-sistema')
        manual = tokens(css_do_site, tema, 'escuro-manual')

        divergentes = {
            nome: (automatico.get(nome), manual.get(nome))
            for nome in automatico.keys() | manual.keys()
            if automatico.get(nome) != manual.get(nome)
        }

        assert not divergentes, f'{tema}: escopos escuros divergem em {divergentes}'

    def test_o_claro_manual_vence_o_sistema_escuro(self, css_do_site):
        """Quem escolhe claro na mão não pode receber escuro porque o sistema
        está escuro, então o bloco do @media precisa se excluir nesse caso."""
        faixas = _faixas_do_media_escuro(css_do_site)
        assert faixas, 'nenhum bloco de @media escuro'

        for inicio, fim in faixas:
            trecho = css_do_site[inicio:fim]
            if '--' not in trecho:
                continue
            assert ':not([data-tema="claro"])' in trecho, \
                'bloco de tokens no @media escuro sem a exclusao do claro manual'


class TestPreferenciaDeTema:
    """A preferência vem de cookie e o Flask a renderiza no <html>. Aplicar por
    JavaScript depois do load exigiria script inline bloqueante no <head>, que
    o teste de CSP proíbe -- e sem ele a página pinta o tema errado e troca."""

    def atributo(self, client, rota='/', cookie=None):
        if cookie is not None:
            client.set_cookie('tema', cookie)

        pagina = client.get(rota).get_data(as_text=True)
        casa = re.search(r'<html[^>]*\sdata-tema="([^"]*)"', pagina)
        assert casa, f'{rota} sem data-tema no <html>'
        return casa.group(1)

    @pytest.mark.parametrize('rota', ROTAS)
    def test_sem_cookie_o_tema_e_automatico(self, client, rota):
        assert self.atributo(client, rota) == 'auto'

    @pytest.mark.parametrize('escolha', ['claro', 'escuro', 'auto'])
    def test_cookie_valido_vira_atributo(self, client, escolha):
        assert self.atributo(client, cookie=escolha) == escolha

    @pytest.mark.parametrize('lixo', [
        'roxo', '', 'ESCURO', 'escuro claro', '../etc/passwd',
    ])
    def test_cookie_invalido_cai_no_automatico(self, client, lixo):
        assert self.atributo(client, cookie=lixo) == 'auto'

    def test_cookie_hostil_nao_chega_ao_html(self, client):
        """O valor vai para dentro de um atributo HTML e vem do cliente."""
        hostil = '"><script>alert(1)</script>'
        client.set_cookie('tema', hostil)

        pagina = client.get('/').get_data(as_text=True)

        assert 'alert(1)' not in pagina
        assert '<script>alert' not in pagina
        assert 'data-tema="auto"' in pagina


class TestControleDeTema:
    @pytest.mark.parametrize('rota', ROTAS)
    def test_toda_pagina_tem_o_controle(self, client, rota):
        pagina = client.get(rota).get_data(as_text=True)

        assert 'id="tema"' in pagina, f'{rota} sem o botao de tema'

    @pytest.mark.parametrize('rota', ROTAS)
    def test_o_controle_tem_nome_acessivel(self, client, rota):
        """Botão de ícone sem rótulo é um botão mudo para leitor de tela."""
        pagina = client.get(rota).get_data(as_text=True)
        botao = re.search(r'<button[^>]*id="tema"[^>]*>', pagina)

        assert botao, f'{rota} sem <button id="tema">'
        assert 'aria-label' in botao.group(0)

    @pytest.mark.parametrize('rota', ROTAS)
    def test_toda_pagina_carrega_o_modulo_de_tema(self, client, rota):
        pagina = client.get(rota).get_data(as_text=True)

        assert re.search(r'<script type="module" src="[^"]*js/tema\.js"', pagina), \
            f'{rota} nao carrega tema.js'

    def test_o_modulo_e_servido(self, client):
        assert client.get('/static/js/tema.js').status_code == 200
