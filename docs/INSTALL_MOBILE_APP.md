# 手机安装版发布说明

这个项目已经是可安装的 PWA App。手机要真正安装它，需要满足两个条件：

1. 应用必须通过 HTTPS 地址访问。
2. 手机浏览器能读取到 `manifest.webmanifest` 和 `service-worker.js`。

本仓库已经提供这些文件，并补好了生产启动入口。

## 推荐发布方式

把仓库发布到任意支持 Node 或 Docker 的 HTTPS 托管平台即可。平台需要提供：

- HTTPS 域名。
- 一个持久化数据目录，用来保存 `data/db.json` 和上传照片。
- 环境变量配置。

生产环境变量建议：

```text
HOST=0.0.0.0
PORT=5173
DATA_DIR=/data
JWT_SECRET=换成一段足够长的随机字符串
AMAP_KEY=你的高德 Web JS API Key
AMAP_SECURITY_CODE=你的高德 JS 安全密钥
```

如果平台使用 Docker，直接使用仓库根目录的 `Dockerfile`。容器会暴露 `5173` 端口，并把数据保存到 `/data`。

## 发布后安装

拿到 HTTPS 地址后，例如：

```text
https://your-memory-map.example.com
```

### iPhone

1. 用 Safari 打开 HTTPS 地址。
2. 点击分享按钮。
3. 选择“添加到主屏幕”。
4. 点击“添加”。

### Android

1. 用 Chrome 打开 HTTPS 地址。
2. 浏览器提示“安装应用”时点击安装。
3. 如果没有自动提示，打开右上角菜单，选择“安装应用”或“添加到主屏幕”。

## 本地预览和真正安装的区别

`http://127.0.0.1:5173` 只适合电脑本地开发。手机无法用这个地址访问你的电脑应用。

局域网地址例如 `http://192.168.x.x:5173` 可以用于手机预览，但通常不能触发完整 PWA 安装，因为手机浏览器一般要求 HTTPS。

所以最终要给手机安装，请使用 HTTPS 部署地址。
