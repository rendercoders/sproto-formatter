# Sproto 协议格式化插件

[![VS Code Marketplace](https://img.shields.io/vscode-marketplace/v/your-name.sproto-formatter.svg)](https://marketplace.visualstudio.com/items?itemName=your-name.sproto-formatter)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

专为 `.sproto` 协议文件设计的格式化和语法校验工具，支持以下功能：

- ​**智能缩进**：自动对齐协议层级结构
- ​**符号校验**：检测中文标点符号（如 `：` `；`）
- ​**协议号检查**：验证协议号唯一性
- ​**类型校验**：检查字段类型是否合法

## 安装

1. 打开 VS Code
2. 进入扩展面板 (Ctrl+Shift+X)
3. 搜索 `Sproto Formatter` 并安装

## 使用

### 手动格式化
1. 打开 `.sproto` 文件
2. 按 `F1` 输入 `Format Document` 或使用快捷键 `Shift+Alt+F`

### 自动校验
保存文件时自动检查以下问题：
- ❌ 中文标点符号
- ❌ 缩进不一致
- ❌ 重复协议号

![演示动画](https://example.com/demo.gif)

## 配置项
```jsonc
// settings.json
{
  "sprotoFormatter.indentSize": 2,
  "sprotoFormatter.strictMode": true
}
```

## 开发
```bash
# 安装依赖
npm install

# 编译并调试
npm run compile && code --extension-development-path=.
```

## 协议规范参考
- 字段定义语法：`字段名 编号: 类型 # 注释`
- 协议号范围：2000-9999

## 许可证
[本项目使用 MIT 许可证](https://github.com/your-username/sproto-formatter/blob/main/LICENSE)