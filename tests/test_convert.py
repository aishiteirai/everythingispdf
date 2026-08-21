"""Testes do endpoint de conversao.

Documentos passam por um dublê de `libreoffice` (ver tests/bin/libreoffice),
entao a suite roda sem LibreOffice instalado. O que se verifica aqui e o
contrato do app: status HTTP, corpo, e -- em todo caminho, inclusive os de
erro -- diretorio de trabalho vazio no fim.
"""

import pytest

PDF_MAGIC = b'%PDF-'


class TestImagem:
    def test_png_rgba_vira_pdf(self, client, upload, png):
        r = client.post('/api/convert', **upload(png, 'foto.png'))

        assert r.status_code == 200
        assert r.data[:5] == PDF_MAGIC
        assert r.mimetype == 'application/pdf'

    def test_nome_do_download_troca_a_extensao(self, client, upload, png):
        r = client.post('/api/convert', **upload(png, 'foto.png'))

        assert 'foto.pdf' in r.headers['Content-Disposition']

    def test_nao_deixa_resto(self, client, upload, png, restos):
        client.post('/api/convert', **upload(png, 'foto.png'))

        assert restos() == []

    def test_png_invalido_da_400(self, client, upload, restos):
        """Era 500. No caminho de imagem o Pillow e o unico executor, entao
        bytes que ele nao abre sao entrada invalida do cliente, nao falha do
        servidor. 500 continua para falha do LibreOffice, que e do servidor."""
        r = client.post('/api/convert', **upload(b'nao sou um png', 'falso.png'))

        assert r.status_code == 400
        assert r.is_json
        assert restos() == []


class TestDocumento:
    def test_docx_vira_pdf(self, client, upload):
        r = client.post('/api/convert', **upload(b'conteudo docx', 'relatorio.docx'))

        assert r.status_code == 200
        assert r.data[:5] == PDF_MAGIC

    def test_nome_com_espaco_e_sanitizado(self, client, upload):
        r = client.post('/api/convert', **upload(b'x', 'Relatorio Final.docx'))

        assert r.status_code == 200
        assert 'Relatorio_Final.pdf' in r.headers['Content-Disposition']

    @pytest.mark.parametrize('filename', [
        'a.doc', 'a.pptx', 'a.ppt', 'a.odt', 'a.odp', 'a.xlsx', 'a.xls',
    ])
    def test_formatos_de_documento_aceitos(self, client, upload, filename):
        r = client.post('/api/convert', **upload(b'x', filename))

        assert r.status_code == 200

    def test_nao_deixa_resto(self, client, upload, restos):
        client.post('/api/convert', **upload(b'x', 'relatorio.docx'))

        assert restos() == []


class TestFalhaDeConversao:
    """O cleanup antigo so existia no caminho de sucesso. Estes testes fixam
    a garantia de que o `finally` cobre os caminhos de erro."""

    def test_libreoffice_falhando_da_500(self, client, upload, lo_mode):
        lo_mode('fail')

        r = client.post('/api/convert', **upload(b'x', 'ruim.docx'))

        assert r.status_code == 500
        assert 'error' in r.get_json()

    def test_libreoffice_falhando_nao_vaza(self, client, upload, lo_mode, restos):
        lo_mode('fail')

        client.post('/api/convert', **upload(b'x', 'ruim.docx'))

        assert restos() == []

    def test_saida_sem_pdf_da_500(self, client, upload, lo_mode, restos):
        lo_mode('nopdf')

        r = client.post('/api/convert', **upload(b'x', 'vazio.docx'))

        assert r.status_code == 500
        assert restos() == []

    def test_timeout_da_504(self, client, upload, lo_mode):
        lo_mode('hang')

        r = client.post('/api/convert', **upload(b'x', 'travado.docx'))

        assert r.status_code == 504
        assert 'tempo limite' in r.get_json()['error']

    def test_timeout_nao_vaza(self, client, upload, lo_mode, restos):
        lo_mode('hang')

        client.post('/api/convert', **upload(b'x', 'travado.docx'))

        assert restos() == []

    def test_erro_nao_expoe_detalhe_interno(self, client, upload, lo_mode):
        lo_mode('fail')

        r = client.post('/api/convert', **upload(b'x', 'ruim.docx'))

        corpo = r.get_data(as_text=True)
        assert 'Traceback' not in corpo
        assert 'libreoffice' not in corpo.lower()


class TestValidacaoDeEntrada:
    def test_sem_campo_file_da_400(self, client):
        r = client.post('/api/convert', data={}, content_type='multipart/form-data')

        assert r.status_code == 400

    def test_nome_vazio_da_400(self, client, upload):
        r = client.post('/api/convert', **upload(b'x', ''))

        assert r.status_code == 400

    @pytest.mark.parametrize('filename', ['virus.exe', 'script.sh', 'sem_extensao'])
    def test_extensao_nao_permitida_da_415(self, client, upload, filename, restos):
        r = client.post('/api/convert', **upload(b'x', filename))

        assert r.status_code == 415
        assert restos() == []

    def test_extensao_e_case_insensitive(self, client, upload):
        r = client.post('/api/convert', **upload(b'x', 'RELATORIO.DOCX'))

        assert r.status_code == 200

    def test_acima_do_limite_da_413_em_json(self, client, upload, limite_pequeno):
        # O teto de producao e 32 MB; alocar isso por teste e desperdicio, e o
        # que importa aqui e o comportamento no estouro, nao o valor exato.
        grande = b'a' * (limite_pequeno + 1024)

        r = client.post('/api/convert', **upload(grande, 'grande.docx'))

        assert r.status_code == 413
        assert r.is_json
        assert 'MB' in r.get_json()['error']

    def test_path_traversal_no_nome_e_contido(self, client, upload, png, temp_folder):
        r = client.post('/api/convert', **upload(png, '../../etc/passwd.png'))

        assert r.status_code == 200
        assert 'passwd.pdf' in r.headers['Content-Disposition']
        assert '..' not in r.headers['Content-Disposition']


class TestRotasDeApoio:
    def test_pagina_de_conversao_responde(self, client):
        # O hub em / e coberto por test_pages.py.
        r = client.get('/convert')

        assert r.status_code == 200
        assert 'Conversor' in r.get_data(as_text=True)

    def test_health(self, client):
        r = client.get('/health')

        assert r.get_json() == {'status': 'ok'}

    def test_spec_do_swagger(self, client):
        r = client.get('/apispec_1.json')

        assert r.status_code == 200
        assert '/api/convert' in r.get_json()['paths']


class TestRateLimit:
    """Conversao sobe um LibreOffice por documento. Sem limite, poucos
    requests simultaneos derrubam o servidor."""

    def test_excesso_de_requests_da_429(self, client, upload, png, rate_limit):
        limite = int(rate_limit.split(' per ')[0])

        respostas = [
            client.post('/api/convert', **upload(png, 'foto.png')).status_code
            for _ in range(limite + 2)
        ]

        assert respostas[:limite] == [200] * limite
        assert respostas[limite:] == [429, 429]

    def test_429_responde_json(self, client, upload, png, rate_limit):
        limite = int(rate_limit.split(' per ')[0])
        for _ in range(limite):
            client.post('/api/convert', **upload(png, 'foto.png'))

        r = client.post('/api/convert', **upload(png, 'foto.png'))

        assert r.status_code == 429
        assert r.is_json
        assert 'error' in r.get_json()

    def test_429_nao_deixa_resto(self, client, upload, png, rate_limit, restos):
        limite = int(rate_limit.split(' per ')[0])
        for _ in range(limite + 2):
            client.post('/api/convert', **upload(png, 'foto.png'))

        assert restos() == []

    def test_rotas_de_apoio_nao_sao_limitadas(self, client, rate_limit):
        codigos = [client.get('/health').status_code for _ in range(30)]

        assert set(codigos) == {200}


class TestOrientacaoDaImagem:
    """Foto de celular chega deitada com a orientacao no EXIF. Ignorar isso faz
    o PDF sair virado."""

    @pytest.fixture
    def foto_deitada(self):
        """JPEG 200x100 com Orientation=6: deve ser exibido como 100x200."""
        import io

        from PIL import Image

        buf = io.BytesIO()
        exif = Image.Exif()
        exif[274] = 6
        Image.new('RGB', (200, 100), (30, 120, 90)).save(buf, 'JPEG', exif=exif)

        return buf.getvalue()

    def test_respeita_a_orientacao_do_exif(self, client, upload, foto_deitada, paginas):
        r = client.post('/api/convert', **upload(foto_deitada, 'foto.jpg'))

        assert r.status_code == 200
        largura, altura = paginas(r.data)[0]
        assert altura > largura, 'pagina saiu deitada: EXIF ignorado'

    def test_os_dois_endpoints_concordam_sobre_a_mesma_foto(
        self, client, upload, envio, opcoes, foto_deitada, paginas
    ):
        """Converter uma imagem sozinha e montar um PDF de uma imagem sao o
        mesmo trabalho. Resultados diferentes para o mesmo arquivo sao um bug,
        nao uma escolha."""
        um = client.post('/api/convert', **upload(foto_deitada, 'foto.jpg'))
        outro = client.post(
            '/api/imgtopdf', **envio([(foto_deitada, 'foto.jpg')], opcoes(1))
        )

        assert paginas(um.data) == paginas(outro.data)

    def test_imagem_gigante_e_recusada(self, client, upload, monkeypatch):
        """A guarda contra bomba de descompressao tem que valer nos dois
        endpoints, nao so no de imagens."""
        import io

        from PIL import Image

        monkeypatch.setattr(Image, 'MAX_IMAGE_PIXELS', 100)
        buf = io.BytesIO()
        Image.new('RGB', (200, 200)).save(buf, 'PNG')

        r = client.post('/api/convert', **upload(buf.getvalue(), 'grande.png'))

        assert r.status_code == 400
