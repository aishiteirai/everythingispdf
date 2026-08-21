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


class TestInterfaceDoServidor:
    """O servidor de desenvolvimento escuta em loopback por padrao. Abrir para
    a rede e opcional e explicito: um servidor de desenvolvimento na LAN aceita
    upload de qualquer um no wifi."""

    def carrega(self, nome, **env):
        from test_proxy import carrega_app

        return carrega_app(nome, **env)

    def test_o_padrao_e_loopback(self):
        modulo = self.carrega('app_host_padrao')

        assert modulo.HOST == '127.0.0.1'

    def test_a_variavel_de_ambiente_abre_para_a_rede(self):
        """HOST=0.0.0.0 e o que permite testar no celular pela mesma rede."""
        modulo = self.carrega('app_host_aberto', HOST='0.0.0.0')

        assert modulo.HOST == '0.0.0.0'

    def test_o_run_usa_a_constante_e_nao_um_literal(self):
        """Se o app.run continuar com o endereco escrito na mao, a variavel
        nao serve para nada."""
        conteudo = arquivo('app.py')

        assert 'app.run(host=HOST' in conteudo
        assert "app.run(host='127.0.0.1'" not in conteudo
