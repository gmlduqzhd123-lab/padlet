// The key is never persisted or exposed as a model field.
export function createApiSession() {
  let key = "";
  return {
    set(value) {
      key = String(value).trim();
    },
    get() {
      return key;
    },
    has() {
      return !!key;
    },
    clear() {
      key = "";
    },
  };
}
