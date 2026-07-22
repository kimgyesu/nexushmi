// 사용자별 클라우드 프로젝트 저장/불러오기 (Firestore)
//   Firestore 문서 1개 최대 1MB 제한 → 큰 프로젝트(배경 data URI 등)는 여러 조각으로 나눠 저장.
//   경로: users/{uid}/nexus/meta (조각수) + users/{uid}/nexus/chunk_0..N (JSON 조각)
import { db } from '../firebase'
import { doc, getDoc, writeBatch } from 'firebase/firestore'

const CHUNK = 400000 // 조각당 문자수 (~400KB, 1MB 문서한도 안전 마진)
const metaRef = uid => doc(db, 'users', uid, 'nexus', 'meta')
const chunkRef = (uid, i) => doc(db, 'users', uid, 'nexus', 'chunk_' + i)

export async function loadCloudProject(uid) {
  try {
    const meta = await getDoc(metaRef(uid))
    if (!meta.exists()) return null
    const n = meta.data().chunks || 0
    if (!n) return null
    const parts = await Promise.all(Array.from({ length: n }, (_, i) => getDoc(chunkRef(uid, i))))
    const str = parts.map(c => (c.exists() ? c.data().data : '')).join('')
    return str ? JSON.parse(str) : null
  } catch (e) { console.warn('[cloud] 불러오기 실패:', e.code || e.message); return null }
}

export async function saveCloudProject(uid, project) {
  try {
    const str = JSON.stringify(project)
    const n = Math.ceil(str.length / CHUNK)
    const batch = writeBatch(db)
    for (let i = 0; i < n; i++) batch.set(chunkRef(uid, i), { data: str.slice(i * CHUNK, (i + 1) * CHUNK) })
    batch.set(metaRef(uid), { chunks: n, size: str.length, updatedAt: Date.now() })
    await batch.commit()
  } catch (e) { console.warn('[cloud] 저장 실패:', e.code || e.message) }
}
