// src/api/user.js
import { API_BASE } from "./session";

const LS_KEY = "ai_fitness_user";

async function handleResp(resp) {
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status} ${text}`);
  }
  return resp.json();
}

/** 내부: {id,userId,name,...} → {id,name,...} 표준화 */
function normalizeUser(obj = {}) {
  const id = obj.id ?? obj.userId ?? "";
  return {
    ...obj,
    id,
    name: obj.name ?? "",
  };
}

/** 로컬스토리지 유틸 */
export function loadLocalUser() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return normalizeUser(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveLocalUser(user) {
  const { id, name } = normalizeUser(user);
  if (!id) return; // id 없으면 저장 안 함
  localStorage.setItem(LS_KEY, JSON.stringify({ id, name }));
}

export function clearLocalUser() {
  localStorage.removeItem(LS_KEY);
}

/** ✅ 서버에 사용자 생성 요청 (서버가 id 또는 userId 중 무엇을 주든 표준화) */
export async function createUser({ name }) {
  const resp = await fetch(`${API_BASE}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await handleResp(resp); // 서버 응답: { id?, userId?, name, createdAt? }
  const norm = normalizeUser(data);
  return {
    id: norm.id,
    name: norm.name,
    createdAt: data.createdAt ?? null,
  };
}

/** 이름으로 사용자 생성 후 로컬에도 저장 */
export async function createAndStoreUser({ name }) {
  const created = await createUser({ name });
  saveLocalUser(created); // {id, name} 저장
  return created;
}

/** 기타 보조 함수 */
export function requireId() {
  const u = loadLocalUser();
  if (!u?.id) throw new Error("id가 없습니다. 시작 화면에서 계정을 먼저 생성해주세요.");
  return u.id;
}

/* ✅ 과거 코드 호환: 기존 이름 유지, 내부적으로 id 반환 */
export function requireUserId() {
  return requireId();
}

export function patchLocalUserName(newName = "") {
  const u = loadLocalUser() || {};
  const merged = { ...u, name: newName };
  saveLocalUser(merged); // id 유지, 이름만 갱신
  return merged;
}

export async function ensureUserByName(name) {
  const existing = loadLocalUser();
  if (existing?.id) return { ...existing, existed: true };
  const created = await createAndStoreUser({ name });
  return { ...created, existed: false };
}
