FROM python:3.11-slim

# Install Node.js
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Ollama
RUN curl -fsSL https://ollama.ai/install.sh | sh

# Install Python deps
RUN pip install --no-cache-dir flask flask-cors timm torch --index-url https://download.pytorch.org/whl/cpu

# Copy app
WORKDIR /app
COPY . .

# Install Node deps and build frontend
RUN npm install && npm run build

# Pull a small model for fast inference
RUN ollama pull tinyllama:1.1b &

EXPOSE 3000

CMD ["python", "server.py", "--port", "3000"]
