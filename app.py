import os
import pdfplumber
from flask import Flask, flash, redirect, render_template, request, url_for

UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {"pdf"}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "change-me-in-production")
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def extract_text_from_pdf(filepath: str) -> str:
    """Extract all text from a PDF file using pdfplumber."""
    pages_text = []
    with pdfplumber.open(filepath) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            if text.strip():
                pages_text.append(f"[페이지 {i}]\n{text.strip()}")
    return "\n\n".join(pages_text) if pages_text else "(추출된 텍스트 없음)"


@app.route("/", methods=["GET", "POST"])
def index():
    extracted_text = None
    filename = None

    if request.method == "POST":
        if "pdf_file" not in request.files:
            flash("파일이 선택되지 않았습니다.", "error")
            return redirect(url_for("index"))

        file = request.files["pdf_file"]
        if file.filename == "":
            flash("파일을 선택해 주세요.", "error")
            return redirect(url_for("index"))

        if file and allowed_file(file.filename):
            from werkzeug.utils import secure_filename

            filename = secure_filename(file.filename)
            save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            file.save(save_path)
            extracted_text = extract_text_from_pdf(save_path)
            flash("PDF 파일이 성공적으로 업로드되었습니다.", "success")
        else:
            flash("PDF 파일만 업로드할 수 있습니다.", "error")
            return redirect(url_for("index"))

    return render_template("index.html", extracted_text=extracted_text, filename=filename)


if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug)
