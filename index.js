/* eslint no-var: 0 */
/* eslint no-eq-null: 0 */
/* eslint eqeqeq: 0 */
/* eslint no-redeclare: 0 */
/* eslint prefer-arrow-callback: 0 */
/* eslint object-shorthand: 0 */
/* eslint babel/no-invalid-this: 0 */
function calcDiff(holder, key, newObj, oldObj) {
  if (newObj === oldObj || newObj === undefined) {
    return;
  }

  if (newObj == null || oldObj == null || typeof newObj !== typeof oldObj) {
    holder[key] = newObj;
  } else if (Array.isArray(newObj) && Array.isArray(oldObj)) {
    if (newObj.length === oldObj.length) {
      for (var i = 0, len = newObj.length; i < len; ++i) {
        calcDiff(holder, key + '[' + i + ']', newObj[i], oldObj[i]);
      }
    } else {
      holder[key] = newObj;
    }
  } else if (typeof newObj === 'object' && typeof oldObj === 'object') {
    var newKeys = Object.keys(newObj);
    var oldKeys = Object.keys(oldObj);

    if (newKeys.length !== oldKeys.length) {
      holder[key] = newObj;
    } else {
      var allKeysSet = Object.create(null);
      for (var i = 0, len = newKeys.length; i < len; ++i) {
        allKeysSet[newKeys[i]] = true;
        allKeysSet[oldKeys[i]] = true;
      }
      if (Object.keys(allKeysSet).length !== newKeys.length) {
        holder[key] = newObj;
      } else {
        for (var i = 0, len = newKeys.length; i < len; ++i) {
          var k = newKeys[i];
          calcDiff(holder, key + '.' + k, newObj[k], oldObj[k]);
        }
      }
    }
  } else if (newObj !== oldObj) {
    holder[key] = newObj;
  }
}

function diff(newObj, oldObj) {
  var keys = Object.keys(newObj);
  var diffResult = {};
  for (var i = 0, len = keys.length; i < len; ++i) {
    var k = keys[i];
    var oldKeyPath = k.split('.');
    var oldValue = oldObj[oldKeyPath[0]];
    for (
      var j = 1, jlen = oldKeyPath.length;
      j < jlen && oldValue !== undefined;
      ++j
    ) {
      oldValue = oldValue[oldKeyPath[j]];
    }
    calcDiff(diffResult, k, newObj[k], oldValue);
  }
  return diffResult;
}

function getVmData(vm) {
  // 确保当前 vm 所有数据被同步
  var dataKeys = [].concat(
    Object.keys(vm._data || {}),
    Object.keys(vm._props || {}),
    Object.keys(vm._mpProps || {}),
    Object.keys(vm._computedWatchers || {})
  );
  return dataKeys.reduce(function(res, key) {
    res[key] = vm[key];
    return res;
  }, {});
}

function getComKey(vm) {
  return vm && vm.$attrs ? vm.$attrs.mpcomid : '0';
}

function getParentComKey(vm, res) {
  if (res === void 0) {
    res = [];
  }

  var ref = vm || {};
  var $parent = ref.$parent;
  if (!$parent) {
    return res;
  }
  res.unshift(getComKey($parent));
  if ($parent.$parent) {
    return getParentComKey($parent, res);
  }
  return res;
}

function formatVmData(vm) {
  var $p = getParentComKey(vm).join(',');
  var $k = $p + ($p ? ',' : '') + getComKey(vm);

  // getVmData 这儿获取当前组件内的所有数据，包含 props、computed 的数据
  // 改动 vue.runtime 所获的的核心能力
  var data = Object.assign(getVmData(vm), { $k: $k, $kk: $k + ',', $p: $p });
  var key = '$root.' + $k;
  var res = {};
  res[key] = data;
  return res;
}

function throttle(func, wait, options) {
  var context, args, result;
  var timeout = null;
  // 上次执行时间点
  var previous = 0;
  if (!options) {
    options = {};
  }
  // 延迟执行函数
  function later() {
    // 若设定了开始边界不执行选项，上次执行时间始终为0
    previous = options.leading === false ? 0 : Date.now();
    timeout = null;
    result = func.apply(context, args);
    if (!timeout) {
      context = args = null;
    }
  }
  return function(handle, data) {
    var now = Date.now();
    // 首次执行时，如果设定了开始边界不执行选项，将上次执行时间设定为当前时间。
    if (!previous && options.leading === false) {
      previous = now;
    }
    // 延迟执行时间间隔
    var remaining = wait - (now - previous);
    context = this;
    args = args ? [handle, Object.assign(args[1], data)] : [handle, data];
    // 延迟时间间隔remaining小于等于0，表示上次执行至此所间隔时间已经超过一个时间窗口
    // remaining大于时间窗口wait，表示客户端系统时间被调整过
    if (remaining <= 0 || remaining > wait) {
      clearTimeout(timeout);
      timeout = null;
      previous = now;
      result = func.apply(context, args);
      if (!timeout) {
        context = args = null;
      }
      // 如果延迟执行不存在，且没有设定结尾边界不执行选项
    } else if (!timeout && options.trailing !== false) {
      timeout = setTimeout(later, remaining);
    }
    return result;
  };
}

function getPage(vm) {
  var rootVueVM = vm.$root;
  var ref = rootVueVM.$mp || {};
  var mpType = ref.mpType;
  if (mpType === void 0) {
    mpType = '';
  }
  var page = ref.page;

  // 优化后台态页面进行 setData: https://mp.weixin.qq.com/debug/wxadoc/dev/framework/performance/tips.html
  if (mpType === 'app' || !page || typeof page.setData !== 'function') {
    return;
  }
  return page;
}

var throttleSetData = throttle(function(page, data) {
  page.setData(diff(data, page.data));
}, 50);

var MpvueDiffPatch = {};
MpvueDiffPatch.install = function(Vue) {
  Vue.prototype.$updateDataToMP = function() {
    var page = getPage(this);
    if (!page) {
      return;
    }

    var data = formatVmData(this);
    throttleSetData(page, data);
  };
};

module.exports = MpvueDiffPatch;
