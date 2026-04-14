# 本地珠宝 OA 框架（可运行）

本版本已支持：
- 主表字段管理：产品编号、图片、产品类型、工厂编号、重量、细石数、异形石数、主石数、主石价格、胚价、电镀费、成本工费、电镀颜色、备注
- 左侧菜单管理：按角色可配置显示菜单
- 登录鉴权：登录/退出、会话过期自动跳回登录
- 系统管理：用户管理、角色管理、权限管理、菜单管理
- 菜单管理增强：支持菜单分组、同组内拖拽排序并保存
- 产品查询：多单号（按换行分隔）、产品类型、工厂编号、重量范围、细石数范围、成本工费范围、标签、分页
- 产品维护：新增 / 修改 / 删除（新增与编辑为弹窗）
- 独立页面：主表导入、图片导入（支持文件夹检索导入）、本地AI
- 图片导入规则：同名图片会把旧图改名为 `*-old-时间戳`，最新图片生效

## 启动

```bash
npm run init-db
npm start
```

## 访问入口

- 登录页：`http://127.0.0.1:8080/login.html`
- 主页：`http://127.0.0.1:8080/index.html`
- 产品主表：`http://127.0.0.1:8080/products.html`
- 主表导入：`http://127.0.0.1:8080/import-products.html`
- 图片导入：`http://127.0.0.1:8080/import-images.html`
- 本地AI：`http://127.0.0.1:8080/ai.html`
- 用户管理：`http://127.0.0.1:8080/users.html`
- 角色管理：`http://127.0.0.1:8080/roles.html`
- 权限管理：`http://127.0.0.1:8080/permissions.html`
- 菜单管理：`http://127.0.0.1:8080/menus.html`

默认管理员账号：
- 用户名：`admin`
- 密码：`admin123`

## 主要接口

- 鉴权
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/nav/menus`

- 主页与基础
- `GET /api/dashboard`
- `GET /api/base/product-types`
- `GET /api/base/factories`

- 产品主表
- `GET /api/products`
- `POST /api/products`
- `GET /api/products/:id`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`

- 导入与AI
- `POST /api/import/products/preview`
- `POST /api/import/products/confirm`
- `POST /api/import/images`
- `POST /api/ai/query`

- 系统管理（管理员）
- `GET/POST /api/admin/users`
- `PUT/DELETE /api/admin/users/:id`
- `GET/POST /api/admin/roles`
- `PUT/DELETE /api/admin/roles/:id`
- `GET/POST /api/admin/permissions`
- `PUT/DELETE /api/admin/permissions/:id`
- `GET/POST /api/admin/menus`
- `PUT/DELETE /api/admin/menus/:id`
- `GET /api/admin/options`
