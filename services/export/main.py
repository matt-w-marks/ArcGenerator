from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from routers.exports import router as exports_router

app = FastAPI(
    title="Export Service",
    docs_url=None,   # disable Swagger UI in production
    redoc_url=None,
)

app.include_router(exports_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "export"}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Never leak stack traces to the client
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
