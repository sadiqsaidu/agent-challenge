FROM ollama/ollama:0.7.0

# These are **build-time** env variables with no secrets—
# they simply configure which model endpoint to use:
ARG API_BASE_URL=http://127.0.0.1:11434/api
ARG MODEL_NAME_AT_ENDPOINT=qwen2.5:1.5b

# Install system dependencies and Node.js
RUN apt-get update && apt-get install -y \
  curl \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm

WORKDIR /app

# Copy only your package manifests first (for better layer caching)
COPY package.json pnpm-lock.yaml ./

RUN pnpm install

# Copy the rest of your code
COPY . .

# Build your TypeScript (if you have a build step)
RUN pnpm run build

# Expose the port your app listens on
EXPOSE 8080

# **Clear Ollama’s entrypoint**, so CMD runs as expected
ENTRYPOINT []

# At runtime, we’ll pass in the real secrets via --env-file
CMD ["node", ".mastra/output/index.mjs"]
