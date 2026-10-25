# Service unique pour l'hébergement gratuit (Render) : API Django + interface React compilée.
# L'école est identifiée par le chemin (/e/<code>) et l'en-tête X-Ecole, pas par sous-domaine.
FROM node:22-alpine AS interface
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_MODE_CHEMIN=1
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    ECOLE_PAR_EN_TETE=true FRONTEND_DIST=/app/interface DEBUG=false
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY deploy/render-demarrage.sh /app/demarrage.sh
COPY --from=interface /app/dist /app/interface
CMD ["sh", "/app/demarrage.sh"]
