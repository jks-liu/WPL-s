# WPL/s

Write-Publish-Loop w/ statistic.

This code is based on <https://github.com/niudai/VSCode-Zhihu> by 牛岱 under MIT license. That repo seems no longer maintained, so I will continue work here.

Project icon is from [Google Material icons](https://fonts.google.com/icons?icon.query=coffee) licensed under [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0.html)

# Development & contribute

## Notes & useful link

Zhihu text edit is based on [Draft.js](https://draftjs.org). ref: [这是一篇关于知乎编辑器的专栏文章](https://zhuanlan.zhihu.com/p/31559179).

[drmingdrmer/md2zhihu](https://github.com/drmingdrmer/md2zhihu)) converts markdown to zhihu compatible format. 

# Post from browser for getting format

## Tag

## Foot note

```html
content: <p>建议大家在说一段代码是UB之前，不说查看一下标准原文，最少也Google一下。</p><p><br></p><p>我看了一下C11标准，这段代码应该不是UB，所以我倾向于这是GCC的一个bug。并且我用最新的GCC11试了上面的例子，也无法复现，说明这个bug很大可能已经被修复了。</p><p><br></p><p>下面是标准原文<sup data-text="ISO/IEC 9899:201x" data-url="http://www.open-std.org/jtc1/sc22/wg14/www/docs/n1548.pdf" data-draft-node="inline" data-draft-type="reference" data-numero="1">[1]</sup>Section 6.9.1, P174-12：</p><blockquote>If the <code>}</code> that terminates a function is reached, <b>and the value of the function call is used by the caller</b>, the behavior is undefined.</blockquote><p>注意我标粗的那一句，用的是<code>and</code>。意味着只有在返回值被使用的时候才是UB，显然题主不是这个情况。</p>
```

## Table

## 好物推荐

## 打赏

## link to info block

```html
content: <p>本文系抛砖引玉，主要是探索一下最新的C++ 20协程（C++ 20 Coroutine）在线程池中的应用能力。</p><h2>简介</h2><p>线程池中与C++ 20协程有关的部分主要有两点：</p><ol><li>线程池本身是使用协程实现的；</li><li>提交给线程池的任务可以是协程。</li></ol><p>需要做到上面两点，主要依赖了这样一个事实：C++ 20的协程可以在一个线程中暂停，然后在另一个线程中恢复执行。跨线程的协程暂停/恢复是很多语言/协程库所不具备的。</p><p>协程线程池的完整实现可以在<a href="https://github.com/jks-liu/coroutine-thread-pool.h">这里</a>找到。专栏文章<a href="https://zhuanlan.zhihu.com/p/375279181">《使用C++20协程（Coroutine）实现线程池》</a>也有详细介绍，同时这篇专栏还详细介绍了C++ 20协程，对协程不了解的朋友可以参考。</p><a href="https://github.com/jks-liu/coroutine-thread-pool.h" data-draft-node="block" data-draft-type="link-card">https://github.com/jks-liu/coroutine-thread-pool.h</a><a href="https://zhuanlan.zhihu.com/p/375279181" data-draft-node="block" data-draft-type="link-card">Jks Liu：使用C++20协程（Coroutine）实现线程池</a><h2>核心介绍</h2><p>线程池的核心是将一个任务（task）协程化，并保存其句柄供线程池恢复执行。</p><pre lang="cpp">template &lt;std::invocable F&gt;<br/>    future&lt;std::invoke_result_t&lt;F&gt;&gt; submit(F task)<br/>    {<br/>        using RT = std::invoke_result_t&lt;F&gt;;<br/>        using PT = future&lt;RT&gt;::promise_type;<br/>        std::coroutine_handle&lt;PT&gt; h = co_await awaitable&lt;RT&gt;();<br/><br/>        if constexpr (std::is_void_v&lt;RT&gt;) {<br/>            task();<br/>        } else {<br/>            h.promise().set_value(task());<br/>        }<br/>    }</pre><p>其中核心语句是：<code>std::coroutine_handle&lt;PT&gt; h = co_await awaitable&lt;RT&gt;();</code>。<code>co_await</code>让任务暂停，<code>awaitable</code>则将任务句柄保存起来。</p><p>总体来说整个思路还是比较清晰的。</p><h2>例子</h2><pre lang="cpp">#include &lt;iostream&gt;<br/>#include &lt;chrono&gt;<br/>#include &lt;string&gt;<br/><br/>#include &quot;thread-pool.h&quot;<br/><br/>using namespace jks;<br/><br/>void a_ordinary_function_return_nothing()<br/>{<br/>    std::cout &lt;&lt; __func__ &lt;&lt; std::endl;<br/>}<br/><br/>std::string a_ordinary_function_return_string()<br/>{<br/>    return std::string(__func__);<br/>}<br/><br/>future&lt;void&gt; a_coroutine_return_nothing()<br/>{<br/>    co_await thread_pool::awaitable&lt;void&gt;();<br/>    std::cout &lt;&lt; __func__ &lt;&lt; std::endl;<br/>}<br/><br/>future&lt;std::string&gt; a_coroutine_return_string()<br/>{<br/>    auto h = co_await thread_pool::awaitable&lt;std::string&gt;();<br/>    h.promise().set_value(__func__);<br/>}<br/><br/><br/>std::string a_function_calling_a_coroutine()<br/>{<br/>    auto r = a_coroutine_return_string();<br/>    return r.get() + &quot; in &quot; + __func__;<br/>}<br/><br/>// You can submit your coroutine handle in your own awaitable<br/>// This implementation is a simplified version of jks::thread_pool::awaitable<br/>struct submit_awaitable: std::suspend_never<br/>{<br/>    void await_suspend(std::coroutine_handle&lt;&gt; h)<br/>    {<br/>        thread_pool::get(0).submit_coroutine(h);<br/>    }<br/>};<br/><br/>future&lt;void&gt; submit_raw_coroutine_handle()<br/>{<br/>    co_await submit_awaitable();<br/>    std::cout &lt;&lt; __func__ &lt;&lt; std::endl;<br/>}<br/><br/>int main()<br/>{<br/>    using namespace std::chrono_literals;<br/><br/>    constexpr auto n_pool = 3;<br/>    // get thread pool singleton<br/>    auto&amp; tpool = thread_pool::get(n_pool);<br/><br/>    // 任务可以是一个普通的函数<br/>    tpool.submit(a_ordinary_function_return_nothing);<br/>    auto func_return_sth = tpool.submit(a_ordinary_function_return_string);<br/><br/>    // 任务可以是一个协程<br/>    tpool.submit(a_coroutine_return_nothing);<br/>    auto coro_return_sth = tpool.submit(a_coroutine_return_string);<br/><br/>    // 任务可以是一个调用了协程的函数<br/>    auto func_calling_coro = tpool.submit(a_function_calling_a_coroutine);<br/><br/>    // 我们也可以直接提交协程句柄<br/>    submit_raw_coroutine_handle();<br/><br/>    std::this_thread::sleep_for(1s);<br/><br/>    // Lambda也是支持的<br/>    for (int i=0; i&lt;=n_pool; ++i) {<br/>        tpool.submit([i]() -&gt; int{<br/>            std::cout &lt;&lt; &quot;* Task &quot; &lt;&lt; i &lt;&lt; &#x27;+&#x27; &lt;&lt; std::endl;<br/>            std::this_thread::sleep_for(3s);<br/>            std::cout &lt;&lt; &quot;* Task &quot; &lt;&lt; i &lt;&lt; &#x27;-&#x27; &lt;&lt; std::endl;<br/>            return i;<br/>        });<br/>    }<br/>    std::this_thread::sleep_for(1s);<br/><br/>    // 最后，我们可以得到任务的执行结果<br/>    std::cout &lt;&lt; func_return_sth.get() &lt;&lt; std::endl;<br/>    std::cout &lt;&lt; coro_return_sth.get().get() &lt;&lt; std::endl;<br/>    std::cout &lt;&lt; func_calling_coro.get() &lt;&lt; std::endl;<br/><br/>    // Destructor of thread_pool blocks until tasks current executing completed<br/>    // Tasks which are still in queue will not be executed<br/>    // So above lambda example, Task 3 is not executed<br/>}</pre><p><br></p>
```

