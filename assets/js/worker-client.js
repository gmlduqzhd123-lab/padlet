let worker,
  sequence = 0,
  pending = new Map();
export function startWorker(onReady) {
  worker = new Worker(new URL("./import-worker.js", import.meta.url));
  worker.onmessage = ({ data }) => {
    if (data.ready) {
      onReady();
      return;
    }
    if (data.fatal) {
      for (const p of pending.values()) p.reject(Error(data.fatal));
      pending.clear();
      return;
    }
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    data.error ? p.reject(Error(data.error)) : p.resolve(data.result);
  };
  worker.onerror = () => {
    for (const p of pending.values()) p.reject(Error("로컬 처리 Worker 오류"));
    pending.clear();
  };
}
export function localTask(action, ...args) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, action, args });
  });
}
export function cancelLocal(onReady) {
  worker.terminate();
  for (const p of pending.values())
    p.reject(Error("로컬 파일 처리 취소 · 기존 자료는 유지됩니다."));
  pending.clear();
  startWorker(onReady);
}
