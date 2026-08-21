"""Testes do que sustenta o servico fora do codigo Python.

Nao exercitam a aplicacao: leem os arquivos que definem a imagem e o
repositorio. Sao baratos e travam coisas que sumiriam sem ninguem notar.
"""

import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def arquivo(nome):
    with open(os.path.join(RAIZ, nome), encoding='utf-8') as aberto:
        return aberto.read()


def instrucoes(nome):
    """Linhas logicas do Dockerfile, com as continuacoes em `\\` juntadas --
    o mesmo que o Docker faz antes de interpretar."""
    conteudo = re.sub(r'\\\n\s*', ' ', arquivo(nome))

    return [linha.strip() for linha in conteudo.split('\n') if linha.strip()]


class TestDockerfile:
    def test_declara_healthcheck(self):
        """A rota /health existe e o CI usa. Sem HEALTHCHECK o orquestrador
        nao sabe dela, e contêiner travado segue marcado como saudavel."""
        assert 'HEALTHCHECK' in arquivo('Dockerfile')

    def test_o_healthcheck_usa_a_rota_de_saude(self):
        sonda = [l for l in instrucoes('Dockerfile') if l.startswith('HEALTHCHECK')]

        assert len(sonda) == 1, f'esperava um HEALTHCHECK, vi {len(sonda)}'
        assert '/health' in sonda[0]
        assert 'CMD' in sonda[0]

    def test_copia_todo_modulo_python_do_projeto(self):
        """O Dockerfile copiava so app.py e a imagem quebrava no import do
        modulo novo. Esta asercao pega o proximo modulo esquecido."""
        conteudo = arquivo('Dockerfile')
        modulos = {
            nome for nome in os.listdir(RAIZ)
            if nome.endswith('.py') and nome != 'setup.py'
        }

        faltando = sorted(nome for nome in modulos if nome not in conteudo)
        assert not faltando, f'modulos fora do COPY: {faltando}'


class TestLicenca:
    def test_existe(self):
        """Repositorio publico sem licenca ninguem pode usar legalmente -- e
        este distribui a fonte Inter sob OFL dentro dele."""
        assert os.path.exists(os.path.join(RAIZ, 'LICENSE'))

    def test_a_licenca_da_fonte_continua_ao_lado_dela(self):
        caminho = os.path.join(RAIZ, 'static', 'fonts', 'Inter-LICENSE.txt')

        assert os.path.exists(caminho)
        with open(caminho, encoding='utf-8') as aberto:
            assert 'SIL Open Font License' in aberto.read()
