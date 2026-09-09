// ==================== STATE ====================
var currentUser = null;
var allBookings = [];
var allRooms = [];
var allUsers = [];
var calYear = new Date().getFullYear();
var calMonth = new Date().getMonth();
var chartMonthly = null;
var chartRooms = null;

// --- Public Calendar State ---
var pubCalYear = new Date().getFullYear();
var pubCalMonth = new Date().getMonth();
var pubBookings = [];
var pubRooms = [];

// ==================== INIT ====================
window.onload = function() {
  var hash = window.location.hash;
  
  // [FIX] เช็คค่า Session ว่าเคยล็อกอินไว้หรือไม่ (แก้ปัญหารีเฟรชแล้วหลุด)
  var storedUser = sessionStorage.getItem('currentUser');
  
  if (storedUser) {
    // ถ้าระบบจำได้ว่าเคยล็อกอินแล้ว ให้ข้ามหน้าล็อกอินและเปิดแอปเลย
    currentUser = JSON.parse(storedUser);
    showApp(); 
  } else if (SERVER_MODE === 'login' || hash === '#login') {
    // โหมดเข้าสู่ระบบ (เมื่อกดมาจากหน้าปฏิทินสาธารณะ)
    document.getElementById('publicCalendar').style.display = 'none';
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
  } else {
    // หน้าแรกปกติ (iframe หรือดูตรงๆ) → แสดงปฏิทินสาธารณะ
    document.body.classList.add('public-mode');
    showPublicCalendar();
  }

  // ตั้งค่าวันที่ขั้นต่ำสำหรับการจองให้เป็นวันนี้
  var todayStr = new Date().toISOString().split('T')[0];
  var dateInputs = document.querySelectorAll('input[type="date"]');
  dateInputs.forEach(function(el) {
    if (el.id === 'bookingDate') el.min = todayStr;
  });

  // อัปเดตวันที่บน Topbar ทันที และตั้งเวลาอัปเดตอัตโนมัติ
  updateTopbarDate();
  setInterval(updateTopbarDate, 60000);
};

function updateTopbarDate() {
  var now = new Date();
  var opts = { weekday:'long', year:'numeric', month:'long', day:'numeric' };
  var topbarDateEl = document.getElementById('topbarDate');
  if(topbarDateEl) {
      topbarDateEl.textContent = now.toLocaleDateString('th-TH', opts);
  }
}

// ==================== PUBLIC CALENDAR ====================
function showPublicCalendar() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('publicCalendar').style.display = 'flex';
  document.getElementById('publicCalendar').style.flexDirection = 'column';

  var now = new Date();
  var opts = { weekday:'long', year:'numeric', month:'long', day:'numeric' };
  document.getElementById('pubTopbarDate').textContent = now.toLocaleDateString('th-TH', opts);

  // อัปเดตวันที่บน Public Calendar ทุก 1 นาที
  if (window._pubDateInterval) clearInterval(window._pubDateInterval);
  window._pubDateInterval = setInterval(function() {
    var d = new Date();
    var el = document.getElementById('pubTopbarDate');
    if (el) el.textContent = d.toLocaleDateString('th-TH', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  }, 60000);

  loadPublicData();
}

function backToLogin() {
  // [GH Pages] เปิดหน้า login ของ GitHub Pages เอง แทนหน้า GAS เดิม
  var loginUrl = location.origin + location.pathname + '?mode=login';
  window.open(loginUrl, '_blank', 'noopener,noreferrer');
}

// ==================== ปรับปรุงประสิทธิภาพ: ดึงข้อมูลแบบรวบยอด ====================
function loadPublicData() {
  showLoading(true);
  
  // ใช้ getAllData() ดึงข้อมูลทุกอย่างรวดเดียว ลดเวลาการรอ Server
  google.script.run
    .withSuccessHandler(function(data) {
      pubRooms = data.rooms || [];
      pubBookings = (data.bookings || []).filter(function(b) {
        return b.status === 'Approved' || b.status === 'Pending';
      });
      
      // อัปเดตตัวกรองห้อง
      var sel = document.getElementById('pubRoomFilter');
      if(sel) {
        sel.innerHTML = '<option value="">-- ทุกห้อง --</option>';
        pubRooms.filter(function(r){ return r.status === 'Active'; }).forEach(function(r) {
          sel.innerHTML += '<option value="' + r.id + '">' + escapeHtml(r.name) + '</option>';
        });
      }

      showLoading(false);
      renderPublicCalendar();
      if(typeof renderPubTodayTable === 'function') renderPubTodayTable();
      if(typeof renderPubRoomList === 'function') renderPubRoomList();
    })
    .withFailureHandler(function(err) {
      showLoading(false);
      showToast('error', 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    })
    .getAllData();
}

function renderPublicCalendar() {
  var thMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  document.getElementById('pubCalMonthTitle').textContent = thMonths[pubCalMonth] + ' ' + (pubCalYear + 543);

  var grid = document.getElementById('pubCalendarGrid');
  grid.innerHTML = '';

  var roomFilter = document.getElementById('pubRoomFilter').value;

  var days = ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
  days.forEach(function(d) {
    var el = document.createElement('div');
    el.className = 'cal-day-header'; el.textContent = d;
    grid.appendChild(el);
  });

  var firstDay = new Date(pubCalYear, pubCalMonth, 1).getDay();
  var daysInMonth = new Date(pubCalYear, pubCalMonth + 1, 0).getDate();
  var today = new Date();
  var prevDays = new Date(pubCalYear, pubCalMonth, 0).getDate();

  for (var i = firstDay - 1; i >= 0; i--) {
    var el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.innerHTML = '<div class="cal-day-num" style="color:#a0aec0;">' + (prevDays - i) + '</div>';
    grid.appendChild(el);
  }

  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = pubCalYear + '-' + String(pubCalMonth + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    var el = document.createElement('div');
    el.className = 'cal-day';
    el.style.cursor = 'default';
    if (today.getFullYear() === pubCalYear && today.getMonth() === pubCalMonth && today.getDate() === d) {
      el.classList.add('today');
    }

    var dayBookings = pubBookings.filter(function(b) {
      return b.date === dateStr && (!roomFilter || b.roomId === roomFilter);
    });

    var html = '<div class="cal-day-num">' + d + '</div>';
    dayBookings.slice(0, 3).forEach(function(b) {
      var room = pubRooms.find(function(r) { return r.id === b.roomId; });
      var roomName = room ? room.name : b.roomId;
      var tip = roomName + ' | ' + b.startTime + '-' + b.endTime + ' | ' + b.title;
      html += '<div class="cal-event ' + b.status.toLowerCase() + '" title="' + escapeHtml(tip) + '">' +
              b.startTime + ' ' + escapeHtml(b.title) + '</div>';
    });
    if (dayBookings.length > 3) {
      html += '<div style="font-size:10px;color:#718096;">+' + (dayBookings.length - 3) + ' รายการ</div>';
    }
    el.innerHTML = html;
    grid.appendChild(el);
  }
}

function pubChangeMonth(dir) {
  pubCalMonth += dir;
  if (pubCalMonth > 11) { pubCalMonth = 0; pubCalYear++; }
  if (pubCalMonth < 0) { pubCalMonth = 11; pubCalYear--; }
  renderPublicCalendar();
}

function renderPubTodayTable() {
  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  var todayBookings = pubBookings.filter(function(b) { return b.date === todayStr; });
  var tbody = document.getElementById('pubTodayTable');

  if (todayBookings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#718096;padding:20px;">ไม่มีการจองวันนี้</td></tr>';
    return;
  }

  todayBookings.sort(function(a,b){ return a.startTime.localeCompare(b.startTime); });
  tbody.innerHTML = '';
  todayBookings.forEach(function(b) {
    var room = pubRooms.find(function(r) { return r.id === b.roomId; });
    tbody.innerHTML += '<tr>' +
      '<td>' + (room ? escapeHtml(room.name) : b.roomId) + '</td>' +
      '<td>' + escapeHtml(b.title) + '</td>' +
      '<td style="white-space:nowrap;">' + b.startTime + ' - ' + b.endTime + '</td>' +
      '<td>' + getStatusBadge(b.status) + '</td>' +
      '</tr>';
  });
}

function renderPubRoomList() {
  var container = document.getElementById('pubRoomList');
  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  var now = today.getHours().toString().padStart(2,'0') + ':' + today.getMinutes().toString().padStart(2,'0');

  container.innerHTML = '';
  pubRooms.filter(function(r){ return r.status === 'Active'; }).forEach(function(room) {
    var busy = pubBookings.find(function(b) {
      return b.roomId === room.id && b.date === todayStr &&
             b.status === 'Approved' && b.startTime <= now && b.endTime > now;
    });
    var statusHtml = busy
      ? '<span class="status-badge status-pending" style="background:#fff0f0;color:#c53030;"><i class="fas fa-circle" style="font-size:8px;color:#e53e3e;"></i> กำลังใช้งาน</span>'
      : '<span class="status-badge status-approved"><i class="fas fa-circle" style="font-size:8px;"></i> ว่าง</span>';
    container.innerHTML +=
      '<div style="background:#f7fafc;border-radius:12px;padding:14px 18px;border:1.5px solid #e2e8f0;">' +
        '<div style="font-weight:700;font-size:14px;color:#1a3a5c;margin-bottom:6px;">' + escapeHtml(room.name) + '</div>' +
        '<div style="font-size:12px;color:#718096;margin-bottom:8px;"><i class="fas fa-users" style="margin-right:4px;"></i>' + room.capacity + ' คน' +
          (room.details ? ' &nbsp;·&nbsp; ' + escapeHtml(room.details) : '') + '</div>' +
        statusHtml +
        (busy ? '<div style="font-size:11px;color:#718096;margin-top:6px;">ถึง ' + busy.endTime + ' น.</div>' : '') +
      '</div>';
  });
}

// ==================== AUTH ====================
function doLogin() {
  var email = document.getElementById('loginEmail').value.trim();
  var password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showLoginError('กรุณากรอกอีเมลและรหัสผ่าน');
    return;
  }

  var btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังเข้าสู่ระบบ...';

  showLoading(true);
  google.script.run
    .withSuccessHandler(function(result) {
      showLoading(false);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> เข้าสู่ระบบ';
      if (result.success) {
        currentUser = result.user;
        sessionStorage.setItem('currentUser', JSON.stringify(currentUser)); // จำค่าล็อกอินไว้
        hideLoginError();
        showApp();
      } else {
        showLoginError(result.message || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      }
    })
    .withFailureHandler(function(err) {
      showLoading(false);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> เข้าสู่ระบบ';
      showLoginError('เกิดข้อผิดพลาด: ' + (err.message || 'ไม่สามารถเชื่อมต่อได้'));
    })
    .login(email, password);
}

function doLogout() {
  currentUser = null;
  allBookings = []; allRooms = []; allUsers = [];
  sessionStorage.removeItem('currentUser'); // เคลียร์ session
  // [GH Pages] รีเฟรชหน้าต่างเพื่อให้เริ่มกระบวนการใหม่ที่หน้า Login (หน้าตัวเอง ไม่ใช่ GAS)
  window.location.href = location.pathname + '?mode=login';
}

// ==================== AUTH TAB SWITCH ====================
function switchAuthTab(tab) {
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
  document.getElementById('panelLogin').classList.toggle('active', tab === 'login');
  document.getElementById('panelRegister').classList.toggle('active', tab === 'register');
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('regError').style.display = 'none';
}

// ==================== REGISTER ====================
function doRegister() {
  var name     = document.getElementById('regName').value.trim();
  var email    = document.getElementById('regEmail').value.trim();
  var password = document.getElementById('regPassword').value;
  var confirm  = document.getElementById('regPasswordConfirm').value;
  var dept     = document.getElementById('regDepartment').value.trim();
  var phone    = document.getElementById('regPhone').value.trim();

  document.getElementById('regError').style.display = 'none';

  if (!name || !email || !password) {
    showRegError('กรุณากรอกข้อมูลที่จำเป็นให้ครบ');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showRegError('รูปแบบอีเมลไม่ถูกต้อง');
    return;
  }
  if (password.length < 6) {
    showRegError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
    return;
  }
  if (password !== confirm) {
    showRegError('รหัสผ่านไม่ตรงกัน กรุณากรอกใหม่');
    return;
  }

  var btn = document.getElementById('registerBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังสมัครสมาชิก...';
  showLoading(true);

  google.script.run
    .withSuccessHandler(function(result) {
      showLoading(false);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-user-plus"></i> สมัครสมาชิก';
      if (result.success) {
        ['regName','regEmail','regPassword','regPasswordConfirm','regDepartment','regPhone'].forEach(function(id) {
          document.getElementById(id).value = '';
        });
        switchAuthTab('login');
        showToast('success', '✅ สมัครสมาชิกสำเร็จ! กรุณารอ Admin อนุมัติก่อนเข้าใช้งาน');
      } else {
        showRegError(result.message);
      }
    })
    .withFailureHandler(function(err) {
      showLoading(false);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-user-plus"></i> สมัครสมาชิก';
      showRegError('เกิดข้อผิดพลาด: ' + (err.message || 'ไม่สามารถเชื่อมต่อได้'));
    })
    .registerUser({ name: name, email: email, password: password, department: dept, phone: phone });
}

function showRegError(msg) {
  var el = document.getElementById('regError');
  document.getElementById('regErrorMsg').textContent = msg;
  el.style.display = 'flex';
}

function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('publicCalendar').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';

  document.getElementById('sidebarName').textContent = currentUser.name;
  document.getElementById('sidebarRole').textContent = getRoleLabel(currentUser.role);
  document.getElementById('sidebarAvatar').textContent = currentUser.name.charAt(0).toUpperCase();

  if (currentUser.role === 'Admin' || currentUser.role === 'Manager') {
    document.getElementById('adminMenuTitle').style.display = 'block';
    document.getElementById('allBookingsMenu').style.display = 'flex';
    if (currentUser.role === 'Admin') {
      document.getElementById('manageRoomsMenu').style.display = 'flex';
      document.getElementById('manageUsersMenu').style.display = 'flex';
      document.getElementById('settingsMenu').style.display = 'flex';
    }
  }

  loadAllData();
  loadLineOASettings(); 
  showPage('dashboard');
}

function getRoleLabel(role) {
  var labels = { Admin: 'ผู้ดูแลระบบ', Manager: 'ผู้ดูแล', User: 'ผู้ใช้งาน', Pending: 'รออนุมัติ' };
  return labels[role] || role;
}

// ==================== DATA LOADING ====================
function loadAllData() {
  showLoading(true);
  google.script.run
    .withSuccessHandler(function(data) {
      allRooms    = data.rooms    || [];
      allBookings = data.bookings || [];
      allUsers    = data.users    || [];
      showLoading(false);
      renderAll();
    })
    .withFailureHandler(function(err) {
      showLoading(false);
      showToast('error', 'โหลดข้อมูลไม่สำเร็จ: ' + (err.message || ''));
    })
    .getAllData();
}

function renderAll() {
  renderDashboard();
  renderCalendar();
  renderRooms();
  renderMyBookings();
  if (currentUser.role === 'Admin' || currentUser.role === 'Manager') {
    renderAllBookings();
    renderManageRooms();
  }
  if (currentUser.role === 'Admin') {
    renderManageUsers(); 
    loadSettingsForm();
  }
  updatePendingBadge();
}

// ==================== NAVIGATION ====================
function showPage(pageName) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });

  var page = document.getElementById('page-' + pageName);
  if (page) page.classList.add('active');

  var titles = {
    dashboard: 'Dashboard', calendar: 'ปฏิทินการจอง', rooms: 'ห้องประชุม',
    myBookings: 'การจองของฉัน', allBookings: 'รายการจองทั้งหมด',
    manageRooms: 'จัดการห้องประชุม', manageUsers: 'จัดการผู้ใช้งาน', settings: 'ตั้งค่าระบบ'
  };
  document.getElementById('topbarTitle').textContent = titles[pageName] || pageName;

  var navItems = document.querySelectorAll('.nav-item');
  var navMap = { dashboard:0, calendar:1, rooms:2, myBookings:3, allBookings:4, manageRooms:5, manageUsers:6, settings:7 };
  if (navMap[pageName] !== undefined && navItems[navMap[pageName]]) {
    navItems[navMap[pageName]].classList.add('active');
  }

  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ==================== DASHBOARD & FILTER ====================
function renderDashboard() {
  var total = allBookings.length;
  var approved = allBookings.filter(function(b) { return b.status === 'Approved'; }).length;
  var pending = allBookings.filter(function(b) { return b.status === 'Pending'; }).length;
  var rejected = allBookings.filter(function(b) { return b.status === 'Rejected' || b.status === 'Cancelled'; }).length;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statApproved').textContent = approved;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statRejected').textContent = rejected;

  // โหลดข้อมูลเข้าตาราง (ตอนเริ่มต้น)
  filterDashboardTable('clear', null);
  
  renderCharts();
}

// [NEW] ฟังก์ชันสำหรับการกรองตารางเมื่อคลิกที่กราฟ
function filterDashboardTable(filterType, filterValue) {
  var tbody = document.getElementById('recentBookingsTable');
  tbody.innerHTML = '';

  if (filterType !== 'clear') {
    showToast('info', 'กำลังกรองข้อมูล... คลิกพื้นที่ว่างในกราฟเพื่อดูทั้งหมด');
  }

  var filteredData = allBookings.filter(function(b) {
    if (filterType === 'clear') return true;
    if (filterType === 'month') {
      var bMonth = parseInt(b.date.split('-')[1], 10) - 1;
      return bMonth === filterValue;
    }
    if (filterType === 'room') {
      var room = allRooms.find(function(r) { return r.id === b.roomId; });
      var roomName = room ? room.name : b.roomId;
      return roomName === filterValue;
    }
    return true;
  });

  // เรียงวันที่ล่าสุดขึ้นก่อน
  var sorted = filteredData.sort(function(a, b) {
    return (b.date + b.startTime).localeCompare(a.date + a.startTime);
  });
  
  var recent = sorted.slice(0, 10); // แสดงสูงสุด 10 รายการ

  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#718096;padding:30px;">ไม่มีข้อมูลการจองในส่วนที่เลือก</td></tr>';
  } else {
    recent.forEach(function(b) {
      var room = allRooms.find(function(r) { return r.id === b.roomId; });
      tbody.innerHTML += '<tr>' +
        '<td><code style="background:#f0f4f8;padding:2px 6px;border-radius:4px;font-size:11px;">' + b.id + '</code></td>' +
        '<td>' + escapeHtml(b.title) + '</td>' +
        '<td>' + (room ? escapeHtml(room.name) : b.roomId) + '</td>' +
        '<td>' + formatDateTH(b.date) + '</td>' +
        '<td>' + b.startTime + ' - ' + b.endTime + '</td>' +
        '<td>' + getStatusBadge(b.status) + '</td>' +
        '</tr>';
    });
  }
}

function renderCharts() {
  var months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  var monthData = new Array(12).fill(0);
  allBookings.forEach(function(b) {
    var parts = b.date.split('-');
    if (parts.length >= 2) {
      var m = parseInt(parts[1]) - 1;
      if (!isNaN(m) && m >= 0 && m < 12) monthData[m]++;
    }
  });

  if (chartMonthly) { chartMonthly.destroy(); chartMonthly = null; }
  var ctx1 = document.getElementById('chartMonthly').getContext('2d');
  chartMonthly = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{ label: 'จำนวนการจอง', data: monthData, backgroundColor: 'rgba(13,110,253,0.7)', borderRadius: 6 }]
    },
    options: { 
      responsive: true, 
      plugins: { legend: { display: false } }, 
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      // [FIX] เพิ่มความสามารถในการคลิกที่กราฟแท่ง
      onClick: function(evt, elements) {
        if (elements.length > 0) {
          var clickedMonthIndex = elements[0].index;
          filterDashboardTable('month', clickedMonthIndex);
        } else {
          filterDashboardTable('clear', null);
        }
      }
    }
  });

  var roomData = {};
  allBookings.filter(function(b) { return b.status !== 'Rejected' && b.status !== 'Cancelled'; }).forEach(function(b) {
    var room = allRooms.find(function(r) { return r.id === b.roomId; });
    var name = room ? room.name : b.roomId;
    roomData[name] = (roomData[name] || 0) + 1;
  });

  if (chartRooms) { chartRooms.destroy(); chartRooms = null; }
  var ctx2 = document.getElementById('chartRooms').getContext('2d');
  if (Object.keys(roomData).length === 0) {
    ctx2.clearRect(0, 0, ctx2.canvas.width, ctx2.canvas.height);
    ctx2.fillStyle = '#718096'; ctx2.textAlign = 'center'; ctx2.font = '14px Sarabun';
    ctx2.fillText('ยังไม่มีข้อมูล', ctx2.canvas.width/2, ctx2.canvas.height/2);
    return;
  }
  chartRooms = new Chart(ctx2, {
    type: 'doughnut',
    data: {
      labels: Object.keys(roomData),
      datasets: [{ data: Object.values(roomData), backgroundColor: ['#0d6efd','#38a169','#dd6b20','#e53e3e','#805ad5','#00b4d8'] }]
    },
    options: { 
      responsive: true, 
      plugins: { legend: { position: 'bottom' } },
      // [FIX] เพิ่มความสามารถในการคลิกที่กราฟโดนัท
      onClick: function(evt, elements) {
        if (elements.length > 0) {
          var index = elements[0].index;
          var clickedRoomName = this.data.labels[index];
          filterDashboardTable('room', clickedRoomName);
        } else {
          filterDashboardTable('clear', null);
        }
      }
    }
  });
}

// ==================== CALENDAR ====================
function renderCalendar() {
  var thMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  document.getElementById('calMonthTitle').textContent = thMonths[calMonth] + ' ' + (calYear + 543);

  var grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  var days = ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
  days.forEach(function(d) {
    var el = document.createElement('div');
    el.className = 'cal-day-header'; el.textContent = d;
    grid.appendChild(el);
  });

  var firstDay = new Date(calYear, calMonth, 1).getDay();
  var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  var today = new Date();
  var prevDays = new Date(calYear, calMonth, 0).getDate();

  for (var i = firstDay - 1; i >= 0; i--) {
    var el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.innerHTML = '<div class="cal-day-num" style="color:#a0aec0;">' + (prevDays - i) + '</div>';
    grid.appendChild(el);
  }

  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = calYear + '-' + String(calMonth + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    var el = document.createElement('div');
    el.className = 'cal-day';
    if (today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d) {
      el.classList.add('today');
    }

    var dayBookings = allBookings.filter(function(b) {
      return b.date === dateStr &&
        (currentUser.role !== 'User' || b.userId === currentUser.id);
    });

    var html = '<div class="cal-day-num">' + d + '</div>';
    dayBookings.slice(0, 3).forEach(function(b) {
      html += '<div class="cal-event ' + b.status.toLowerCase() + '" title="' + escapeHtml(b.title) + '">' +
              b.startTime + ' ' + escapeHtml(b.title) + '</div>';
    });
    if (dayBookings.length > 3) {
      html += '<div style="font-size:10px;color:#718096;">+' + (dayBookings.length - 3) + ' รายการ</div>';
    }

    el.innerHTML = html;
    el.onclick = (function(ds) { return function() { openDayBookingsModal(ds); }; })(dateStr);
    grid.appendChild(el);
  }
}

function changeMonth(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
}

// ==================== ROOMS ====================
function renderRooms() {
  var grid = document.getElementById('roomGrid');
  grid.innerHTML = '';
  var colors = ['blue','green','purple'];
  var icons = ['🏢','🏛️','🎯','💼','🖥️','📊'];

  if (allRooms.length === 0) {
    grid.innerHTML = '<p style="color:#718096;">ยังไม่มีห้องประชุม</p>';
    return;
  }

  allRooms.forEach(function(room, i) {
    var bookingCount = allBookings.filter(function(b) { return b.roomId === room.id && b.status === 'Approved'; }).length;
    var isInactive = room.status !== 'Active';
    grid.innerHTML += '<div class="room-card' + (isInactive ? ' inactive' : '') + '" onclick="' + (isInactive ? '' : 'openBookingModal(\'' + room.id + '\')') + '">' +
      '<div class="room-card-img ' + colors[i % colors.length] + '">' + icons[i % icons.length] + '</div>' +
      '<div class="room-card-body">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
          '<div class="room-card-name">' + escapeHtml(room.name) + '</div>' +
          (isInactive ? '<span class="status-badge status-inactive">ปิดบริการ</span>' : '') +
        '</div>' +
        '<div class="room-card-detail">' + escapeHtml(room.details || 'ห้องประชุมมาตรฐาน') + '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;">' +
          '<span class="room-card-capacity"><i class="fas fa-users"></i> ' + room.capacity + ' คน</span>' +
          '<span style="font-size:12px;color:#718096;">' + bookingCount + ' การจอง</span>' +
        '</div>' +
      '</div>' +
      '</div>';
  });
}

// ==================== MY BOOKINGS ====================
function renderMyBookings() {
  var myBookings = allBookings.filter(function(b) { return b.userId === currentUser.id; });
  renderBookingTable('myBookingsTable', myBookings, false);
}

function filterMyBookings() {
  var search = document.getElementById('myBookingSearch').value.toLowerCase();
  var status = document.getElementById('myBookingStatus').value;
  var myBookings = allBookings.filter(function(b) {
    return b.userId === currentUser.id &&
      b.title.toLowerCase().includes(search) &&
      (status === '' || b.status === status);
  });
  renderBookingTable('myBookingsTable', myBookings, false);
}

// ==================== ALL BOOKINGS ====================
function renderAllBookings() {
  var roomFilter = document.getElementById('allBookingRoom');
  roomFilter.innerHTML = '<option value="">-- ทุกห้อง --</option>';
  allRooms.forEach(function(r) {
    roomFilter.innerHTML += '<option value="' + r.id + '">' + escapeHtml(r.name) + '</option>';
  });
  renderBookingTable('allBookingsTable', allBookings, true);
}

function filterAllBookings() {
  var search = document.getElementById('allBookingSearch').value.toLowerCase();
  var status = document.getElementById('allBookingStatus').value;
  var room = document.getElementById('allBookingRoom').value;
  var dateFilter = document.getElementById('allBookingDate').value;
  var filtered = allBookings.filter(function(b) {
    // ค้นหาจากหัวข้อ, ชื่อผู้ประสานงาน, ฝ่าย/ส่วน หรือชื่อผู้ใช้งาน
    var user = allUsers.find(function(u) { return u.id === b.userId; });
    var userName = user ? user.name.toLowerCase() : '';
    var bookerName = (b.bookerName && b.bookerName !== '-') ? b.bookerName.toLowerCase() : '';
    var dept = (b.department && b.department !== '-') ? b.department.toLowerCase() : '';
    var matchSearch = !search ||
      b.title.toLowerCase().includes(search) ||
      userName.includes(search) ||
      bookerName.includes(search) ||
      dept.includes(search);
    return matchSearch &&
      (status === '' || b.status === status) &&
      (room === '' || b.roomId === room) &&
      (dateFilter === '' || b.date === dateFilter);
  });
  renderBookingTable('allBookingsTable', filtered, true);
}

function renderBookingTable(tableId, bookings, isAdmin) {
  var tbody = document.getElementById(tableId);
  tbody.innerHTML = '';

  var cols = isAdmin ? 9 : 8;

  if (bookings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="' + cols + '" style="text-align:center;color:#718096;padding:30px;">ไม่มีข้อมูลการจอง</td></tr>';
    return;
  }

  bookings.slice().sort(function(a, b) {
    return (b.date + b.startTime).localeCompare(a.date + a.startTime);
  }).forEach(function(b) {
    var room = allRooms.find(function(r) { return r.id === b.roomId; });
    var user = allUsers.find(function(u) { return u.id === b.userId; });
    var userName = user ? user.name : b.userId;
    var deptLabel = (b.department && b.department !== '-') ? b.department : '-';

    var canEdit   = b.userId === currentUser.id && b.status === 'Pending';
    var canDelete = (b.userId === currentUser.id && (b.status === 'Pending' || b.status === 'Approved')) || currentUser.role === 'Admin';
    var canCancel = b.userId === currentUser.id && b.status === 'Approved';

    var actions = '';
    if (isAdmin && b.status === 'Pending') {
      actions += '<button class="btn btn-success btn-sm" onclick="openApproveModal(\'' + b.id + '\',\'Approved\')" title="อนุมัติ"><i class="fas fa-check"></i></button> ' +
                 '<button class="btn btn-danger btn-sm" onclick="openApproveModal(\'' + b.id + '\',\'Rejected\')" title="ไม่อนุมัติ"><i class="fas fa-times"></i></button> ';
    }
    if (canEdit) {
      actions += '<button class="btn btn-warning btn-sm" onclick="editBooking(\'' + b.id + '\')" title="แก้ไข"><i class="fas fa-edit"></i></button> ';
    }
    if (canCancel && !isAdmin) {
      actions += '<button class="btn btn-outline btn-sm" onclick="cancelBooking(\'' + b.id + '\')" title="ยกเลิกการจอง"><i class="fas fa-ban"></i></button> ';
    }
    if (currentUser.role === 'Admin' && canDelete) {
      actions += '<button class="btn btn-danger btn-sm" onclick="confirmDeleteBooking(\'' + b.id + '\')" title="ลบ"><i class="fas fa-trash"></i></button>';
    } else if (canDelete && !canCancel) {
      actions += '<button class="btn btn-danger btn-sm" onclick="confirmDeleteBooking(\'' + b.id + '\')" title="ลบ"><i class="fas fa-trash"></i></button>';
    }
    actions += ' <button class="btn btn-outline btn-sm" onclick="showBookingDetail(\'' + b.id + '\')" title="รายละเอียด"><i class="fas fa-eye"></i></button>';

    var row = '<tr>' +
      '<td><code style="background:#f0f4f8;padding:2px 6px;border-radius:4px;font-size:11px;">' + b.id + '</code></td>';

    if (isAdmin) {
      row += '<td>' + escapeHtml(userName) + '</td>';
    }

    row += '<td>' + escapeHtml(b.title) + '</td>' +
      '<td>' + (room ? escapeHtml(room.name) : b.roomId) + '</td>';

    if (isAdmin) {
      row += '<td style="font-size:12px;color:#718096;">' + escapeHtml(deptLabel) + '</td>';
    }

    row += '<td>' + formatDateTH(b.date) + '</td>' +
      '<td style="white-space:nowrap;">' + b.startTime + ' - ' + b.endTime + '</td>' +
      '<td>' + getStatusBadge(b.status) + '</td>' +
      (!isAdmin ? '<td style="font-size:12px;color:#718096;">' + escapeHtml(b.remark !== '-' ? (b.remark || '') : '') + '</td>' : '') +
      '<td style="white-space:nowrap;">' + (actions || '<span style="color:#a0aec0;font-size:12px;">-</span>') + '</td>' +
      '</tr>';

    tbody.innerHTML += row;
  });
}

// ==================== MANAGE ROOMS ====================
function renderManageRooms() {
  var tbody = document.getElementById('manageRoomsTable');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (allRooms.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#718096;padding:30px;">ยังไม่มีห้องประชุม</td></tr>';
    return;
  }

  allRooms.forEach(function(r) {
    var statusBadge = r.status === 'Active'
      ? '<span class="status-badge status-approved"><i class="fas fa-circle" style="font-size:8px;"></i> เปิดใช้งาน</span>'
      : '<span class="status-badge status-inactive"><i class="fas fa-circle" style="font-size:8px;"></i> ปิดใช้งาน</span>';

    tbody.innerHTML += '<tr>' +
      '<td><code style="background:#f0f4f8;padding:2px 6px;border-radius:4px;font-size:11px;">' + r.id + '</code></td>' +
      '<td>' + escapeHtml(r.name) + '</td>' +
      '<td>' + r.capacity + ' คน</td>' +
      '<td style="font-size:13px;">' + escapeHtml(r.details || '-') + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' +
        '<button class="btn btn-warning btn-sm" onclick="editRoom(\'' + r.id + '\')"><i class="fas fa-edit"></i></button> ' +
        '<button class="btn btn-danger btn-sm" onclick="confirmDeleteRoom(\'' + r.id + '\')"><i class="fas fa-trash"></i></button>' +
      '</td>' +
      '</tr>';
  });
}

// ==================== MANAGE USERS ====================
function renderManageUsers() {
  var tbody = document.getElementById('manageUsersTable');
  if (!tbody) return;
  tbody.innerHTML = '';

  var activeUsers = allUsers.filter(function(u) { return u.role !== 'Pending'; });

  if (activeUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#718096;padding:30px;">ยังไม่มีผู้ใช้งาน</td></tr>';
  } else {
    activeUsers.forEach(function(u) {
      tbody.innerHTML += '<tr>' +
        '<td><code style="background:#f0f4f8;padding:2px 6px;border-radius:4px;font-size:11px;">' + u.id + '</code></td>' +
        '<td>' + escapeHtml(u.name) + '</td>' +
        '<td>' + escapeHtml(u.email) + '</td>' +
        '<td style="font-size:13px;color:#718096;">' + escapeHtml(u.department || '-') + '</td>' +
        '<td><span class="status-badge ' + getRoleBadgeClass(u.role) + '">' + getRoleLabel(u.role) + '</span></td>' +
        '<td>' +
          '<button class="btn btn-warning btn-sm" onclick="editUser(\'' + u.id + '\')"><i class="fas fa-edit"></i></button> ' +
          (u.id !== currentUser.id ? '<button class="btn btn-danger btn-sm" onclick="confirmDeleteUser(\'' + u.id + '\')"><i class="fas fa-trash"></i></button>' : '<span style="font-size:11px;color:#a0aec0;">(ตัวคุณ)</span>') +
        '</td>' +
        '</tr>';
    });
  }

  renderPendingReg();
}

function renderPendingReg() {
  var pendingUsers = allUsers.filter(function(u) { return u.role === 'Pending'; });
  var section = document.getElementById('pendingRegSection');
  var list    = document.getElementById('pendingRegList');
  var count   = document.getElementById('pendingRegCount');
  if (!section || !list) return;

  if (pendingUsers.length === 0) {
    section.style.display = 'none';
    updatePendingRegBadge(0);
    return;
  }

  section.style.display = 'block';
  count.textContent = pendingUsers.length;
  updatePendingRegBadge(pendingUsers.length);

  list.innerHTML = '';
  pendingUsers.forEach(function(u) {
    list.innerHTML +=
      '<div class="pending-card">' +
        '<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;flex-shrink:0;">' +
          escapeHtml(u.name.charAt(0).toUpperCase()) +
        '</div>' +
        '<div class="pending-card-info">' +
          '<div class="pending-card-name">' + escapeHtml(u.name) + '</div>' +
          '<div class="pending-card-meta">' +
            '<i class="fas fa-envelope" style="width:14px;"></i> ' + escapeHtml(u.email) +
            (u.department && u.department !== '-' ? ' &nbsp;·&nbsp; <i class="fas fa-building" style="width:14px;"></i> ' + escapeHtml(u.department) : '') +
            (u.phone && u.phone !== '-' ? ' &nbsp;·&nbsp; <i class="fas fa-phone" style="width:14px;"></i> ' + escapeHtml(u.phone) : '') +
          '</div>' +
        '</div>' +
        '<div class="pending-card-actions">' +
          '<button class="btn btn-success btn-sm" onclick="openApproveUserModal(\'' + u.id + '\')">' +
            '<i class="fas fa-check"></i> อนุมัติ' +
          '</button>' +
          '<button class="btn btn-danger btn-sm" onclick="confirmRejectUser(\'' + u.id + '\',\'' + escapeHtml(u.name) + '\')">' +
            '<i class="fas fa-times"></i> ปฏิเสธ' +
          '</button>' +
        '</div>' +
      '</div>';
  });
}

function updatePendingRegBadge(count) {
  var badge = document.getElementById('pendingRegBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

function openApproveUserModal(userId) {
  var u = allUsers.find(function(x) { return x.id === userId; });
  if (!u) return;
  document.getElementById('approveUserId').value = userId;
  document.getElementById('approveUserRole').value = 'User';
  document.getElementById('approveUserInfo').innerHTML =
    '<b><i class="fas fa-user"></i> ' + escapeHtml(u.name) + '</b><br>' +
    '<i class="fas fa-envelope" style="width:16px;color:#718096;"></i> ' + escapeHtml(u.email) + '<br>' +
    (u.department && u.department !== '-' ? '<i class="fas fa-building" style="width:16px;color:#718096;"></i> ' + escapeHtml(u.department) + '<br>' : '') +
    (u.phone && u.phone !== '-' ? '<i class="fas fa-phone" style="width:16px;color:#718096;"></i> ' + escapeHtml(u.phone) : '');
  openModal('approveUserModal');
}

function confirmApproveUser() {
  var userId = document.getElementById('approveUserId').value;
  var role   = document.getElementById('approveUserRole').value;
  showLoading(true);
  google.script.run
    .withSuccessHandler(function(result) {
      showLoading(false);
      closeModal('approveUserModal');
      if (result.success) {
        showToast('success', result.message);
        loadAllData();
      } else {
        showToast('error', result.message);
      }
    })
    .withFailureHandler(function(err) { showLoading(false); showToast('error', err.message); })
    .approveUser(userId, role);
}

function confirmRejectUser(userId, name) {
  document.getElementById('confirmMsg').textContent = 'ปฏิเสธคำขอสมัครของ "' + name + '" และลบออกจากระบบ?';
  document.getElementById('confirmOkBtn').onclick = function() {
    showLoading(true);
    google.script.run
      .withSuccessHandler(function(result) {
        showLoading(false);
        closeModal('confirmModal');
        if (result.success) {
          showToast('success', result.message);
          loadAllData();
        } else {
          showToast('error', result.message);
        }
      })
      .withFailureHandler(function(err) { showLoading(false); showToast('error', err.message); })
      .rejectUser(userId);
  };
  openModal('confirmModal');
}

function getRoleBadgeClass(role) {
  var classes = { Admin: 'status-rejected', Manager: 'status-pending', User: 'status-approved' };
  return classes[role] || 'status-approved';
}

// ==================== BOOKING MODAL ====================
var _dayModalDate = null;

function openBookingModal(roomId, date) {
  document.getElementById('editBookingId').value = '';
  document.getElementById('bookingModalTitle').innerHTML = '<i class="fas fa-calendar-plus"></i> จองห้องประชุม';
  document.getElementById('bookingTitle').value = '';
  document.getElementById('bookingRemark').value = '';
  document.getElementById('bookingEquipment').value = '';
  document.getElementById('bookingAttendees').value = '';
  document.getElementById('bookedSlotsInfo').style.display = 'none';

  document.getElementById('bookingBookerName').value = currentUser.name || '';
  document.getElementById('bookingPhone').value = (currentUser.phone && currentUser.phone !== '-') ? currentUser.phone : '';
  document.getElementById('bookingDepartment').value = (currentUser.department && currentUser.department !== '-') ? currentUser.department : '';

  var roomSelect = document.getElementById('bookingRoom');
  roomSelect.innerHTML = '<option value="">-- เลือกห้องประชุม --</option>';
  allRooms.filter(function(r) { return r.status === 'Active'; }).forEach(function(r) {
    roomSelect.innerHTML += '<option value="' + r.id + '">' + escapeHtml(r.name) + ' (' + r.capacity + ' คน)</option>';
  });
  if (roomId) roomSelect.value = roomId;

  var todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('bookingDate').value = date || todayStr;
  document.getElementById('bookingDate').min = todayStr;
  document.getElementById('bookingStart').value = '09:00';
  document.getElementById('bookingEnd').value = '12:00';

  openModal('bookingModal');
  checkRoomAvailability();
}

function openBookingModalWithDate(dateStr) {
  openBookingModal(null, dateStr);
}

function editBooking(bookingId) {
  var b = allBookings.find(function(x) { return x.id === bookingId; });
  if (!b) return;

  document.getElementById('editBookingId').value = b.id;
  document.getElementById('bookingModalTitle').innerHTML = '<i class="fas fa-edit"></i> แก้ไขการจอง';
  document.getElementById('bookingTitle').value = b.title;
  document.getElementById('bookingRemark').value = b.remark !== '-' ? (b.remark || '') : '';
  document.getElementById('bookingDepartment').value = b.department !== '-' ? (b.department || '') : '';
  document.getElementById('bookingBookerName').value = b.bookerName !== '-' ? (b.bookerName || '') : '';
  document.getElementById('bookingPhone').value = b.phone !== '-' ? (b.phone || '') : '';
  document.getElementById('bookingAttendees').value = b.attendees !== '-' ? (b.attendees || '') : '';
  document.getElementById('bookingEquipment').value = b.equipment !== '-' ? (b.equipment || '') : '';
  document.getElementById('bookedSlotsInfo').style.display = 'none';

  var roomSelect = document.getElementById('bookingRoom');
  roomSelect.innerHTML = '<option value="">-- เลือกห้องประชุม --</option>';
  allRooms.filter(function(r) { return r.status === 'Active'; }).forEach(function(r) {
    roomSelect.innerHTML += '<option value="' + r.id + '">' + escapeHtml(r.name) + ' (' + r.capacity + ' คน)</option>';
  });
  roomSelect.value = b.roomId;

  var todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('bookingDate').value = b.date;
  document.getElementById('bookingDate').min = todayStr;
  document.getElementById('bookingStart').value = b.startTime;
  document.getElementById('bookingEnd').value = b.endTime;

  openModal('bookingModal');
  checkRoomAvailability();
}

function openDayBookingsModal(dateStr) {
  _dayModalDate = dateStr;
  var thDays = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  var thMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  var d = new Date(dateStr + 'T00:00:00');
  var dateLabel = 'วัน' + thDays[d.getDay()] + 'ที่ ' + d.getDate() + ' ' + thMonths[d.getMonth()] + ' ' + (d.getFullYear() + 543);

  document.getElementById('dayBookingsTitle').innerHTML = '<i class="fas fa-calendar-day"></i> ' + dateLabel;

  var dayBookings = allBookings.filter(function(b) {
    return b.date === dateStr &&
      b.status !== 'Rejected' && b.status !== 'Cancelled' &&
      (currentUser.role !== 'User' || b.userId === currentUser.id);
  }).sort(function(a, b) { return a.startTime.localeCompare(b.startTime); });

  var list = document.getElementById('dayBookingsList');
  var today = new Date(); today.setHours(0,0,0,0);
  var isPast = new Date(dateStr + 'T00:00:00') < today;

  var newBtn = document.getElementById('dayBookingsNewBtn');
  newBtn.style.display = isPast ? 'none' : 'inline-flex';

  if (dayBookings.length === 0) {
    list.innerHTML =
      '<div style="text-align:center;padding:40px 20px;color:#718096;">' +
        '<i class="fas fa-calendar-times" style="font-size:40px;opacity:0.3;display:block;margin-bottom:12px;"></i>' +
        '<div style="font-size:15px;font-weight:600;">ยังไม่มีการจองในวันนี้</div>' +
        (!isPast ? '<div style="font-size:13px;margin-top:6px;">คลิก "จองวันนี้" เพื่อทำการจองใหม่</div>' : '') +
      '</div>';
  } else {
    list.innerHTML = '';
    dayBookings.forEach(function(b) {
      var room = allRooms.find(function(r) { return r.id === b.roomId; });
      var roomName = room ? room.name : b.roomId;
      list.innerHTML +=
        '<div class="day-booking-item" onclick="showBookingDetail(\'' + b.id + '\')">' +
          '<div class="day-booking-time">' +
            '<i class="fas fa-clock" style="font-size:11px;opacity:0.6;"></i> ' +
            b.startTime + ' - ' + b.endTime +
          '</div>' +
          '<div class="day-booking-info">' +
            '<div class="day-booking-title">' + escapeHtml(b.title) + '</div>' +
            '<div class="day-booking-meta">' +
              '<i class="fas fa-door-open" style="width:13px;"></i> ' + escapeHtml(roomName) +
              (b.department && b.department !== '-' ? ' &nbsp;·&nbsp; <i class="fas fa-building" style="width:13px;"></i> ' + escapeHtml(b.department) : '') +
            '</div>' +
          '</div>' +
          '<div style="flex-shrink:0;">' + getStatusBadge(b.status) + '</div>' +
        '</div>';
    });
  }
  openModal('dayBookingsModal');
}

function newBookingFromDay() {
  closeModal('dayBookingsModal');
  openBookingModal(null, _dayModalDate);
}

function showBookingDetail(bookingId) {
  var b = allBookings.find(function(x) { return x.id === bookingId; });
  if (!b) return;

  var room = allRooms.find(function(r) { return r.id === b.roomId; });
  var roomName = room ? room.name : b.roomId;

  var thDays = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  var thMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  var d = new Date(b.date + 'T00:00:00');
  var dateLabel = 'วัน' + thDays[d.getDay()] + 'ที่ ' + d.getDate() + ' ' + thMonths[d.getMonth()] + ' ' + (d.getFullYear() + 543);

  var statusColors = { Approved: '#276749', Pending: '#744210', Rejected: '#742a2a', Cancelled: '#4a5568' };
  var statusBg     = { Approved: '#c6f6d5', Pending: '#fef3c7', Rejected: '#fed7d7', Cancelled: '#e2e8f0' };
  var sColor = statusColors[b.status] || '#4a5568';
  var sBg    = statusBg[b.status]    || '#e2e8f0';

  var body =
    '<div class="detail-header-bar">' +
      '<div class="detail-header-icon"><i class="fas fa-calendar-check"></i></div>' +
      '<div>' +
        '<div class="detail-header-title">' + escapeHtml(b.title) + '</div>' +
        '<div class="detail-header-sub">' +
          '<i class="fas fa-door-open"></i> ' + escapeHtml(roomName) + '&nbsp;&nbsp;' +
          '<span style="background:' + sBg + ';color:' + sColor + ';padding:2px 10px;border-radius:20px;font-size:12px;font-weight:700;">' + getStatusLabel(b.status) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="detail-section">' +
      '<div class="detail-section-title"><i class="fas fa-clock"></i> วันและเวลา</div>' +
      '<div class="detail-row"><div class="detail-label">วันที่</div><div class="detail-value">' + dateLabel + '</div></div>' +
      '<div class="detail-row"><div class="detail-label">เวลา</div><div class="detail-value">' + b.startTime + ' – ' + b.endTime + ' น.</div></div>' +
      '<div class="detail-row"><div class="detail-label">ห้องประชุม</div><div class="detail-value">' + escapeHtml(roomName) + (room ? ' <span style="color:#718096;font-size:12px;">(' + room.capacity + ' คน)</span>' : '') + '</div></div>' +
    '</div>' +

    '<div class="detail-section">' +
      '<div class="detail-section-title"><i class="fas fa-building"></i> ข้อมูลหน่วยงาน</div>' +
      '<div class="detail-row"><div class="detail-label">ฝ่าย/ส่วน</div><div class="detail-value">' + escapeHtml(b.department !== '-' ? b.department : '—') + '</div></div>' +
      '<div class="detail-row"><div class="detail-label">ผู้ประสานงาน</div><div class="detail-value">' + escapeHtml(b.bookerName !== '-' ? b.bookerName : '—') + '</div></div>' +
      '<div class="detail-row"><div class="detail-label">เบอร์ติดต่อ</div><div class="detail-value">' +
        (b.phone && b.phone !== '-' ? '<a href="tel:' + escapeHtml(b.phone) + '" style="color:#0d6efd;">' + escapeHtml(b.phone) + '</a>' : '—') +
      '</div></div>' +
      '<div class="detail-row"><div class="detail-label">จำนวนผู้เข้าร่วม</div><div class="detail-value">' + (b.attendees !== '-' ? escapeHtml(b.attendees) + ' คน' : '—') + '</div></div>' +
    '</div>' +

    '<div class="detail-section">' +
      '<div class="detail-section-title"><i class="fas fa-info-circle"></i> รายละเอียดเพิ่มเติม</div>' +
      '<div class="detail-row"><div class="detail-label">อุปกรณ์ที่ต้องการ</div><div class="detail-value">' + escapeHtml(b.equipment !== '-' ? b.equipment : '—') + '</div></div>' +
      '<div class="detail-row"><div class="detail-label">หมายเหตุ</div><div class="detail-value">' + escapeHtml(b.remark !== '-' ? b.remark : '—') + '</div></div>' +
      '<div class="detail-row"><div class="detail-label">รหัสการจอง</div><div class="detail-value"><code style="background:#f0f4f8;padding:2px 8px;border-radius:6px;font-size:12px;">' + escapeHtml(b.id) + '</code></div></div>' +
    '</div>';

  document.getElementById('bookingDetailBody').innerHTML = body;

  var footer = '<button class="btn btn-outline" onclick="closeModal(\'bookingDetailModal\')">ปิด</button>';
  var today2 = new Date(); today2.setHours(0,0,0,0);
  var isPast = new Date(b.date + 'T00:00:00') < today2;

  if (!isPast && b.status === 'Pending' && b.userId === currentUser.id) {
    footer += '<button class="btn btn-warning" onclick="closeModal(\'bookingDetailModal\');editBooking(\'' + b.id + '\')"><i class="fas fa-edit"></i> แก้ไข</button>';
    footer += '<button class="btn btn-danger" onclick="closeModal(\'bookingDetailModal\');cancelBooking(\'' + b.id + '\')"><i class="fas fa-times"></i> ยกเลิกการจอง</button>';
  }
  if ((currentUser.role === 'Admin' || currentUser.role === 'Manager') && b.status === 'Pending') {
    footer += '<button class="btn btn-success" onclick="closeModal(\'bookingDetailModal\');openApproveModal(\'' + b.id + '\',\'Approved\')"><i class="fas fa-check"></i> อนุมัติ</button>';
    footer += '<button class="btn btn-danger" onclick="closeModal(\'bookingDetailModal\');openApproveModal(\'' + b.id + '\',\'Rejected\')"><i class="fas fa-times"></i> ปฏิเสธ</button>';
  }

  document.getElementById('bookingDetailFooter').innerHTML = footer;
  closeModal('dayBookingsModal');
  openModal('bookingDetailModal');
}

function getStatusLabel(status) {
  var labels = { Pending: 'รออนุมัติ', Approved: 'อนุมัติแล้ว', Rejected: 'ปฏิเสธ', Cancelled: 'ยกเลิก' };
  return labels[status] || status;
}

function checkRoomAvailability() {
  var roomId = document.getElementById('bookingRoom').value;
  var date = document.getElementById('bookingDate').value;
  var editId = document.getElementById('editBookingId').value;

  var infoEl = document.getElementById('bookedSlotsInfo');
  var listEl = document.getElementById('bookedSlotsList');

  if (!roomId || !date) { infoEl.style.display = 'none'; return; }

  var slots = allBookings.filter(function(b) {
    return b.roomId === roomId && b.date === date &&
           b.status !== 'Rejected' && b.status !== 'Cancelled' &&
           b.id !== editId;
  });

  if (slots.length === 0) { infoEl.style.display = 'none'; return; }

  infoEl.style.display = 'block';
  listEl.innerHTML = slots.map(function(s) {
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
           getStatusBadge(s.status) +
           '<span>' + s.startTime + ' - ' + s.endTime + ' | ' + escapeHtml(s.title) + '</span></div>';
  }).join('');
}

function saveBooking() {
  var title       = document.getElementById('bookingTitle').value.trim();
  var roomId      = document.getElementById('bookingRoom').value;
  var date        = document.getElementById('bookingDate').value;
  var startTime   = document.getElementById('bookingStart').value;
  var endTime     = document.getElementById('bookingEnd').value;
  var remark      = document.getElementById('bookingRemark').value.trim();
  var department  = document.getElementById('bookingDepartment').value.trim();
  var bookerName  = document.getElementById('bookingBookerName').value.trim();
  var phone       = document.getElementById('bookingPhone').value.trim();
  var attendees   = document.getElementById('bookingAttendees').value.trim();
  var equipment   = document.getElementById('bookingEquipment').value.trim();
  var editId      = document.getElementById('editBookingId').value;

  if (!title || !roomId || !date || !startTime || !endTime) {
    showToast('warning', 'กรุณากรอกข้อมูลที่จำเป็นให้ครบ (หัวข้อ, ห้อง, วันที่, เวลา)');
    return;
  }
  if (!department) {
    showToast('warning', 'กรุณาระบุฝ่าย/ส่วน/หน่วยงาน');
    return;
  }
  if (!bookerName) {
    showToast('warning', 'กรุณาระบุชื่อผู้ประสานงาน');
    return;
  }
  if (!phone) {
    showToast('warning', 'กรุณาระบุเบอร์โทรติดต่อ');
    return;
  }
  if (startTime >= endTime) {
    showToast('warning', 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น');
    return;
  }
  var today = new Date(); today.setHours(0,0,0,0);
  if (new Date(date) < today) {
    showToast('warning', 'ไม่สามารถจองย้อนหลังได้');
    return;
  }

  var btn = document.getElementById('saveBookingBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึก...';
  showLoading(true);

  var data = {
    userId: currentUser.id,
    roomId: roomId, date: date,
    startTime: startTime, endTime: endTime,
    title: title,
    remark:     remark     || '-',
    department: department || '-',
    bookerName: bookerName || '-',
    phone:      phone      || '-',
    attendees:  attendees  || '-',
    equipment:  equipment  || '-'
  };

  var fn = 'addBooking';
  if (editId) { data.bookingId = editId; fn = 'updateBooking'; }

  google.script.run
    .withSuccessHandler(function(result) {
      showLoading(false);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> บันทึกการจอง';
      closeModal('bookingModal');
      if (result.success) {
        showToast('success', result.message);
        loadAllData();
      } else {
        showToast('error', result.message);
      }
    })
    .withFailureHandler(function(err) {
      showLoading(false);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> บันทึกการจอง';
      showToast('error', err.message || 'เกิดข้อผิดพลาด');
    })
    [fn](data);
}

function cancelBooking(bookingId) {
  document.getElementById('confirmMsg').textContent = 'คุณต้องการยกเลิกการจองรหัส ' + bookingId + ' ใช่หรือไม่?';
  document.getElementById('confirmOkBtn').onclick = function() {
    showLoading(true);
    google.script.run
      .withSuccessHandler(function(result) {
        showLoading(false);
        closeModal('confirmModal');
        if (result.success) {
          showToast('success', 'ยกเลิกการจองสำเร็จ');
          loadAllData();
        } else {
          showToast('error', result.message);
        }
      })
      .withFailureHandler(function(err) { showLoading(false); showToast('error', err.message); })
      .updateBookingStatus(bookingId, 'Cancelled', 'ยกเลิกโดยผู้จอง');
  };
  openModal('confirmModal');
}

// ==================== APPROVE MODAL ====================
function openApproveModal(bookingId, action) {
  var b = allBookings.find(function(x) { return x.id === bookingId; });
  if (!b) return;

  document.getElementById('approveBookingId').value = bookingId;
  document.getElementById('approveAction').value = action;
  document.getElementById('approveRemark').value = '';

  var room = allRooms.find(function(r) { return r.id === b.roomId; });
  var user = allUsers.find(function(u) { return u.id === b.userId; });
  document.getElementById('approveBookingInfo').innerHTML =
    '<b>หัวข้อ:</b> ' + escapeHtml(b.title) + '<br>' +
    '<b>ห้อง:</b> ' + (room ? escapeHtml(room.name) : b.roomId) + '<br>' +
    '<b>วันที่:</b> ' + formatDateTH(b.date) + '<br>' +
    '<b>เวลา:</b> ' + b.startTime + ' - ' + b.endTime + '<br>' +
    '<b>ฝ่าย/ส่วน:</b> ' + escapeHtml(b.department !== '-' ? b.department : '-') + '<br>' +
    '<b>ผู้ประสานงาน:</b> ' + escapeHtml(b.bookerName !== '-' ? b.bookerName : (user ? user.name : b.userId)) + '<br>' +
    '<b>เบอร์ติดต่อ:</b> ' + escapeHtml(b.phone !== '-' ? b.phone : '-') + '<br>' +
    '<b>จำนวนผู้เข้าร่วม:</b> ' + (b.attendees !== '-' ? escapeHtml(b.attendees) + ' คน' : '-');

  if (action === 'Approved') {
    document.getElementById('approveModalTitle').innerHTML = '<i class="fas fa-check-circle" style="color:#38a169;"></i> อนุมัติการจอง';
    document.getElementById('approveBtn').className = 'btn btn-success';
    document.getElementById('approveBtn').innerHTML = '<i class="fas fa-check"></i> อนุมัติ';
  } else {
    document.getElementById('approveModalTitle').innerHTML = '<i class="fas fa-times-circle" style="color:#e53e3e;"></i> ไม่อนุมัติการจอง';
    document.getElementById('approveBtn').className = 'btn btn-danger';
    document.getElementById('approveBtn').innerHTML = '<i class="fas fa-times"></i> ไม่อนุมัติ';
  }

  openModal('approveModal');
}

function confirmApprove() {
  var bookingId = document.getElementById('approveBookingId').value;
  var action = document.getElementById('approveAction').value;
  var remark = document.getElementById('approveRemark').value;

  if (action === 'Rejected' && !remark.trim()) {
    showToast('warning', 'กรุณาระบุเหตุผลที่ไม่อนุมัติ');
    return;
  }

  var btn = document.getElementById('approveBtn');
  btn.disabled = true;
  showLoading(true);
  google.script.run
    .withSuccessHandler(function(result) {
      showLoading(false);
      btn.disabled = false;
      closeModal('approveModal');
      if (result.success) {
        showToast('success', result.message);
        loadAllData();
      } else {
        showToast('error', result.message);
      }
    })
    .withFailureHandler(function(err) { showLoading(false); btn.disabled = false; showToast('error', err.message); })
    .updateBookingStatus(bookingId, action, remark);
}

// ==================== DELETE BOOKING ====================
function confirmDeleteBooking(bookingId) {
  document.getElementById('confirmMsg').textContent = 'คุณต้องการลบการจองรหัส ' + bookingId + ' ใช่หรือไม่? (ไม่สามารถกู้คืนได้)';
  document.getElementById('confirmOkBtn').onclick = function() {
    showLoading(true);
    google.script.run
      .withSuccessHandler(function(result) {
        showLoading(false);
        closeModal('confirmModal');
        if (result.success) {
          showToast('success', result.message);
          loadAllData();
        } else {
          showToast('error', result.message);
        }
      })
      .withFailureHandler(function(err) { showLoading(false); showToast('error', err.message); })
      .deleteBooking(bookingId);
  };
  openModal('confirmModal');
}

// ==================== ROOM MODAL ====================
function openRoomModal() {
  document.getElementById('editRoomId').value = '';
  document.getElementById('roomModalTitle').innerHTML = '<i class="fas fa-door-open"></i> เพิ่มห้องประชุม';
  document.getElementById('roomName').value = '';
  document.getElementById('roomCapacity').value = '';
  document.getElementById('roomStatus').value = 'Active';
  document.getElementById('roomDetails').value = '';
  openModal('roomModal');
}

function editRoom(roomId) {
  var r = allRooms.find(function(x) { return x.id === roomId; });
  if (!r) return;
  document.getElementById('editRoomId').value = r.id;
  document.getElementById('roomModalTitle').innerHTML = '<i class="fas fa-edit"></i> แก้ไขห้องประชุม';
  document.getElementById('roomName').value = r.name;
  document.getElementById('roomCapacity').value = r.capacity;
  document.getElementById('roomStatus').value = r.status || 'Active';
  document.getElementById('roomDetails').value = r.details || '';
  openModal('roomModal');
}

function saveRoom() {
  var name = document.getElementById('roomName').value.trim();
  var capacity = document.getElementById('roomCapacity').value;
  var status = document.getElementById('roomStatus').value;
  var details = document.getElementById('roomDetails').value.trim();
  var editId = document.getElementById('editRoomId').value;

  if (!name || !capacity || parseInt(capacity) < 1) {
    showToast('warning', 'กรุณากรอกชื่อห้องและความจุที่ถูกต้อง');
    return;
  }

  showLoading(true);
  var data = { name: name, capacity: parseInt(capacity), status: status, details: details };
  if (editId) data.roomId = editId;

  google.script.run
    .withSuccessHandler(function(result) {
      showLoading(false);
      closeModal('roomModal');
      if (result.success) {
        showToast('success', result.message);
        loadAllData();
      } else {
        showToast('error', result.message);
      }
    })
    .withFailureHandler(function(err) { showLoading(false); showToast('error', err.message); })
    .saveRoom(data);
}

function confirmDeleteRoom(roomId) {
  var r = allRooms.find(function(x) { return x.id === roomId; });
  document.getElementById('confirmMsg').textContent = 'คุณต้องการลบห้อง "' + (r ? r.name : roomId) + '" ใช่หรือไม่?';
  document.getElementById('confirmOkBtn').onclick = function() {
    showLoading(true);
    google.script.run
      .withSuccessHandler(function(result) {
        showLoading(false);
        closeModal('confirmModal');
        if (result.success) {
          showToast('success', result.message);
          loadAllData();
        } else {
          showToast('error', result.message);
        }
      })
      .withFailureHandler(function(err) { showLoading(false); showToast('error', err.message); })
      .deleteRoom(roomId);
  };
  openModal('confirmModal');
}

// ==================== USER MODAL ====================
function openUserModal() {
  document.getElementById('editUserId').value = '';
  document.getElementById('userModalTitle').innerHTML = '<i class="fas fa-user-plus"></i> เพิ่มผู้ใช้งาน';
  document.getElementById('userName').value = '';
  document.getElementById('userEmail').value = '';
  document.getElementById('userPassword').value = '';
  document.getElementById('userRole').value = 'User';
  document.getElementById('userDepartment').value = '';
  document.getElementById('userPhone').value = '';
  document.getElementById('pwdRequired').style.display = 'inline';
  openModal('userModal');
}

function editUser(userId) {
  var u = allUsers.find(function(x) { return x.id === userId; });
  if (!u) return;
  document.getElementById('editUserId').value = u.id;
  document.getElementById('userModalTitle').innerHTML = '<i class="fas fa-user-edit"></i> แก้ไขผู้ใช้งาน';
  document.getElementById('userName').value = u.name;
  document.getElementById('userEmail').value = u.email;
  document.getElementById('userPassword').value = '';
  document.getElementById('userRole').value = u.role;
  document.getElementById('userDepartment').value = u.department !== '-' ? u.department : '';
  document.getElementById('userPhone').value = u.phone !== '-' ? u.phone : '';
  document.getElementById('pwdRequired').style.display = 'none';
  openModal('userModal');
}

function saveUser() {
  var name       = document.getElementById('userName').value.trim();
  var email      = document.getElementById('userEmail').value.trim();
  var password   = document.getElementById('userPassword').value;
  var role       = document.getElementById('userRole').value;
  var department = document.getElementById('userDepartment').value.trim();
  var phone      = document.getElementById('userPhone').value.trim();
  var editId     = document.getElementById('editUserId').value;

  if (!name || !email) {
    showToast('warning', 'กรุณากรอกชื่อและอีเมล');
    return;
  }
  if (!editId && !password) {
    showToast('warning', 'กรุณากรอกรหัสผ่านสำหรับผู้ใช้ใหม่');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('warning', 'รูปแบบอีเมลไม่ถูกต้อง');
    return;
  }

  showLoading(true);
  var data = { name: name, email: email, password: password, role: role, department: department || '-', phone: phone || '-' };
  if (editId) data.userId = editId;

  google.script.run
    .withSuccessHandler(function(result) {
      showLoading(false);
      closeModal('userModal');
      if (result.success) {
        showToast('success', result.message);
        loadAllData();
      } else {
        showToast('error', result.message);
      }
    })
    .withFailureHandler(function(err) { showLoading(false); showToast('error', err.message); })
    .saveUser(data);
}

function confirmDeleteUser(userId) {
  var u = allUsers.find(function(x) { return x.id === userId; });
  document.getElementById('confirmMsg').textContent = 'คุณต้องการลบผู้ใช้งาน "' + (u ? u.name : userId) + '" ใช่หรือไม่?';
  document.getElementById('confirmOkBtn').onclick = function() {
    showLoading(true);
    google.script.run
      .withSuccessHandler(function(result) {
        showLoading(false);
        closeModal('confirmModal');
        if (result.success) {
          showToast('success', result.message);
          loadAllData();
        } else {
          showToast('error', result.message);
        }
      })
      .withFailureHandler(function(err) { showLoading(false); showToast('error', err.message); })
      .deleteUser(userId);
  };
  openModal('confirmModal');
}

// ==================== SETTINGS ====================
function loadSettingsForm() {
  google.script.run
    .withSuccessHandler(function(settings) {
      if (settings.LineChannelToken) {
        document.getElementById('lineChannelToken').value = settings.LineChannelToken;
      }
      if (settings.LineGroupId) {
        document.getElementById('lineGroupId').value = settings.LineGroupId;
      }
      if (settings.LineOAUrl) {
        document.getElementById('lineOAUrl').value = settings.LineOAUrl;
        updateLineOAButton(settings.LineOAUrl);
      }
      if (settings.PowerBI) {
        document.getElementById('powerBiUrl').value = settings.PowerBI;
        document.getElementById('powerBiPreview').innerHTML =
          '<iframe src="' + settings.PowerBI + '" width="100%" height="400" frameborder="0" allowfullscreen></iframe>';
      }
      updateLineStatusBadge();
    })
    .withFailureHandler(function() {})
    .getSettings();
}

function loadLineOASettings() {
  google.script.run
    .withSuccessHandler(function(settings) {
      if (settings && settings.LineOAUrl) {
        updateLineOAButton(settings.LineOAUrl);
      }
    })
    .withFailureHandler(function() {})
    .getSettings();
}

function updateLineOAButton(url) {
  var banner = document.getElementById('lineOABanner');
  var link   = document.getElementById('lineOALink');
  if (banner && link) {
    if (url && url.trim()) {
      banner.style.display = 'block';
      link.href = url.trim();
    } else {
      banner.style.display = 'none';
    }
  }
}

function testLineOAUrl() {
  var url = document.getElementById('lineOAUrl').value.trim();
  if (!url) {
    showToast('warning', 'กรุณากรอก LINE OA URL ก่อน');
    return;
  }
  window.open(url, '_blank');
}

function testLineGroup() {
  var token   = document.getElementById('lineChannelToken').value.trim();
  var groupId = document.getElementById('lineGroupId').value.trim();
  if (!token) { showToast('warning', 'กรุณากรอก Channel Access Token ก่อน'); return; }
  if (!groupId) { showToast('warning', 'กรุณากรอก LINE Group ID ก่อน'); return; }

  showLoading(true);
  google.script.run
    .withSuccessHandler(function(result) {
      showLoading(false);
      if (result.success) {
        showToast('success', '✅ ส่งข้อความทดสอบไปยังกลุ่ม LINE สำเร็จ!');
      } else {
        showToast('error', '❌ ส่งไม่สำเร็จ: ' + result.message);
      }
    })
    .withFailureHandler(function(err) {
      showLoading(false);
      showToast('error', 'เกิดข้อผิดพลาด: ' + (err.message || 'ไม่สามารถเชื่อมต่อได้'));
    })
    .testLineGroupMessage();
}

function updateLineStatusBadge() {
  var badge   = document.getElementById('lineStatusBadge');
  if (!badge) return;
  var token   = document.getElementById('lineChannelToken').value.trim();
  var groupId = document.getElementById('lineGroupId').value.trim();
  if (token && groupId) {
    badge.textContent = '✅ ตั้งค่าแล้ว';
    badge.style.background = '#d1fae5'; badge.style.color = '#065f46';
  } else if (token || groupId) {
    badge.textContent = '⚠️ ตั้งค่าไม่ครบ';
    badge.style.background = '#fef3c7'; badge.style.color = '#92400e';
  } else {
    badge.textContent = 'ยังไม่ตั้งค่า';
    badge.style.background = '#f3f4f6'; badge.style.color = '#6b7280';
  }
}

function saveSettings() {
  var lineChannelToken = document.getElementById('lineChannelToken').value.trim();
  var lineGroupId      = document.getElementById('lineGroupId').value.trim();
  var lineOAUrl        = document.getElementById('lineOAUrl').value.trim();
  var powerBiUrl       = document.getElementById('powerBiUrl').value.trim();

  showLoading(true);
  google.script.run
    .withSuccessHandler(function(result) {
      showLoading(false);
      if (result.success) {
        showToast('success', 'บันทึกการตั้งค่าสำเร็จ');
        updateLineOAButton(lineOAUrl);
        updateLineStatusBadge();
        if (powerBiUrl) {
          document.getElementById('powerBiPreview').innerHTML =
            '<iframe src="' + powerBiUrl + '" width="100%" height="400" frameborder="0" allowfullscreen></iframe>';
        } else {
          document.getElementById('powerBiPreview').innerHTML = '';
        }
      } else {
        showToast('error', result.message);
      }
    })
    .withFailureHandler(function(err) { showLoading(false); showToast('error', err.message); })
    .saveSettings({ LineChannelToken: lineChannelToken, LineGroupId: lineGroupId, LineOAUrl: lineOAUrl, PowerBI: powerBiUrl });
}

// ==================== HELPERS ====================
function updatePendingBadge() {
  var pending = allBookings.filter(function(b) { return b.status === 'Pending'; }).length;
  var badge = document.getElementById('pendingBadge');
  if (badge) {
    badge.textContent = pending;
    badge.style.display = pending > 0 ? 'inline' : 'none';
  }
}

function getStatusBadge(status) {
  var map = {
    Pending:   '<span class="status-badge status-pending"><i class="fas fa-clock" style="font-size:9px;"></i> รออนุมัติ</span>',
    Approved:  '<span class="status-badge status-approved"><i class="fas fa-check" style="font-size:9px;"></i> อนุมัติแล้ว</span>',
    Rejected:  '<span class="status-badge status-rejected"><i class="fas fa-times" style="font-size:9px;"></i> ไม่อนุมัติ</span>',
    Cancelled: '<span class="status-badge status-cancelled"><i class="fas fa-ban" style="font-size:9px;"></i> ยกเลิก</span>'
  };
  return map[status] || ('<span class="status-badge">' + status + '</span>');
}

function formatDateTH(dateStr) {
  if (!dateStr) return '-';
  var parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  var months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  var m = parseInt(parts[1]) - 1;
  if (m < 0 || m > 11) return dateStr;
  return parseInt(parts[2]) + ' ' + months[m] + ' ' + (parseInt(parts[0]) + 543);
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str || '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function openModal(id) {
  document.getElementById(id).classList.add('show');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}
function showLoading(show) {
  document.getElementById('loadingOverlay').classList.toggle('show', show);
}
function showLoginError(msg) {
  document.getElementById('loginError').style.display = 'flex';
  document.getElementById('loginErrorMsg').textContent = msg;
}
function hideLoginError() {
  document.getElementById('loginError').style.display = 'none';
}

function showToast(type, msg) {
  var icons = { success: 'fas fa-check-circle', error: 'fas fa-times-circle', warning: 'fas fa-exclamation-triangle', info: 'fas fa-info-circle' };
  var container = document.getElementById('toastContainer');
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = '<i class="' + (icons[type] || icons.info) + ' toast-icon"></i><span class="toast-msg">' + escapeHtml(msg) + '</span>';
  container.appendChild(toast);
  setTimeout(function() {
    toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s';
    setTimeout(function() { if (container.contains(toast)) container.removeChild(toast); }, 300);
  }, 3500);
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && document.getElementById('loginPage').style.display !== 'none' &&
      document.getElementById('loginPage').style.display !== '') {
    if (document.getElementById('panelLogin').classList.contains('active')) {
      doLogin();
    } else if (document.getElementById('panelRegister').classList.contains('active')) {
      doRegister();
    }
  }
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.show').forEach(function(m) {
      m.classList.remove('show');
    });
  }
}); // [FIX] ปิดปีกกาของ Event Listener ตรงนี้ให้ถูกต้อง

// ==================== EXPORT TO EXCEL ====================
// [FIX] ย้ายฟังก์ชัน Export ออกมาจาก Keydown เพื่อให้ปุ่มเรียกใช้งานได้
function exportDashboardToExcel() {
  if (!allBookings || allBookings.length === 0) {
    showToast('warning', 'ไม่มีข้อมูลสำหรับ Export');
    return;
  }

  // สร้าง Header และ ข้อมูล
  var csvContent = "\uFEFF"; // BOM for Thai Language Support
  var headers = ["รหัสการจอง", "หัวข้อ", "ห้องประชุม", "ผู้จอง", "วันที่จอง", "เวลาเริ่ม", "เวลาสิ้นสุด", "สถานะ"];
  csvContent += headers.join(",") + "\n";

  allBookings.forEach(function(b) {
    var room = allRooms.find(function(r) { return r.id === b.roomId; });
    var roomName = room ? room.name : b.roomId;
    var user = allUsers.find(function(u) { return u.id === b.userId; });
    var userName = user ? user.name : b.userId;

    var row = [
      b.id || '',
      '"' + (b.title || '').replace(/"/g, '""') + '"',
      '"' + roomName + '"',
      '"' + userName + '"',
      b.date || '',
      b.startTime || '',
      b.endTime || '',
      b.status || ''
    ];
    csvContent += row.join(",") + "\n";
  });

  // สร้างไฟล์และสั่งดาวน์โหลด
  var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement("a");
  var url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", "รายงานการจองห้องประชุม_" + new Date().toISOString().split('T')[0] + ".csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
