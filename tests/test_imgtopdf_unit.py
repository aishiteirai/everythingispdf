"""Testes das funcoes puras de imgtopdf.py.

Sem Flask e sem HTTP: sao as funcoes de geometria, rotacao e validacao. E
onde a margem fica testavel de verdade, ja que ela nao muda o MediaBox --
so o tamanho da imagem colada dentro da pagina.
"""

import io

import pytest
from PIL import Image

import imgtopdf as mod


class TestTamanhoDePagina:
    def test_a4_a_150_dpi(self):
        assert mod.pagina_em_px('a4') == (1240, 1754)

    def test_letter_a_150_dpi(self):
        assert mod.pagina_em_px('letter') == (1275, 1650)

    def test_paisagem_troca_os_lados(self):
        assert mod.pagina_em_px('a4', paisagem=True) == (1754, 1240)

    def test_nome_desconhecido_e_erro(self):
        with pytest.raises(KeyError):
            mod.pagina_em_px('oficio')

    def test_milimetro_vira_pixel_no_dpi_da_pagina(self):
        # 25.4 mm = 1 polegada = DPI_PAGINA pixels.
        assert mod.mm_para_px(25.4) == mod.DPI_PAGINA


class TestRotacao:
    @pytest.fixture
    def retrato(self):
        return Image.new('RGB', (100, 200))

    @pytest.mark.parametrize('rotacao, esperado', [
        (0, (100, 200)),
        (90, (200, 100)),
        (180, (100, 200)),
        (270, (200, 100)),
    ])
    def test_dimensoes_apos_girar(self, retrato, rotacao, esperado):
        assert mod.aplica_rotacao(retrato, rotacao).size == esperado

    def test_zero_nao_copia_a_imagem(self, retrato):
        """Girar 0 grau nao deve custar uma copia da imagem."""
        assert mod.aplica_rotacao(retrato, 0) is retrato

    def test_90_e_no_sentido_horario(self):
        """O botao da UI gira no sentido horario, e o servidor tem que
        concordar com o preview. Numa imagem com o topo claro e a base
        escura, girar 90 horario leva o topo para a direita."""
        imagem = Image.new('RGB', (2, 2))
        imagem.putpixel((0, 0), (255, 255, 255))  # topo-esquerda
        imagem.putpixel((0, 1), (0, 0, 0))        # base-esquerda

        girada = mod.aplica_rotacao(imagem, 90)

        assert girada.getpixel((1, 0)) == (255, 255, 255)
        assert girada.getpixel((0, 0)) == (0, 0, 0)


class TestEncaixe:
    def test_preserva_a_proporcao(self):
        assert mod.encaixa((1000, 500), (400, 400)) == (400, 200)

    def test_nunca_passa_da_area(self):
        largura, altura = mod.encaixa((300, 1000), (400, 400))

        assert largura <= 400 and altura <= 400

    def test_amplia_imagem_pequena_para_preencher(self):
        """Escolha de produto: 'caber na pagina' inclui ampliar, senao uma
        foto pequena viraria um selo no meio de uma folha A4."""
        assert mod.encaixa((50, 100), (400, 400)) == (200, 400)

    def test_nunca_devolve_lado_zero(self):
        """Margem grande em area minuscula nao pode gerar imagem de lado 0:
        o Pillow recusa colar isso e a requisicao morreria com 500."""
        largura, altura = mod.encaixa((1000, 1), (2, 2))

        assert largura >= 1 and altura >= 1


class TestReducaoDoLadoMaximo:
    def test_reduz_quando_passa_do_limite(self):
        assert mod.reduz_lado_maximo((4400, 2200), 2200) == (2200, 1100)

    def test_nao_amplia_quando_cabe(self):
        assert mod.reduz_lado_maximo((800, 600), 2200) == (800, 600)

    def test_considera_o_lado_maior(self):
        assert mod.reduz_lado_maximo((100, 4400), 2200) == (50, 2200)


class TestValidacaoDeOpcoes:
    def test_opcoes_validas_normalizadas(self):
        opcoes = mod.valida_opcoes(
            '{"pages": [{"rotation": 90}], "size": "a4", "margin_mm": 10}',
            quantidade=1,
        )

        assert opcoes.rotacoes == [90]
        assert opcoes.tamanho == 'a4'
        assert opcoes.margem_mm == 10

    @pytest.mark.parametrize('bruto, quantidade', [
        (None, 1),
        ('', 1),
        ('nao sou json', 1),
        ('[]', 1),
        ('{"size": "a4"}', 1),
        ('{"pages": [{"rotation": 0}], "size": "oficio"}', 1),
        ('{"pages": [{"rotation": 45}], "size": "a4"}', 1),
        ('{"pages": [{"rotation": "90"}], "size": "a4"}', 1),
        ('{"pages": [{"rotation": 0}], "size": "a4", "margin_mm": 51}', 1),
        ('{"pages": [{"rotation": 0}], "size": "a4", "margin_mm": -1}', 1),
        ('{"pages": [{"rotation": 0}], "size": "a4", "margin_mm": "dez"}', 1),
        ('{"pages": [], "size": "a4"}', 0),
        ('{"pages": "tudo", "size": "a4"}', 1),
        ('{"pages": [0], "size": "a4"}', 1),
    ])
    def test_payload_invalido_e_recusado(self, bruto, quantidade):
        with pytest.raises(mod.OpcoesInvalidas):
            mod.valida_opcoes(bruto, quantidade=quantidade)

    def test_pages_desalinhado_de_files_e_recusado(self):
        """Comprimentos diferentes desalinham ordem e rotacao em silencio: o
        PDF sairia errado sem ninguem perceber."""
        with pytest.raises(mod.OpcoesInvalidas):
            mod.valida_opcoes(
                '{"pages": [{"rotation": 0}, {"rotation": 0}], "size": "a4"}',
                quantidade=1,
            )

    def test_margem_tem_default(self):
        opcoes = mod.valida_opcoes('{"pages": [{"rotation": 0}], "size": "image"}', 1)

        assert opcoes.margem_mm == 0


class TestMontagemDoPdf:
    def caminho(self, tmp_path):
        return str(tmp_path / 'saida.pdf')

    def test_uma_pagina_por_imagem_na_ordem_enviada(self, tmp_path, imagem, paginas):
        entradas = [
            io.BytesIO(imagem(100, 200)),
            io.BytesIO(imagem(300, 100)),
            io.BytesIO(imagem(50, 50)),
        ]
        opcoes = mod.Opcoes(tamanho='image', margem_mm=0, rotacoes=[0, 0, 0])
        destino = self.caminho(tmp_path)

        mod.monta_pdf(entradas, opcoes, destino)

        dados = open(destino, 'rb').read()
        assert dados[:5] == b'%PDF-'
        # 150 DPI: 1 px = 72/150 pt.
        assert paginas(dados) == [(48.0, 96.0), (144.0, 48.0), (24.0, 24.0)]

    def test_imagem_ilegivel_e_recusada(self, tmp_path):
        opcoes = mod.Opcoes(tamanho='image', margem_mm=0, rotacoes=[0])

        with pytest.raises(mod.ImagemInvalida):
            mod.monta_pdf([io.BytesIO(b'nao sou imagem')], opcoes, self.caminho(tmp_path))

    def test_pagina_a4_uniformiza_o_tamanho(self, tmp_path, imagem, paginas):
        entradas = [io.BytesIO(imagem(100, 200)), io.BytesIO(imagem(80, 80))]
        opcoes = mod.Opcoes(tamanho='a4', margem_mm=10, rotacoes=[0, 0])
        destino = self.caminho(tmp_path)

        mod.monta_pdf(entradas, opcoes, destino)

        caixas = paginas(open(destino, 'rb').read())
        assert caixas == [(595.2, 841.92), (595.2, 841.92)]

    def test_a4_vira_paisagem_quando_a_imagem_e_paisagem(self, tmp_path, imagem, paginas):
        opcoes = mod.Opcoes(tamanho='a4', margem_mm=0, rotacoes=[0])
        destino = self.caminho(tmp_path)

        mod.monta_pdf([io.BytesIO(imagem(400, 100))], opcoes, destino)

        assert paginas(open(destino, 'rb').read()) == [(841.92, 595.2)]

    def test_rotacao_muda_a_orientacao_da_pagina(self, tmp_path, imagem, paginas):
        """Prova que a rotacao acontece no servidor: mesma imagem retrato,
        girada 90, sai numa pagina paisagem."""
        opcoes = mod.Opcoes(tamanho='image', margem_mm=0, rotacoes=[90])
        destino = self.caminho(tmp_path)

        mod.monta_pdf([io.BytesIO(imagem(100, 200))], opcoes, destino)

        assert paginas(open(destino, 'rb').read()) == [(96.0, 48.0)]

    def test_rotacao_soma_em_cima_do_exif(self, tmp_path, imagem, paginas):
        """Foto de celular chega deitada com Orientation=6. O exif_transpose
        corrige antes, e a rotacao do usuario soma em cima -- senao o preview
        e o PDF discordam."""
        from PIL import Image as PilImage

        buf = io.BytesIO()
        exif = PilImage.Exif()
        exif[274] = 6  # Orientation: girar 90 horario para exibir
        PilImage.new('RGB', (200, 100)).save(buf, 'JPEG', exif=exif)

        opcoes = mod.Opcoes(tamanho='image', margem_mm=0, rotacoes=[0])
        destino = self.caminho(tmp_path)
        mod.monta_pdf([io.BytesIO(buf.getvalue())], opcoes, destino)

        # 200x100 deitada + Orientation=6 = 100x200 em pe.
        assert paginas(open(destino, 'rb').read()) == [(48.0, 96.0)]

    def test_alfa_e_achatado(self, tmp_path, imagem, paginas):
        """PDF nao tem canal alfa: RGBA precisa virar RGB ou o save falha."""
        opcoes = mod.Opcoes(tamanho='image', margem_mm=0, rotacoes=[0])
        destino = self.caminho(tmp_path)

        mod.monta_pdf(
            [io.BytesIO(imagem(60, 60, modo='RGBA', cor=(255, 0, 0, 128)))],
            opcoes,
            destino,
        )

        assert paginas(open(destino, 'rb').read()) == [(28.8, 28.8)]

    def test_imagem_gigante_e_recusada(self, tmp_path, imagem, monkeypatch):
        """Guarda contra bomba de descompressao: um PNG pequeno pode declarar
        dimensoes enormes e estourar a memoria do worker."""
        monkeypatch.setattr(mod.Image, 'MAX_IMAGE_PIXELS', 100)
        opcoes = mod.Opcoes(tamanho='image', margem_mm=0, rotacoes=[0])

        with pytest.raises(mod.ImagemInvalida):
            mod.monta_pdf([io.BytesIO(imagem(200, 200))], opcoes, self.caminho(tmp_path))


class TestLimiteDePaginas:
    """A API anuncia 20 imagens. Nenhum teste chegava perto disso: o maior
    montava 3, e o smoke do CI monta 2. Foi por ai que passou um defeito que
    so aparece a partir da quinta pagina."""

    def caminho(self, tmp_path):
        return str(tmp_path / 'saida.pdf')

    @pytest.mark.parametrize('quantidade', [4, 5, 10, mod.MAX_IMAGENS])
    def test_monta_o_maximo_de_paginas_anunciado(
        self, tmp_path, imagem, paginas, quantidade
    ):
        entradas = [io.BytesIO(imagem(120, 90)) for _ in range(quantidade)]
        opcoes = mod.Opcoes(tamanho='image', margem_mm=0, rotacoes=[0] * quantidade)
        destino = self.caminho(tmp_path)

        mod.monta_pdf(entradas, opcoes, destino)

        assert len(paginas(open(destino, 'rb').read())) == quantidade

    def test_a_ordem_se_mantem_em_muitas_paginas(self, tmp_path, imagem, paginas):
        """Ordem com 3 paginas nao prova ordem com 20: um merge que embaralhe
        no meio passaria no teste pequeno."""
        larguras = [100 + 10 * indice for indice in range(mod.MAX_IMAGENS)]
        entradas = [io.BytesIO(imagem(largura, 100)) for largura in larguras]
        opcoes = mod.Opcoes(
            tamanho='image', margem_mm=0, rotacoes=[0] * mod.MAX_IMAGENS
        )
        destino = self.caminho(tmp_path)

        mod.monta_pdf(entradas, opcoes, destino)

        # 150 DPI: 1 px = 72/150 pt.
        esperado = [(round(largura * 72 / 150, 2), 48.0) for largura in larguras]
        assert paginas(open(destino, 'rb').read()) == esperado

    def test_rotacao_por_pagina_em_muitas_paginas(self, tmp_path, imagem, paginas):
        rotacoes = [0, 90] * (mod.MAX_IMAGENS // 2)
        entradas = [io.BytesIO(imagem(100, 200)) for _ in rotacoes]
        opcoes = mod.Opcoes(tamanho='image', margem_mm=0, rotacoes=rotacoes)
        destino = self.caminho(tmp_path)

        mod.monta_pdf(entradas, opcoes, destino)

        caixas = paginas(open(destino, 'rb').read())
        esperado = [(48.0, 96.0) if giro == 0 else (96.0, 48.0) for giro in rotacoes]
        assert caixas == esperado

    def test_muitos_pdfs_seguidos_no_mesmo_processo(self, tmp_path, imagem, paginas):
        """Um worker do gunicorn atende milhares de requisicoes sem reiniciar.
        Estado que sobrevive entre montagens nao pode fazer a decima falhar."""
        opcoes = mod.Opcoes(tamanho='image', margem_mm=0, rotacoes=[0] * 6)

        for rodada in range(10):
            destino = str(tmp_path / f'rodada{rodada}.pdf')
            entradas = [io.BytesIO(imagem(120, 90)) for _ in range(6)]

            mod.monta_pdf(entradas, opcoes, destino)

            assert len(paginas(open(destino, 'rb').read())) == 6, f'rodada {rodada}'
