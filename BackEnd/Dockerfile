FROM python:3.11-slim

WORKDIR /app

# System deps for sentence-transformers, spacy, language-tool-python
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Install GradingSystem first (heavier ML deps)
COPY GradingSystem /app/GradingSystem
RUN pip install --no-cache-dir -e /app/GradingSystem

# Pre-download sentence-transformers model at build time
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-mpnet-base-v2')"

# Install BackEnd
COPY BackEnd /app/backend
RUN pip install --no-cache-dir -e /app/backend

WORKDIR /app/backend

EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
