"""Monta um PDF unico a partir de varias imagens, com ordem e rotacao.

O cliente manda os arquivos originais na ordem das paginas e, num JSON
separado, a rotacao de cada uma. Quem transforma e o Pillow, aqui: reencodar
no navegador perderia qualidade e faria o PDF depender do `toBlob` de cada
navegador.

As funcoes deste modulo nao conhecem Flask nem HTTP -- geometria, rotacao e
validacao ficam testaveis sem subir a aplicacao.
"""

import io
import json
from dataclasses import dataclass

from PIL import Image, ImageOps
from pypdf import PdfWriter

# Densidade de composicao e do PDF. Define o tamanho em pixels das paginas de
# tamanho fixo e, por consequencia, o MediaBox: px / DPI * 72 pontos.
DPI_PAGINA = 150

# Teto do lado maior no modo "image", onde a pagina herda o tamanho da imagem.
# Sem isso uma foto de 50 MP viraria uma pagina gigante.
LADO_MAXIMO_PX = 2200

MAX_IMAGENS = 20
MARGEM_MAX_MM = 50

# Guarda contra bomba de descompressao: um arquivo de poucos KB pode declarar
# dimensoes enormes e estourar a memoria ao decodificar. Mais estrito que o
# default do Pillow (~89 MP).
MAX_PIXELS = 64_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

TAMANHOS_MM = {
    'a4': (210, 297),
    'letter': (215.9, 279.4),
}

# "image" nao tem medida fixa: a pagina herda o tamanho da imagem.
TAMANHOS = ('image', *TAMANHOS_MM)

ROTACOES_VALIDAS = (0, 90, 180, 270)

# Rotacao por transpose, nao por rotate: multiplo de 90 nao precisa de
# reamostragem, entao a imagem sai exata e sem calculo de expansao. O Pillow
# gira no sentido anti-horario, e a UI gira no horario -- por isso 90 horario
# e ROTATE_270.
_TRANSPOSICOES = {
    90: Image.Transpose.ROTATE_270,
    180: Image.Transpose.ROTATE_180,
    270: Image.Transpose.ROTATE_90,
}

# PDF nao tem canal alfa. Mesma lista que a conversao de imagem unica usa.
_MODOS_A_CONVERTER = ('RGBA', 'P', 'LA')


class OpcoesInvalidas(ValueError):
    """Payload de opcoes malformado. Vira 400."""


class ImagemInvalida(ValueError):
    """Bytes que o Pillow nao abre, ou imagem acima do teto de pixels."""


@dataclass(frozen=True)
class Opcoes:
    tamanho: str
    margem_mm: int
    rotacoes: list


def mm_para_px(mm, dpi=DPI_PAGINA):
    return round(mm / 25.4 * dpi)


def pagina_em_px(nome, paisagem=False, dpi=DPI_PAGINA):
    """Tamanho da pagina em pixels. Levanta KeyError para nome desconhecido."""
    largura_mm, altura_mm = TAMANHOS_MM[nome]
    largura = mm_para_px(largura_mm, dpi)
    altura = mm_para_px(altura_mm, dpi)

    return (altura, largura) if paisagem else (largura, altura)


def aplica_rotacao(imagem, rotacao):
    transposicao = _TRANSPOSICOES.get(rotacao)
    if transposicao is None:
        return imagem

    return imagem.transpose(transposicao)


def encaixa(origem, area):
    """Maior tamanho com a proporcao de `origem` que cabe em `area`.

    Amplia imagem pequena de proposito: "caber na pagina" inclui crescer,
    senao uma foto pequena viraria um selo no meio de uma folha A4. O piso de
    1 px existe porque o Pillow recusa colar imagem de lado zero.
    """
    origem_largura, origem_altura = origem
    area_largura, area_altura = area

    escala = min(area_largura / origem_largura, area_altura / origem_altura)

    return (
        min(area_largura, max(1, round(origem_largura * escala))),
        min(area_altura, max(1, round(origem_altura * escala))),
    )


def reduz_lado_maximo(tamanho, limite):
    """Reduz proporcionalmente ate o lado maior caber no limite. Nunca amplia."""
    largura, altura = tamanho
    maior = max(largura, altura)
    if maior <= limite:
        return (largura, altura)

    escala = limite / maior

    return (max(1, round(largura * escala)), max(1, round(altura * escala)))


def valida_opcoes(bruto, quantidade):
    """Valida o campo `options` contra a quantidade de arquivos enviados.

    Devolve `Opcoes`. Levanta `OpcoesInvalidas` com mensagem pronta para o
    usuario em qualquer desvio.
    """
    if not 1 <= quantidade <= MAX_IMAGENS:
        raise OpcoesInvalidas(
            f'Envie de 1 a {MAX_IMAGENS} imagens.'
        )

    if not bruto:
        raise OpcoesInvalidas('Campo options ausente.')

    try:
        dados = json.loads(bruto)
    except (TypeError, ValueError) as erro:
        raise OpcoesInvalidas('Campo options nao e um JSON valido.') from erro

    if not isinstance(dados, dict):
        raise OpcoesInvalidas('Campo options precisa ser um objeto JSON.')

    paginas = dados.get('pages')
    if not isinstance(paginas, list):
        raise OpcoesInvalidas('Campo pages precisa ser uma lista.')

    # Comprimentos diferentes desalinham ordem e rotacao em silencio: o PDF
    # sairia errado sem ninguem perceber.
    if len(paginas) != quantidade:
        raise OpcoesInvalidas(
            f'pages tem {len(paginas)} itens para {quantidade} imagens.'
        )

    rotacoes = []
    for pagina in paginas:
        if not isinstance(pagina, dict):
            raise OpcoesInvalidas('Cada item de pages precisa ser um objeto.')

        rotacao = pagina.get('rotation', 0)
        if type(rotacao) is not int or rotacao not in ROTACOES_VALIDAS:
            raise OpcoesInvalidas(
                'rotation precisa ser 0, 90, 180 ou 270.'
            )
        rotacoes.append(rotacao)

    tamanho = dados.get('size')
    if tamanho not in TAMANHOS:
        raise OpcoesInvalidas(f"size precisa ser um de {', '.join(TAMANHOS)}.")

    margem_mm = dados.get('margin_mm', 0)
    if type(margem_mm) is not int or not 0 <= margem_mm <= MARGEM_MAX_MM:
        raise OpcoesInvalidas(
            f'margin_mm precisa ser um inteiro de 0 a {MARGEM_MAX_MM}.'
        )

    return Opcoes(tamanho=tamanho, margem_mm=margem_mm, rotacoes=rotacoes)


def _para_rgb(imagem):
    if imagem.mode in _MODOS_A_CONVERTER:
        convertida = imagem.convert('RGB')
        imagem.close()
        return convertida

    return imagem


def _redimensiona(imagem, tamanho):
    if tamanho == imagem.size:
        return imagem

    redimensionada = imagem.resize(tamanho, Image.LANCZOS)
    imagem.close()
    return redimensionada


def _monta_pagina(entrada, rotacao, opcoes):
    """Le uma imagem e devolve a pagina pronta para virar PDF."""
    try:
        with Image.open(entrada) as original:
            # O tamanho vem do cabecalho, antes de decodificar: da para
            # recusar a bomba sem gastar a memoria que ela pede.
            largura, altura = original.size
            limite = Image.MAX_IMAGE_PIXELS
            if limite is not None and largura * altura > limite:
                raise ImagemInvalida(
                    f'Imagem de {largura}x{altura} acima do limite de pixels.'
                )

            # Foto de celular chega deitada com a orientacao no EXIF. Corrige
            # antes para a rotacao do usuario somar em cima -- senao o preview
            # e o PDF discordam.
            imagem = ImageOps.exif_transpose(original)
    except ImagemInvalida:
        raise
    except Exception as erro:
        raise ImagemInvalida('Nao foi possivel ler a imagem.') from erro

    imagem = aplica_rotacao(imagem, rotacao)

    if opcoes.tamanho == 'image':
        imagem = _redimensiona(imagem, reduz_lado_maximo(imagem.size, LADO_MAXIMO_PX))
        return _para_rgb(imagem)

    pagina_largura, pagina_altura = pagina_em_px(
        opcoes.tamanho, paisagem=imagem.width > imagem.height
    )
    margem = mm_para_px(opcoes.margem_mm)
    area = (
        max(1, pagina_largura - 2 * margem),
        max(1, pagina_altura - 2 * margem),
    )

    imagem = _para_rgb(_redimensiona(imagem, encaixa(imagem.size, area)))

    folha = Image.new('RGB', (pagina_largura, pagina_altura), (255, 255, 255))
    folha.paste(
        imagem,
        ((pagina_largura - imagem.width) // 2, (pagina_altura - imagem.height) // 2),
    )
    imagem.close()

    return folha


def monta_pdf(entradas, opcoes, caminho_saida):
    """Grava o PDF com uma pagina por entrada, na ordem recebida.

    Cada imagem vira um PDF de uma pagina em memoria e e liberada antes de
    abrir a proxima, entao o pico nao guarda mais de uma imagem decodificada.
    O que acumula sao bytes de PDF ja comprimidos, ordens de grandeza menores.

    Duas alternativas foram descartadas:

    `save(append_images=[...])` manteria todas as imagens transformadas em
    memoria ao mesmo tempo -- o PdfImagePlugin materializa a lista antes de
    escrever, entao nem generator ajuda -- e 20 paginas em tamanho original
    passariam de 500 MB.

    `save(append=True)`, que era a implementacao anterior, relia o PDF inteiro
    a cada pagina (custo quadratico na contagem) e batia num defeito do
    PdfParser do Pillow: `processed_offsets` e um argumento mutavel com default
    de lista, entao os offsets de cada releitura se acumulam e a quinta pagina
    dispara um falso "trailer loop found". A cadeia de /Prev do arquivo estava
    correta -- o laco era do parser, nao do PDF.
    """
    escritor = PdfWriter()

    # Os buffers ficam vivos ate a escrita: nao dependemos de o pypdf ter
    # copiado tudo no append.
    paginas = []

    try:
        for indice, entrada in enumerate(entradas):
            imagem = _monta_pagina(entrada, opcoes.rotacoes[indice], opcoes)
            buffer = io.BytesIO()
            try:
                imagem.save(buffer, 'PDF', resolution=float(DPI_PAGINA))
            finally:
                imagem.close()

            buffer.seek(0)
            paginas.append(buffer)
            escritor.append(buffer)

        with open(caminho_saida, 'wb') as saida:
            escritor.write(saida)
    finally:
        escritor.close()
        for buffer in paginas:
            buffer.close()
