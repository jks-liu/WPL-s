---
title: WPL/s v1.3.0发布 - 支持链接卡片 - 让你在 VS Code 中编写发布知乎文章及回答问题
zhihu-title-image: ./res/media/vs-code-extension-search-zhihu-this.png
---

链接卡片格式
```
[![zhihu-link-card:本项目 GitHub 主页](./pics/vs-code-extension-search-zhihu.png)](https://github.com/jks-liu/WPL-s)
```
语法上和一个图片链接一样，但图片的文字需要以`zhihu-link-card:`开头。


# WPL/s - 让你在VS Code中编写发布知乎文章及回答问题

这是一个开源项目，你可以在[jks-liu.WPL-s@Github](https://github.com/jks-liu/WPL-s)上找到它。

[![zhihu-link-card:本项目 GitHub 主页](res/media/vs-code-extension-search-zhihu.png)](https://github.com/jks-liu/WPL-s)

本项目源于牛岱的开源项目（开源协议：MIT）[VSCode-Zhihu](https://github.com/niudai/VSCode-Zhihu)，在此表示感谢。

插件图标来自[Google Material icons](https://fonts.google.com/icons?icon.query=coffee)，在 [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0.html)下授权。

# 安装
在VS Code中搜索`zhihu`，安装即可，如下图。虽然目前排在最后一个:cry:。

![在VS Code中搜索`zhihu`](./res/media/vs-code-extension-search-zhihu.png)

# 支持的功能

测试使用[这个 Markdown 文件](https://github.com/jks-liu/zhihu/blob/master/WPLs-introduction-and-test.md)，测试结果可以查看[这篇知乎专栏文章](https://zhuanlan.zhihu.com/p/390528313)。

| Markdown基础功能 | 支持与否 |
| :--- | :--- |
| 章节标题 | :heavy_check_mark: *1 |
| 分割线 | :heavy_check_mark: |
| 引用 | :heavy_check_mark: |
| 链接 | :heavy_check_mark: *8 |
| 图片 | :heavy_check_mark: *6 |
| 表格 | :heavy_check_mark: *2 |
| 公式 | :heavy_check_mark: |
| 代码块 | :heavy_check_mark: |
| 加粗 | :heavy_check_mark: |
| 斜体 | :heavy_check_mark: |
| 加粗斜体嵌套 | :heavy_check_mark: |
| 删除线 | :x: *3 |
| 列表 | :heavy_check_mark: |
| 参考文献 | :heavy_check_mark: *4 |

| 其它特色功能 | 支持与否 |
| :--- | :--- |
| 元数据 | :heavy_check_mark: *4 |
| 目录 | :x: *0 |
| 章节标题自动编号 | :x: *0 |
| Emoji表情 | :heavy_check_mark: *5 |
| 任务列表 | :heavy_check_mark: |


| 知乎特色功能 | 支持与否 |
| --- | --- |
| 标题 | :heavy_check_mark: *7 |
| 回答问题 | :heavy_check_mark: |
| 发布文章 | :heavy_check_mark: |
| 题图 | :heavy_check_mark: *7 |
| 链接卡片 | :heavy_check_mark: *4 |
| 视频 | :x: |
| 好物推荐 | :x: |
| 附件 | :x: |
| 标签 | :x: *0 |
| 草稿 | :x: |
| 赞赏 | :x: |
| 追更 | :x: |

（0）打算近期支持，star，点赞，收藏，一键三连给我动力呀

1. 最多可支持 4 级标题
2. 表格暂时不支持对齐
3. 知乎本身不支持，请大家踊跃向[知乎小管家](https://www.zhihu.com/people/zhihuadmin)提建议
4. 格式见下一小节
5. 支持大部分Emoji（很多emoji刚发的时候可以看到，但一段时间过后就会被知乎过滤掉），具体列表请查看上面的链接。
6. - 同时支持本地图片和网络链接（暂时不支持 SVG 格式）
7. 在元数据中指定
8. 不支持为图片设置连接

# Markdown 语法文档

最直接的方法是参考[上面提到的 Markdown 测试文件](https://github.com/jks-liu/zhihu/blob/master/WPLs-introduction-and-test.md)。

## Markdown语法
自行 Google，或查看上面的测试文件。由于本项目使用 `makdown-it` 来渲染 Markdown，所以遵循 [CommonMark](https://commonmark.org/) 规范。

## [Jekyll 元数据](https://jekyllrb.com/docs/front-matter/)
目前仅支持如下元数据：
```md
---
title: 请输入标题（若是回答的话，请删除本行）
zhihu-url: 请输入知乎链接（删除本行发表新的知乎专栏文章）
zhihu-title-image: 请输入专栏文章题图（若无需题图，删除本行）
注意: 所有的冒号是半角冒号，冒号后面有一个半角空格
---
```

## 链接卡片
```md
[![zhihu-link-card:本项目 GitHub 主页](./pics/vs-code-extension-search-zhihu.png)](https://github.com/jks-liu/WPL-s)
```
语法上和一个图片链接一样，但图片的文字需要以`zhihu-link-card:`开头。

## 任务列表
```md
- [ ] 未完成的任务
- [x] 已完成的任务
    - [ ] 嵌套未完成的任务
    - [x] 嵌套已完成的任务
```

## Emoji表情
语法和 Github 中使用 Emoji 一样，自行 Google 或查看上面的测试文件。

## 参考文献
```md
   用[^n]来引用。

[^n]: https://网址.com 说明文字

注意字符 ^ 不能少。冒号后面有一个空格。网址中不能有空格。网址和说明文字之间有一个空格，说明文字自己可以有空格。
```


# 使用方法

## 登录
点击左上角登录按钮，用知乎扫描二维码。

## 发布文章
点击右上角发布按钮。


# 开源协议

MIT 许可，详情请查看[LICENSE](./LICENSE)。

# 贡献
欢迎提交 issue 和 pr。
