from fastapi import FastAPI

app = FastAPI(title="Export Service")


@app.get("/health")
def health():
    return {"status": "ok", "service": "export"}
