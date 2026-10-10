// 📱 QR로 접속: 교실 TV·전자칠판에 이 앱 주소 QR을 크게 띄운다. 미리 만든 qr.svg를 써서 인터넷 없이도 뜬다.
function setup() {
  const button = document.getElementById("qrApp");
  const dialog = document.getElementById("qrDialog");
  if (!button || !dialog) return;
  button.addEventListener("click", () => dialog.showModal());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
}

if (typeof document !== "undefined") setup();
