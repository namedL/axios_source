'use strict';
/**
 * 绑定函数
 * 实现这个方法，主要是为了兼容ie 诶...
 * @param {*} fn 
 * @param {*} thisArg 
 * @returns 
 *  
 */
module.exports = function bind(fn, thisArg) {
  return function wrap() {
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    } 
    return fn.apply(thisArg, args);
  };
};


// module.exports = function bind(fn, thisArg) {
//   return function wrap() {
//     return fn.apply(thisArg, Array.from(arguments));
//   }
// }