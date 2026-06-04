# Kawang Shop（小野卡铺）

Kawang Shop 是一个单店铺数字商品自动发卡系统，适合会员卡券、游戏充值、软件授权码、学习资料兑换码等虚拟商品销售。买家可以免登录浏览商品、下单支付、查询订单；注册用户可以保存订单记录；管理员通过统一登录入口进入后台管理商品、分类、卡密和订单。

项目采用前后端分离架构：

- 前端：React + TypeScript + Vite + Nginx
- 后端：FastAPI + SQLAlchemy + Alembic
- 数据库：MySQL
- 缓存：Redis
- 支付：皓臻支付网关
- 部署：Docker Compose

## 功能点

买家端：

- 商品分类与商品列表展示
- 商品详情页、库存展示、购买数量选择
- 免登录购买，联系方式用于订单查询和卡密找回
- 登录、注册、邮箱验证码、邮箱重置密码
- 支付二维码弹层与支付状态轮询
- 支付成功后展示卡密，并支持复制
- 游客订单查询，按联系方式或订单号查询
- 注册用户个人中心，包含个人资料和我的订单
- 公告页、关于页、客服微信和二维码配置
- 简体中文、繁体中文、英文切换
- 亮色/暗色主题切换

管理端：

- 管理员统一存放在 `user` 表，通过 `role=admin` 判断权限
- 后台接口必须携带管理员 JWT 才能访问
- 商品管理：新增、编辑、删除、排序、上下架、封面图上传
- 分类管理：新增、编辑、排序、启用/停用
- 卡密管理：批量导入、查看库存、编辑、删除
- 订单管理：查看订单状态、卡密分配、退款/取消状态展示
- 图片上传使用 MD5 去重，并以 MD5 作为文件名保存
- 商品、分类和库存支持 Redis 缓存，并在写操作后刷新缓存
- 下单时以后端事务锁定库存，避免多人并发购买超卖

## 部署前准备

服务器需要安装：

- Docker
- Docker Compose v2
- Git

检查：

```bash
docker --version
docker compose version
git --version
```

## 环境变量

不要把真实 `.env`、支付私钥、SMTP 授权码、数据库密码上传到仓库。

在项目根目录创建 `.env` 文件，示例结构如下。请把所有 `change-me` 或空值替换为你自己的真实配置：

```env
APP_NAME=Kawang Shop
DEBUG=false
SITE_URL=https://your-domain.com

MYSQL_ROOT_PASSWORD=change-me-mysql-root-password
MYSQL_DATABASE=shop

DATABASE_URL=mysql+asyncmy://root:change-me-mysql-root-password@mysql:3306/shop
DATABASE_URL_SYNC=mysql+pymysql://root:change-me-mysql-root-password@mysql:3306/shop
REDIS_URL=redis://redis:6379/0

JWT_SECRET=change-me-to-a-random-string-min-32-chars-long
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

CORS_ORIGINS=["https://your-domain.com","http://localhost","http://localhost:5173","http://127.0.0.1:5173"]

HAOZPAY_MERCHANT_NO=
HAOZPAY_PRIVATE_KEY=
HAOZPAY_PLATFORM_PUBLIC_KEY=
HAOZPAY_API_BASE_URL=https://gate.haozpay.com
HAOZPAY_DEBUG=false

SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_USE_TLS=true

ADMIN_USERNAME=sanye
ADMIN_PASSWORD=change-me-admin-password

EMAIL_CODE_EXPIRE_SECONDS=300
LOGIN_ATTEMPT_LIMIT=5
LOGIN_ATTEMPT_WINDOW_SECONDS=300
ORDER_EXPIRE_MINUTES=15

PAGE_DEFAULT_SIZE=20
PAGE_MAX_SIZE=100
```

说明：

- `SITE_URL` 必须是支付平台能访问到的公网地址。
- `JWT_SECRET` 生产环境必须使用 32 位以上随机字符串。
- `SMTP_PASSWORD` 是邮箱授权码，不是邮箱登录密码。
- QQ 邮箱 `587` 端口使用 STARTTLS，`465` 端口使用隐式 TLS。
- `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 会用于初始化管理员账号。

## Docker 部署

项目根目录执行：

```bash
docker compose -p kawang up -d --build
```

Windows PowerShell 如果需要显式指定后端环境文件：

```powershell
$env:BACKEND_ENV_FILE=".env"
docker compose -p kawang up -d --build
```

启动后访问：

- 买家端：`http://服务器IP` 或 `https://你的域名`
- 后台：`/admin`
- 健康检查：`http://127.0.0.1:8000/health`

容器说明：

- `frontend`：构建 React 前端，并使用 Nginx 对外提供页面
- `backend`：FastAPI 后端，启动时执行数据库迁移和初始化
- `mysql`：MySQL 数据库，默认仅绑定到 `127.0.0.1`
- `redis`：Redis 缓存，默认仅绑定到 `127.0.0.1`

数据卷：

- `mysql_data`：保存 MySQL 数据
- `uploads`：保存上传图片

## Nginx 与 HTTPS

项目自带的 `frontend/nginx.conf` 是容器内 Nginx 配置：

- 静态资源和 SPA 路由由前端 Nginx 提供
- `/api/` 代理到后端容器
- `/static/` 代理到后端上传文件目录
- `/admin` 和 `/api/admin/` 默认限制内网访问

如果服务器上已有外层 Nginx，可以用外层 Nginx 做域名和 HTTPS，反向代理到本项目的前端容器端口。

示例：

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

HTTPS 可以使用 Certbot 或服务器面板申请证书。证书配置完成后，`SITE_URL` 要改成 `https://your-domain.com`，再重启后端容器。

## 客服微信和二维码

客服信息单独放在前端运行时配置：

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

二维码图片可放在：

```text
frontend/public/images/customer-qr.png
```

如果 `qrImageSrc` 为空，页面会显示默认模拟二维码。

## 常用命令

查看容器：

```bash
docker compose -p kawang ps
```

查看日志：

```bash
docker compose -p kawang logs -f backend
docker compose -p kawang logs -f frontend
```

重启后端：

```bash
docker compose -p kawang restart backend
```

停止服务：

```bash
docker compose -p kawang down
```

停止并删除数据卷，谨慎使用：

```bash
docker compose -p kawang down -v
```
