from fastapi import APIRouter

api_router = APIRouter()

# Public routes
from app.api.v1.shop import router as shop_router
api_router.include_router(shop_router, tags=["Shop"])

from app.api.v1.categories import router as categories_router
api_router.include_router(categories_router, tags=["Categories"])

from app.api.v1.products import router as products_router
api_router.include_router(products_router, tags=["Products"])

from app.api.v1.orders import router as orders_router
api_router.include_router(orders_router, tags=["Orders"])

from app.api.v1.auth import router as auth_router
api_router.include_router(auth_router, tags=["Auth"])

from app.api.v1.announcements import router as announcements_router
api_router.include_router(announcements_router, tags=["Announcements"])

# Admin routes
from app.api.v1.admin.router import admin_router
api_router.include_router(admin_router, tags=["Admin"])
