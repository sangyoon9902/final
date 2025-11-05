import { API_BASE } from "./session";

const LS_KEY = "ai_fitness_user";

async function handleResp(resp) {
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status} ${text}`);
  }
  return resp.json();
}

/** 로컬스토리지 유틸 */
export function loadLocalUser() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function saveLocalUser(user) {
  if (!user || !user.userId) return;
  localStorage.setItem(LS_KEY, JSON.stringify({ userId: user.userId, name: user.name || "" }));
}
export function clearLocalUser() {
  localStorage.removeItem(LS_KEY);
}

/** ✅ 서버에 사용자 생성 요청 */
export async function createUser({ name }) {
  const resp = await fetch(`${API_BASE}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return handleResp(resp); // { userId, name, createdAt }
}

/** 이름으로 사용자 생성 후 로컬에도 저장 */
export async function createAndStoreUser({ name }) {
  const data = await createUser({ name });
  saveLocalUser({ userId: data.userId, name: data.name });
  return data;
}

/** 기타 보조 함수 */
export function requireUserId() {
  const u = loadLocalUser();
  if (!u?.userId) throw new Error("userId가 없습니다. 시작 화면에서 계정을 먼저 생성해주세요.");
  return u.userId;
}
export function patchLocalUserName(newName = "") {
  const u = loadLocalUser() || {};
  const merged = { ...u, name: newName };
  saveLocalUser(merged);
  return merged;
}
export async function ensureUserByName(name) {
  const existing = loadLocalUser();
  if (existing?.userId) return { ...existing, existed: true };
  const created = await createAndStoreUser({ name });
  return { ...created, existed: false };
}
