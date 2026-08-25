FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

COPY main.py ./

# Bake the model into the image at build time so the pod doesn't hit the
# HuggingFace Hub on every cold start / restart.
RUN python -c "from transformers import pipeline; pipeline('summarization', model='facebook/bart-large-cnn')"

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
