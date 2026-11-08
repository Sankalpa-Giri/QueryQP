FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for PyMuPDF, OCR and curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libmupdf-dev \
    tesseract-ocr \
    tesseract-ocr-eng \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Ensure tessdata paths are linked and TESSDATA_PREFIX is configured
ENV TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata
RUN mkdir -p /usr/share/tessdata && \
    (cp -rn /usr/share/tesseract-ocr/5/tessdata/* /usr/share/tessdata/ 2>/dev/null || true) && \
    (ln -sf /usr/share/tesseract-ocr/5/tessdata/* /usr/share/tessdata/ 2>/dev/null || true)

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Ensure storage directories exist
RUN mkdir -p data/storage/documents data/storage/markdown data/storage/assets data/storage/slides data/storage/exports

EXPOSE 8000

CMD ["gunicorn", "app.main:app", "-w", "2", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-"]
