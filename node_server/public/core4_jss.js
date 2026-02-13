/**
 * ====================================================================
 * 🟢 GreenSync Frontend Logic (최종 완성본)
 * ====================================================================
 * [수정 내역]
 * - 로그인 상태에서 '시작하기' 버튼 클릭 시, 모달 대신 대시보드로 바로 이동하도록 수정
 * ====================================================================
 */

// 로그인 상태 관리
let isLoggedIn = false;
// 차트 바구니 
let chartInstances = {};
// 데이터 통계 리로드용
let lastLoadTime = 0;

/* ====================================================================
        UI Helpers (화면 동작 관련 - 프론트엔드 영역)
   ==================================================================== */

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const firstInput = modal.querySelector('input, button, textarea, select, a[href]');
  if (firstInput) firstInput.focus();
}

function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.add('hidden');
  document.body.style.overflow = '';
}

function closeAnyOpenModal() {
  const openModalEl = document.querySelector('.modal:not(.hidden)');
  if (openModalEl) closeModal(openModalEl);
}

// ESC 키로 모달 닫기
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAnyOpenModal();
});

// ✨ [핵심] 전역 클릭 이벤트 핸들러
document.addEventListener('click', async (e) => {
  
  // --- 1. 모달 열기 버튼 ---
  const openBtn = e.target.closest('[data-open-modal]');
  if (openBtn) {
    const type = openBtn.getAttribute('data-open-modal');

    // [추가된 로직] 이미 로그인 상태라면 '로그인(시작하기)' 버튼 눌렀을 때 바로 대시보드로!
    if (type === 'login' && isLoggedIn) {
      navigateTo('dashboard');
      return;                            // 모달 열지 않고 종료
    }

    closeAnyOpenModal();
    hideLoginMessage();
    
    const modalMap = {
      'login': 'modal-login', 'about': 'modal-about', 'signup': 'modal-signup',
      'forgot': 'modal-forgot', 'plant-detail': 'modal-plant-detail',
      'diary': 'modal-diary',
      'photo': 'modal-photo', 'memo': 'modal-memo', 'plant-register': 'modal-plant-register',
      'password': 'modal-password', 'edit-name': 'modal-edit-name',
      'edit-email': 'modal-edit-email', 'edit-phone': 'modal-edit-phone',
      'edit-address': 'modal-edit-address'
    };
    if (modalMap[type]) openModal(modalMap[type]);
    return;
  }

  // --- 2. 모달 닫기 버튼 ---
  if (e.target.closest('[data-close-modal]')) {
    closeModal(e.target.closest('.modal'));
    return;
  }

  // --- 3. 홈 로고 클릭 ---
  if (e.target.closest('[data-go-home]')) {
    e.preventDefault?.();
    closeAnyOpenModal();
    navigateTo('home');
    return;
  }

  // --- 4. 네비게이션 메뉴 클릭 ---
  const nav = e.target.closest('[data-nav]');
  if (nav) {
    e.preventDefault();
    const target = nav.getAttribute('data-nav');
    navigateTo(target);
  }
  
  // --- 5. 탭 버튼 클릭 ---
  await handleTabClicks(e);

  // // --- 6. 로그아웃 버튼 (헤더 & 설정페이지) ---
  // if (e.target.id === 'btn-logout' || e.target.id === 'header-btn-logout') {
  //   if (confirm('정말 로그아웃 하시겠습니까?')) {
  //     // ⚠️ [BACKEND TODO] : 로그아웃 API 호출
  //     alert('로그아웃 되었습니다.');
  //     window.location.reload(); 
  //   }
  //   return;
  // }

  // --- 6. 로그아웃 버튼 ---
// --- 6. 로그아웃 버튼 ---
if (e.target.id === 'btn-logout' || e.target.id === 'header-btn-logout') {
  if (confirm('정말 로그아웃 하시겠습니까?')) {

    // ✅ 세션 로그인 방식이면 sessionStorage를 비워야 함
    sessionStorage.removeItem('userEmail');
    sessionStorage.removeItem('isLoggedIn');

    // ✅ 예전에 localStorage 쓰던 흔적까지 같이 제거(안전)
    localStorage.removeItem('userEmail');
    localStorage.removeItem('isLoggedIn');

    // 전역 상태도 즉시 반영
    isLoggedIn = false;

    alert('로그아웃 되었습니다.');
    window.location.hash = '#home';   // 홈으로 보내기
    window.location.reload();         // 가장 확실하게 초기화
  }
  return;
}

// --- 7. 회원 탈퇴 버튼 ---
  if (e.target.id === 'btn-delete') {
    const check = prompt('탈퇴하려면 "동의"라고 입력해주세요.');
    
    if (check === '동의') {
      const email = sessionStorage.getItem('userEmail');
      
      if (!email) {
        alert("로그인 정보가 없어서 탈퇴 처리를 할 수 없어!");
        return;
      }

      try {
        const res = await fetch(`http://192.168.219.236:3001/api/user/withdraw/${email}`, {
          method: "DELETE"
        });
        const result = await res.json();

        if (result.success) {
          alert('그동안 GreenSync와 함께해주셔서 감사합니다. 🌿👋');
          localStorage.clear(); 
          window.location.reload(); 
        } else {
          alert('탈퇴 처리 실패: ' + result.message);
        }
      } catch (err) {
        console.error("탈퇴 통신 에러:", err);
        alert("서버와 통신 중 문제가 발생했어!");
      }
    } else {
      alert('탈퇴 처리가 취소되었습니다.');
    }
    return;
  }
});


/* ====================================================================
       Page Navigation & Demo Mode
   ==================================================================== */

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const page = document.getElementById(pageId);
  if (page) page.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setActiveNav(target) {
  document.querySelectorAll('.nav__item').forEach(a => {
    a.classList.toggle('nav__item--active', a.getAttribute('data-nav') === target);
  });
}

/* ====================================================================
   Hash Router (정석 라우팅)
   - URL의 #home, #dashboard ... 를 기준으로 페이지 유지/복원
   ==================================================================== */

const VALID_ROUTES = new Set(['home', 'dashboard', 'growth', 'report', 'settings']);

function getRouteFromHash() {
  const raw = (location.hash || '').replace('#', '').trim();
  return VALID_ROUTES.has(raw) ? raw : 'home';
}

function renderRoute(route) {
  // 네비 active 표시
  setActiveNav(route);
  // 기존 페이지 전환 + 로그인 잠금 로직 재사용
  handlePageNavigation(route);
}

function navigateTo(route) {
  const next = VALID_ROUTES.has(route) ? route : 'home';

  // hash가 이미 같으면 hashchange가 안 일어나므로 직접 렌더
  if (location.hash === `#${next}`) renderRoute(next);
  else location.hash = `#${next}`;
}

// 해시가 바뀌면 그 페이지로 이동
window.addEventListener('hashchange', () => {
  renderRoute(getRouteFromHash());
});

// 로그인 체크 및 잠금 화면(Blur) 처리
function handlePageNavigation(target) {
  if (target === 'home') {
    showPage('page-home');
    return;
  }

  const pageId = `page-${target}`;
  showPage(pageId);

  const pageEl = document.getElementById(pageId);
  if (!pageEl) return;

  // 기존 overlay 제거
  const existingOverlay = pageEl.querySelector('.lock-overlay');
  if (existingOverlay) existingOverlay.remove();

  // 로그인 안했으면 잠금
  if (!isLoggedIn) {
    const overlay = document.createElement('div');
    overlay.className = 'lock-overlay';
    overlay.innerHTML = `
      <div class="lock-msg-box">
        <span class="lock-icon" style="font-size:48px; display:block; margin-bottom:16px;">🔒</span>
        <h3 class="lock-title" style="font-size:22px; font-weight:800; margin-bottom:8px;">로그인이 필요해요</h3>
        <p class="lock-desc" style="color:#64748b; margin-bottom:24px;">
          식집사님의 소중한 데이터를 보려면<br>로그인을 해주세요.
        </p>
        <button class="btn btn--solid btn--lg" onclick="openModal('modal-login')">로그인 하러가기</button>
      </div>
    `;
    pageEl.appendChild(overlay);
    return;
  }

  // 로그인 되어 있으면 탭 초기화
  initPageTabs(target);
    // ✅ [추가] 페이지 진입 시 데이터 로드 트리거
  if (target === 'dashboard') {
    refreshDashboard();
    loadAverageStats();
  }
}

function activateSidebar(pageId, activeSelector) {
  document.querySelectorAll(`${pageId} .side-menu__item`).forEach(b => b.classList.remove('is-active'));
  document.querySelector(activeSelector)?.classList.add('is-active');
}

async function handleTabClicks(e) {
  if (!isLoggedIn && !e.target.closest('[data-nav="home"]')) return;

  const dashBtn = e.target.closest('[data-dash-tab]');
  if (dashBtn) {
    const tab = dashBtn.dataset.dashTab;
    activateSidebar('#page-dashboard', `[data-dash-tab="${tab}"]`);
    document.getElementById('dash-emotion')?.classList.toggle('hidden', tab !== 'emotion');
    document.getElementById('dash-env')?.classList.toggle('hidden', tab !== 'env');
    // ✅ [추가] 환경데이터 탭을 열 때마다 최신 값 로드
    if (tab === 'env') {
      refreshDashboard();
      loadAverageStats();
    }
  }
  
const growthBtn = e.target.closest('[data-growth-tab]');
if (growthBtn) {
  const target = growthBtn.dataset.growthTab;
  activateSidebar('#page-growth', `[data-growth-tab="${target}"]`);
  document.querySelectorAll('.growth-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`growth-${target}`)?.classList.add('active');

  // ✅ 추가: 타임라인 탭을 열면 서버에서 기록 불러오기
  if (target === 'timeline') {
    await loadTimeline();
  }
}

  const reportBtn = e.target.closest('[data-report-tab]');
  if (reportBtn) {
    const tab = reportBtn.dataset.reportTab;

    // 1) 버튼 active
    activateSidebar('#page-report', `[data-report-tab="${tab}"]`);

    // 2) 패널 show/hide (hidden 기준으로 통일)
    const panels = document.querySelectorAll('#page-report .report-panel');
    panels.forEach(p => {
      p.classList.add('hidden');
      p.classList.remove('is-active');
    });

    const activePanel = document.getElementById(`report-${tab}`);
    if (!activePanel) {
      console.error(`[report] panel not found: report-${tab}`);
      // fallback: skill로 복귀
      const skill = document.getElementById('report-skill');
      skill?.classList.remove('hidden');
      skill?.classList.add('is-active');
      activateSidebar('#page-report', '[data-report-tab="skill"]');
      return;
    }
    activePanel.classList.remove('hidden');
    activePanel.classList.add('is-active');

    // 3) 탭별 데이터 로드 (에러 나도 UI는 보이게 try/catch)
    try {
      if (tab === 'skill') await loadSkillReport();
      if (tab === 'stats') await loadStatistics();   // 실제로 존재함 :contentReference[oaicite:4]{index=4}
      if (tab === 'habit') {
        if (typeof loadHabitReport === 'function') {
          await loadHabitReport();
        }
      }

    } catch (err) {
      console.error(`[report:${tab}] load error`, err);
    }
  }

  const settingBtn = e.target.closest('[data-settings-tab]');
  if (settingBtn) {
    const tab = settingBtn.dataset.settingsTab;
    activateSidebar('#page-settings', `[data-settings-tab="${tab}"]`);
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(`settings-${tab}`)?.classList.remove('hidden');
  }
}

function showLoginMessage(message, type = 'error') {
  const box = document.getElementById('login-alert');
  if (!box) return;
  box.textContent = message;
  box.classList.remove('hidden');
  box.classList.toggle('form-alert--success', type === 'success');
}
function hideLoginMessage() {
  const box = document.getElementById('login-alert');
  if (!box) return;
  box.textContent = '';
  box.classList.add('hidden');
  box.classList.remove('form-alert--success');
}


function updateHeaderToLoggedIn() {
  const authBtn = document.getElementById('auth-buttons');
  const email = sessionStorage.getItem('userEmail') || '식집사';
  
  if (authBtn) {
    authBtn.innerHTML = `
      <span class="link-btn" style="cursor:default; margin-right:8px;"><b>${email.split('@')[0]}</b>님</span>
      <button class="link-btn" id="header-btn-logout" style="font-size:14px; color:#64748b;">로그아웃</button>
    `;
  }
}


/* ====================================================================
   3. [BACKEND] 초기화 & 데이터 로딩
   ==================================================================== */

  document.addEventListener('DOMContentLoaded', () => {
    console.log("🌿 GreenSync Front-end Ready.");

    // 1) 저장된 로그인 상태 먼저 복원
    const savedLogin = sessionStorage.getItem('isLoggedIn');
    const savedEmail = sessionStorage.getItem('userEmail');

    isLoggedIn = (savedLogin === 'true' && !!savedEmail);

    if (isLoggedIn) {
      updateHeaderToLoggedIn?.();
      checkAndRenderPlantUI(savedEmail);

      // 2) 로그인 상태에서만 데이터 로딩
      refreshDashboard();
      loadStatistics();
      loadAverageStats(); // ✅ 평균 환경 데이터도 여기서 확실히 호출
    } else {
      // 데모 잠금/블러 유지 로직이 있으면 여기서 적용
      console.log("로그인 전 상태: 데이터 로딩 스킵");
    }
  
  // 4. 데이터 페이지 바로 불러오기1 ()
  // const savedEmail = sessionStorage.getItem('userEmail');
  const chartCanvas = document.getElementById('growthChart');
  if (savedEmail && chartCanvas) {
        initGrowthDashboard(savedEmail); // 페이지 열리자마자 바로 실행!
    }
  // 5. 데이터 페이지 바로 불러오기2 (성장 차트 + 타임라인)  
  const timelineList = document.querySelector('.timeline--cards');
  if (timelineList) {
      console.log("📅 타임라인 로드를 시작합니다...");
      loadTimeline(); 
  }
  // 6. 평균 환경 데이터 로드!
  if (document.getElementById('avg-temp-val')) {
      console.log("📊 평균 환경 데이터 로드를 시작합니다...");
      loadAverageStats(); 
  }

  // 7. 식물 상태 상세정보 모달
  const detailBtn = document.querySelector('[data-open-modal="plant-detail"]');
  if (detailBtn) {
      detailBtn.addEventListener('click', () => {
          console.log("🌿 상세 정보를 불러옵니다...");
          openPlantDetail(); // 모달 데이터를 채우는 함수 호출!
      });
  }
    
    // ✅ 로그인 세팅 끝난 뒤에 라우팅(잠금 판단) 실행
  renderRoute(getRouteFromHash());
  lastLoadTime = Date.now();

// ✅ 로그인 상태면 LLM 메시지 로드 1회만
// if (isLoggedIn) {
  //loadLatestLLMNotification();
//}
});

// 다른탭 보다가 다시 와도 로드
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      if (now - lastLoadTime > 60000) { 
        // console.log("다시 돌아오셨군요! 데이터를 새로 불러옵니다.");
        loadStatistics();
        lastLoadTime = now; // 시간 갱신
      } else {
        // console.log("방금 불러왔으니 조금 있다가 갱신할게요.");
      }    
    }
});

// ========================================================
//                       1. 홈화면
// ========================================================

// ===============    1-1. 로그인 페이지     ================
// 로그인 처리
document.addEventListener('submit', async (e) => {
  const formId = e.target.id;

  if (formId === 'login-form') {
    e.preventDefault(); // 기본 동작 막기
    const email = document.getElementById('login-email')?.value;
    const pw = document.getElementById('login-pass')?.value;

    if (!email || !pw) {
      alert("이메일과 비밀번호를 모두 입력해줘!");
      return;
    }

    try {
      const res = await fetch("http://192.168.219.236:3001/api/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, pw })
      });
      const result = await res.json();

      if (result.success) {
        // 로그인 성공 시 정보 저장
      sessionStorage.setItem('userEmail', email);
      sessionStorage.setItem('isLoggedIn', 'true');

      // (중요) 기존 localStorage에 남아있을 수 있으니 지워버리기
      localStorage.removeItem('userEmail');
      localStorage.removeItem('isLoggedIn');

      isLoggedIn = true;
      updateHeaderToLoggedIn?.();
      checkAndRenderPlantUI?.(email);

        // 전역 상태 업데이트
        isLoggedIn = true; 
        alert(`${email}님, 반갑습니다! 🌿`);
        closeAnyOpenModal(); // 모달 닫기
        updateHeaderToLoggedIn(); // 헤더 UI 변경
        
        // 식물 정보가 있다면 렌더링
        if (typeof checkAndRenderPlantUI === 'function') {
          await checkAndRenderPlantUI(email);
        }

        // 현재 페이지 리프레시 (대시보드 잠금 해제 등을 위해)
        const activeNav = document.querySelector('.nav__item--active');
        const target = activeNav?.getAttribute('data-nav') || getRouteFromHash();
        navigateTo(target);

      } else {
        // 서버에서 거부 (비번 틀림 등)
        alert(result.message || "로그인 정보를 다시 확인하세요");
      }
    } catch (err) {
      console.error("로그인 통신 에러:", err);
      alert("서버와 연결할 수 없음");
    }
  }
});

// ========================================================
// ==============    1-2. 회원가입 페이지     ===============
// ========================================================
// 회원가입 처리
document.addEventListener('submit', async (e) => { // async 잊지 말고!
  if (e.target && e.target.id === 'signup-form') {
    e.preventDefault();

    // 1. 폼 데이터 가져오기 (HTML input의 id를 확인해줘!)
    const userName = document.getElementById('signup-name')?.value?.trim();
    const email    = document.getElementById('signup-email')?.value?.trim();
    const password = document.getElementById('signup-pass')?.value;
    const confirmPw = document.getElementById('signup-pass-confirm')?.value;

    // 2. 기본적인 유효성 검사
    if (password !== confirmPw) {
      alert("비밀번호가 서로 일치하지 않음");
      return;
    }

    if (password.length < 4) {
      alert("비밀번호는 최소 4자 이상으로 설정!");
      return;
    }

    try {
      // 3. 백엔드 API 호출
      const response = await fetch('http://192.168.219.236:3001/api/user/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: userName,
          email: email,
          pw: password // 백엔드에서 받는 이름이 password라면 password로 수정!
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // ✅ 회원가입 성공
        alert(`${userName}님, GreenSync의 식집사가 되신 걸 환영합니다! 로그인을 진행해주세요.`);
        closeAnyOpenModal();
        
        // 가입 성공 후 바로 로그인 모달을 띄워주면 센스 만점!
        setTimeout(() => openModal('modal-login'), 500);
        
      } else {
        // 가입 실패 (이미 존재하는 이메일 등)
        alert(result.message || "회원가입 실패, 다시 시도하세요.");
      }
    } catch (error) {
      console.error("Signup Error:", error);
      alert("서버와 통신하는 중 문제 발생");
    }
  }
});

// ========================================================
//                    2. 성장 분석
// ========================================================
// =========  2-1. 감정상태 요약 (오늘의 메시지)  =============
// // =========================
// // [LLM] 오늘의 메시지/현재상태 불러오기 (Node가 프론트 서빙 기준)
// // =========================
// async function loadLatestLLMNotification() {
//   try {
//     // ✅ 같은 Origin(노드가 html/js도 서빙)이라 상대경로가 정답
//     const res = await fetch("/api/llm/latest-notification", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//     });

//     const data = await res.json();
//     if (!res.ok || !data.ok) {
//       console.warn("LLM API 실패:", data);
//       applyFallbackUI(data?.message || "알림을 불러오지 못했어요.");
//       return;
//     }

//     const { llm_notification, source_event } = data;

//     // 1) 대시보드 '오늘의 메시지' (HTML에 .msg__text 존재)
//     const msgEl = document.querySelector("#page-dashboard .msg__text");
//     if (msgEl) msgEl.textContent = `"${llm_notification.message}"`;

//     const sev = llm_notification?.severity;

//     // 2) 카드 + 3) 모달 공통: LLM이 내려준 status_short 사용
//     const short = llm_notification?.status_short ?? "상태 확인이 필요해요.";

//     const cardDescEl = document.querySelector("#page-dashboard .plant-card__desc");
//     if (cardDescEl) cardDescEl.textContent = short;

//     const modalStatusEl = document.querySelector("#modal-plant-detail .plant-detail__statusText");
//     if (modalStatusEl) modalStatusEl.textContent = short;

//     // 4) (선택) 모달 카드 값 채우기: TEMP/HUM/LIGHT가 source_event에 있으면 반영
//     // HTML에 id가 current-temp/current-hum/current-light로 잡혀 있음
//     const tempEl = document.getElementById("current-temp");
//     const humEl = document.getElementById("current-hum");
//     const lightEl = document.getElementById("current-light");

//     if (tempEl && source_event?.TEMP != null) tempEl.textContent = `${Number(source_event.TEMP).toFixed(1)}°C`;
//     if (humEl && source_event?.HUM != null) humEl.textContent = `${Number(source_event.HUM).toFixed(0)}%`;
//     if (lightEl && source_event?.LIGHT != null) lightEl.textContent = `${Number(source_event.LIGHT).toFixed(0)}`;

//   } catch (e) {
//     console.error("LLM 알림 로딩 예외:", e);
//     applyFallbackUI("알림 서버 연결에 실패했어요.");
//   }
// }

// function applyFallbackUI(messageText) {
//   // 오늘의 메시지(독립)
//   const msgEl = document.querySelector("#page-dashboard .msg__text");
//   if (msgEl) msgEl.textContent = `"${messageText}"`;

//   // 상태요약(카드+모달 동일)
//   const statusShort = "알림을 불러오지 못했어요."; // 원하는 문구로 조정 가능

//   const cardDescEl = document.querySelector("#page-dashboard .plant-card__desc");
//   if (cardDescEl) cardDescEl.textContent = statusShort;

//   const modalStatusEl = document.querySelector("#modal-plant-detail .plant-detail__statusText");
//   if (modalStatusEl) modalStatusEl.textContent = statusShort;
// }

// ========================================================
// ===========    2-2. 식물상태 상세정보 모달    =============
// ========================================================
async function openPlantDetail() {
    try {
        // 1. 우리가 만든 쿼리 주소로 요청!
        const response = await fetch('/api/current-status');
        const data = await response.json();

        if (data) {
            // 2. 온습도/조도 업데이트
            document.getElementById('detail-temp').textContent = `${Number(data.temp).toFixed(1)}°C (현재)`;
            document.getElementById('detail-humi').textContent = `${Number(data.hum).toFixed(1)}% (현재)`;
            
            // 조도 1500 기준 상태 판별
            let lightStatus = "부족함 ☁️";
            if (data.light >= 1000) lightStatus = "매우 충분 ☀️";
            else if (data.light >= 400) lightStatus = "적당함 🌤️";
            document.getElementById('detail-light').textContent = lightStatus;

            // ✨ 3. 물주기 남은 날짜 계산 로직!
            // RECOMMENDED_CYCLE(권장 주기)과 last_soil_date(마지막 물준 날) 활용
            if (data.last_soil_date && data.RECOMMENDED_CYCLE) {
                const lastWatering = new Date(data.last_soil_date);
                const today = new Date();
                
                // 마지막 물준 날로부터 흐른 날짜 계산
                const diffTime = Math.abs(today - lastWatering);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                const remainingDays = data.RECOMMENDED_CYCLE - diffDays;
                
                let wateringText = "";
                if (remainingDays > 0) wateringText = `${remainingDays}일 후`;
                else if (remainingDays === 0) wateringText = `오늘 줘야 해요! 💧`;
                else wateringText = `${Math.abs(remainingDays)}일 지남 (얼른 줘!)`;
                
                document.getElementById('detail-watering').textContent = wateringText;
            } else {
                document.getElementById('detail-watering').textContent = "기록 없음";
            }

            // 4. 모달 열기!
            document.getElementById('modal-plant-detail').classList.remove('hidden');
        }
    } catch (err) {
        console.error("모달 데이터 로드 실패!", err);
        alert("데이터를 불러오는 데 문제가 생겼어, 친구야!");
    }
}

// ========================================================
// ==============    2-2. 환경 데이터 페이지    ==============
// ========================================================
// 실시간 환경 데이터 (가장 최근)
// 1. 서버에서 최신 데이터를 가져와서 화면을 고치는 함수
async function refreshDashboard() {
    try {
        // 서버 라우터 주소 (GET, /api/current-status)
        const response = await fetch('/api/current-status');
        if (!response.ok) throw new Error('데이터 응답 에러');
        
        const data = await response.json();

        if (data) {
            // 기본 환경 데이터
            document.getElementById('current-temp').textContent = `${data.temp.toFixed(1)}°C`;
            document.getElementById('current-hum').textContent = `${data.hum.toFixed(1)}%`;
            document.getElementById('current-light').textContent = `${data.light.toFixed(1)}lux`;

            // [B] 토양 센서 날짜로 D-Day 계산하기
            if (data.last_soil_date) {
                const dDayText = calculateDDay(data.last_soil_date, data.RECOMMENDED_CYCLE);                
                const waterElement = document.getElementById('water-dday');
                waterElement.textContent = dDayText;
                
                // 만약 오늘 물 줘야 하면 빨간색!
                if (dDayText === "D-Day" || dDayText === "D-0") {
                    waterElement.style.color = "#ef4444"; 
                } else {
                    waterElement.style.color = "#0284c7";
                }
            }
        }
    } catch (error) {
        console.error("대시보드 데이터 로드 실패:", error);
    }
}

// 2. 날짜 차이를 계산해서 D-Day 문자열을 만드는 도우미 함수
function calculateDDay(lastDate, cycle) {
    const last = new Date(lastDate);
    const today = new Date();
    
    // 두 날짜의 차이 계산
    const diffTime = today - last;
    const passedDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    // 권장 주기(cycle)에서 흐른 날(passedDays)을 빼면 남은 날!
    const remaining = cycle - passedDays;
    
    if (remaining === 0) return "D-Day";
    if (remaining < 0) return `D+${Math.abs(remaining)}`; // 주기 지남!
    return `D-${remaining}`;
}

// 평균 환경 데이터 (최근 7일) - 안전 버전
async function loadAverageStats() {
  const email = sessionStorage.getItem('userEmail');
  if (!email) {
    console.warn("[avg] no email in sessionStorage");
    return;
  }

  // ✅ DOM id 미스매치 방어 (여기서 바로 잡힘)
  const tempValEl  = document.getElementById('avg-temp-val');
  const humiValEl  = document.getElementById('avg-humi-val');
  const lightValEl = document.getElementById('avg-light-val');

  const tempBarEl  = document.getElementById('avg-temp-bar');
  const humiBarEl  = document.getElementById('avg-humi-bar');
  const lightBarEl = document.getElementById('avg-light-bar');

  if (!tempValEl || !humiValEl || !lightValEl) {
    console.error("[avg] VALUE element id mismatch",
      { tempValEl, humiValEl, lightValEl }
    );
    return;
  }

  try {
    const response = await fetch(`/api/average-stats/${encodeURIComponent(email)}`);
    const result = await response.json();

    if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
      console.warn("[avg] empty result", result);
      // 비어있으면 UI에 '기록 없음' 같은 문구 넣고 싶으면 여기서 처리
      return;
    }

    let sumTemp = 0, sumHumi = 0, sumLight = 0;
    const count = result.data.length;

    result.data.forEach(item => {
      sumTemp  += Number(item.TEMP_AVG  ?? 0);
      sumHumi  += Number(item.HUMI_AVG  ?? 0);
      sumLight += Number(item.LIGHT_AVG ?? 0);
    });

    const finalAvgTemp  = (sumTemp / count);
    const finalAvgHumi  = (sumHumi / count);
    const finalAvgLight = (sumLight / count);

    // ✅ 값 업데이트
    tempValEl.textContent  = `${finalAvgTemp.toFixed(1)}°C`;
    humiValEl.textContent  = `${finalAvgHumi.toFixed(0)}%`;
    lightValEl.textContent = `${finalAvgLight.toFixed(0)} lux`;

    // ✅ bar는 있으면 업데이트, 없으면 그냥 스킵
    if (tempBarEl) {
      const tempPercent = Math.min((finalAvgTemp / 40) * 100, 100);
      tempBarEl.style.width = `${tempPercent}%`;
    }
    if (humiBarEl) humiBarEl.style.width = `${Math.min(finalAvgHumi, 100)}%`;
    if (lightBarEl) {
      const lightPercent = Math.min((finalAvgLight / 1500) * 100, 100);
      lightBarEl.style.width = `${lightPercent}%`;
    }

    console.log("[avg] updated OK");
  } catch (err) {
    console.error("[avg] fetch/update error:", err);
  }
}

// ========================================================
//                    3. 성장 분석
// ========================================================

// ============    3-1. 타임랩스 페이지 시작    ==============

// timelapse-action클래스의 btn클래스를 찾아줘 -> 그리고 선언
const btnTimelapsePlay = document.querySelector('.timelapse-actions .btn');

if (btnTimelapsePlay) {
  btnTimelapsePlay.addEventListener('click', async () => {
    const email = sessionStorage.getItem('userEmail');
    // HTML input[type="date"]에서 값 가져오기
    const dateInputs = document.querySelectorAll('.timelapse-input');
    /*
      const dateInputs = [{
        tagName: 'INPUT', 
        type: 'date', 
        value: '2025-12-01', 
        className: 'timelapse-input',
      },
    */
    const startDate = dateInputs[0].value;
    const endDate = dateInputs[1].value;

    if (!startDate || !endDate) {
      alert("시작일과 종료일을 선택하세요");
      return;
    }

    try {
      // 서버로 데이터 요청 (GET 방식)
      const res = await fetch(`http://192.168.219.236:3001/api/timelapse/${email}?start=${startDate}&end=${endDate}`);
      const result = await res.json();
      console.log(result);
      // result.images;
      /* [ {
          IMG_PATH: "raspi_img\img20260204124738.jpg",
          CREATED_AT: "2026-02-06 09:00:00"
          }, ...}] */

      if (result.success) {
        // console.log("이미지를 이만큼 찾았어:", result.images.length);
        // 여기서 이미지를 화면에 순차적으로 보여주는 함수 실행!
        runTimelapse(result.images);
      } else {
        alert(result.message);
      }
    } catch (err) {
      console.error("타임랩스 요청 실패:", err);
    }
  });
}
// 타임랩스 함수
function runTimelapse(images) {
  if (!images || images.length === 0) return;
  const serverUrl = "http://192.168.219.236:3001"; // ⬅️ 친구의 서버 IP 주소 확인!
  
  // [속도 개선] 브라우저 메모리에 이미지 미리 로드하기
  images.forEach(img => {
    const preImg = new Image();
    const cleanPath = img.IMG_PATH.replace(/\\/g, '/');
    preImg.src = `${serverUrl}/${cleanPath}`; 
  });

  // 1. 이미지를 보여줄 영역
  const screen = document.querySelector('#timelapse-screen');
  // 2. 스크린 초기화 (이미지 태그 2개를 겹쳐서 만듦, 깜빡임 현상 완화)
  screen.innerHTML = `
        <img id="img1" style="position:absolute; width:100%; height:100%; object-fit:cover; opacity:1;">
        <img id="img2" style="position:absolute; width:100%; height:100%; object-fit:cover; opacity:0;">
  `;
  const img1 = document.getElementById('img1');
  const img2 = document.getElementById('img2');

  let index = 0;
  const speed = 100;  
  
  // 3. 0.5초(500ms)마다 반복 실행하는 타이머 시작!
  const timer = setInterval(() => {
    // [종료 조건] 모든 이미지를 다 보여줬다면?
    if (index >= images.length) {
      clearInterval(timer);
      return;   // 알림 없이 그냥 종료
    }
    
    // 4. 현재 순서의 이미지 정보 가져오기
    const currentImg = images[index];
    // 역슬래시 > 슬래시
    const cleanPath = currentImg.IMG_PATH.replace(/\\/g, '/');
    const fullPath = `${serverUrl}/${cleanPath}`;
    console.log(fullPath);

    // 5. 번갈아가며 이미지 교체 (짝수면 img1, 홀수면 img2)    
    if (index % 2 === 0) {
      img1.src = fullPath;
      img1.style.opacity = 1;
      img2.style.opacity = 0;
    } else {
      img2.src = fullPath;
      img2.style.opacity = 1;
      img1.style.opacity = 0;
    }
    
    // 6. 다음 이미지로 넘어가기
    index++;
  }, 50); // 속도 조절: 500은 0.5초, 100으로 하면 0.1초
}

// =========================================================
// ============    3-2. 성장 히스토리 페이지     ==============
// =========================================================
// 사이드 메뉴 클릭으로 초기화
const sideMenuItems = document.querySelectorAll('.side-menu__item');
sideMenuItems.forEach(item => {
    item.addEventListener('click', () => {
        // 클릭한 버튼이 '성장 히스토리' 탭을 여는 버튼인지 확인
        if (item.getAttribute('data-growth-tab') === 'history') {
            const savedEmail = sessionStorage.getItem('userEmail');
            
            // 탭이 전환되어 화면에 캔버스가 나타날 시간을 아주 잠깐(0.1초) 줌
            setTimeout(() => {
                const chartCanvas = document.getElementById('growthChart');
                if (savedEmail && chartCanvas) {
                    console.log("성장 히스토리 탭 클릭됨 - 차트 초기화");
                    initGrowthDashboard(savedEmail);
                }
            }, 100);
        }
    });
});
// 히스토리 요청
let myGrowthChart = null;
async function initGrowthDashboard(email) {
    try {
        // 1. 우리가 만든 노드 API 호출
        const response = await fetch(`/api/growth/history/${email}`);
        const result = await response.json();
        console.log(result);
        
        if (!result.success || result.history.length === 0) return;

        const history = result.history;
        const lastData = history[history.length - 1];
        const firstData = history[0];

        // 2. 상단 KPI 업데이트 (+12% 부분)
        document.querySelector('.gh-kpi__value').innerText = `${result.growthRate > 0 ? '+' : ''}${result.growthRate}%`;
        // 3. 우측 상단 변화량 업데이트 (+3cm 부분)
        const delta = (lastData.height - firstData.height).toFixed(1);
        document.querySelector('.gh-card__delta').innerText = `${delta > 0 ? '+' : ''}${delta}cm`;

        // 4. Chart.js로 그래프 그리기
        const ctx = document.getElementById('growthChart').getContext('2d');
        
        // 기존에 차트가 있다면 파괴해서 메모리를 비워줌
        if (myGrowthChart !== null) {
            myGrowthChart.destroy();
        }
        // 사진 느낌을 내기 위해 그라데이션 추가 (선택사항)
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(74, 222, 128, 0.3)');
        gradient.addColorStop(1, 'rgba(74, 222, 128, 0)');
        
        // 5. 차트 설정
        myGrowthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: history.map(item => item.date), // ["01-01", "01-05"...]
                datasets: [{
                    data: history.map(item => item.height),
                    borderColor: '#4ade80',
                    backgroundColor: gradient, // 연한 초록색 채우기
                    fill: true,
                    tension: 0.4, // 부드러운 곡선
                    pointRadius: 4,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#4ade80'
                }]
            },
            options: { // 👈 중복되었던 부분을 하나로 통합!
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            maxRotation: 0,
                            autoSkip: true,
                            font: { size: 12 }
                        }
                    },
                    y: {
                        beginAtZero: false,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });

    } catch (err) {
        console.error("로딩 실패:", err);
    }
}

// 페이지 로드 시 실행 (로그인된 이메일 사용)
const userEmail = sessionStorage.getItem('userEmail');
initGrowthDashboard(userEmail);

// ======================================================
// ============    3-3. 타임라인 페이지     ===============
// ======================================================

// 1. 파일 이름 표시 및 기분 선택 이벤트 (추가)
document.addEventListener('change', (e) => {
    if (e.target.id === 'diary-file') {
        const fileName = e.target.files[0]?.name || "클릭하여 사진 업로드";
        document.getElementById('file-name-display').innerText = fileName;
    }
});

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('mood__btn')) {
        document.querySelectorAll('.mood__btn').forEach(btn => btn.classList.remove('is-active'));
        e.target.classList.add('is-active');
        document.getElementById('diary-mood').value = e.target.dataset.mood;
    }
});

// 2. 통합 저장 로직 (기존 submit 리스너 수정)
document.addEventListener('submit', async (e) => {
  //HTML에서 만든 폼 ID
  if (e.target.id === 'diary-form') {
    e.preventDefault();

    const fileInput = document.getElementById('diary-file');
    const commentInput = document.getElementById('diary-text');
    const moodInput = document.getElementById('diary-mood'); // hidden input
    const userEmail = sessionStorage.getItem('userEmail');

    // 최소한 하나는 입력했는지 확인 (방어 코드)
    if (!fileInput.files[0] && !commentInput.value.trim()) {
      alert('사진을 올리거나 내용을 입력해주세요!');
      return;
    }

    // 📦 택배 박스(FormData) 만들기
    const formData = new FormData();
    
    // 사진이 있으면 담기
    if (fileInput.files[0]) {
      formData.append('diaryImage', fileInput.files[0]);
    }
    
    formData.append('userEmail', userEmail);
    formData.append('comment', commentInput.value);
    formData.append('emoji', moodInput.value);

    try {
      const response = await fetch('/api/diary/upload', {
        method: 'POST',
        body: formData // 파일이 있어서 JSON.stringify는 안 써!
      });

      const result = await response.json();

      if (result.ok) {
        alert('오늘의 기록이 타임라인에 저장됐어! 💚');
        closeAnyOpenModal(); // 모달 닫기
        // ✅ 타임라인만 새로 로드 (탭 유지)
          // (선택) 입력 초기화
        e.target.reset();
        document.getElementById('file-name-display').innerText = "클릭하여 사진 업로드";
        document.querySelectorAll('.mood__btn').forEach(btn => btn.classList.remove('is-active'));
        document.getElementById('diary-mood').value = "";
  await loadTimeline();     
      } else {
        alert('저장 실패: ' + result.message);
      }
    } catch (err) {
      console.error('서버 통신 에러:', err);
      alert('서버와 연결할 수 없어! 백엔드가 켜져있는지 확인해봐.');
    }
  }
});

// 타임라인!
async function loadTimeline() {
    const userEmail = sessionStorage.getItem('userEmail');
    const timelineContainer = document.querySelector('.timeline--cards');

    if (!userEmail || !timelineContainer) return;

    try {
        const response = await fetch(`/api/diary/list/${userEmail}`);
        const result = await response.json();

        // 카드 렌더링
        timelineContainer.innerHTML = '';
        if (result.ok && result.data.length > 0) {

            result.data.forEach(item => {
                // console.log("📦 서버에서 받은 아이템 하나:", item);
                // 🛠️ 날짜 처리 방어 로직 (여기가 핵심!)
                let dateStr = "날짜 정보 없음";
                let relativeStr = "";
                
                if (item.CREATED_AT) {
                    const d = new Date(item.CREATED_AT);
                    // 날짜가 유효한지 확인 (isNaN 체크)
                    if (!isNaN(d.getTime())) {
                        dateStr = d.toLocaleDateString(); // "2026. 2. 10." 형태
                        relativeStr = getRelativeTime(item.CREATED_AT);
                    }
                }

                const imageSection = item.IMG_PATH 
                    ? `<div class="tcard__image" style="margin: 10px 0;">
                         <img src="${item.IMG_PATH}" alt="식물사진" style="width:100%; border-radius:12px;">
                       </div>` 
                    : '';

                const cardHtml = `
                    <article class="tcard tcard--green">
                        <div class="tcard__bar"></div>
                        <div class="tcard__row">
                            <div class="tcard__icon" aria-hidden="true">${item.EMOJI || '🌿'}</div>
                            <div class="tcard__main">
                                <div class="tcard__meta">
                                    <span class="tcard__date">${dateStr}</span>
                                    <span class="tcard__tag">${relativeStr}</span>
                                      <button type="button"
                                        class="tcard__delete"
                                        data-memo-id="${item.MEMO_ID}">
                                        삭제
                                      </button>
                                </div>
                                ${imageSection}
                                <div class="tcard__text">${item.MEMO_TEXT || ''}</div>
                            </div>
                        </div>
                    </article>
                `;
                timelineContainer.insertAdjacentHTML('beforeend', cardHtml);
            });
        }
    } catch (err) {
        console.error("타임라인 로드 실패:", err);
    }
}

  document.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('tcard__delete')) return;

    const memoId = e.target.dataset.memoId;
    const userEmail = sessionStorage.getItem('userEmail');

    if (!memoId || !userEmail) return;

    if (!confirm('이 기록을 삭제할까?')) return;

    try {
        const resp = await fetch(
          `/api/diary/${memoId}?userEmail=${encodeURIComponent(userEmail)}`,
          { method: 'DELETE' }
        );

      const data = await resp.json();

      if (resp.ok && data.ok) {
        // 방법 1) 화면에서 즉시 제거(깔끔)
        e.target.closest('article.tcard')?.remove();

        // 방법 2) 그냥 다시 로드(더 안전)
        // await loadTimeline();
      } else {
        alert(data.message || '삭제 실패');
      }
    } catch (err) {
      console.error(err);
      alert('서버 통신 오류');
    }
  });


// 💡 보너스: '오늘', '어제' 등을 계산해주는 함수
function getRelativeTime(dateString) {
    const now = new Date();
    const target = new Date(dateString);
    const diffDays = Math.floor((now - target) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return '오늘';
    if (diffDays === 1) return '어제';
    return `${diffDays}일 전`;
}


// ========================================================
//                    4. 분석 리포트
// ========================================================

// ==========    4-1. 식집사 숙련도 점수 페이지     ===========




// ========================================================
// =============    4-2. 데이터 통계 페이지     ==============
// ========================================================
async function loadStatistics() {
    try {
      // 금고(localStorage)에서 이메일 꺼내기
      const userEmail = sessionStorage.getItem('userEmail'); 
        
      if (!userEmail) {
        console.log("로그인 정보가 없습니다.");
        return;
        }
      // 1. 노드 서버에 분석 데이터 요청!

      // URL 뒤에 ?email=... 을 붙여서 전송
      const response = await fetch(`http://192.168.219.236:3001/api/stats?email=${userEmail}`, {
        method: 'GET'
      });
        
      const result = await response.json();

      if (result.success) {
        const data = result.data;
        const analysis = data.analysis;

      // 하단 수치 업데이트
      document.getElementById('avg-temp').innerText = `${analysis.avg_temp}°C`;
      document.getElementById('avg-hum').innerText = `${analysis.avg_hum}%`;
      document.getElementById('avg-light').innerText = `${analysis.avg_light} lux`;
      document.getElementById('water-avg-interval').innerText = `${analysis.water_avg_interval}일`;
      document.getElementById('water-total-month').innerText = `${analysis.water_total_month}회`;

      // // 그래프 그리기
      renderLineChart('tempChart', data.labels, data.temp_data, '#ff6384', '온도(°C)');
      renderLineChart('humChart', data.labels, data.hum_data, '#36a2eb', '습도(%)');
      renderLineChart('lightChart', data.labels, data.light_data, '#ffcd56', '조도(lux)');
      renderBarChart('waterWeeklyChart', analysis.water_weekly);
    }
  } catch (error) {
    console.error("데이터 로드 실패:", error);
  }
}

// 그래프 그리는 함수
function renderLineChart(canvasId, labels, chartData, color, labelName) {
    const canvas = document.getElementById(canvasId);
    if(!canvas) return; // 💡 캔버스가 없으면 건너뛰는 안전장치

    const ctx = canvas.getContext('2d');
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: labelName,
                data: chartData,
                borderColor: color,
                backgroundColor: color + '33', 
                fill: true,
                tension: 0.4 
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, // 💡 부모 컨테이너 크기에 맞춤
            scales: { y: { beginAtZero: false } } 
        }
    });
}

function renderBarChart(canvasId, weeklyData) {
    const canvas = document.getElementById(canvasId);
    if(!canvas) return;

    const ctx = canvas.getContext('2d');
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }
    const labels = weeklyData.map(d => d.label);
    const values = weeklyData.map(d => d.value);

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: weeklyData.map(d => d.label),
            datasets: [{
                label: '물주기 횟수',
                data: weeklyData.map(d => d.value),
                backgroundColor: '#4bc0c0'
            }]
        },
        options: { 
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        // 💡 핵심: 눈금 간격을 1로 고정!
                        stepSize: 1,
                        // 소수점을 아예 안 나오게 정수로 포맷팅
                        callback: function(value) {
                            if (Math.floor(value) === value) {
                                return value;
                            }
                        }
                    }
                  }
              }
        }
    });
}



// ========================================================
//                      5. 환경 설정
// ========================================================
// 나의 정보 페이지
async function renderUserProfile(email) {
  if (!email) return;

  try {
    console.log(email)
    const res = await fetch(`http://192.168.219.236:3001/api/user/profile/${email}`);
    const result = await res.json();
    
    if (result.success) {
      // 1. HTML에서 이름과 이메일이 들어갈 위치를 찾아 (ID는 네 HTML에 맞게 수정해!)
      const heroNameEl = document.querySelector('.profile-hero__name');
      const nameEl = document.getElementById('profile-name');
      const emailEl = document.getElementById('profile-email');
      const dateEl = document.getElementById('profile-date');

      // 2. 서버에서 받은 진짜 데이터로 갈아끼우기
      if (heroNameEl) heroNameEl.textContent = `${result.userName}님`;
      if (nameEl) nameEl.textContent = result.userName;
      if (emailEl) emailEl.textContent = result.email;
      const date= result.createAt.split('T')[0]; // 표준시 형식 > 날짜형식으로 치환
      if (dateEl) dateEl.textContent = `가입일 : ${date}`;

      console.log("프로필 업데이트 완료:", result.userName);
    }
  } catch (err) {
    console.error("프로필 로딩 실패:", err);
  }
}

// 🌿 반려식물 등록/수정
// 🌿 반려식물 등록 처리 (전체 로직)
document.addEventListener('submit', async (e) => {
  if (e.target && e.target.id === 'plant-form') {
    e.preventDefault();

    const email = sessionStorage.getItem('userEmail');
    const plantName = document.getElementById('plant-name')?.value; // 모달 안의 input ID
    const plantSpecies = document.getElementById('plant-species')?.value;
    const plantDate = document.getElementById('plant-date')?.value;

    try {
      const res = await fetch("http://192.168.219.236:3001/api/plants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantName, plantSpecies, plantDate, email })
      });

      const result = await res.json();

      if (result.success) {
        alert('식물 등록 완료!');
        closeAnyOpenModal(); // 모달 닫고

        // ✨ 바로 여기서 다시 UI를 체크하는 거야!
        // 이 함수가 돌면서 'hidden'을 지우고 새로 등록된 이름을 넣어줄 거야.
        await checkAndRenderPlantUI(email); 
        
      } else {
        alert('등록 실패: ' + result.message);
      }
    } catch (err) {
      console.error(err);
    }
  }
});

// 🌿 반려식물 삭제 처리 (core4_jss.js)
const btnPlantDelete = document.getElementById('btn-plant-delete');

if (btnPlantDelete) {
  btnPlantDelete.addEventListener('click', async () => {
    const email = sessionStorage.getItem('userEmail'); // 누구 식물인지 알아야 하니까!

    if (!email) {
      alert("로그인 정보가 없음");
      return;
    }

    if (confirm('정말 이 반려식물을 삭제하시겠습니까?\n모든 성장 기록이 사라집니다.')) {
      try {
        // 1. 서버에 삭제 요청 (DELETE 방식)
        const res = await fetch(`http://192.168.219.236:3001/api/plants/${email}`, {
          method: "DELETE"
        });
        const result = await res.json();

        if (result.success) {
          alert('식물이 삭제되었습니다.');

          // 2. 화면 갱신 (비서 함수를 다시 불러서 '없음' 화면으로 돌리기)
          if (typeof checkAndRenderPlantUI === 'function') {
            await checkAndRenderPlantUI(email);
          }
        } else {
          alert('삭제 실패: ' + result.message);
        }
      } catch (err) {
        console.error("삭제 통신 에러:", err);
        alert("서버와 연결할 수 없음");
      }
    }
  });
}

// ==========================================================
//                        대시보드 LLM
// ==========================================================

function initPageTabs(target) {
  if (target === 'dashboard') {
    console.log("[dashboard] enter");
    console.log("[dashboard] calling loadLatestLLMNotification");
    document.getElementById('dash-emotion')?.classList.remove('hidden');
    document.getElementById('dash-env')?.classList.add('hidden');
    activateSidebar('#page-dashboard', '[data-dash-tab="emotion"]');
    // ✅ [LLM] 대시보드 들어오면 오늘의 메시지/현재상태 갱신
    loadLatestLLMNotification();
  } 
  else if (target === 'growth') {
    document.querySelectorAll('.growth-panel').forEach(p => {
        p.classList.remove('active', 'hidden');
    });
    document.getElementById('growth-timelapse')?.classList.add('active');
    activateSidebar('#page-growth', '[data-growth-tab="timelapse"]');
  } 
  else if (target === 'report') {
    // 패널 전부 숨김 + active 정리
    document.querySelectorAll('#page-report .report-panel').forEach(p => {
      p.classList.add('hidden');
      p.classList.remove('is-active');
    });

    // skill만 오픈
    const skill = document.getElementById('report-skill');
    skill?.classList.remove('hidden');
    skill?.classList.add('is-active');

    activateSidebar('#page-report', '[data-report-tab="skill"]');
    loadSkillReport();
  }

  else if (target === 'settings') {
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('settings-info')?.classList.remove('hidden');
    activateSidebar('#page-settings', '[data-settings-tab="info"]');
  }
}

// =========================
// [LLM] 오늘의 메시지/현재상태 불러오기 (Node가 프론트 서빙 기준)
// =========================
async function loadLatestLLMNotification() {
  try {
    // ✅ 같은 Origin(노드가 html/js도 서빙)이라 상대경로가 정답
    const res = await fetch("/api/llm/latest-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      console.warn("LLM API 실패:", data);
      applyFallbackUI(data?.message || "알림을 불러오지 못했어요.");
      return;
    }

    const { llm_notification, source_event } = data;

    // 1) 대시보드 '오늘의 메시지' (HTML에 .msg__text 존재)
    const msgEl = document.querySelector("#page-dashboard .msg__text");
    if (msgEl) msgEl.textContent = `"${llm_notification.message}"`;

    const sev = llm_notification?.severity;

    // 2) 카드 + 3) 모달 공통: LLM이 내려준 status_short 사용
    const short = llm_notification?.status_short ?? "상태 확인이 필요해요.";

    const cardDescEl = document.querySelector("#page-dashboard .plant-card__desc");
    if (cardDescEl) cardDescEl.textContent = short;

    const modalStatusEl = document.querySelector("#modal-plant-detail .plant-detail__statusText");
    if (modalStatusEl) modalStatusEl.textContent = short;

    // 4) (선택) 모달 카드 값 채우기: TEMP/HUM/LIGHT가 source_event에 있으면 반영
    // HTML에 id가 current-temp/current-hum/current-light로 잡혀 있음
    const tempEl = document.getElementById("current-temp");
    const humEl = document.getElementById("current-hum");
    const lightEl = document.getElementById("current-light");

    if (tempEl && source_event?.TEMP != null) tempEl.textContent = `${Number(source_event.TEMP).toFixed(1)}°C`;
    if (humEl && source_event?.HUM != null) humEl.textContent = `${Number(source_event.HUM).toFixed(0)}%`;
    if (lightEl && source_event?.LIGHT != null) lightEl.textContent = `${Number(source_event.LIGHT).toFixed(0)}`;

  } catch (e) {
    console.error("LLM 알림 로딩 예외:", e);
    applyFallbackUI("알림 서버 연결에 실패했어요.");
  }
}

// =========================
// [REPORT] 숙련도 점수 + LLM 해석 불러오기
// =========================
async function loadSkillReport() {
  try {
    // 1) 이메일 확보 (지금 프로젝트는 임시 로그인이라 localStorage/전역에서 가져와야 함)
    //    너희 로그인 구조에 맞게 아래 한 줄만 바꾸면 됨.
    const days = 30;

    const email = sessionStorage.getItem("userEmail");
    if (!email) {
      console.error("로그인 이메일이 없습니다.");
      return;
    }

    // 2) 로딩 UI
    document.getElementById("skill-ai-loading")?.classList.remove("hidden");
    document.getElementById("skill-ai-box")?.classList.add("hidden");

    // 3) Node API 호출 (점수 + LLM 합본)
    const res = await fetch("/api/llm/skill-interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, days }),
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      console.warn("skill report api fail:", data);
      const loading = document.getElementById("skill-ai-loading");
      if (loading) loading.textContent = "리포트를 불러오지 못했어요.";
      return;
    }

    // 4) 점수 UI 반영 (기존 하드코딩 72 등 제거)
    const score = data.input; // scorePayload
    const total = Number(score?.scores?.totalScore ?? 0);
    const levelName = score.level.levelName;
    const nextRemain = score.level.nextLevelRemaining;

    const numEl = document.querySelector("#report-skill .skill-score__num");
    if (numEl) numEl.textContent = String(total);

    const rankTextEl = document.querySelector("#report-skill .skill-rank__text");
    if (rankTextEl) rankTextEl.textContent = levelName;

    const barEl = document.querySelector("#report-skill .skill-bar");
    const fillEl = document.querySelector("#report-skill .skill-bar__fill");
    if (barEl) barEl.setAttribute("aria-valuenow", String(total));
    if (fillEl) fillEl.style.width = `${total}%`;

    const nextEl = document.querySelector("#report-skill .skill-next b");
    if (nextEl) nextEl.textContent = `${nextRemain}점`;
    updateLevelSystemUI(total);

    // 5) 세부 점수 UI 반영
    const water = score.scores.waterScore;
    const env = score.scores.envScore;
    const record = score.scores.recordScore;

    document.getElementById("score-water-bar").style.width = water + "%";
    document.getElementById("score-water-num").textContent = `${water} / 100`;

    document.getElementById("score-env-bar").style.width = env + "%";
    document.getElementById("score-env-num").textContent = `${env} / 100`;

    document.getElementById("score-record-bar").style.width = record + "%";
    document.getElementById("score-record-num").textContent = `${record} / 100`;

    // 6) LLM 해석 UI 반영
    const llm = data.interpretation;
    document.getElementById("skill-ai-title").textContent = llm.title;
    document.getElementById("skill-ai-summary").textContent = llm.summary;
    document.getElementById("skill-ai-type").textContent = llm.user_type;

    const strengths = document.getElementById("skill-ai-strengths");
    const weaknesses = document.getElementById("skill-ai-weaknesses");
    const actions = document.getElementById("skill-ai-actions");

    if (strengths) strengths.innerHTML = (llm.strengths || []).map(s => `<li>${s}</li>`).join("");
    if (weaknesses) weaknesses.innerHTML = (llm.weaknesses || []).map(s => `<li>${s}</li>`).join("");
    if (actions) actions.innerHTML = (llm.next_actions || []).map(s => `<li>${s}</li>`).join("");

    document.getElementById("skill-ai-loading")?.classList.add("hidden");
    document.getElementById("skill-ai-box")?.classList.remove("hidden");

  } catch (err) {
    console.error("loadSkillReport error:", err);
    const loading = document.getElementById("skill-ai-loading");
    if (loading) loading.textContent = "에러가 발생했어요.";
  }
}

function updateLevelSystemUI(total) {
  // 1) 옵션1 DOM 요소들
  const badgeEl = document.getElementById("level-current-badge");
  const nextEl = document.getElementById("level-next-text");
  const fillEl = document.getElementById("level-progress-fill");
  const scoreTextEl = document.getElementById("level-score-text");
  const rangeTextEl = document.getElementById("level-range-text");

  const steps = Array.from(document.querySelectorAll(".level-system .level-step"));

  if (!steps.length) {
    console.warn("[LevelSystem] .level-step 요소를 못 찾았어요. HTML 확인 필요");
    return;
  }

  // 2) 현재 레벨 찾기
  const currentStep =
    steps.find(step => {
      const min = Number(step.dataset.min);
      const max = Number(step.dataset.max);
      return total >= min && total <= max;
    }) || steps[0];

  const curMin = Number(currentStep.dataset.min);
  const curMax = Number(currentStep.dataset.max);
  const curLabel = currentStep.dataset.label || "현재 레벨";

  // 3) 현재 표시(하이라이트)
  steps.forEach(s => s.classList.remove("is-current"));
  currentStep.classList.add("is-current");

  // 4) 상단 텍스트
  if (badgeEl) badgeEl.textContent = `현재 레벨 · ${curLabel}`;
  if (scoreTextEl) scoreTextEl.textContent = `점수: ${total}`;
  if (rangeTextEl) rangeTextEl.textContent = `구간: ${curMin} - ${curMax}점`;

  // 5) 진행도(현재 구간 내 퍼센트)
  const denom = Math.max(1, curMax - curMin);
  const pct = Math.max(0, Math.min(100, ((total - curMin) / denom) * 100));
  if (fillEl) fillEl.style.width = `${pct.toFixed(1)}%`;

  // 6) “다음 레벨까지” 텍스트
  const currentIndex = steps.indexOf(currentStep);
  const nextStep = steps[currentIndex + 1];

  if (!nextEl) return;

  if (!nextStep) {
    nextEl.textContent = "최고 레벨이에요! 🎉";
  } else {
    const nextMin = Number(nextStep.dataset.min);
    const remain = Math.max(0, nextMin - total);
    nextEl.textContent = `다음 레벨까지 ${remain}점`;
  }
}

function applyFallbackUI(messageText) {
  // 오늘의 메시지(독립)
  const msgEl = document.querySelector("#page-dashboard .msg__text");
  if (msgEl) msgEl.textContent = `"${messageText}"`;

  // 상태요약(카드+모달 동일)
  const statusShort = "알림을 불러오지 못했어요."; // 원하는 문구로 조정 가능

  const cardDescEl = document.querySelector("#page-dashboard .plant-card__desc");
  if (cardDescEl) cardDescEl.textContent = statusShort;

  const modalStatusEl = document.querySelector("#modal-plant-detail .plant-detail__statusText");
  if (modalStatusEl) modalStatusEl.textContent = statusShort;
}



// ==========================================================
//                         미 구 현
// ==========================================================
// 비밀번호 찾기
// document.addEventListener('submit', (e) => {
//   if (e.target && e.target.id === 'forgot-form') {
//     e.preventDefault();
//     // ⚠️ [BACKEND TODO] : 비밀번호 찾기 API
//     alert('임시: 비밀번호 찾기 요청');
//     closeAnyOpenModal();
//   }
// });

// 사용자 정보 수정
// document.addEventListener('submit', (e) => {
//   const id = e.target.id;
//   if (['form-edit-name', 'form-edit-phone', 'form-edit-address', 'form-edit-email'].includes(id)) {
//     e.preventDefault();
//     // ⚠️ [BACKEND TODO] : 사용자 프로필 업데이트 API
//     alert('성공적으로 수정되었습니다! (API 연결 필요)');
//     closeAnyOpenModal();
//     e.target.reset();
//   }
// });

// // 🔐 비밀번호 변경
// document.addEventListener('submit', (e) => {
//   if (e.target && e.target.id === 'password-form') {
//     e.preventDefault();
//     const newPw = document.getElementById('new-pw').value;
//     const confirmPw = document.getElementById('confirm-pw').value;

//     if (newPw.length < 4) { alert('비밀번호는 4자 이상이어야 합니다.'); return; }
//     if (newPw !== confirmPw) { alert('새 비밀번호가 일치하지 않습니다.'); return; }

//     // ⚠️ [BACKEND TODO] : 비밀번호 변경 API
//     alert('비밀번호가 성공적으로 변경되었습니다!');
//     closeAnyOpenModal();
//     e.target.reset();
//   }
// });


// ========================================================
//                     기타 : 함수 추가
// ========================================================

/*
    사용자의 반려식물 정보를 가져와서 화면을 업데이트하는 비서 함수
 */
async function checkAndRenderPlantUI(email) {
  const emptyState = document.getElementById('plant-empty-state');
  const existState = document.getElementById('plant-exist-state');

  // 이메일이 없으면 실행 안 함
  if (!email) return;

  try {
    // 1. 서버에 해당 유저의 식물 정보 요청 (GET 방식)
    console.log("지금 이메일:", email);
    const res = await fetch(`http://192.168.219.236:3001/api/plants/${email}`);
    const result = await res.json();
    // console.log("서버가 준 결과:", result);
    if (result.success && result.hasPlant) {
      // ✅ 식물이 있는 경우: '있음' 화면 보여주고 데이터 채우기
      emptyState?.classList.add('hidden');
      existState?.classList.remove('hidden');

      // HTML의 식물 이름을 서버 데이터로 교체
      const nameEl = document.getElementById('tree-name')
      if (nameEl) nameEl.textContent = result.plantName;

      // ✅ 3. 함께한 날짜(D-Day) 계산 로직
      const periodEl = document.getElementById('tree-period');
      if (periodEl && result.plantDate) {
        const today = new Date();
        const startDate = new Date(result.plantDate);
        
        // 날짜 차이 계산기
        const diffTime = today - startDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // 오늘부터 1일!

        periodEl.textContent = `${diffDays}일 동안 함께 성장했습니다 🌱`;
      }
      
      console.log("UI 업데이트 완료:", result.plantName);
    } else {
      // 식물이 없는 경우: '없음' 화면 보여주기
      emptyState?.classList.remove('hidden');
      existState?.classList.add('hidden');
    }
  } catch (err) {
    console.error("식물 정보 로딩 실패:", err);
  }
}

/*function handlePageNavigation(navTarget) {
  // ✅ 현재 페이지 저장 (새로고침 복원용)
  sessionStorage.setItem('currentPage', navTarget);

  if (typeof showPage === 'function') {
    showPage(`page-${navTarget}`);
  }

  // (settings/profile 로딩 로직은 그대로)
  if (navTarget === 'settings' || navTarget === 'profile') {
    const email = localStorage.getItem('userEmail');
    if (email) {
      renderUserProfile(email);
    }
  }

  if (typeof setActiveNav === 'function') {
    setActiveNav(navTarget);
  }
}*/
