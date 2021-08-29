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
