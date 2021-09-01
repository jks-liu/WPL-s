![在VS Code中搜索`zhihu`](./res/media/vs-code-extension-search-zhihu-this.png)

# WPL/s v0.4.0发布 - 支持参考文献 - 让你在VS Code中编写发布知乎文章及回答问题
```md
用[^n]来引用。

[^n]: https://网址.com 说明文字

注意字符 ^ 不能少。冒号后面有一个空格。网址中不能有空格。网址和说明文字之间有一个空格，说明文字自己可以有空格。
```

# WPL/s - 让你在VS Code中编写发布知乎文章及回答问题

这是一个开源项目，你可以在[jks-liu.WPL-s@Github](https://github.com/jks-liu/WPL-s)上找到它。

本项目源于牛岱的开源项目（开源协议：MIT）[VSCode-Zhihu](https://github.com/niudai/VSCode-Zhihu)，在此表示感谢。原项目貌似已不再维护，我在此接力。

插件图标来自[Google Material icons](https://fonts.google.com/icons?icon.query=coffee)，在 [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0.html)下授权。

# 安装
在VS Code中搜索`zhihu`，安装即可，如下图。虽然目前排在最后一个:cry:。

![在VS Code中搜索`zhihu`](./res/media/vs-code-extension-search-zhihu.png)

# 支持的功能

测试使用[这个markdown文件](https://github.com/jks-liu/zhihu/blob/master/WPLs-introduction-and-test.md)，测试结果可以查看[这篇知乎专栏文章](https://zhuanlan.zhihu.com/p/390528313)。

| Markdown基础功能 | 支持与否 |
| :--- | :--- |
| 标题 | :heavy_check_mark: *1 |
| 分割线 | :heavy_check_mark: |
| 引用 | :heavy_check_mark: |
| 链接 | :heavy_check_mark: |
| 图片 | :heavy_check_mark: |
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
| 目录 | :x: *0 |
| 章节标题自动编号 | :x: *0 |
| Emoji表情 | :heavy_check_mark: *5 |
| 任务列表 | :heavy_check_mark: |


| 知乎特色功能 | 支持与否 |
| --- | --- |
| 回答问题 | :heavy_check_mark: |
| 发布文章 | :heavy_check_mark: |
| 题图 | :heavy_check_mark: |
| 链接卡片 | :x: *0 |
| 视频 | :x: |
| 好物推荐 | :x: |
| 附件 | :x: |
| 标签 | :x: *0 |
| 草稿 | :x: |
| 赞赏 | :x: |
| 追更 | :x: |

0. 打算近期支持，star，点赞，收藏，一键三连给我动力呀
1. 最多可支持4级标题
2. 表格暂时不支持对齐
3. 知乎本身不支持，请大家踊跃向[知乎小管家](https://www.zhihu.com/people/zhihuadmin)提意见
4. 格式如下：
   ```md
    用[^n]来引用。

   [^n]: https://网址.com 说明文字

   注意字符 ^ 不能少。冒号后面有一个空格。网址中不能有空格。网址和说明文字之间有一个空格，说明文字自己可以有空格。
   ```
5. 支持大部分Emoji（很多emoji刚发的时候可以看到，但一段时间过后就会被知乎过滤掉），具体列表请查看上面的链接。

# 使用方法

## 登录
点击左上角登录按钮，用知乎扫描二维码。

## 发布文章
点击右上角发布按钮。

## Markdown语法
自行Google，或查看上面的测试文件。

## 知乎文章题图
在第一个一级标题前的图片会被当做题图。

## Emoji表情
语法和Github中使用Emoji一样，自行Google或查看上面的测试文件。

# 开源协议

MIT许可，详情请查看[LICENSE](./LICENSE)。

# 贡献
欢迎提交issue和pr。
