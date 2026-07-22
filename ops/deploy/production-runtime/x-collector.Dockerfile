FROM python:3.13-slim

WORKDIR /app
COPY apps/x-collector /app/apps/x-collector
RUN pip install --no-cache-dir /app/apps/x-collector

ARG SOCIAL_MONITOR_RELEASE_SHA
LABEL org.opencontainers.image.revision="${SOCIAL_MONITOR_RELEASE_SHA}"

WORKDIR /app/apps/x-collector
USER 1000:1000
CMD ["python", "-m", "x_collector"]
