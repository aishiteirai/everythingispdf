# Usa uma imagem oficial do Python, versao leve (slim)
FROM python:3.10-slim

# Evita que o Python grave arquivos .pyc e forca o log no terminal
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Instala o LibreOffice e limpa o cache para deixar o container mais leve
RUN apt-get update && \
    apt-get install -y libreoffice --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala as dependencias primeiro para aproveitar o cache de camadas
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py imgtopdf.py ./
COPY templates/ ./templates/
COPY static/ ./static/

# O app escreve em temp/ durante a conversao
RUN mkdir -p /app/temp && \
    useradd --create-home --shell /usr/sbin/nologin appuser && \
    chown -R appuser:appuser /app
USER appuser

# O Docker nao define HOME a partir do USER. Sem isso HOME vira "/", que
# appuser nao pode escrever, e o LibreOffice falha ao criar cache de fontes.
ENV HOME=/home/appuser

# Porta padrao do Render
EXPOSE 10000

# A imagem slim nao tem curl, entao a sonda usa o proprio Python. start-period
# cobre a subida do gunicorn; sem HEALTHCHECK o orquestrador nao sabe da rota
# /health e um container travado segue marcado como saudavel.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:10000/health', timeout=4)" 

# --timeout precisa ser maior que o CONVERSION_TIMEOUT do app (90s)
CMD ["gunicorn", "--bind", "0.0.0.0:10000", "--timeout", "120", "--workers", "2", "app:app"]
