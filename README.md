# Kawang Shop（小野卡铺）

Kawang Shop 是一个单店铺数字商品自动发卡系统，适合会员卡券、游戏充值、软件授权码、学习资料兑换码等虚拟商品销售。买家可以免登录浏览商品、下单支付、查询订单；注册用户可以保存订单记录；管理员通过统一登录入口进入后台管理商品、分类、卡密、订单和公告。

本项目部署方式统一为 **Docker Compose 部署**。生产环境不需要在宿主机安装 Python、Node.js、MySQL 或 Redis。

## 技术栈

- 前端：React + TypeScript + Vite + Nginx
- 后端：FastAPI + SQLAlchemy + Alembic
- 数据库：MySQL 8
- 缓存：Redis 7
- 支付：皓臻支付网关
- 部署：Docker Compose

## 功能点

买家端：

- 商品分类、商品列表、商品详情和库存展示
- 免登录购买，联系方式用于订单查询和卡密找回
- 登录、注册、邮箱验证码、邮箱重置密码
- 支付二维码弹层与支付状态轮询
- 支付成功后展示卡密，并支持复制
- 游客订单查询，按联系方式或订单号查询
- 注册用户个人中心、个人资料、我的订单
- 公告页、关于页、客服微信和二维码配置
- 简体中文、繁体中文、英文切换
- 亮色/暗色主题切换

管理端：

- 管理员统一存放在 `user` 表，通过 `role=admin` 判断权限
- 后台接口必须携带管理员 JWT 才能访问
- 商品管理：新增、编辑、删除、排序、封面图上传
- 分类管理：新增、编辑、排序、启用/停用
- 卡密管理：批量导入、库存汇总、卡密明细、编辑、删除
- 订单管理：订单列表、订单详情、手动发货、补发卡密、退款
- 公告管理：新增、编辑、发布、置顶、删除
- 图片上传使用 MD5 去重，并以 MD5 作为文件名保存
- 商品、分类、库存、公告、订单等接口支持缓存与缓存失效
- 下单时以后端事务锁定库存，避免并发购买超卖

## 服务器要求

只需要安装：

- Docker
- Docker Compose v2
- Git

检查命令：

```bash
docker --version
docker compose version
git --version
```

## 目录结构

```text
kawang/
  backend/              FastAPI 后端
  frontend/             React 前端和容器内 Nginx 配置
  docker-compose.yml    Docker Compose 编排文件
  .env.example          环境变量示例
```

## Docker 部署流程

### 1. 拉取代码

```bash
git clone https://github.com/sanyeyuanqi/kawang.git
cd kawang
```

### 2. 创建环境变量文件

```bash
cp .env.example .env
```

然后编辑 `.env`，把占位值替换成生产配置。

最小必改项：

```env
SITE_URL=https://your-domain.com
BACKEND_ENV_FILE=.env

MYSQL_ROOT_PASSWORD=root
MYSQL_DATABASE=shop

DATABASE_URL=mysql+asyncmy://root:root@mysql:3306/shop
DATABASE_URL_SYNC=mysql+pymysql://root:root@mysql:3306/shop
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=40
DATABASE_POOL_RECYCLE_SECONDS=1800
DATABASE_POOL_PRE_PING=true
REDIS_URL=redis://redis:6379/0
REDIS_MAX_CONNECTIONS=100

UVICORN_WORKERS=4
SCHEDULER_LOCK_FILE=/tmp/kawang_scheduler.lock

JWT_SECRET=change-me-to-a-random-string-min-32-chars-long
CORS_ORIGINS=["https://your-domain.com","http://your-server-ip"]

HAOZPAY_MERCHANT_NO=
HAOZPAY_PRIVATE_KEY=
HAOZPAY_PLATFORM_PUBLIC_KEY=
HAOZPAY_API_BASE_URL=https://gate.haozpay.com
HAOZPAY_DEBUG=false
HAOZPAY_QUERY_ENABLED=false

SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_USE_TLS=true

ADMIN_USERNAME=sanye
ADMIN_PASSWORD=change-me-admin-password
```

注意：

- 不要把真实 `.env`、支付私钥、SMTP 授权码、数据库密码提交到 GitHub。
- `BACKEND_ENV_FILE=.env` 用于让后端容器读取项目根目录的真实 `.env` 配置。
- `SITE_URL` 必须是支付平台可以访问到的公网地址。
- `JWT_SECRET` 生产环境必须使用 32 位以上随机字符串。
- `SMTP_PASSWORD` 是邮箱授权码，不是邮箱登录密码。
- `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 会在容器启动时用于初始化或更新管理员账号。
- `UVICORN_WORKERS` 是后端 worker 进程数；`DATABASE_POOL_SIZE` 和 `DATABASE_MAX_OVERFLOW` 是每个 worker 的数据库连接池配置。
- 多 worker 模式下定时任务会通过 `SCHEDULER_LOCK_FILE` 做跨进程锁，避免重复执行。

## 并发与连接数配置

默认 Docker 配置已经按较高并发做了放大：

```env
UVICORN_WORKERS=4
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=40
REDIS_MAX_CONNECTIONS=100
SCHEDULER_LOCK_FILE=/tmp/kawang_scheduler.lock
```

含义：

- `UVICORN_WORKERS=4`：后端容器启动 4 个 Uvicorn worker 进程。
- `DATABASE_POOL_SIZE=20`：每个 worker 常驻最多 20 个数据库连接。
- `DATABASE_MAX_OVERFLOW=40`：每个 worker 高峰期可临时再开 40 个数据库连接。
- `REDIS_MAX_CONNECTIONS=100`：每个 worker 的 Redis 连接池最大连接数。
- `SCHEDULER_LOCK_FILE=/tmp/kawang_scheduler.lock`：多 worker 下只允许一个进程运行定时任务。

数据库理论最大连接数约为：

```text
UVICORN_WORKERS * (DATABASE_POOL_SIZE + DATABASE_MAX_OVERFLOW)
```

按默认值计算是 `4 * (20 + 40) = 240` 个 MySQL 连接。提高这些值前，请确认 MySQL 的 `max_connections`、服务器 CPU 和内存也足够。

`docker-compose.yml` 已将 MySQL 容器启动参数设置为 `--max-connections=500`，能覆盖默认配置下的连接上限。如果继续提高 worker 或连接池，请同步提高 MySQL 的 `max_connections`。

常见配置建议：

| 服务器规格 | UVICORN_WORKERS | DATABASE_POOL_SIZE | DATABASE_MAX_OVERFLOW | REDIS_MAX_CONNECTIONS |
|---|---:|---:|---:|---:|
| 2 核 4G | 2 | 10 | 20 | 50 |
| 4 核 8G | 4 | 20 | 40 | 100 |
| 8 核 16G | 6-8 | 25 | 50 | 150 |

修改 `.env` 后重建并启动后端：

```bash
docker compose -p kawang --env-file .env up -d --build backend
```

### 3. 启动服务

```bash
docker compose -p kawang --env-file .env up -d --build
```

启动后会自动执行：

1. 等待 MySQL 就绪
2. 执行 `alembic upgrade head`
3. 执行 `python -m app.seed`
4. 启动 FastAPI 后端
5. 启动前端 Nginx

### 4. 查看启动状态

```bash
docker compose -p kawang ps
```

正常情况下应看到：

- `mysql` healthy
- `redis` healthy
- `backend` healthy
- `frontend` running 或 healthy

### 5. 访问地址

- 买家端：`http://服务器IP` 或 `https://你的域名`
- 后台管理：`http://服务器IP/admin` 或 `https://你的域名/admin`
- 后端健康检查：`http://127.0.0.1:8000/health`

`docker-compose.yml` 默认端口：

| 服务 | 宿主机端口 | 说明 |
|---|---:|---|
| frontend | `80` | 对外提供网站 |
| backend | `127.0.0.1:8000` | 仅本机访问，前端 Nginx 代理 |
| mysql | `127.0.0.1:3306` | 仅本机访问 |
| redis | `127.0.0.1:6379` | 仅本机访问 |

## 客服微信和二维码

客服信息在前端运行时配置：

```text
frontend/public/shop-contact.json
```

示例：

```json
{
  "customerWechat": "your-wechat-id",
  "qrImageSrc": "/images/customer-qr.png"
}
```

二维码图片放在：

```text
frontend/public/images/customer-qr.png
```

修改后重新构建前端容器：

```bash
docker compose -p kawang --env-file .env up -d --build frontend
```

## HTTPS 部署

项目容器内的 `frontend/nginx.conf` 负责：

- 提供前端静态页面
- 代理 `/api/` 到后端容器
- 代理 `/static/` 到后端上传文件
- 限制 `/admin` 页面默认只允许内网访问

如果需要 HTTPS，推荐在宿主机或服务器面板上再加一层外部 Nginx/Caddy/宝塔反向代理，转发到本项目的 `80` 端口。

外层 Nginx 示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

证书配置完成后：

1. 把 `.env` 里的 `SITE_URL` 改成 `https://your-domain.com`
2. 把 `CORS_ORIGINS` 加上 `https://your-domain.com`
3. 重启后端容器

```bash
docker compose -p kawang --env-file .env restart backend
```

## 常用 Docker 命令

查看容器：

```bash
docker compose -p kawang ps
```

查看日志：

```bash
docker compose -p kawang logs -f
docker compose -p kawang logs -f backend
docker compose -p kawang logs -f frontend
docker compose -p kawang logs -f mysql
docker compose -p kawang logs -f redis
```

重启服务：

```bash
docker compose -p kawang restart
docker compose -p kawang restart backend
docker compose -p kawang restart frontend
```

重新构建并启动：

```bash
docker compose -p kawang --env-file .env up -d --build
```

停止服务：

```bash
docker compose -p kawang down
```

停止并删除数据卷，谨慎使用：

```bash
docker compose -p kawang down -v
```

## 数据备份与恢复

备份 MySQL：

```bash
docker compose -p kawang exec mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > kawang-backup.sql
```

恢复 MySQL：

```bash
docker compose -p kawang exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < kawang-backup.sql
```

备份上传文件：

```bash
docker run --rm -v kawang_uploads:/data -v "$PWD":/backup alpine tar czf /backup/kawang-uploads.tar.gz -C /data .
```

恢复上传文件：

```bash
docker run --rm -v kawang_uploads:/data -v "$PWD":/backup alpine sh -c 'cd /data && tar xzf /backup/kawang-uploads.tar.gz'
```

## 更新项目

```bash
git pull
docker compose -p kawang --env-file .env up -d --build
```

后端容器启动时会自动执行数据库迁移。

## 排障

查看后端启动错误：

```bash
docker compose -p kawang logs --tail=200 backend
```

查看数据库状态：

```bash
docker compose -p kawang ps mysql
docker compose -p kawang logs --tail=100 mysql
```

进入后端容器：

```bash
docker compose -p kawang exec backend sh
```

手动执行迁移：

```bash
docker compose -p kawang exec backend alembic upgrade head
```

手动初始化数据：

```bash
docker compose -p kawang exec backend python -m app.seed
```
