# 人教高中英语词卡 Android 版

完全离线的 Android WebView 应用。安装包内置 2019 人教版高中英语七册、2731 条词汇，不声明网络权限。

## 功能

- 全部词汇随机
- 收藏夹随机
- 未收藏词汇随机
- 收藏与取消收藏
- 三种模式分别保存随机队列和当前位置
- 所有数据仅保存在设备本地

## 构建

需要 JDK 17、Android SDK 35 和 Gradle 8.7：

```bash
gradle :app:assembleDebug
```

输出：`app/build/outputs/apk/debug/app-debug.apk`
