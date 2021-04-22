'use strict';

var utils = require('./../utils');
var settle = require('./../core/settle');
var cookies = require('./../helpers/cookies');
var buildURL = require('./../helpers/buildURL');
var buildFullPath = require('../core/buildFullPath');
var parseHeaders = require('./../helpers/parseHeaders');
var isURLSameOrigin = require('./../helpers/isURLSameOrigin');
var createError = require('../core/createError');

module.exports = function xhrAdapter(config) {
  return new Promise(function dispatchXhrRequest(resolve, reject) {
     // 初始化数据和请求头
    var requestData = config.data;
    var requestHeaders = config.headers;
    var responseType = config.responseType;

     // 对于FormData，Content-Type 由浏览器自行设定
    if (utils.isFormData(requestData)) {
      delete requestHeaders['Content-Type']; // Let the browser set it
    }

    // 通过 XMLHttpRequest 构造函数 生成 XHR 对象
    var request = new XMLHttpRequest();

    // HTTP basic authentication
    // 鉴权使用
    //在HTTP中，Basic Authorization基本认证是一种用来允许Web浏览器或其他客户端程序在请求时提供用户名和口令形式的身份凭证的一种登录验证方式。
    if (config.auth) {
      var username = config.auth.username || '';
      var password = config.auth.password ? unescape(encodeURIComponent(config.auth.password)) : '';
      requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
    }

     // 根据BaseUrl和后缀来拼接URL
    var fullPath = buildFullPath(config.baseURL, config.url);

    // 准备了一个异步的 request(只是准备、没有发送)
    request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);

    // Set the request timeout in MS
     // 设置超时时间 （单位为毫秒）
    request.timeout = config.timeout;

    function onloadend() {
      if (!request) {
        return;
      }
      // Prepare the response
      // 获取响应头
      var responseHeaders = 'getAllResponseHeaders' in request ? parseHeaders(request.getAllResponseHeaders()) : null;
      // 获取响应数据
      var responseData = !responseType || responseType === 'text' ||  responseType === 'json' ?
        request.responseText : request.response;
      var response = {
        data: responseData,
        status: request.status,
        statusText: request.statusText,
        headers: responseHeaders,
        config: config,
        request: request
      };

      // 处理 promise
      settle(resolve, reject, response);

      // Clean up request
      // 清理请求对象
      request = null;
    }

    if ('onloadend' in request) {
      // Use onloadend if available
      request.onloadend = onloadend;
    } else {
      /**
       * 扩展
       *  readyState - 请求的阶段
       *  0：未初始化 (Uninitialized)。尚未调用 open()方法。
          1：已打开 (Open)。已调用 open()方法，尚未调用 send()方法。
          2：已发送 (Sent)。已调用 send()方法，尚未收到响应。
          3：接收中 (Receiving)。已经收到部分响应。
          4：完成 (Complete)。已经收到所有响应
       */

      // Listen for ready state to emulate onloadend
      // 每次 readyState 从一个值变成另一个值，都会触发 readystatechange 事件
      // 监听 readystatechange 事件
      request.onreadystatechange = function handleLoad() {
        if (!request || request.readyState !== 4) {
          return;
        }

        // The request errored out and we didn't get a response, this will be
        // handled by onerror instead
        // With one exception: request that using file: protocol, most browsers
        // will return status as 0 even though it's a successful request
        // 该请求出错了，我们没有得到响应, 将由 onerror 处理
      // 本地文件传输协议除外，它即使请求成功，也会返回状态为 0
        if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
          return;
        }
        // readystate handler is calling before onerror or ontimeout handlers,
        // so we should call onloadend on the next 'tick'
        setTimeout(onloadend);
      };
    }

    // Handle browser request cancellation (as opposed to a manual cancellation)
    // 处理下面的状态：
    // 请求被取消，更确切地来说，是非正常的取消（相对于手动取消）
    //它的readyState将被置为 XMLHttpRequest.UNSENT，并且请求的status置为 0
    request.onabort = function handleAbort() {
      if (!request) {
        return;
      }

      reject(createError('Request aborted', config, 'ECONNABORTED', request));

      // Clean up request
      request = null;
    };

    // Handle low level network errors
    // 处理一些底层的网络错误，这些错误的具体内容被浏览器所隐藏 抛出一个笼统的 Network Error
    request.onerror = function handleError() {
      // Real errors are hidden from us by the browser
      // onerror should only fire if it's a network error
      reject(createError('Network Error', config, null, request));

      // Clean up request
      request = null;
    };

    // Handle timeout
    // 处理超时
    request.ontimeout = function handleTimeout() {
      var timeoutErrorMessage = 'timeout of ' + config.timeout + 'ms exceeded';
      if (config.timeoutErrorMessage) {
        timeoutErrorMessage = config.timeoutErrorMessage;
      }
      reject(createError(
        timeoutErrorMessage,
        config,
        config.transitional && config.transitional.clarifyTimeoutError ? 'ETIMEDOUT' : 'ECONNABORTED',
        request));

      // Clean up request
      request = null;
    };

    // 添加xsrf头
    // 仅在标准浏览器环境中运行时才能执行此操作。
    // 例如 web worker 和 react-native 之类，则不会
    // Add xsrf header
    // This is only done if running in a standard browser environment.
    // Specifically not if we're in a web worker, or react-native.

    //判断是否在标准浏览器环境。
    if (utils.isStandardBrowserEnv()) {
      // Add xsrf header
      //生成 XSRF 请求头的值。
      /*用户配置中是否传入了withCredentials (跨域请求凭证),通过 isURLSameOrigin(fullPath)确定URL是否与当前位置具有相同的来源 */
      //当两个条件有一个满足时，检查xsrfCookieName(用作 xsrf token 的值的cookie的名称)，如果存在，通过cookies.read()读取这个cookie，否则置为undefined
      var xsrfValue = (config.withCredentials || isURLSameOrigin(fullPath)) && config.xsrfCookieName ?
        cookies.read(config.xsrfCookieName) :
        undefined;

      //经过上面的赋值，如果最终的值存在，则设置请求头，请求头的名称由配置config.xsrfHeaderName决定
      if (xsrfValue) {
        requestHeaders[config.xsrfHeaderName] = xsrfValue;
      }
    }

    // Add headers to the request
    // 添加请求头
    // 对每个请求头执行 setRequestHeader 函数
    if ('setRequestHeader' in request) {
      utils.forEach(requestHeaders, function setRequestHeader(val, key) {
        if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
          // Remove Content-Type if data is undefined
          // 如果数据未定义，则删除Content-Type
          delete requestHeaders[key];
        } else {
          // Otherwise add header to the request
          // 否则，将标头添加到请求中
          request.setRequestHeader(key, val);
        }
      });
    }

    // Add withCredentials to request if needed
    // 默认情况下，跨源请求不提供凭据（ cookie、 HTTP 认证和客户端 SSL 证书）。可以通过将withCredentials 属性设置为 true 来表明请求会发送凭据。
    if (!utils.isUndefined(config.withCredentials)) {
      request.withCredentials = !!config.withCredentials;
    }

    // Add responseType to request if needed
    // 如果用户设置了响应类型，则处理之。
    // 主要的响应类型列举如下：
    // "arraybuffer" "blob" "document" "json" "text";
    if (responseType && responseType !== 'json') {
      request.responseType = config.responseType;
    }

    // Handle progress if needed
    // 下载事件  我们可以通过这个属性来实现对下载进度的监控。
    if (typeof config.onDownloadProgress === 'function') {
      request.addEventListener('progress', config.onDownloadProgress);
    }

    // Not all browsers support upload events
    // 上传事件，注意: 并非所有浏览器都支持上传事件
    // 我们可以通过这个属性来实现对上传进度的监控。
    if (typeof config.onUploadProgress === 'function' && request.upload) {
      request.upload.addEventListener('progress', config.onUploadProgress);
    }
    
    // CancelToken的Promise在适配器中被添加处理程序
    if (config.cancelToken) {
      // Handle cancellation
      //处理取消行为
      config.cancelToken.promise.then(function onCanceled(cancel) {
        if (!request) {
          return;
        }

        // 通过执行XMLHttpRequest.abort()，我们达到了终止请求的目的，在之后我们执行reject来改变适配器的Promise的状态
        request.abort();
        reject(cancel);
        // Clean up request
        request = null;
      });
    }

    if (!requestData) {
      requestData = null;
    }

    // Send the request
    // 发送请求
    request.send(requestData);
  });
};
