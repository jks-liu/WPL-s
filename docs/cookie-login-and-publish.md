# 登录 Cookie 与知乎发布链路（当前实现）

本文对应当前仓库的 `src/` 代码，描述扩展如何取得、保存、使用 Cookie，以及如何创建或更新知乎文章。这里的接口是项目目前调用的知乎网页接口，不代表知乎提供稳定的公开发布 API。

## 1. 总体链路

```text
zhihu.login
  → Playwright 启动独立 Chrome/Edge Profile，打开知乎登录页
  → 从浏览器上下文读取知乎 Cookie
  → 带候选 Cookie 请求 /api/v4/me，验证身份
  → 将整组知乎 Cookie 存入 VS Code SecretStorage

zhihu.publish / zhihu.drafts
  → Markdown + front matter → HTML、图片 URL、文章元数据
  → HttpService 按请求 URL 从 SecretStorage 选取 Cookie
  → fetch 调用知乎草稿/发布接口
```

Playwright 浏览器只负责交互式登录及提取 Cookie；发布请求由扩展宿主的 `fetch` 发出，不通过浏览器页面，也不读取用户日常浏览器的 Profile。入口与服务装配见 [`src/extension.ts`](../src/extension.ts)。

## 2. 获取与验证 Cookie

1. 执行 `zhihu.login` 时，`AuthenticateService.login()` 先用现有 Cookie 请求 `GET https://www.zhihu.com/api/v4/me`。仅当响应状态为 `200` 且 JSON 中有 `id`，才认为已登录，并复用该会话。
2. 若验证未通过，先删除 SecretStorage 中旧的 Cookie，再显示可取消的登录进度。`BrowserLoginService` 使用 `playwright-core` 的 `chromium.launchPersistentContext()` 启动**可见**浏览器，打开 `https://www.zhihu.com/signin`，由用户自行完成知乎要求的登录步骤。
3. 浏览器 Profile 位于扩展的 `globalStorageUri/zhihu-browser-profile`。可用 `zhihu.browserExecutablePath` 指定浏览器；否则按 `zhihu.browserChannel` 选择。`auto` 在 Windows 上依次尝试 Edge、Chrome，其他系统则相反。仅支持本地桌面版 VS Code，不支持 Web 或 Remote 扩展宿主。
4. 每 1 秒从 `BrowserContext.cookies()` 读取一次 Cookie，只保留 `zhihu.com` 及其子域的 Cookie；为 `/api/v4/me` 构造候选 `Cookie` 请求头。Cookie 变化时在下一轮轮询中验证，同一组 Cookie 验证失败时最多每 5 秒重试一次。验证仍由 `AccountService.fetchProfile(candidateCookie, signal)` 发起；浏览器页面出现“已登录”本身不是成功判据。
5. 验证成功后保存该次读取的知乎 Cookie，更新内存中的账号资料并关闭登录窗口。用户取消、关窗或超过 10 分钟则不保存新 Cookie；浏览器 Profile 仍留在磁盘上，供下次打开。登录开始前被清除的旧 SecretStorage Cookie 不会因取消而恢复。

这段流程主要位于 [`authenticate.service.ts`](../src/service/authenticate.service.ts)、[`browser-login.service.ts`](../src/service/browser-login.service.ts) 和 [`account.service.ts`](../src/service/account.service.ts)。

## 3. Cookie 存储与请求注入

`CookieService` 将浏览器 Cookie 的 `name`、`value`、`domain`、`path`、`expires`、`httpOnly`、`secure`、`sameSite` 序列化，存到 VS Code `context.secrets` 的 `zhihu.cookie` 键。它不是工作区文件，也不是仅在内存中保存；独立浏览器 Profile 则是另一份磁盘数据。写入前会检查字段格式、去重，并拒绝非知乎域名的 Cookie；空结果不会覆盖已保存的有效数据。

每次 `HttpService.sendRequest()` 发请求时，若调用方没有显式提供 `cookie`，便让 `CookieService.getCookieHeader(uri)` 从 SecretStorage 读取并按目标 URL 筛选：域名及子域匹配、路径匹配、`secure` Cookie 仅用于 HTTPS、已过期 Cookie 不发送；较长的匹配路径排在前面。因此发往 `www.zhihu.com` 与 `zhuanlan.zhihu.com` 的请求可能携带不同 Cookie，发往无关域名的请求不会携带知乎 Cookie。HTTP 层把筛选结果写入 `Cookie` 头；若其中有 `_xsrf` 且调用方未设置 `x-xsrftoken`，还会自动设置该请求头。通用请求头包括 `User-Agent`、`Accept` 和 `Accept-Encoding`，JSON 请求体会被序列化并设置 `Content-Type: application/json; charset=UTF-8`。

登录验证使用显式候选 `cookie`，不会先把未验证的 Cookie 写入 SecretStorage。普通请求收到 `Set-Cookie` 时，HTTP 层会尝试按响应 URL 合并回 SecretStorage；显式提供 `cookie` 的验证请求不会触发此合并。Cookie 匹配和合并规则见 [`cookie.service.ts`](../src/service/cookie.service.ts)，请求实现见 [`http.service.ts`](../src/service/http.service.ts)。

扩展启动后仅在存在可用于 `/api/v4/me` 的已保存 Cookie 时，异步查询账号并恢复左侧显示的用户名，不阻塞命令注册。登录/退出改变 `ProfileService` 状态后，左侧操作列表与标题栏按钮随之切换。执行 `zhihu.logout` 会清除 SecretStorage Cookie、删除独立浏览器 Profile、清空内存账号与 HTTP 缓存；若删除浏览器数据失败，仍会清空当前内存登录状态并提示警告。

## 4. Markdown 到文章请求

`zhihu.publish` 和 `zhihu.drafts` 都进入 `PublishService.publish()`，区别是传入的 `draft` 分别为 `false`、`true`。当前编辑器内容先由 `markdown-it`、`markdown-it-zhihu-common` 和 `markdown-it-meta` 解析；图片 token及链接卡片的 `data-image` 由 `PipeService` 调用 `PasteService` 转为知乎图片地址，再渲染为 HTML，并附加 WPL/s 署名段落。没有 front matter 时会提示并插入示例模板；这项检查发生在渲染和图片处理之后。

文章相关的 front matter 示例：

```md
---
title: 文章标题
zhihu-title-image: ./cover.png
zhihu-tags: Markdown, 写作
---
正文
```

`title` 缺失时弹框要求输入；`zhihu-title-image` 会先尝试上传并替换为知乎图片地址；`zhihu-tags` 按半角逗号拆分。`zhihu-url` 缺失表示新建文章；其 URL 路径匹配 `/p/<数字>` 表示更新该文章。当前分流代码只检查路径格式，没有校验该 URL 的主机名。若路径是问题或回答，命令会进入另一套回答发布逻辑，而非文章接口。选专栏前会用当前账号的 `url_token` 查询专栏列表；可以选“不发布到专栏”。

文章请求均使用 `sendRequest()`，因此自动走上述 Cookie/XSRF 处理：

| 场景 | 请求顺序 | 关键请求体 |
| --- | --- | --- |
| 新建草稿 | `POST https://zhuanlan.zhihu.com/api/articles/drafts` → `PATCH /api/articles/{id}/draft` | 创建：`{"title":"h","delta_time":0}`；更新：`content`、`title`、`titleImage`、`isTitleImageFullScreen` |
| 发布新文章 | 同上，再 `PUT /api/articles/{id}/publish` | `column`、`commentPermission: "anyone"` |
| 更新已有草稿 | `PATCH /api/articles/{id}/draft` | 同上 |
| 发布已有文章更新 | 同上，再 `PUT /api/articles/{id}/publish` | 同上 |

创建草稿的 `POST` 还显式设置 `Origin: https://zhuanlan.zhihu.com`、`Referer: https://zhuanlan.zhihu.com/write`、`X-Requested-With: fetch`。标签处理会先读取 `GET /api/articles/{id}/draft` 的 `topics`，删除不在新标签中的 topic，再通过自动补全接口查找并添加新 topic。新建文章的发布响应状态低于 `300` 时，或新建草稿内容保存成功时，代码尝试将 `zhihu-url` 写回当前编辑器的 front matter。文章接口与实现见 [`publish.service.ts`](../src/service/publish.service.ts)、[`URL.ts`](../src/const/URL.ts)。

回答分支复用同一 HTTP/Cookie 机制，但目标主机是 `www.zhihu.com`：新回答为 `POST /api/v4/questions/{questionId}/answers`，更新回答为 `PUT /api/v4/answers/{answerId}`；草稿则使用 `POST` 或 `PUT /api/v4/questions/{questionId}/draft`。

图片上传另走 `POST https://api.zhihu.com/images`（`image_hash` 为图片 MD5，`source` 为 `answer`），随后按返回的上传凭据将图片传到知乎使用的 OSS；本地图片及外部图片在发布前都会经过这一路径。OSS 上传不是文章发布接口本身，但其预取请求同样由 `HttpService` 注入匹配的 Cookie。实现见 [`paste.service.ts`](../src/service/paste.service.ts)。

## 5. 当前实现的边界

- `Cookie` 是会话凭据，文档、日志和 issue 中都不应粘贴其值；独立浏览器 Profile 与 VS Code SecretStorage 都应视为敏感数据。退出登录会尝试删除两者，但不能使知乎服务端的会话失效。
- 发布命令没有单独的“已登录”前置校验，认证与否由接口请求结果体现。`HttpService` 在网络/解析异常时记录错误并返回 `null`；草稿创建、内容保存和发布请求会检查空响应与 HTTP 状态，并给出错误提示。但发布任务通过零延迟定时器执行，“命令已触发”仍不等于“文章已成功发布”。
- 标签更新调用未等待完成，部分标签子请求也没有逐一检查 HTTP 状态；剪贴板图片上传由子进程回调启动，命令可能先于上传完成返回。发布前应核对知乎页面中的正文、图片和标签。`EventService` 将发布事件写到扩展目录的 `events.json`；重启后的事件恢复路径目前统一调用“新建文章”，不能视作原操作的精确重放。
- 本项目依赖知乎当前的网页接口及其 Cookie 登录态；知乎更改接口、登录校验或防护策略时，这套流程可能需要调整。
