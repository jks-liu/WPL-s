# 知乎格式逆向

# 表格

```html
<table data-draft-node="block" data-draft-type="table" data-size="normal">
  <tbody>
    <tr>
      <th>头左</th>
      <th>头右</th>
    </tr>
    <tr>
      <td>数据左</td>
      <td>数据右</td>
    </tr>
  </tbody>
</table>
```

# 链接卡片

```html
<a
  href="https://github.com/jks-liu"
  data-draft-node="block"
  data-draft-type="link-card"
  data-image="https://pic3.zhimg.com/v2-82281f72b3da192f7568fc47492d90f9_ipico.jpg"
  data-image-width="145"
  data-image-height="145"
  >jks-liu - Overview</a
>
```

```html
<a
  href="https://zhuanlan.zhihu.com/p/390528313"
  data-draft-node="block"
  data-draft-type="link-card"
  data-image="https://pic2.zhimg.com/v2-c6dfa5adc2f6980e4382114c60236710_180x120.jpg?source=172ae18b"
  data-image-width="1024"
  data-image-height="512"
  >Jks Liu：VS Code插件WPL/s介绍及测试</a
>
```

# 标签

DELETE https://zhuanlan.zhihu.com/api/articles/101553734/topics/20053651

POST https://zhuanlan.zhihu.com/api/articles/101553734/topics

```json
{
  "introduction": "",
  "avatarUrl": "https://pic2.zhimg.com/80/da8e974dc_l.jpg?source=4e949a73",
  "name": "Zhihu学佛 话题",
  "url": "https://www.zhihu.com/topic/21672344",
  "type": "topic",
  "excerpt": "",
  "id": "21672344"
}
```

# 参考文献

```html
<p>
  <sup
    data-text="百度"
    data-url="https://baidu.com"
    data-draft-node="inline"
    data-draft-type="reference"
    data-numero="1"
    >[1]</sup
  >
</p>
<p>
  <sup
    data-text="百度"
    data-url="https://baidu.com"
    data-draft-node="inline"
    data-draft-type="reference"
    data-numero="1"
    >[1]</sup
  >
</p>
<p>
  <sup
    data-text="Google"
    data-url="https://google.com"
    data-draft-node="inline"
    data-draft-type="reference"
    data-numero="2"
    >[2]</sup
  >
</p>
<p><br /></p>
```

content: <h2>Markdown 测试专用</h2><p>#! https://zhuanlan.zhihu.com/p/101553734</p><p>测试 4</p><a data-draft-node="block" data-draft-type="mcn-link-card" data-mcn-id="1422499037739765760"></a><p>ab</p>

# 标签

首先 GET `https://zhuanlan.zhihu.com/api/articles/101553734/draft` 获得

```json
{
  "image_url": "https://pic4.zhimg.com/v2-c6dfa5adc2f6980e4382114c60236710_b.jpg",
  "updated": 1634565226,
  "copyright_permission": "need_review",
  "reviewers": [],
  "topics": [
    {
      "url": "https://www.zhihu.com/api/v4/topics/21504097",
      "type": "topic",
      "id": "21504097",
      "name": "\u6492\u53d1\u751f\u7684\u7b97\u6cd5"
    },
    {
      "url": "https://www.zhihu.com/api/v4/topics/19586973",
      "type": "topic",
      "id": "19586973",
      "name": "4A \u5e7f\u544a\u516c\u53f8"
    }
  ],
  "excerpt": "",
  "article_type": "normal",
  "excerpt_title": "",
  "summary": "\u672c\u6587\u4e13\u6587\u7528\u6765\u6d4b\u8bd5\u77e5\u4e4e\u7684\u5404\u79cd\u529f\u80fd\u3002",
  "title_image_size": { "width": 0, "height": 0 },
  "id": 101553734,
  "author": {
    "is_followed": false,
    "avatar_url_template": "https://pic2.zhimg.com/6d957ba5a_{size}.jpg",
    "uid": "30962201133056",
    "user_type": "people",
    "is_following": false,
    "url_token": "jks-liu",
    "id": "70179d5c52a3edbaa459e10e28c73748",
    "description": "",
    "name": "Jks Liu",
    "is_advertiser": false,
    "headline": "\u8bf7\u52ff\u9080\u8bf7\u6211\u56de\u7b54\u95ee\u9898",
    "gender": 0,
    "url": "/people/70179d5c52a3edbaa459e10e28c73748",
    "avatar_url": "https://pic2.zhimg.com/6d957ba5a_l.jpg",
    "is_org": false,
    "type": "people"
  },
  "url": "https://zhuanlan.zhihu.com/p/101553734",
  "comment_permission": "all",
  "settings": {
    "commercial_report_info": { "is_report": false, "commercial_types": [] },
    "table_of_contents": { "enabled": false }
  },
  "created": 1578406772,
  "content": "<p>\u672c\u6587\u4e13\u6587\u7528\u6765\u6d4b\u8bd5\u77e5\u4e4e\u7684\u5404\u79cd\u529f\u80fd\u3002</p>",
  "has_publishing_draft": false,
  "state": "published",
  "is_title_image_full_screen": false,
  "title": "\u6d4b\u8bd5\u4e13\u7528",
  "title_image": "https://pic4.zhimg.com/v2-c6dfa5adc2f6980e4382114c60236710_b.jpg",
  "type": "article_draft"
}
```

get https://zhuanlan.zhihu.com/api/autocomplete/topics?token=a&max_matches=5&use_similar=0&topic_filter=1

```json
[
  {
    "introduction": "",
    "avatar_url": "https://pica.zhimg.com/80/c02c1ee9f_l.jpg?source=4e949a73",
    "name": "4A \u5e7f\u544a\u516c\u53f8",
    "url": "https://www.zhihu.com/topic/19586973",
    "type": "topic",
    "excerpt": "",
    "id": "19586973"
  },
  {
    "introduction": "",
    "avatar_url": "https://pic1.zhimg.com/80/281aa82e7b9bf232dfbf1b3a9cf6d909_l.jpg?source=4e949a73",
    "name": "A \u80a1\u5927\u8dcc",
    "url": "https://www.zhihu.com/topic/20013362",
    "type": "topic",
    "excerpt": "",
    "id": "20013362"
  },
  {
    "introduction": "",
    "avatar_url": "https://pica.zhimg.com/80/v2-349955d95b18302d02a48c590955b61c_l.jpg?source=4e949a73",
    "name": "Sony A7",
    "url": "https://www.zhihu.com/topic/20014872",
    "type": "topic",
    "excerpt": "",
    "id": "20014872"
  },
  {
    "introduction": "",
    "avatar_url": "https://pic3.zhimg.com/80/v2-fa472d5ad9a7df0e6f5ac737c14f32ce_l.jpg?source=4e949a73",
    "name": "\u5965\u8feaA3",
    "url": "https://www.zhihu.com/topic/20008717",
    "type": "topic",
    "excerpt": "",
    "id": "20008717"
  }
]
```

添加标签 POST `https://zhuanlan.zhihu.com/api/articles/101553734/topics`

```json
{
  "introduction": "",
  "avatarUrl": "https://pic3.zhimg.com/80/281aa82e7b9bf232dfbf1b3a9cf6d909_l.jpg?source=4e949a73",
  "name": "A 股大跌",
  "url": "https://www.zhihu.com/topic/20013362",
  "type": "topic",
  "excerpt": "",
  "id": "20013362"
}
```

删除标签 DELETE `https://zhuanlan.zhihu.com/api/articles/101553734/topics/20013362`
