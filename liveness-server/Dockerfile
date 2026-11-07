# The browser app is static and runs on Vercel. This image runs the separate
# anti-spoofing API needed by the production site.
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    LIVENESS_CORS_ORIGIN_REGEX="^https://([a-z0-9-]+\\.)*vercel\\.app$"

WORKDIR /app

RUN apt-get update \
    && apt-get install --no-install-recommends -y git libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN git clone --depth 1 https://github.com/computervisioneng/Silent-Face-Anti-Spoofing.git Silent-Face-Anti-Spoofing \
    && pip install -r Silent-Face-Anti-Spoofing/requirements.txt -r requirements.txt

COPY app.py ./app.py

EXPOSE 8000
CMD ["sh", "-c", "python -m uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
