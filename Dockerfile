# Usa uma imagem oficial do Python, versão leve (slim)
FROM python:3.10-slim

# Evita que o Python grave arquivos .pyc e força o log no terminal
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Instala o LibreOffice e limpa o cache para deixar o container mais leve
RUN apt-get update && \
    apt-get install -y libreoffice --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Define a pasta de trabalho dentro do container
WORKDIR /app

# Copia as dependências do DOCKER especificamente
COPY requirements-docker.txt .
RUN pip install --no-cache-dir -r requirements-docker.txt

# Copia o restante do seu código (app.py, app2.py, templates, etc)
COPY . .

# Expõe a porta 10000 (Padrão do Render)
EXPOSE 10000

# Inicia o servidor apontando para o app2.py
CMD ["gunicorn", "--bind", "0.0.0.0:10000", "--timeout", "120", "app2:app"]