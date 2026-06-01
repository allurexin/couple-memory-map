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
- 首页使用行政区边界感更强的地图，保留全国/省/市层级轮廓，弱化 POI 和建筑细节，突出打卡点和路径。
- 搜索店名后先选择高德候选地点，再定位并添加记忆；城市、区县和地址会从候选地点自动保存。
- 保存店名、城市、菜品、日期、评分、是否想再去、备注和照片。
- 另一位用户刷新或切回页面后可以看到最新记忆。
- 按关键词和想再去状态筛选。
- 只能访问自己情侣空间里的记忆。

## 说明

当前实现不依赖 npm，使用 Codex 自带的 Node 运行时。
