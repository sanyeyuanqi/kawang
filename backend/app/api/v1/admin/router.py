from fastapi import APIRouter

admin_router = APIRouter(prefix="/admin")

from app.api.v1.admin.auth import router as auth_router
admin_router.include_router(auth_router)

from app.api.v1.admin.dashboard import router as dashboard_router
admin_router.include_router(dashboard_router)

from app.api.v1.admin.products import router as products_router
admin_router.include_router(products_router)

from app.api.v1.admin.categories import router as categories_router
admin_router.include_router(categories_router)

from app.api.v1.admin.code_keys import router as code_keys_router
admin_router.include_router(code_keys_router)

from app.api.v1.admin.orders import router as orders_router
admin_router.include_router(orders_router)

from app.api.v1.admin.announcements import router as announcements_router
admin_router.include_router(announcements_router)
