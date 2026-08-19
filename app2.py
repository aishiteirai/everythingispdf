from flask import Flask, request, send_file, jsonify, after_this_request, render_template
import os
import uuid
import subprocess
from werkzeug.utils import secure_filename
from PIL import Image
from flasgger import Swagger

app = Flask(__name__)
swagger = Swagger(app)

app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 

TEMP_FOLDER = os.path.join(os.getcwd(), 'temp')
os.makedirs(TEMP_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'docx', 'doc', 'pptx', 'ppt'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def convert_with_libreoffice(input_path, output_dir):
    """Chama o LibreOffice no Linux para converter o arquivo"""
    args = [
        'libreoffice',
        '--headless',
        '--convert-to', 'pdf',
        '--outdir', output_dir,
        input_path
    ]
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/api/convert', methods=['POST'])
def convert_file():
    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum arquivo enviado.'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nenhum arquivo selecionado.'}), 400

    if file and allowed_file(file.filename):
        extensao = file.filename.rsplit('.', 1)[1].lower()
        filename = secure_filename(file.filename)
        unique_id = str(uuid.uuid4())
        
        input_path = os.path.join(TEMP_FOLDER, f"{unique_id}_{filename}")
        
        nome_base = f"{unique_id}_{filename.rsplit('.', 1)[0]}"
        output_path = os.path.join(TEMP_FOLDER, f"{nome_base}.pdf")
        
        file.save(input_path)
        
        try:
            if extensao in {'png', 'jpg', 'jpeg'}:
                image = Image.open(input_path)
                if image.mode in ("RGBA", "P"):
                    image = image.convert("RGB")
                
                output_path = os.path.join(TEMP_FOLDER, f"{unique_id}.pdf")
                image.save(output_path, "PDF", resolution=100.0)
                
            elif extensao in {'docx', 'doc', 'pptx', 'ppt'}:
                convert_with_libreoffice(input_path, TEMP_FOLDER)
            
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
            
        except subprocess.CalledProcessError:
            return jsonify({'error': 'Erro ao converter o documento no servidor.'}), 500
        except Exception as e:
            return jsonify({'error': f'Erro durante a conversão: {str(e)}'}), 500
            
    return jsonify({'error': 'Formato não suportado.'}), 415