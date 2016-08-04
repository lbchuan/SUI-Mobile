/**
 * 路由
 *
 * 路由功能将接管页面的链接点击行为，最后达到动画切换的效果，具体如下：
 *  1. 链接对应的是另一个页面，那么则尝试 ajax 加载，然后把新页面里的符合约定的结构提取出来，然后做动画切换；如果没法 ajax 或结构不符合，那么则回退为普通的页面跳转
 *  2. 链接是当前页面的锚点，并且该锚点对应的元素存在且符合路由约定，那么则把该元素做动画切入
 *  3. 浏览器前进后退（history.forward/history.back）时，也使用动画效果
 *  4. 如果链接有 back 这个 class，那么则忽略一切，直接调用 history.back() 来后退
 *
 * 路由功能默认开启，如果需要关闭路由功能，那么在 zepto 之后，msui 脚本之前设置 $.config.router = false 即可（intro.js 中会 extend 到 $.smConfig 中）。
 *
 * 可以设置 $.config.routerFilter 函数来设置当前点击链接是否使用路由功能，实参是 a 链接的 zepto 对象；返回 false 表示不使用 router 功能。
 *
 * ajax 载入新的文档时，并不会执行里面的 js。到目前为止，在开启路由功能时，建议的做法是：
 *  把所有页面的 js 都放到同一个脚本里，js 里面的事件绑定使用委托而不是直接的绑定在元素上（因为动态加载的页面元素还不存在），然后所有页面都引用相同的 js 脚本。非事件类可以通过监控 pageInit 事件，根据里面的 pageId 来做对应区别处理。
 *
 * 如果有需要
 *
 * 对外暴露的方法
 *  - load （原 loadPage 效果一致,但后者已标记为待移除）
 *  - forward
 *  - back
 *
 * 事件
 * pageLoad* 系列在发生 ajax 加载时才会触发；当是块切换或已缓存的情况下，不会发送这些事件
 *  - pageLoadCancel: 如果前一个还没加载完,那么取消并发送该事件
 *  - pageLoadStart: 开始加载
 *  - pageLodComplete: ajax complete 完成
 *  - pageLoadError: ajax 发生 error
 *  - pageAnimationStart: 执行动画切换前，实参是 event，sectionId 和 $section
 *  - pageAnimationEnd: 执行动画完毕，实参是 event，sectionId 和 $section
 *  - beforePageRemove: 新 document 载入且动画切换完毕，旧的 document remove 之前在 window 上触发，实参是 event 和 $pageContainer
 *  - pageRemoved: 新的 document 载入且动画切换完毕，旧的 document remove 之后在 window 上触发
 *  - beforePageSwitch: page 切换前，在 pageAnimationStart 前，beforePageSwitch 之后会做一些额外的处理才触发 pageAnimationStart
 *  - pageInitInternal: （经 init.js 处理后，对外是 pageInit）紧跟着动画完成的事件，实参是 event，sectionId 和 $section
 *
 * 术语
 *  - 文档（document），不带 hash 的 url 关联着的应答 html 结构
 *  - 块（section），一个文档内有指定块标识的元素
 *
 * 路由实现约定
 *  - 每个文档的需要展示的内容必需位于指定的标识（routerConfig.sectionGroupClass）的元素里面，默认是: div.page-group （注意,如果改变这个需要同时改变 less 中的命名）
 *  - 每个块必需带有指定的块标识（routerConfig.pageClass），默认是 .page
 *
 *  即，使用路由功能的每一个文档应当是下面这样的结构（省略 <body> 等）:
 *      <div class="page-group">
 *          <div class="page">xxx</div>
 *          <div class="page">yyy</div>
 *      </div>
 *
 * 另，每一个块都应当有一个唯一的 ID，这样才能通过 #the-id 的形式来切换定位。
 * 当一个块没有 id 时，如果是第一个的默认的需要展示的块，那么会给其添加一个随机的 id；否则，没有 id 的块将不会被切换展示。
 *
 * 通过 history.state/history.pushState 以及用 sessionStorage 来记录当前 state 以及最大的 state id 来辅助前进后退的切换效果，所以在不支持 sessionStorage 的情况下，将不开启路由功能。
 *
 * 为了解决 ajax 载入页面导致重复 ID 以及重复 popup 等功能，上面约定了使用路由功能的所有可展示内容都必需位于指定元素内。从而可以在进行文档间切换时可以进行两个文档的整体移动，切换完毕后再把前一个文档的内容从页面之间移除。
 *
 * 默认地过滤了部分协议的链接，包括 tel:, javascript:, mailto:，这些链接将不会使用路由功能。如果有更多的自定义控制需求，可以在 $.config.routerFilter 实现
 *
 * 注: 以 _ 开头的函数标明用于此处内部使用，可根据需要随时重构变更，不对外确保兼容性。
 *
 */
+function ($) {
    'use strict';

    if (!window.CustomEvent) {
        window.CustomEvent = function (type, config) {
            config = config || {bubbles: false, cancelable: false, detail: undefined};
            var e = document.createEvent('CustomEvent');
            e.initCustomEvent(type, config.bubbles, config.cancelable, config.detail);
            return e;
        };

        window.CustomEvent.prototype = window.Event.prototype;
    }

    var EVENTS = {
        pageLoadStart: 'pageLoadStart', // ajax 开始加载新页面前
        pageLoadCancel: 'pageLoadCancel', // 取消前一个 ajax 加载动作后
        pageLoadError: 'pageLoadError', // ajax 加载页面失败后
        pageLoadComplete: 'pageLoadComplete', // ajax 加载页面完成后（不论成功与否）
        pageAnimationStart: 'pageAnimationStart', // 动画切换 page 前
        pageAnimationEnd: 'pageAnimationEnd', // 动画切换 page 结束后
        beforePageRemove: 'beforePageRemove', // 移除旧 document 前（适用于非内联 page 切换）
        pageRemoved: 'pageRemoved', // 移除旧 document 后（适用于非内联 page 切换）
        beforePageSwitch: 'beforePageSwitch', // page 切换前，在 pageAnimationStart 前，beforePageSwitch 之后会做一些额外的处理才触发 pageAnimationStart
        pageInit: 'pageInitInternal', // 目前是定义为一个 page 加载完毕后（实际和 pageAnimationEnd 等同）
        domLoaded: 'domLoaded', // 目前是定义为一个 page 插入dom后（实际和 pageAnimationStart 等同）
        noMoreBack: 'noMoreBack'
    };

    var Util = {
        /**
         * 获取 url 的 fragment（即 hash 中去掉 # 的剩余部分）
         *
         * 如果没有则返回空字符串
         * 如: http://example.com/path/?query=d#123 => 123
         *
         * @param {String} url url
         * @returns {String}
         */
        getUrlFragment: function (url) {
            var hashIndex = url.indexOf('#');
            return hashIndex === -1 ? '' : url.slice(hashIndex + 1);
        },
        getPathname: function (url) {
            var start = url.indexOf('/', 8),
                end = url.indexOf('?');
            if (end == -1) {
                end = url.length;
            }
            return url.substring(start, end);
        },
        /**
         * 获取一个链接相对于当前页面的绝对地址形式
         *
         * 假设当前页面是 http://a.com/b/c
         * 那么有以下情况:
         * d => http://a.com/b/d
         * /e => http://a.com/e
         * #1 => http://a.com/b/c#1
         * http://b.com/f => http://b.com/f
         *
         * @param {String} url url
         * @returns {String}
         */
        getAbsoluteUrl: function (url) {
            var link = document.createElement('a');
            link.setAttribute('href', url);
            var absoluteUrl = link.href;
            link = null;
            return absoluteUrl;
        },
        /**
         * 获取一个 url 的基本部分，即不包括 hash
         *
         * @param {String} url url
         * @returns {String}
         */
        getBaseUrl: function (url) {
            var hashIndex = url.indexOf('#');
            return hashIndex === -1 ? url.slice(0) : url.slice(0, hashIndex);
        },
        /**
         * 把一个字符串的 url 转为一个可获取其 base 和 fragment 等的对象
         *
         * @param {String} url url
         * @returns {UrlObject}
         */
        toUrlObject: function (url) {
            var fullUrl = this.getAbsoluteUrl(url),
                baseUrl = this.getBaseUrl(fullUrl),
                fragment = this.getUrlFragment(url),
                pathname = this.getPathname(url);

            return {
                base: baseUrl,
                full: fullUrl,
                original: url,
                fragment: fragment,
                pathname: pathname
            };
        },
        /**
         * 判断浏览器是否支持 sessionStorage，支持返回 true，否则返回 false
         * @returns {Boolean}
         */
        supportStorage: function () {
            var mod = 'sm.router.storage.ability';
            try {
                sessionStorage.setItem(mod, mod);
                sessionStorage.removeItem(mod);
                return true;
            } catch (e) {
                return false;
            }
        }
    };

    var routerConfig = {
        sectionGroupClass: 'page-group',
        // 表示是当前 page 的 class
        curPageClass: 'page-current',
        // 用来辅助切换时表示 page 是 visible 的,
        // 之所以不用 curPageClass，是因为 page-current 已被赋予了「当前 page」这一含义而不仅仅是 display: block
        // 并且，别的地方已经使用了，所以不方便做变更，故新增一个
        visiblePageClass: 'page-visible',
        // 表示是 page 的 class，注意，仅是标志 class，而不是所有的 class
        pageClass: 'page'
    };

    var DIRECTION = {
        leftToRight: 'from-left-to-right',
        rightToLeft: 'from-right-to-left'
    };

    var theHistory = window.history;

    $.load = function () {
        // 判断页面中是否有page-group
        if ($('.' + routerConfig.sectionGroupClass)[0]) {
            // 存在，则直接初始化
            $.init();
        } else {
            // 不存在，则加载页面
            $(function () {
                $.router.load({
                    url: window.location.href,
                    ignoreCache: true,
                    ignoreSame: true,
                    direction: 'none',
                    isPushState: true
                });
            });
        }
    }

    var Router = function () {
        this.sessionNames = {
            currentState: 'sm.router.currentState',
            maxStateId: 'sm.router.maxStateId'
        };

        this._init();
        this.xhr = null;
        window.addEventListener('popstate', this._onPopState.bind(this));
    };

    /**
     * 初始化
     *
     * - 把当前文档内容缓存起来
     * - 查找默认展示的块内容，查找顺序如下
     *      1. id 是 url 中的 fragment 的元素
     *      2. 有当前块 class 标识的第一个元素
     *      3. 第一个块
     * - 初始页面 state 处理
     *
     * @private
     */
    Router.prototype._init = function () {

        this.$view = $('body');

        // 用来保存 document 的 map
        this.cache = {};
        // 保存路由state
        this.states = [];
    };

    Router.prototype.reloadPrevious = function () {
        if (this.states.length == 1) {
            return;
        }

        // 删除前一个group
        var preState = this.states[this.states.length - 2];
        this._removeDocument(preState);

        // 加载前一个
        this._addDocument(preState.pageId, preState.url, this.cache[preState.url.pathname], true);
    };

    /**
     * 切换到 url 指定的块或文档
     *
     * 如果 url 指向的是当前页面，那么认为是切换块；
     * 否则是切换文档
     *
     * @param {String} url url
     * @param {Boolean=} ignoreCache 是否强制请求不使用缓存，对 document 生效，默认是 false
     */
    Router.prototype.load = function (options) {
        if (typeof options == 'string') {
            options = {
                url: options,
                ignoreCache: false,
                ignoreSame: false,
                direction: DIRECTION.rightToLeft,
                isPushState: true
            }
        }

        options = $.extend({
            ignoreCache: false,
            ignoreSame: false,
            direction: DIRECTION.rightToLeft,
            isPushState: true
        }, options);

        if (!options.ignoreSame && this._isTheSameDocument(location.href, options.url)) {
            return;
        } else {
            if (options.history) {
                var oldCallback = options.callback;
                var that = this;
                options.callback = function () {
                    // 到指定历史页面
                    var currState = that.states[that.states.length - 1];
                    for (var i = that.states.length - 1; i >= 0; i--) {
                        if (options.history == that.states[i].url.pathname) {
                            break;
                        }
                    }
                    that._tempNoPopBack = function () {
                        theHistory.pushState(currState, '', currState.url.full);
                    };
                    theHistory.go(i - that.states.length + 1);

                    // 删除页面
                    for (var d = i + 1; d < that.states.length - 1; d++) {
                        that._removeDocument(that.states[d]);
                    }

                    // 处理this.states
                    that.states = that.states.slice(0, i + 1);
                    that.states.push(currState);

                    oldCallback && oldCallback();
                }
            }
            this._load(options);
        }
    };

    /**
     * 载入显示一个新的文档
     *
     * - 如果有缓存，那么直接利用缓存来切换
     * - 否则，先把页面加载过来缓存，然后再切换
     *      - 如果解析失败，那么用 location.href 的方式来跳转
     *
     * 注意：不能在这里以及其之后用 location.href 来 **读取** 切换前的页面的 url，
     *     因为如果是 popState 时的调用，那么此时 location 已经是 pop 出来的 state 的了
     *
     * @param {String} url 新的文档的 url
     * @param {Boolean=} ignoreCache 是否不使用缓存强制加载页面
     * @param {Boolean=} isPushState 是否需要 pushState
     * @param {String=} direction 新文档切入的方向
     * @private
     */
    Router.prototype._load = function (options) {
        var urlObj = Util.toUrlObject(options.url);
        var pathname = urlObj.pathname;

        if (options.ignoreCache) {
            delete this.cache[pathname];
        }

        var cacheDocument = this.cache[pathname];
        var context = this;

        if (cacheDocument) {
            this._doSwitchDocument(urlObj, cacheDocument, options.isPushState, options.direction, options.callback);
        } else {
            this._loadDocument(urlObj.full, {
                success: function ($doc) {
                    // cache the dom
                    context.cache[pathname] = $doc;
                    context._parseDocumentTest($doc);
                    context._doSwitchDocument(urlObj, $doc, options.isPushState, options.direction, options.callback);
                }
            });
        }
    };

    /**
     * 利用缓存来做具体的切换文档操作
     *
     * - 确定待切入的文档的默认展示 section
     * - 把新文档 append 到 view 中
     * - 动画切换文档
     * - 如果需要 pushState，那么把最新的状态 push 进去并把当前状态更新为该状态
     *
     * @param {String} url 待切换的文档的 url
     * @param {Boolean} isPushState 加载页面后是否需要 pushState，默认是 true
     * @param {String} direction 动画切换方向，默认是 DIRECTION.rightToLeft
     * @private
     */
    Router.prototype._doSwitchDocument = function (urlObj, $doc, isPushState, direction, callback) {
        if (typeof isPushState === 'undefined') {
            isPushState = true;
        }

        var $currentDoc = this.$view.find('.' + routerConfig.sectionGroupClass).last();
        var $currentSection = this._getCurrentSection();

        var curPageId = this._generateRandomId();
        var $visibleSection = this._addDocument(curPageId, urlObj, $doc);

        $currentSection[0] && $currentSection.trigger(EVENTS.beforePageSwitch, [$currentSection.data('id'), $currentSection]);

        $visibleSection.addClass(routerConfig.curPageClass);

        if (isPushState) {
            this._pushNewState(urlObj, curPageId);
        }

        this._animateDocument($currentDoc, $visibleSection.parent(), $visibleSection, direction, callback);
    };

    Router.prototype._addDocument = function (curPageId, urlObj, $doc, prepend) {
        if (prepend == undefined) {
            prepend = false;
        }

        // 复制一份html，插入
        var $newDoc = $($doc.html());
        if (prepend) {
            var $currentDoc = this.$view.find('.' + routerConfig.sectionGroupClass).last();
            $currentDoc.before($newDoc);
        } else {
            this.$view.append($newDoc);
        }

        var $visibleSection = $newDoc.find('.' + routerConfig.pageClass).eq(0);
        $visibleSection.addClass(curPageId, routerConfig.curPageClass);
        $visibleSection.data('id', curPageId);
        // 添加query参数到dom中
        var url = urlObj.base;
        var query = {};
        if (url.indexOf('?') != -1) {
            var start = url.indexOf('?'),
                end = url.indexOf('#');
            if (end == -1) {
                end = url.length;
            }
            var querys = url.substring(start + 1, end).split('&');
            for (var i = 0; i < querys.length; i++) {
                var item = querys[i].split('=');
                query[item[0]] = item[1];
            }
        }
        $visibleSection.data('query', query);
        $visibleSection.trigger(EVENTS.domLoaded, [curPageId, $visibleSection]);

        return $visibleSection;
    };

    /**
     * 链接点击load，则根据链接中的参数控制加载操作
     * @param $target
     * @private
     */
    Router.prototype._linkLoad = function ($target) {
        var ignoreCache = $target.attr('data-no-cache') === 'true';
        var url = $target.attr('href');
        var history = $target.data('history');
        this.load({
            url: url,
            ignoreCache: ignoreCache,
            history: history
        });
    }

    /**
     * 链接点击back，则根据链接中的参数控制返回操作
     * @param $target
     * @private
     */
    Router.prototype._linkBack = function ($target) {
        // 判断是否返回到指定历史页面
        var href = $target.attr('href');
        if (href && href != '#') {
            // 有链接，则跳转到指定历史页面
            this.back(href);
            return;
        }
        // 最后判断是否回退n个页面
        var n = $target.data('back');
        if (n) {
            n = n * 1;
        } else {
            // 默认回退-1
            n = -1;
        }
        this.back(n);
    }

    /**
     * 调用 history.back()
     */
    Router.prototype.back = function (option) {
        if (typeof  option == 'string') {
            this._backToUrl(option);
            return;
        }
        if (typeof option == 'number') {
            theHistory.go(option);
            return;
        }
        theHistory.go(-1);
    };

    /**
     * 调用 history.back()
     */
    Router.prototype._backToUrl = function (url) {
        // 回退到具体历史，则判断出历史第几个
        var urlObj = Util.toUrlObject(url);
        for (var i = this.states.length - 1; i >= 0; i--) {
            if (urlObj.pathname == this.states[i].url.pathname) {
                break;
            }
        }
        if (i >= 0) {
            theHistory.go(i - this.states.length + 1);
        }
    };

    /**
     * 判断两个 url 指向的页面是否是同一个
     *
     * 判断方式: 如果两个 url 的 base 形式（不带 hash 的绝对形式）相同，那么认为是同一个页面
     *
     * @param {String} url
     * @param {String} anotherUrl
     * @returns {Boolean}
     * @private
     */
    Router.prototype._isTheSameDocument = function (url, anotherUrl) {
        return Util.toUrlObject(url).base === Util.toUrlObject(anotherUrl).base;
    };

    /**
     * ajax 加载 url 指定的页面内容
     *
     * 加载过程中会发出以下事件
     *  pageLoadCancel: 如果前一个还没加载完,那么取消并发送该事件
     *  pageLoadStart: 开始加载
     *  pageLodComplete: ajax complete 完成
     *  pageLoadError: ajax 发生 error
     *
     *
     * @param {String} url url
     * @param {Object=} callback 回调函数配置，可选，可以配置 success\error 和 complete
     *      所有回调函数的 this 都是 null，各自实参如下：
     *      success: $doc, status, xhr
     *      error: xhr, status, err
     *      complete: xhr, status
     *
     * @private
     */
    Router.prototype._loadDocument = function (url, callback) {
        if (this.xhr && this.xhr.readyState < 4) {
            this.xhr.onreadystatechange = function () {
            };
            this.xhr.abort();
            this.dispatch(EVENTS.pageLoadCancel, {detail: {options: {url: url}}});
        }

        this.dispatch(EVENTS.pageLoadStart, {detail: {options: {url: url}}});

        callback = callback || {};
        var self = this;

        this.xhr = $.ajax({
            url: url,
            success: $.proxy(function (data, status, xhr) {
                // 给包一层 <html/>，从而可以拿到完整的结构
                var $doc = $('<html></html>');
                $('<div class="' + routerConfig.sectionGroupClass + '"></div>').append(data).appendTo($doc);
                callback.success && callback.success.call(null, $doc, status, xhr);
            }, this),
            error: function (xhr, status, err) {
                callback.error && callback.error.call(null, xhr, status, err);
                self.dispatch(EVENTS.pageLoadError, {detail: {options: {url: url}}});
            },
            complete: function (xhr, status) {
                callback.complete && callback.complete.call(null, xhr, status);
                self.dispatch(EVENTS.pageLoadComplete, {detail: {options: {url: url}}});
            }
        });
    };

    /**
     * 对于 ajax 加载进来的页面，把其缓存起来
     *
     * @param {String} url url
     * @param $doc ajax 载入的页面的 jq 对象，可以看做是该页面的 $(document)
     * @private
     */
    Router.prototype._parseDocumentTest = function ($doc) {
        var $innerView = $doc.find('.' + routerConfig.sectionGroupClass);

        if (!$innerView.length) {
            throw new Error('missing router view mark: ' + routerConfig.sectionGroupClass);
        }
    };

    /**
     * 从 sessionStorage 中获取保存下来的「当前状态」
     *
     * 如果解析失败，那么认为当前状态是 null
     *
     * @returns {State|null}
     * @private
     */
    Router.prototype._getLastState = function () {
        var currentState = sessionStorage.getItem(this.sessionNames.currentState);
        try {
            currentState = JSON.parse(currentState);
        } catch (e) {
            currentState = null;
        }

        return currentState;
    };

    /**
     * 把一个状态设为当前状态，保存仅 sessionStorage 中
     *
     * @param {State} state
     * @private
     */
    Router.prototype._saveAsCurrentState = function (state) {
        sessionStorage.setItem(this.sessionNames.currentState, JSON.stringify(state));
    };

    /**
     * 获取下一个 state 的 id
     *
     * 读取 sessionStorage 里的最后的状态的 id，然后 + 1；如果原没设置，那么返回 1
     *
     * @returns {number}
     * @private
     */
    Router.prototype._getNextStateId = function () {
        var maxStateId = sessionStorage.getItem(this.sessionNames.maxStateId);
        return maxStateId ? parseInt(maxStateId, 10) + 1 : 1;
    };

    /**
     * 把 sessionStorage 里的最后状态的 id 自加 1
     *
     * @private
     */
    Router.prototype._incMaxStateId = function () {
        sessionStorage.setItem(this.sessionNames.maxStateId, this._getNextStateId());
    };

    /**
     * 从一个文档切换为显示另一个文档
     *
     * @param $from 目前显示的文档
     * @param $to 待切换显示的新文档
     * @param $visibleSection 新文档中展示的 section 元素
     * @param direction 新文档切入方向
     * @private
     */
    Router.prototype._animateDocument = function ($from, $to, $visibleSection, direction, callback) {
        var sectionId = $visibleSection.data('id');


        var $visibleSectionInFrom = $from.find('.' + routerConfig.curPageClass);
        $visibleSectionInFrom.addClass(routerConfig.visiblePageClass).removeClass(routerConfig.curPageClass);

        $visibleSection.trigger(EVENTS.pageAnimationStart, [sectionId, $visibleSection]);

        if (direction == 'none') {
            callback && callback();
            $visibleSectionInFrom.removeClass(routerConfig.visiblePageClass);
            $visibleSection.trigger(EVENTS.pageAnimationEnd, [sectionId, $visibleSection]);
            // 外层（init.js）中会绑定 pageInitInternal 事件，然后对页面进行初始化
            $visibleSection.trigger(EVENTS.pageInit, [sectionId, $visibleSection]);
        } else {
            this._animateElement($from, $to, direction);
            $from.animationEnd(function () {
                $visibleSectionInFrom.removeClass(routerConfig.visiblePageClass);
                callback && callback();
            });

            $to.animationEnd(function () {
                $visibleSection.trigger(EVENTS.pageAnimationEnd, [sectionId, $visibleSection]);
                // 外层（init.js）中会绑定 pageInitInternal 事件，然后对页面进行初始化
                $visibleSection.trigger(EVENTS.pageInit, [sectionId, $visibleSection]);
            });
        }
    };

    /**
     * 切换显示两个元素
     *
     * 切换是通过更新 class 来实现的，而具体的切换动画则是 class 关联的 css 来实现
     *
     * @param $from 当前显示的元素
     * @param $to 待显示的元素
     * @param direction 切换的方向
     * @private
     */
    Router.prototype._animateElement = function ($from, $to, direction) {
        // todo: 可考虑如果入参不指定，那么尝试读取 $to 的属性，再没有再使用默认的
        // 考虑读取点击的链接上指定的方向
        if (typeof direction === 'undefined') {
            direction = DIRECTION.rightToLeft;
        }

        var animPageClasses = [
            'page-from-center-to-left',
            'page-from-center-to-right',
            'page-from-right-to-center',
            'page-from-left-to-center'].join(' ');

        var classForFrom, classForTo;
        switch (direction) {
            case DIRECTION.rightToLeft:
                classForFrom = 'page-from-center-to-left';
                classForTo = 'page-from-right-to-center';
                break;
            case DIRECTION.leftToRight:
                classForFrom = 'page-from-center-to-right';
                classForTo = 'page-from-left-to-center';
                break;
            default:
                classForFrom = 'page-from-center-to-left';
                classForTo = 'page-from-right-to-center';
                break;
        }

        $from.removeClass(animPageClasses).addClass(classForFrom);
        $to.removeClass(animPageClasses).addClass(classForTo);

        $from.animationEnd(function () {
            $from.removeClass(animPageClasses);
        });
        $to.animationEnd(function () {
            $to.removeClass(animPageClasses);
        });
    };

    /**
     * 获取当前显示的第一个 section
     *
     * @returns {*}
     * @private
     */
    Router.prototype._getCurrentSection = function () {
        return this.$view.find('.' + routerConfig.curPageClass).eq(0);
    };

    /**
     * popState 事件关联着的后退处理
     *
     * 同时在切换后把新 state 设为当前 state
     *
     * @param {State} state 新 state
     * @param {State} fromState 旧 state
     * @private
     */
    Router.prototype._back = function (state, fromState) {
        if (this.states.length == 1) {
            // no more back
            $(window).trigger(EVENTS.noMoreBack, [fromState]);
            return;
        }
        this._doRemoveDocument(state, fromState, DIRECTION.leftToRight);
        this._saveAsCurrentState(state);
    };

    /**
     * 利用缓存来做具体的切换文档操作
     *
     * - 确定待切入的文档的默认展示 section
     * - 把新文档 append 到 view 中
     * - 动画切换文档
     * - 如果需要 pushState，那么把最新的状态 push 进去并把当前状态更新为该状态
     *
     * @param {String} url 待切换的文档的 url
     * @param {Boolean} isPushState 加载页面后是否需要 pushState，默认是 true
     * @param {String} direction 动画切换方向，默认是 DIRECTION.rightToLeft
     * @private
     */
    Router.prototype._doRemoveDocument = function (state, fromState, direction) {
        // 找到当前的group
        var $currentSection = this.$view.find('.' + fromState.pageId);
        var $currentDoc = $currentSection.parent();
        // 获取旧的group
        var $visibleSection = this.$view.find('.' + state.pageId);
        var $oldDoc = $visibleSection.parent();

        $currentSection[0] && $currentSection.trigger(EVENTS.beforePageSwitch, [$currentSection.data('id'), $currentSection]);

        $visibleSection.addClass(routerConfig.curPageClass);

        var that = this;
        this._animateDocument($currentDoc, $oldDoc, $visibleSection, direction, function () {
            // 完成切换，按顺序将fromState到state之间的页面删除
            // 同时清理this.states
            while (that.states[that.states.length - 1].url.base != state.url.base) {
                var popState = that.states.pop();
                that._removeDocument(popState);
            }
        });
    };

    Router.prototype._removeDocument = function (state) {
        var $popSection = this.$view.find('.' + state.pageId);
        var $popDoc = $popSection.parent();
        $popSection.trigger(EVENTS.beforePageRemove, [$popSection.data('id'), $popSection]);
        $popDoc.remove();
        $(window).trigger(EVENTS.pageRemoved);
    };

    /**
     * popState 事件处理
     *
     * 根据 pop 出来的 state 和当前 state 来判断是前进还是后退
     *
     * @param event
     * @private
     */
    Router.prototype._onPopState = function (event) {
        if (this._tempNoPopBack) {
            this._tempNoPopBack();
            this._tempNoPopBack = undefined;
            return;
        }
        var state = event.state;
        // if not a valid state, do nothing
        if (!state || !state.pageId) {
            $(window).trigger(EVENTS.noMoreBack, [this._getLastState()]);
            return;
        }

        var lastState = this._getLastState();

        if (!lastState) {
            console.error && console.error('Missing last state when backward or forward');
            return;
        }

        if (state.id === lastState.id) {
            return;
        }

        this._back(state, lastState);
    };

    /**
     * 页面进入到一个新状态
     *
     * 把新状态 push 进去，设置为当前的状态，然后把 maxState 的 id +1。
     *
     * @param {String} url 新状态的 url
     * @param {String} sectionId 新状态中显示的 section 元素的 id
     * @private
     */
    Router.prototype._pushNewState = function (urlObj, sectionId) {
        var state = {
            id: this._getNextStateId(),
            pageId: sectionId,
            url: urlObj
        };

        theHistory.pushState(state, '', urlObj.full);
        this.states.push(state);
        this._saveAsCurrentState(state);
        this._incMaxStateId();
    };

    /**
     * 生成一个随机的 id
     *
     * @returns {string}
     * @private
     */
    var _index = 0;
    Router.prototype._generateRandomId = function () {
        return "page-" + (_index++);
    };

    Router.prototype.dispatch = function (event, options) {
        var e = new CustomEvent(event, $.extend({
            bubbles: true,
            cancelable: true
        }, options));

        //noinspection JSUnresolvedFunction
        window.dispatchEvent(e);
    };

    /**
     * 判断一个链接是否使用 router 来处理
     *
     * @param $link
     * @returns {boolean}
     */
    function isInRouterBlackList($link) {
        var classBlackList = [
            'external',
            'tab-link',
            'open-popup',
            'close-popup',
            'open-panel',
            'close-panel'
        ];

        for (var i = classBlackList.length - 1; i >= 0; i--) {
            if ($link.hasClass(classBlackList[i])) {
                return true;
            }
        }

        var linkEle = $link.get(0);
        var linkHref = linkEle.getAttribute('href');

        var protoWhiteList = [
            'http',
            'https'
        ];

        //如果非noscheme形式的链接，且协议不是http(s)，那么路由不会处理这类链接
        if (/^(\w+):/.test(linkHref) && protoWhiteList.indexOf(RegExp.$1) < 0) {
            return true;
        }

        //noinspection RedundantIfStatementJS
        if (linkEle.hasAttribute('external')) {
            return true;
        }

        return false;
    }

    /**
     * 自定义是否执行路由功能的过滤器
     *
     * 可以在外部定义 $.config.routerFilter 函数，实参是点击链接的 Zepto 对象。
     *
     * @param $link 当前点击的链接的 Zepto 对象
     * @returns {boolean} 返回 true 表示执行路由功能，否则不做路由处理
     */
    function customClickFilter($link) {
        var customRouterFilter = $.smConfig.routerFilter;
        if ($.isFunction(customRouterFilter)) {
            var filterResult = customRouterFilter($link);
            if (typeof filterResult === 'boolean') {
                return filterResult;
            }
        }

        return true;
    }

    $(function () {
        // 用户可选关闭router功能
        if (!$.smConfig.router) {
            return;
        }

        if (!Util.supportStorage()) {
            return;
        }

        var router = $.router = new Router();

        $(document).on('click', 'a', function (e) {
            var $target = $(e.currentTarget);

            var filterResult = customClickFilter($target);
            if (!filterResult) {
                return;
            }

            if (isInRouterBlackList($target)) {
                return;
            }

            e.preventDefault();

            if ($target.hasClass('back')) {
                router._linkBack($target);
            } else {
                var url = $target.attr('href');
                if (!url || url === '#') {
                    return;
                }

                router._linkLoad($target);
            }
        });
    });
}(Zepto);
