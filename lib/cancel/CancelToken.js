'use strict';

var Cancel = require('./Cancel');

/**
 * A `CancelToken` is an object that can be used to request cancellation of an operation.
 *
 * @class
 * @param {Function} executor The executor function. 一个执行函数
 * CancelToken是一个请求取消操作的对象
 */
function CancelToken(executor) {
  if (typeof executor !== 'function') {
    throw new TypeError('executor must be a function.');
  }

   // 初始化外部的resolvePromise
  var resolvePromise;
  this.promise = new Promise(function promiseExecutor(resolve) {
    // 让外部的 resolvePromise 指向 resolve
    // 这样的话，我们执行 resolvePromise() 就相当于将Promise resolve
    resolvePromise = resolve;
  });

  // 获取上下文 这里的token即 CancelToken对象
  var token = this;

  // 当我们的executor()被执行时，我们的resolvePromise的状态也从pending变成了resolved
  executor(function cancel(message) {
    if (token.reason) {
      // Cancellation has already been requested
      // 如果CancelToken对象上已经存在reason，说明已经取消，多余的取消函数将失去作用
      return;
    }

     // 为cancelToken设置reason（一个Cancel对象）
    token.reason = new Cancel(message);

     // 在我们resolve时，触发了adapter的resolve事件。adapter
    resolvePromise(token.reason);
  });
}

/**
 * Throws a `Cancel` if cancellation has been requested.
 * // 判断请求是否已经被取消，就抛出this.reason, 也就是上面的 Cancel 对象
 */
CancelToken.prototype.throwIfRequested = function throwIfRequested() {
  if (this.reason) {
    throw this.reason;
  }
};

/**
 * Returns an object that contains a new `CancelToken` and a function that, when called,
 * cancels the `CancelToken`.
 *  CancelToken的工厂方法
 */
CancelToken.source = function source() {
  var cancel;
  var token = new CancelToken(function executor(c) {
    cancel = c;
  });
  return {
    token: token,
    cancel: cancel
  };
};

module.exports = CancelToken;
