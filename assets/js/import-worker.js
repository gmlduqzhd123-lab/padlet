// Classic worker: vendor UMD bundles stay local; application adapters are ES modules.
importScripts("../vendor/xlsx-0.20.3.min.js", "../vendor/fflate-0.8.2.js");
let adapters;
import("./local-import.js")
  .then((module) => {
    adapters = module;
    self.postMessage({ ready: true });
  })
  .catch(() =>
    self.postMessage({ fatal: "로컬 처리 모듈을 불러오지 못했습니다." }),
  );
self.onmessage = async ({ data }) => {
  const { id, action, args } = data;
  try {
    if (!adapters || !["readTable", "readAssets"].includes(action))
      throw Error("지원하지 않는 로컬 처리");
    const result = await adapters[action](...args);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message || "파일 처리 실패" });
  }
};
