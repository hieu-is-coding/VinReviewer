"""GROBID Docker launcher — automates GROBID container startup on backend initialization."""

import asyncio
import logging
import os
import shutil
import subprocess
import httpx
from src.config import settings

logger = logging.getLogger(__name__)


async def ensure_grobid_running() -> None:
    """Check if GROBID is running. If not, try starting it via Docker."""
    # 1. Check if GROBID is already reachable
    url = f"{settings.grobid_url}/api/isalive"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                logger.info("GROBID is already running and reachable at %s.", settings.grobid_url)
                return
    except Exception:
        pass

    # 2. Skip if we are running inside docker container itself
    if os.path.exists("/.dockerenv"):
        logger.info("Running inside Docker. Skipping automatic GROBID container launch.")
        return

    # 3. Check if docker CLI is available
    if not shutil.which("docker"):
        logger.warning(
            "GROBID is not reachable at %s, and 'docker' command is not available in PATH. "
            "Please ensure GROBID is running manually (e.g. docker run -p 8070:8070 lfoppiano/grobid:0.8.1).",
            settings.grobid_url
        )
        return

    logger.info("GROBID is not reachable. Attempting to start GROBID container via Docker...")

    # 4. Check if a container named 'grobid' exists (stopped or running)
    try:
        # Run docker inspect to see if it exists
        inspect_res = subprocess.run(
            ["docker", "inspect", "grobid"],
            capture_output=True,
            text=True,
            check=False
        )

        if inspect_res.returncode == 0:
            logger.info("Found existing 'grobid' container. Starting it...")
            start_res = subprocess.run(
                ["docker", "start", "grobid"],
                capture_output=True,
                text=True,
                check=False
            )
            if start_res.returncode != 0:
                logger.warning("Failed to start existing 'grobid' container: %s", start_res.stderr.strip())
        else:
            logger.info("GROBID container does not exist. Creating and running a new 'grobid' container...")
            run_res = subprocess.run(
                [
                    "docker", "run", "-d",
                    "--name", "grobid",
                    "-p", "8070:8070",
                    "lfoppiano/grobid:0.8.1"
                ],
                capture_output=True,
                text=True,
                check=False
            )
            if run_res.returncode != 0:
                logger.warning("Failed to run GROBID container: %s", run_res.stderr.strip())

        # 5. Wait for it to become ready
        logger.info("Waiting for GROBID to become ready...")
        for attempt in range(15):
            await asyncio.sleep(2)
            try:
                async with httpx.AsyncClient(timeout=2.0) as client:
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        logger.info("GROBID is now ready and reachable at %s.", settings.grobid_url)
                        return
            except Exception:
                pass
        logger.warning("GROBID was started but did not respond on %s within 30 seconds.", url)

    except Exception as exc:
        logger.warning("Unexpected error trying to start GROBID via Docker: %s", exc)
