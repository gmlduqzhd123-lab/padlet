// 📲 앱 설치(홈 화면에 추가) 안내. 브라우저 정보만 읽으며 패들렛 자료·키와는 관계가 없다.
// 서비스 워커·저장소를 쓰지 않는다. 크롬·엣지·삼성 인터넷은 설치 창을, 그 밖은 기기별 방법을 보여 준다.

export function installEnvironment({ userAgent: ua, platform, maxTouchPoints }) {
  const ios = /iphone|ipad|ipod/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  if (/KAKAOTALK/i.test(ua)) return { kind: "kakao", ios };
  if (/NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|; wv\)/i.test(ua)) return { kind: "in-app", ios };
  if (ios) return { kind: /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|Whale/i.test(ua) ? "ios-safari" : "ios-other", ios };
  if (/android/i.test(ua)) return { kind: "android", ios, samsung: /SamsungBrowser/i.test(ua) };
  if (/Firefox/i.test(ua)) return { kind: "firefox", ios };
  if (/Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua)) return { kind: "mac-safari", ios };
  return { kind: "desktop", ios };
}

export function installGuide(env) {
  const browser = env.ios ? "Safari" : "다른 브라우저";
  switch (env.kind) {
    case "kakao":
      return {
        lead: `카카오톡 안에서 연 화면에서는 앱을 설치할 수 없어요. 아래 버튼으로 ${env.ios ? "Safari" : "인터넷 브라우저"}에서 다시 열어 주세요.`,
        external: env.ios ? "Safari로 열기" : "브라우저로 열기",
        steps: [],
        note: `버튼이 안 되면 카카오톡 화면의 ⋮ 메뉴에서 ‘${browser}로 열기’를 누른 뒤 앱 설치를 다시 눌러 주세요.`,
      };
    case "in-app":
      return { lead: "이 앱(인앱 브라우저) 안에서는 설치할 수 없어요.", external: null, steps: ["화면의 ⋮ 또는 ⋯ 메뉴를 누르세요.", `‘${browser}로 열기’를 누르세요.`, "열린 화면에서 앱 설치를 다시 눌러 주세요."], note: null };
    case "ios-safari":
      return { lead: null, external: null, steps: ["Safari 아래쪽(아이패드는 위쪽) 공유 버튼(□↑)을 누르세요.", "목록을 내려 ‘홈 화면에 추가’를 누르세요.", "오른쪽 위 ‘추가’를 누르면 홈 화면에 아이콘이 생겨요."], note: null };
    case "ios-other":
      return { lead: "아이폰·아이패드는 Safari에서 설치하는 것이 가장 확실해요.", external: null, steps: ["이 주소를 Safari에서 열어 주세요.", "아래쪽 공유 버튼(□↑)을 누르세요.", "‘홈 화면에 추가’ → ‘추가’를 누르세요."], note: null };
    case "android":
      return { lead: null, external: null, steps: [`브라우저 ${env.samsung ? "아래쪽 ≡ 메뉴" : "오른쪽 위 ⋮ 메뉴"}를 누르세요.`, "‘앱 설치’ 또는 ‘홈 화면에 추가’를 누르세요.", "‘설치(추가)’를 누르면 홈 화면에 아이콘이 생겨요."], note: "메뉴에 설치 항목이 없으면 크롬이나 삼성 인터넷으로 열어 주세요." };
    case "firefox":
      return { lead: "파이어폭스는 앱 설치를 지원하지 않아요. 크롬이나 엣지로 이 주소를 열고 다시 눌러 주세요.", external: null, steps: [], note: null };
    case "mac-safari":
      return { lead: null, external: null, steps: ["Safari 메뉴 막대의 ‘파일’ 메뉴(또는 공유 버튼)를 누르세요.", "‘Dock에 추가’를 누르세요."], note: null };
    default:
      return { lead: null, external: null, steps: ["주소창 오른쪽의 설치 아이콘(⊕ 또는 🖥️)을 누르세요.", "안 보이면 오른쪽 위 ⋮ 메뉴 → ‘앱 설치’(엣지는 ⋯ → 앱 → ‘이 사이트를 앱으로 설치’)를 누르세요."], note: "이미 설치했다면 바탕화면이나 시작 메뉴에서 열 수 있어요." };
  }
}

/** 카카오톡에서 같은 화면을 기본 브라우저로 여는 주소. 해시·검색어를 빼서 자료가 섞이지 않게 한다. */
export function kakaoOpenExternalUrl(pageUrl) {
  const url = new URL(pageUrl);
  url.hash = "";
  url.search = "";
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(url.href)}`;
}

function standalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches === true || navigator.standalone === true;
}

function setup() {
  const button = document.getElementById("installApp");
  const dialog = document.getElementById("installDialog");
  if (!button || !dialog) return;
  let deferred = null;
  button.hidden = standalone();
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event;
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    button.hidden = true;
    dialog.close();
  });
  button.addEventListener("click", async () => {
    if (deferred) {
      const event = deferred;
      deferred = null;
      await event.prompt();
      try { await event.userChoice; } catch { /* 창을 닫아도 앱은 그대로 동작 */ }
      return;
    }
    const guide = installGuide(installEnvironment(navigator));
    const lead = dialog.querySelector("[data-install-lead]");
    const external = dialog.querySelector("[data-install-external]");
    const steps = dialog.querySelector("[data-install-steps]");
    const note = dialog.querySelector("[data-install-note]");
    lead.textContent = guide.lead ?? "";
    lead.hidden = !guide.lead;
    external.hidden = !guide.external;
    if (guide.external) {
      external.textContent = guide.external;
      external.href = kakaoOpenExternalUrl(location.href);
    }
    steps.replaceChildren(...guide.steps.map((text) => Object.assign(document.createElement("li"), { textContent: text })));
    steps.hidden = guide.steps.length === 0;
    note.textContent = guide.note ?? "";
    note.hidden = !guide.note;
    dialog.showModal();
  });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
}

if (typeof document !== "undefined") setup();
