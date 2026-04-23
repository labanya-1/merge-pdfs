import io
import os
import tempfile
import uuid
from pathlib import Path

from flask import Flask, render_template, request, send_file, jsonify, after_this_request
from pypdf import PdfWriter, PdfReader
from pdf2docx import Converter

MAX_CONTENT_MB = 50
ALLOWED_EXT = {".pdf"}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_MB * 1024 * 1024

TMP_DIR = Path(tempfile.gettempdir()) / "pdftools"
TMP_DIR.mkdir(exist_ok=True)


def _is_pdf(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXT


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/merge", methods=["POST"])
def merge():
    files = request.files.getlist("files")
    if len(files) < 2:
        return jsonify(error="Please upload at least 2 PDF files to merge."), 400

    writer = PdfWriter()
    try:
        for f in files:
            if not _is_pdf(f.filename):
                return jsonify(error=f"'{f.filename}' is not a PDF."), 400
            reader = PdfReader(f.stream)
            for page in reader.pages:
                writer.add_page(page)
    except Exception as e:
        return jsonify(error=f"Failed to read PDF: {e}"), 400

    buf = io.BytesIO()
    writer.write(buf)
    writer.close()
    buf.seek(0)

    return send_file(
        buf,
        mimetype="application/pdf",
        as_attachment=True,
        download_name="merged.pdf",
    )


@app.route("/convert", methods=["POST"])
def convert():
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify(error="Please upload a PDF file."), 400
    if not _is_pdf(f.filename):
        return jsonify(error="Only PDF files are supported."), 400

    job_id = uuid.uuid4().hex
    pdf_path = TMP_DIR / f"{job_id}.pdf"
    docx_path = TMP_DIR / f"{job_id}.docx"
    f.save(pdf_path)

    try:
        cv = Converter(str(pdf_path))
        cv.convert(str(docx_path), start=0, end=None)
        cv.close()
    except Exception as e:
        _cleanup(pdf_path, docx_path)
        return jsonify(error=f"Conversion failed: {e}"), 500

    @after_this_request
    def _remove(response):
        _cleanup(pdf_path, docx_path)
        return response

    out_name = Path(f.filename).stem + ".docx"
    return send_file(
        docx_path,
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        as_attachment=True,
        download_name=out_name,
    )


def _cleanup(*paths):
    for p in paths:
        try:
            os.remove(p)
        except OSError:
            pass


@app.errorhandler(413)
def too_large(_):
    return jsonify(error=f"File too large. Max {MAX_CONTENT_MB} MB."), 413


if __name__ == "__main__":
    app.run(debug=True, port=5000)
