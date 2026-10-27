from contextlib import asynccontextmanager

from fastapi import FastAPI

from database.init_db import init_db

from app.api.products import router as product_router
from app.api.collections import router as collection_router
from app.api.auth import router as auth_router
from app.api.comparisons import router as comparison_router
from app.security.auth import allowed_origins

from fastapi.middleware.cors import CORSMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create missing tables before accepting requests; preserve existing data.
    init_db()
    yield


app = FastAPI(

    title="Product Review Analysis API",

    description=
    "Hybrid URL / Extension / File Collection + Sentiment Analysis System",

    version="1.0.0",

    lifespan=lifespan,

)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(allowed_origins()),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.middleware("http")
async def private_response_headers(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith(("/auth/", "/products", "/collections")):
        response.headers["Cache-Control"] = "no-store"
    return response


app.include_router(
    product_router
)
app.include_router(collection_router)
app.include_router(auth_router)
app.include_router(comparison_router)



@app.get("/")
def home():

    return {

        "service":
        "Backend API",

        "status":
        "running"

    }
