from flask import Flask, request, send_file, jsonify, after_this_request, render_template
import os
import uuid
from werkzeug.utils import secure_filename
from PIL import Image
from flasgger import Swagger

# Importações para o Microsoft Office
from docx2pdf import convert as convert_docx
import comtypes.client
import pythoncom

app = Flask(__name__)
@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')
swagger = Swagger(app)

app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 

# Garante que os caminhos sejam absolutos (o MS Office exige caminhos absolutos)
TEMP_FOLDER = os.path.abspath(os.path.join(os.getcwd(), 'temp'))
os.makedirs(TEMP_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'docx', 'doc', 'pptx', 'ppt'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def convert_ppt_to_pdf(input_path, output_path):
    """Função dedicada para converter PowerPoint usando o COM do Windows"""
    pythoncom.CoInitialize() # Inicializa a thread do COM
    powerpoint = None
    presentation = None
    try:
        powerpoint = comtypes.client.CreateObject("Powerpoint.Application")
        # Abre o PPT invisível
        presentation = powerpoint.Presentations.Open(input_path, WithWindow=False)
        # 32 é o código interno da Microsoft para salvar como PDF (ppSaveAsPDF)
        presentation.SaveAs(output_path, 32)
    finally:
        if presentation:
            presentation.Close()
        if powerpoint:
            powerpoint.Quit()
        pythoncom.CoUninitialize() # Encerra a thread do COM

@app.route('/api/convert', methods=['POST'])
def convert_file():
    """
    Converte Imagens, Word e PowerPoint para PDF (Usando MS Office Nativo).
    ---
    consumes:
      - multipart/form-data
    parameters:
      - name: file
        in: formData
        type: file
        required: true
        description: O arquivo que será convertido.
    responses:
      200:
        description: Arquivo PDF gerado com sucesso.
      400:
        description: Erro no envio.
      500:
        description: Erro interno.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum arquivo enviado.'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nenhum arquivo selecionado.'}), 400

    if file and allowed_file(file.filename):
        extensao = file.filename.rsplit('.', 1)[1].lower()
        filename = secure_filename(file.filename)
        unique_id = str(uuid.uuid4())
        
        # O Office exige caminhos absolutos rigorosos no Windows
        input_path = os.path.abspath(os.path.join(TEMP_FOLDER, f"{unique_id}_{filename}"))
        output_path = os.path.abspath(os.path.join(TEMP_FOLDER, f"{unique_id}.pdf"))
        
        file.save(input_path)
        
        try:
            if extensao in {'png', 'jpg', 'jpeg'}:
                image = Image.open(input_path)
                if image.mode in ("RGBA", "P"):
                    image = image.convert("RGB")
                image.save(output_path, "PDF", resolution=100.0)
                
            elif extensao in {'docx', 'doc'}:
                pythoncom.CoInitialize()
                try:
                    convert_docx(input_path, output_path)
                finally:
                    pythoncom.CoUninitialize()
                    
            elif extensao in {'pptx', 'ppt'}:
                convert_ppt_to_pdf(input_path, output_path)
            
            @after_this_request
            def cleanup(response):
                try:
                    if os.path.exists(input_path):
                        os.remove(input_path)
                    if os.path.exists(output_path):
                        os.remove(output_path)
                except Exception as e:
                    print(f"Erro na limpeza: {e}")
                return response

            nome_download = f"{filename.rsplit('.', 1)[0]}.pdf"
            return send_file(output_path, as_attachment=True, download_name=nome_download)
            
        except Exception as e:
            print(f">>> ERRO GERAL: {str(e)}")
            return jsonify({'error': f'Erro durante a conversão: {str(e)}'}), 500
            
    return jsonify({'error': 'Formato não suportado.'}), 415

if __name__ == '__main__':
    # host='0.0.0.0' diz ao Flask para escutar requisições de qualquer IP da rede
    app.run(host='0.0.0.0', debug=True, port=5000)