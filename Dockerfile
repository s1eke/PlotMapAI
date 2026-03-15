# Build React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# Build Python Backend & Serve
FROM python:3.12-slim
WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy backend configuration for dependency installation
COPY app/pyproject.toml app/uv.lock ./
RUN uv sync

# Copy backend source code and tests
COPY app/ .

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Set environment variables
ENV FLASK_APP=run.py
ENV FLASK_ENV=production

# Create required directories
RUN mkdir -p data uploads

EXPOSE 5000

# Use uv run to ensure the correct virtual environment is active
CMD ["uv", "run", "gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "run:app"]
