# 情侣美食记忆地图

一个零外部依赖的移动端网页 MVP，用来记录两个人一起吃过的店、菜品、照片和备注，并把记忆落到共同地图上。

## 启动

```powershell
.\Start-App.ps1
```

如果 PowerShell 执行策略拦截脚本，也可以运行：

```powershell
.\start-app.cmd
```

打开：

```text
http://127.0.0.1:5173
```

## 测试

```powershell
.\Test-App.ps1
```

如果 PowerShell 执行策略拦截脚本，也可以运行：

```powershell
.\test-app.cmd
```

## 安装成 App

当前应用已经支持 PWA 安装。启动本地服务后，用 Chrome、Edge 或手机浏览器打开：

```text
http://127.0.0.1:5173
```

- 电脑端：浏览器地址栏出现安装图标时点击安装，也可以在浏览器菜单里选择“安装此应用”。
- Android：用 Chrome 打开后选择“添加到主屏幕”或“安装应用”。
- iPhone：用 Safari 打开后点击分享按钮，再选择“添加到主屏幕”。

安装后会以独立窗口打开，图标和启动信息来自 `app/public/manifest.webmanifest`，基础静态资源由 `app/public/service-worker.js` 缓存。

## 配置高德地图

复制 `config.example.json` 为 `config.local.json`，填入高德 Web JS API 的 Key 和安全密钥：

```json
{
  "amapKey": "你的高德 Web JS API Key",
  "amapSecurityCode": "你的高德 JS 安全密钥"
}
```

也可以用环境变量 `AMAP_KEY` 和 `AMAP_SECURITY_CODE` 配置。`config.local.json` 已加入 `.gitignore`，不会提交到仓库。

## 当前功能

- 两个用户分别注册和登录。
- 创建情侣空间，通过绑定码加入。
- 第三个人不能加入已满的情侣空间。
- 未配置高德 Key 时，地图首页以可点击离线地图方式添加记忆点。
- 配置高德 Key 后，首页自动展示最常去城市的地图、打卡点和按日期连接的美食路径。
- 首页使用独立绘制的行政区轮廓地图，可在中国、省份、常去城市之间切换，并用过渡动画展示下钻和返回；搜索选店时才临时切回详细高德地图。
- 搜索店名后先选择高德候选地点，再定位并添加记忆；城市、区县和地址会从候选地点自动保存。
- 保存店名、城市、菜品、日期、评分、是否想再去、备注和照片。
- 另一位用户刷新或切回页面后可以看到最新记忆。
- 按关键词和想再去状态筛选。
- 只能访问自己情侣空间里的记忆。

## 说明

当前实现不依赖 npm，使用 Codex 自带的 Node 运行时。
