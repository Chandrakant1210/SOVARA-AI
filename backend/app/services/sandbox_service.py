"""
SOVARA AI - Docker Sandbox Service

Executes untrusted/AI-generated code inside an isolated, network-disabled
Docker container. Never runs generated code directly on the host.
"""

import os
import re
import stat
import tempfile
import threading
import time
import uuid

import docker
import requests
from docker.errors import ImageNotFound
from docker.types import LogConfig

# Built from backend/sandbox/Dockerfile (python:3.11-slim + pytest). Never pulled.
SANDBOX_IMAGE = os.getenv("SANDBOX_IMAGE", "sovara-sandbox:py311")
EXECUTION_TIMEOUT_SECONDS = 15
MEMORY_LIMIT = "256m"
CPU_QUOTA = 50000  # 50% of one CPU core (Docker's cpu_quota is in units of 100000 = 1 core)
PIDS_LIMIT = 64  # blocks fork bombs
MAX_CODE_CHARS = 20_000
MAX_OUTPUT_CHARS = 20_000  # per stream, returned to the client
MAX_CONCURRENT_RUNS = 2
SANDBOX_USER = "65534:65534"  # "nobody": no root inside the container

_run_slots = threading.BoundedSemaphore(MAX_CONCURRENT_RUNS)
_client = None
_client_lock = threading.Lock()


class SandboxBusyError(RuntimeError):
    """All sandbox slots are in use."""


class SandboxUnavailableError(RuntimeError):
    """Docker or the sandbox image is not available."""


def _get_client() -> docker.DockerClient:
    # Lazy: the backend still starts if Docker isn't running yet.
    global _client
    with _client_lock:
        if _client is None:
            _client = docker.from_env()
        return _client


def _ensure_image_present(client: docker.DockerClient) -> None:
    # Never let Docker auto-pull: that would be outbound network traffic
    # from an air-gapped system. The image must be loaded locally beforehand.
    try:
        client.images.get(SANDBOX_IMAGE)
    except ImageNotFound:
        raise SandboxUnavailableError(
            f"Sandbox image '{SANDBOX_IMAGE}' is not available locally. "
            "Load it offline (docker load) before using the sandbox."
        )


_TEST_FUNC_RE = re.compile(r"^\s*def\s+test_\w*\s*\(", re.MULTILINE)
_PYTEST_SUMMARY_RE = re.compile(r"=*\s*((?:\d+ \w+(?:, )?)+) in [\d.]+s\s*=*\s*$", re.MULTILINE)


def _build_command(code: str) -> tuple[list[str], str]:
    """Runs pytest when the code defines test_ functions, otherwise plain python."""
    if _TEST_FUNC_RE.search(code):
        # -p no:cacheprovider: /sandbox is read-only, so pytest must not write its cache.
        return ["python", "-m", "pytest", "-q", "-p", "no:cacheprovider", "/sandbox/script.py"], "pytest"
    return ["python", "/sandbox/script.py"], "python"


def _pytest_summary(stdout: str) -> str | None:
    """Extracts pytest's final summary, e.g. '2 passed' or '1 failed, 1 passed'."""
    matches = _PYTEST_SUMMARY_RE.findall(stdout)
    return matches[-1].strip() if matches else None


def _truncate(text: str) -> tuple[str, bool]:
    if len(text) <= MAX_OUTPUT_CHARS:
        return text, False
    return text[:MAX_OUTPUT_CHARS] + "\n[output truncated]", True


def get_sandbox_info() -> dict:
    """Real sandbox configuration and availability, for the UI."""
    docker_available, image_available, python_version = False, False, None
    try:
        client = _get_client()
        client.ping()
        docker_available = True
        _ensure_image_present(client)
        image_available = True
        env = client.images.get(SANDBOX_IMAGE).attrs.get("Config", {}).get("Env", [])
        python_version = next((e.split("=", 1)[1] for e in env if e.startswith("PYTHON_VERSION=")), None)
    except Exception:
        pass

    return {
        "docker_available": docker_available,
        "image": SANDBOX_IMAGE,
        "image_available": image_available,
        "python_version": python_version,
        "test_runner": "pytest (when code defines test_ functions)",
        "host_mounts": "script only, read-only",
        "host_secrets": "none mounted",
        "network": "disabled",
        "timeout_seconds": EXECUTION_TIMEOUT_SECONDS,
        "memory_limit": MEMORY_LIMIT,
        "cpu_cores": CPU_QUOTA / 100_000,
        "pids_limit": PIDS_LIMIT,
        "root_filesystem": "read-only",
        "runs_as": "nobody (non-root)",
        "capabilities": "all dropped",
        "max_code_chars": MAX_CODE_CHARS,
        "max_concurrent_runs": MAX_CONCURRENT_RUNS,
    }


def run_code_in_sandbox(code: str) -> dict:
    """
    Runs the given Python code inside a locked-down container:
    - network disabled entirely; image must already be local (never pulled)
    - memory, CPU and process count limited
    - non-root user, all Linux capabilities dropped, no privilege escalation
    - read-only root filesystem; only a small /tmp is writable
    - execution timeout enforced; output size capped
    - script is on a throwaway, read-only mounted temp dir, removed after
    - no host credentials or other volumes mounted in

    Returns {"run_id", "stdout", "stderr", "exit_code", "timed_out",
             "duration_ms", "output_truncated", "runner", "test_summary"}.
    Raises SandboxBusyError or SandboxUnavailableError.
    """
    if not _run_slots.acquire(blocking=False):
        raise SandboxBusyError("The sandbox is busy. Try again in a few seconds.")

    try:
        client = _get_client()
        _ensure_image_present(client)
        run_id = str(uuid.uuid4())

        with tempfile.TemporaryDirectory() as tmpdir:
            script_path = os.path.join(tmpdir, "script.py")
            with open(script_path, "w", encoding="utf-8") as f:
                f.write(code)
            # The non-root container user must be able to read the script.
            os.chmod(tmpdir, stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
            os.chmod(script_path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)

            command, runner = _build_command(code)
            container = None
            started = time.monotonic()
            try:
                container = client.containers.run(
                    SANDBOX_IMAGE,
                    command=command,
                    volumes={tmpdir: {"bind": "/sandbox", "mode": "ro"}},
                    working_dir="/sandbox",
                    network_disabled=True,
                    mem_limit=MEMORY_LIMIT,
                    memswap_limit=MEMORY_LIMIT,  # no extra swap beyond the memory limit
                    cpu_quota=CPU_QUOTA,
                    pids_limit=PIDS_LIMIT,
                    user=SANDBOX_USER,
                    cap_drop=["ALL"],
                    security_opt=["no-new-privileges"],
                    read_only=True,
                    tmpfs={"/tmp": "size=16m"},
                    environment={"HOME": "/tmp", "PYTHONDONTWRITEBYTECODE": "1"},
                    log_config=LogConfig(type=LogConfig.types.JSON, config={"max-size": "1m"}),
                    detach=True,
                    name=f"sovara-sandbox-{run_id}",
                    remove=False,
                )

                try:
                    result = container.wait(timeout=EXECUTION_TIMEOUT_SECONDS)
                    exit_code = result.get("StatusCode", -1)
                    timed_out = False
                except (requests.exceptions.ReadTimeout, requests.exceptions.ConnectionError):
                    try:
                        container.kill()
                    except Exception:
                        pass
                    exit_code = -1
                    timed_out = True

                duration_ms = int((time.monotonic() - started) * 1000)
                stdout, out_trunc = _truncate(
                    container.logs(stdout=True, stderr=False).decode("utf-8", errors="replace")
                )
                stderr, err_trunc = _truncate(
                    container.logs(stdout=False, stderr=True).decode("utf-8", errors="replace")
                )

                return {
                    "run_id": run_id,
                    "stdout": stdout,
                    "stderr": stderr,
                    "exit_code": exit_code,
                    "timed_out": timed_out,
                    "duration_ms": duration_ms,
                    "output_truncated": out_trunc or err_trunc,
                    "runner": runner,
                    "test_summary": _pytest_summary(stdout) if runner == "pytest" else None,
                }
            finally:
                if container:
                    try:
                        container.remove(force=True)
                    except Exception:
                        pass
    finally:
        _run_slots.release()