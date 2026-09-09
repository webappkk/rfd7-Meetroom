// ==================== GAS BRIDGE (GitHub Pages) ====================
// จำลอง google.script.run ให้เรียก Apps Script Web App ผ่าน fetch
// ให้ทำงานได้เหมือนเดิมทุกจุดที่โค้ดเดิมเรียก google.script.run.withSuccessHandler(...)...func(args)

(function () {
  // ชื่อ action ที่ args เป็นค่าเดี่ยว (ไม่ใช่ object) ต้อง map ชื่อ param ให้ตรงกับ routeAction ใน Code.gs
  var ARG_MAP = {
    login: ['email', 'password'],
    approveUser: ['userId', 'role'],
    rejectUser: ['userId'],
    deleteUser: ['userId'],
    deleteRoom: ['roomId'],
    updateBookingStatus: ['bookingId', 'status', 'remark'],
    deleteBooking: ['bookingId']
  };

  function argsToParams(action, args) {
    if (ARG_MAP[action]) {
      var obj = {};
      ARG_MAP[action].forEach(function (key, i) { obj[key] = args[i]; });
      return obj;
    }
    if (args.length === 0) return {};
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) return args[0];
    var obj2 = {};
    args.forEach(function (a, i) { obj2['arg' + i] = a; });
    return obj2;
  }

  function callServer(action, args, onSuccess, onFailure) {
    var params = argsToParams(action, args);
    // ตรงกับฝั่ง Code.gs: decodeURIComponent(param.params) หลัง GAS decode ให้เองชั้นนึงแล้ว
    // จึงต้อง encode 2 ชั้นจากฝั่ง client
    var encoded = encodeURIComponent(encodeURIComponent(JSON.stringify(params)));
    var url = SCRIPT_URL + '?action=' + encodeURIComponent(action) + '&params=' + encoded;

    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.success) {
          onSuccess(json.data);
        } else {
          onFailure({ message: json.error || 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
        }
      })
      .catch(function (err) {
        onFailure({ message: err.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
      });
  }

  function createRunner() {
    var successHandler = function () {};
    var failureHandler = function (err) { console.error(err); };

    var runner = {
      withSuccessHandler: function (fn) { successHandler = fn; return runner; },
      withFailureHandler: function (fn) { failureHandler = fn; return runner; }
    };

    return new Proxy(runner, {
      get: function (target, prop) {
        if (prop in target) return target[prop];
        return function () {
          var args = Array.prototype.slice.call(arguments);
          callServer(prop, args, successHandler, failureHandler);
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = createRunner();
})();
