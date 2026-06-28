"""FastAPI application entrypoint."""

from contextlib import asynccontextmanager
import contextvars
import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.exceptions import AppError
from src.routes import evaluate, health, pdf

correlation_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("correlation_id", default="")


class CorrelationFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = correlation_id_var.get("")
        return True


log_handler = logging.StreamHandler()
log_handler.setFormatter(
    logging.Formatter("%(asctime)s [%(correlation_id)s] %(levelname)s %(name)s: %(message)s")
)
log_handler.addFilter(CorrelationFilter())

logging.basicConfig(
    level=logging.INFO,
    handlers=[log_handler],
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.encoder = None
    yield


app = FastAPI(
    title="GradioAI BackEnd",
    version="0.1.0",
    description="Orchestration service bridging FrontEnd (Supabase) and GradingSystem pipeline",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    cid = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
    correlation_id_var.set(cid)
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = cid
    return response


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error_code": type(exc).__name__,
            "detail": exc.detail,
            "request_id": correlation_id_var.get(str(uuid.uuid4())),
        },
    )


from fastapi.staticfiles import StaticFiles
import os

class CORSStaticFiles(StaticFiles):
    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response

static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static")
os.makedirs(os.path.join(static_dir, "pdfs"), exist_ok=True)
app.mount("/static", CORSStaticFiles(directory=static_dir), name="static")

app.include_router(health.router, tags=["health"])
app.include_router(evaluate.router, tags=["evaluate"])
app.include_router(pdf.router, tags=["pdf"])
