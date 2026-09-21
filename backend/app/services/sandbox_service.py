"""
SOVARA AI — Docker Sandbox Service

Executes untrusted/AI-generated code inside an isolated, network-disabled
Docker container. Never runs generated code directly on the host.
"""

import docker
import tempfile
import os
import uuid

client = docker.from_env()

SANDBOX_IMAGE = "python:3.11-slim"
EXECUTION_TIMEOUT_SECONDS = 15
MEMORY_LIMIT = "256m"
CPU_QUOTA = 50000  # 50% of one CPU core (Docker's cpu_quota is in units of 100000 = 1 core)


def run_code_in_sandbox(code: str) -> dict:
    """
    Runs the given Python code inside a locked-down container:
    - network disabled entirely
    - memory and CPU limited
    - execution timeout enforced
    - filesystem is a throwaway temp dir, removed after
    - no host credentials or volumes mounted in

    Returns {"stdout": str, "stderr": str, "exit_code": int, "timed_out": bool}.
    """
    run_id = str(uuid.uuid4())

    with tempfile.TemporaryDirectory() as tmpdir:
        script_path = os.path.join(tmpdir, "script.py")
        with open(script_path, "w") as f:
            f.write(code)

        container = None
        try:
            container = client.containers.run(
                SANDBOX_IMAGE,
                command=["python", "/sandbox/script.py"],
                volumes={tmpdir: {"bind": "/sandbox", "mode": "ro"}},
                working_dir="/sandbox",
                network_disabled=True,
                mem_limit=MEMORY_LIMIT,
                cpu_quota=CPU_QUOTA,
                detach=True,
                name=f"sovara-sandbox-{run_id}",
                remove=False,
            )

            try:
                result = container.wait(timeout=EXECUTION_TIMEOUT_SECONDS)
                exit_code = result.get("StatusCode", -1)
                timed_out = False
            except Exception:
                container.kill()
                exit_code = -1
                timed_out = True

            logs = container.logs(stdout=True, stderr=False).decode("utf-8", errors="replace")
            errors = container.logs(stdout=False, stderr=True).decode("utf-8", errors="replace")

            return {
                "stdout": logs,
                "stderr": errors,
                "exit_code": exit_code,
                "timed_out": timed_out,
            }

        finally:
            if container:
                try:
                    container.remove(force=True)
                except Exception:
                    pass
                