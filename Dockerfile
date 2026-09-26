FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/src
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer fonts-crosextra-carlito && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY prompts ./prompts
COPY src ./src
CMD ["python","-m","automate_cv.runner"]
