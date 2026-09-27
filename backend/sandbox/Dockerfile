# SOVARA AI - offline sandbox image for code execution.
#
# Build once on a connected dev machine:
#   docker build -t sovara-sandbox:py311 backend/sandbox
# For an air-gapped server, transfer it as a file (no registry, no internet):
#   docker save sovara-sandbox:py311 -o sovara-sandbox.tar   (dev machine)
#   docker load -i sovara-sandbox.tar                        (air-gapped server)
FROM python:3.11-slim

# Pinned so every run uses the same test runner version.
RUN pip install --no-cache-dir pytest==8.3.3

# No application code or secrets live in this image. The script to run is
# mounted read-only at /sandbox at run time.
WORKDIR /sandbox