"""Testes do endpoint que monta um PDF a partir de varias imagens.

Nao ha LibreOffice neste caminho: quem transforma e o Pillow. O que se
verifica aqui e o contrato -- status, corpo, cabecalho -- e, em todo caminho,
diretorio de trabalho vazio no fim.

As dimensoes das paginas saem do /MediaBox, que fica em texto claro nos bytes
do PDF (ver a fixture `paginas`). Com `size: "image"` a pagina herda o tamanho
da imagem, entao imagens de tamanhos distintos tornam ordem e rotacao
verificaveis sem biblioteca de PDF.
"""

import io

import pytest

ROTA = '/api/imgtopdf'
PDF_MAGIC = b'%PDF-'

# 150 DPI: 1 px = 72/150 pt. A4 = 1240x1754 px.
A4_RETRATO = (595.2, 841.92)
A4_PAISAGEM = (841.92, 595.2)
LETTER_RETRATO = (612.0, 792.0)


class TestMontagem:
    def test_tres_imagens_viram_um_pdf_de_tres_paginas(
        self, client, envio, opcoes, imagem, paginas
    ):
        arquivos = [(imagem(100, 100), f'foto{n}.png') for n in range(3)]

        r = client.post(ROTA, **envio(arquivos, opcoes(quantidade=3)))

        assert r.status_code == 200
        assert r.data[:5] == PDF_MAGIC
        assert r.mimetype == 'application/pdf'
        assert len(paginas(r.data)) == 3

    def test_a_ordem_do_envio_e_a_ordem_das_paginas(
        self, client, envio, opcoes, imagem, paginas
    ):
        arquivos = [
            (imagem(100, 200), 'a.png'),
            (imagem(300, 100), 'b.png'),
            (imagem(50, 50), 'c.png'),
        ]

        r = client.post(ROTA, **envio(arquivos, opcoes(quantidade=3)))

        assert paginas(r.data) == [(48.0, 96.0), (144.0, 48.0), (24.0, 24.0)]

    def test_uma_imagem_so_tambem_vale(self, client, envio, opcoes, imagem, paginas):
        r = client.post(ROTA, **envio([(imagem(100, 100), 'a.png')], opcoes(1)))

        assert r.status_code == 200
        assert len(paginas(r.data)) == 1

    def test_nome_do_download_e_fixo(self, client, envio, opcoes, imagem):
        """N arquivos de entrada nao tem um nome de saida obvio."""
        r = client.post(ROTA, **envio([(imagem(50, 50), 'ferias.png')], opcoes(1)))

        assert 'imagens.pdf' in r.headers['Content-Disposition']

    def test_nome_com_path_traversal_nao_escapa(self, client, envio, opcoes, imagem):
        """O nome enviado nunca toca o disco -- so a extensao e lida."""
        r = client.post(
            ROTA, **envio([(imagem(50, 50), '../../etc/passwd.png')], opcoes(1))
        )

        assert r.status_code == 200
        assert '..' not in r.headers['Content-Disposition']

    def test_extensao_e_case_insensitive(self, client, envio, opcoes, imagem):
        r = client.post(ROTA, **envio([(imagem(50, 50), 'FOTO.PNG')], opcoes(1)))

        assert r.status_code == 200

    def test_nao_deixa_resto(self, client, envio, opcoes, imagem, restos):
        client.post(ROTA, **envio([(imagem(50, 50), 'a.png')], opcoes(1)))

        assert restos() == []


class TestRotacao:
    @pytest.mark.parametrize('rotacao, esperado', [
        (0, (48.0, 96.0)),
        (90, (96.0, 48.0)),
        (180, (48.0, 96.0)),
        (270, (96.0, 48.0)),
    ])
    def test_gira_no_servidor(
        self, client, envio, opcoes, imagem, paginas, rotacao, esperado
    ):
        """Prova que a rotacao acontece no servidor: o cliente manda o
        original e um numero, e a pagina sai na orientacao pedida."""
        r = client.post(
            ROTA,
            **envio([(imagem(100, 200), 'a.png')], opcoes(1, rotations=[rotacao])),
        )

        assert paginas(r.data) == [esperado]

    def test_rotacao_e_por_pagina(self, client, envio, opcoes, imagem, paginas):
        arquivos = [(imagem(100, 200), 'a.png'), (imagem(100, 200), 'b.png')]

        r = client.post(ROTA, **envio(arquivos, opcoes(2, rotations=[0, 90])))

        assert paginas(r.data) == [(48.0, 96.0), (96.0, 48.0)]

    def test_soma_em_cima_da_orientacao_do_exif(
        self, client, envio, opcoes, paginas
    ):
        """Foto de celular chega deitada com Orientation=6. Corrigido o EXIF,
        200x100 vira 100x200; girar 90 devolve para paisagem."""
        from PIL import Image

        buf = io.BytesIO()
        exif = Image.Exif()
        exif[274] = 6
        Image.new('RGB', (200, 100)).save(buf, 'JPEG', exif=exif)
        foto = buf.getvalue()

        sem_giro = client.post(ROTA, **envio([(foto, 'f.jpg')], opcoes(1)))
        com_giro = client.post(
            ROTA, **envio([(foto, 'f.jpg')], opcoes(1, rotations=[90]))
        )

        assert paginas(sem_giro.data) == [(48.0, 96.0)]
        assert paginas(com_giro.data) == [(96.0, 48.0)]


class TestTamanhoDaPagina:
    def test_a4_uniformiza_paginas_de_imagens_diferentes(
        self, client, envio, opcoes, imagem, paginas
    ):
        arquivos = [(imagem(100, 200), 'a.png'), (imagem(80, 90), 'b.png')]

        r = client.post(ROTA, **envio(arquivos, opcoes(2, size='a4')))

        assert paginas(r.data) == [A4_RETRATO, A4_RETRATO]

    def test_a4_usa_paisagem_para_imagem_deitada(
        self, client, envio, opcoes, imagem, paginas
    ):
        r = client.post(
            ROTA, **envio([(imagem(400, 100), 'a.png')], opcoes(1, size='a4'))
        )

        assert paginas(r.data) == [A4_PAISAGEM]

    def test_letter(self, client, envio, opcoes, imagem, paginas):
        r = client.post(
            ROTA, **envio([(imagem(100, 200), 'a.png')], opcoes(1, size='letter'))
        )

        assert paginas(r.data) == [LETTER_RETRATO]

    def test_margem_nao_muda_o_tamanho_da_pagina(
        self, client, envio, opcoes, imagem, paginas
    ):
        """A margem encolhe a imagem colada, nao a folha."""
        r = client.post(
            ROTA,
            **envio([(imagem(100, 200), 'a.png')], opcoes(1, size='a4', margin_mm=50)),
        )

        assert paginas(r.data) == [A4_RETRATO]

    def test_modo_imagem_ignora_a_margem(
        self, client, envio, opcoes, imagem, paginas
    ):
        r = client.post(
            ROTA,
            **envio([(imagem(100, 200), 'a.png')], opcoes(1, size='image', margin_mm=50)),
        )

        assert paginas(r.data) == [(48.0, 96.0)]


class TestValidacaoDeEntrada:
    def test_sem_campo_files_da_400(self, client, opcoes):
        r = client.post(
            ROTA,
            data={'options': opcoes(1)},
            content_type='multipart/form-data',
        )

        assert r.status_code == 400
        assert r.is_json

    def test_acima_do_teto_de_imagens_da_400(self, client, envio, opcoes, imagem):
        import imgtopdf

        arquivos = [
            (imagem(20, 20), f'{n}.png') for n in range(imgtopdf.MAX_IMAGENS + 1)
        ]

        r = client.post(ROTA, **envio(arquivos, opcoes(imgtopdf.MAX_IMAGENS + 1)))

        assert r.status_code == 400

    @pytest.mark.parametrize('options', [
        None,
        '',
        'nao sou json',
        '[]',
        '{"size": "a4"}',
        '{"pages": [{"rotation": 0}], "size": "oficio"}',
        '{"pages": [{"rotation": 45}], "size": "a4"}',
        '{"pages": [{"rotation": "90"}], "size": "a4"}',
        '{"pages": [{"rotation": 0}], "size": "a4", "margin_mm": 51}',
        '{"pages": [{"rotation": 0}], "size": "a4", "margin_mm": -1}',
        '{"pages": [{"rotation": 0}, {"rotation": 0}], "size": "a4"}',
        '{"pages": [], "size": "a4"}',
    ])
    def test_options_invalido_da_400(self, client, envio, imagem, options, restos):
        r = client.post(ROTA, **envio([(imagem(20, 20), 'a.png')], options))

        assert r.status_code == 400
        assert r.is_json
        assert restos() == []

    @pytest.mark.parametrize('filename', ['doc.docx', 'virus.exe', 'sem_extensao'])
    def test_extensao_que_nao_e_imagem_da_415(
        self, client, envio, opcoes, imagem, filename, restos
    ):
        """O endpoint e de imagens: documento aqui e formato nao suportado,
        nao payload malformado."""
        r = client.post(ROTA, **envio([(imagem(20, 20), filename)], opcoes(1)))

        assert r.status_code == 415
        assert restos() == []

    def test_imagem_ilegivel_da_400(self, client, envio, opcoes, restos):
        """Aqui o Pillow e o unico executor, entao bytes que ele nao abre sao
        entrada invalida do cliente -- diferente do /api/convert, onde a falha
        pode ser do LibreOffice e o status e 500."""
        r = client.post(ROTA, **envio([(b'nao sou png', 'a.png')], opcoes(1)))

        assert r.status_code == 400
        assert restos() == []

    def test_arquivo_vazio_da_400(self, client, envio, opcoes, restos):
        r = client.post(ROTA, **envio([(b'', 'a.png')], opcoes(1)))

        assert r.status_code == 400
        assert restos() == []

    def test_imagem_gigante_da_400(self, client, envio, opcoes, imagem, monkeypatch):
        """Bomba de descompressao: recusa pelo cabecalho, sem decodificar."""
        from PIL import Image

        monkeypatch.setattr(Image, 'MAX_IMAGE_PIXELS', 100)

        r = client.post(ROTA, **envio([(imagem(200, 200), 'a.png')], opcoes(1)))

        assert r.status_code == 400

    def test_acima_do_limite_de_tamanho_da_413(
        self, client, envio, opcoes, limite_pequeno
    ):
        grande = b'a' * (limite_pequeno + 1024)

        r = client.post(ROTA, **envio([(grande, 'a.png')], opcoes(1)))

        assert r.status_code == 413
        assert r.is_json
        assert 'MB' in r.get_json()['error']


class TestRateLimit:
    def test_excesso_de_requests_da_429(
        self, client, envio, opcoes, imagem, rate_limit
    ):
        limite = int(rate_limit.split(' per ')[0])
        arquivo = [(imagem(20, 20), 'a.png')]

        respostas = [
            client.post(ROTA, **envio(arquivo, opcoes(1))).status_code
            for _ in range(limite + 1)
        ]

        assert respostas[:limite] == [200] * limite
        assert respostas[limite] == 429


class TestDocumentacao:
    def test_a_rota_esta_no_swagger(self, client):
        r = client.get('/apispec_1.json')

        assert ROTA in r.get_json()['paths']
