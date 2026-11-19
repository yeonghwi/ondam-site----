// 온담 한방찻집 — 동작 (모든 페이지가 함께 씁니다)

// ---------- Supabase 설정 (예약 페이지 · 관리자 페이지가 함께 씁니다) ----------
// Supabase 대시보드 → Project Settings → API 에서 복사해 넣습니다.
// 여기에는 Project URL과 공개용 키(Publishable key)만 넣습니다.
// 비밀 키(Secret key)와 비밀번호는 절대 넣지 않습니다.
const SUPABASE_URL = 'https://cxlzwfdrhhwokstpuoux.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_P6Q3eTaOEzBMxXiKSirtqg_CBFcbL-j';

function supabaseReady() {
  return !SUPABASE_URL.startsWith('[') && !SUPABASE_PUBLISHABLE_KEY.startsWith('[') &&
         typeof window.supabase !== 'undefined';
}

// ---------- 단체 예약 신청서 (reserve.html) ----------
// 빈칸을 확인한 뒤 Supabase reservations 표에 저장합니다.
// (손님은 넣기만 할 수 있고, 목록은 볼 수 없습니다 — RLS)
(function () {
  const form = document.getElementById('reserve-form');
  if (!form) return;

  const status = document.getElementById('form-status');
  const dateInput = form.elements.visit_date;

  // 예약 규칙 (예약 안내 문구와 같게 맞춥니다)
  const MAX_PEOPLE = 8;      // 최대 8명
  const DAYS_BEFORE = 1;     // 방문 1일 전까지 신청 → 내일부터 고를 수 있음

  // 가장 이른 방문 날짜 (yyyy-mm-dd, 내 컴퓨터 시간 기준)
  function earliestDate() {
    const d = new Date();
    d.setDate(d.getDate() + DAYS_BEFORE);
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // 달력에서 오늘과 지난 날짜는 고를 수 없게
  dateInput.min = earliestDate();

  // 칸마다 확인하고, 문제가 있으면 안내 문구를 돌려줍니다
  const checks = {
    name(v) {
      if (!v.trim()) return '이름을 입력해 주세요.';
    },
    phone(v) {
      if (!v.trim()) return '연락처를 입력해 주세요.';
      const digits = v.replace(/[\s-]/g, '');
      if (!/^\d{9,11}$/.test(digits)) return '연락처를 숫자로 정확히 입력해 주세요. (예: 010-1234-5678)';
    },
    visit_date(v) {
      if (!v) return '방문 날짜를 달력에서 골라 주세요.';
      if (v < earliestDate()) return '방문 1일 전까지 신청하실 수 있습니다. 내일 이후 날짜를 골라 주세요.';
    },
    people(v, input) {
      if (input.validity.badInput) return '인원은 숫자만 입력해 주세요.';
      if (!v) return '인원을 입력해 주세요.';
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) return '인원은 1명 이상, 숫자로 입력해 주세요.';
      if (n > MAX_PEOPLE) return '최대 ' + MAX_PEOPLE + '명까지 예약하실 수 있습니다.';
    },
  };

  function checkField(name) {
    const input = form.elements[name];
    const message = checks[name](input.value, input) || '';
    const errorEl = document.getElementById(name + '-error');
    errorEl.textContent = message;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    return !message;
  }

  // 칸을 벗어날 때, 이미 오류가 표시된 칸은 고치는 즉시 다시 확인
  Object.keys(checks).forEach(function (name) {
    const input = form.elements[name];
    input.addEventListener('blur', function () {
      if (input.value) checkField(name);
    });
    input.addEventListener('input', function () {
      if (input.getAttribute('aria-invalid') === 'true') checkField(name);
      status.textContent = '';
    });
  });

  const submitBtn = form.querySelector('button[type="submit"]');
  // 예약 신청은 언제나 '손님'으로 보냅니다.
  // 같은 브라우저에 사장님 로그인이 남아 있어도 그 로그인을 쓰지 않습니다
  // (사장님 권한은 보기만 가능해서, 로그인을 쓰면 저장이 막힙니다).
  const db = supabaseReady()
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (submitBtn.disabled) return;     // 두 번 눌러 두 번 저장되지 않게
    status.textContent = '';

    let firstInvalid = null;
    Object.keys(checks).forEach(function (name) {
      if (!checkField(name) && !firstInvalid) firstInvalid = form.elements[name];
    });

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    if (!db) {
      status.textContent = '지금은 신청을 받을 수 없습니다. 053-819-1000으로 전화 주세요.';
      return;
    }

    const message = form.elements.message.value.trim();
    const reservation = {
      name: form.elements.name.value.trim(),
      phone: form.elements.phone.value.trim(),
      visit_date: form.elements.visit_date.value,
      people: Number(form.elements.people.value),
      message: message || null,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = '보내는 중…';

    // 넣기만 합니다 (.select()를 붙이지 않음 — 손님은 목록을 읽을 수 없으므로)
    const { error } = await db.from('reservations').insert(reservation);

    submitBtn.disabled = false;
    submitBtn.textContent = '신청하기';

    if (error) {
      status.textContent = '신청을 보내지 못했습니다. 잠시 뒤 다시 시도하시거나 053-819-1000으로 전화 주세요.';
      return;
    }

    form.reset();
    Object.keys(checks).forEach(function (name) {
      form.elements[name].removeAttribute('aria-invalid');
    });
    status.textContent = '예약 신청이 접수되었습니다. 확인 후 연락드리겠습니다.';
  });
})();

// ---------- 관리자 페이지 (admin.html) ----------
// 로그인 전에는 예약을 불러오지도, 보여 주지도 않습니다.
// (Supabase 보안 설정 RLS에서도 로그인한 사장님만 목록을 볼 수 있게 막습니다.)
(function () {
  const app = document.getElementById('admin-app');
  if (!app) return;

  const loginView = document.getElementById('login-view');
  const listView = document.getElementById('list-view');
  const loginForm = document.getElementById('login-form');
  const loginStatus = document.getElementById('login-status');
  const listStatus = document.getElementById('list-status');
  const logoutBtn = document.getElementById('logout-btn');
  const rows = document.getElementById('reservation-rows');
  const totalCount = document.getElementById('total-count');

  if (!supabaseReady()) {
    loginStatus.textContent = 'Supabase 설정이 아직 없습니다. script.js 맨 위에 Project URL과 공개용 키를 넣어 주세요.';
    loginForm.querySelector('button[type="submit"]').disabled = true;
    return;
  }

  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  const timeFormat = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  // 화면을 비우고 로그인 화면으로
  function showLogin() {
    rows.replaceChildren();
    totalCount.textContent = '0';
    listStatus.textContent = '';
    listView.hidden = true;
    logoutBtn.hidden = true;
    loginView.hidden = false;
  }

  function addCell(tr, text) {
    const td = document.createElement('td');
    td.textContent = text;           // 손님이 쓴 글은 글자로만 넣습니다 (안전)
    tr.appendChild(td);
  }

  async function showList() {
    loginView.hidden = true;
    listView.hidden = false;
    logoutBtn.hidden = false;
    listStatus.textContent = '불러오는 중입니다…';

    const { data, count, error } = await db
      .from('reservations')
      .select('created_at, name, phone, visit_date, people, message', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (error) {
      listStatus.textContent = '예약 목록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
      return;
    }

    rows.replaceChildren();
    data.forEach(function (r) {
      const tr = document.createElement('tr');
      addCell(tr, r.created_at ? timeFormat.format(new Date(r.created_at)) : '');
      addCell(tr, r.name || '');
      addCell(tr, r.phone || '');
      addCell(tr, r.visit_date || '');
      addCell(tr, r.people != null ? r.people + '명' : '');
      addCell(tr, r.message || '');
      rows.appendChild(tr);
    });

    totalCount.textContent = String(count != null ? count : data.length);
    listStatus.textContent = data.length ? '' : '아직 들어온 예약이 없습니다.';
  }

  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    const email = loginForm.elements.email.value.trim();
    const password = loginForm.elements.password.value;

    if (!email || !password) {
      loginStatus.textContent = '이메일과 비밀번호를 모두 입력해 주세요.';
      return;
    }

    loginStatus.textContent = '로그인 중입니다…';
    const { error } = await db.auth.signInWithPassword({ email: email, password: password });
    loginForm.elements.password.value = '';

    if (error) {
      loginStatus.textContent = '이메일 또는 비밀번호가 맞지 않습니다.';
      return;
    }
    loginStatus.textContent = '';
    // 화면 전환은 아래 onAuthStateChange에서 합니다
  });

  logoutBtn.addEventListener('click', async function () {
    await db.auth.signOut();
    showLogin();
  });

  // 로그인 상태가 바뀔 때마다 (새로고침해도 로그인이 남아 있으면 바로 목록)
  db.auth.onAuthStateChange(function (_event, session) {
    if (session) {
      setTimeout(showList, 0);
    } else {
      showLogin();
    }
  });
})();
