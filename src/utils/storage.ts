import { Album, AlbumMeta, AlbumReviewStatus, OperationLog } from '../types';

const STORAGE_KEYS = {
  ALBUMS: 'albums_data',
  REVIEW_STATUS: 'review_status',
  ALBUM_META: 'album_meta',
  OPERATION_LOGS: 'operation_logs',
} as const;

/**
 * 获取所有专辑数据
 */
export function getAllAlbums(): Album[] {
  const data = localStorage.getItem(STORAGE_KEYS.ALBUMS);
  return data ? JSON.parse(data) : [];
}

/**
 * 保存专辑数据
 */
export function saveAlbums(albums: Album[]): void {
  localStorage.setItem(STORAGE_KEYS.ALBUMS, JSON.stringify(albums));
}

/**
 * 获取专辑导入元数据（albumId -> meta）
 */
export function getAlbumMetaMap(): Record<string, AlbumMeta> {
  const data = localStorage.getItem(STORAGE_KEYS.ALBUM_META);
  return data ? JSON.parse(data) : {};
}

/**
 * 保存专辑导入元数据
 */
export function saveAlbumMetaMap(meta: Record<string, AlbumMeta>): void {
  localStorage.setItem(STORAGE_KEYS.ALBUM_META, JSON.stringify(meta));
}

/**
 * 获取所有抽卡状态
 */
export function getAllReviewStatus(): Record<string, AlbumReviewStatus> {
  const data = localStorage.getItem(STORAGE_KEYS.REVIEW_STATUS);
  return data ? JSON.parse(data) : {};
}

/**
 * 保存抽卡状态
 */
export function saveReviewStatus(status: Record<string, AlbumReviewStatus>): void {
  localStorage.setItem(STORAGE_KEYS.REVIEW_STATUS, JSON.stringify(status));
}

/**
 * 获取单个专辑的抽卡状态
 */
export function getAlbumReviewStatus(albumId: string): AlbumReviewStatus | null {
  const allStatus = getAllReviewStatus();
  return allStatus[albumId] || null;
}

/**
 * 更新单个专辑的抽卡状态
 */
export function updateAlbumReviewStatus(albumId: string, status: Partial<AlbumReviewStatus>): void {
  const allStatus = getAllReviewStatus();
  const album = getAllAlbums().find(a => a.albumId === albumId);
  
  if (!album) {
    throw new Error('专辑不存在');
  }
  
  const existingStatus = allStatus[albumId];
  
  // 允许已抽卡的数据重新修改
  
  allStatus[albumId] = {
    albumId,
    albumName: album.albumName,
    bookName: album.bookName,
    category: album.category,
    reviewProgress: status.reviewProgress ?? existingStatus?.reviewProgress ?? 0,
    reviewStatus: status.reviewStatus ?? existingStatus?.reviewStatus ?? '未抽卡',
    selectedImageIndex: status.selectedImageIndex ?? existingStatus?.selectedImageIndex,
    selectedImageLink: status.selectedImageLink ?? existingStatus?.selectedImageLink,
  };
  
  saveReviewStatus(allStatus);
}

/**
 * 批量更新抽卡状态
 */
export function batchUpdateReviewStatus(albumIds: string[]): void {
  const allStatus = getAllReviewStatus();
  
  albumIds.forEach(albumId => {
    const existingStatus = allStatus[albumId];
    if (existingStatus && existingStatus.reviewStatus === '已抽卡') {
      return; // 跳过已抽卡的数据
    }
    
    const album = getAllAlbums().find(a => a.albumId === albumId);
    if (!album) return;
    
    allStatus[albumId] = {
      albumId,
      albumName: album.albumName,
      bookName: album.bookName,
      category: album.category,
      reviewProgress: 0,
      reviewStatus: '已抽卡',
      selectedImageLink: '抽卡不通过',
    };
  });
  
  saveReviewStatus(allStatus);
}

/**
 * 导入新专辑数据（处理重复）
 */
export function importAlbums(newAlbums: Album[]): { imported: number; duplicates: number } {
  const existingAlbums = getAllAlbums();
  const existingStatus = getAllReviewStatus();
  const existingMeta = getAlbumMetaMap();
  const albumMap = new Map<string, Album>();
  const metaToKeep: Record<string, AlbumMeta> = {};
  
  // 保留已抽卡的专辑
  existingAlbums.forEach(album => {
    const status = existingStatus[album.albumId];
    if (status && status.reviewStatus === '已抽卡') {
      albumMap.set(album.albumId, album);
      if (existingMeta[album.albumId]) {
        metaToKeep[album.albumId] = existingMeta[album.albumId];
      }
    }
  });
  
  // 添加新专辑或覆盖未抽卡的专辑
  let duplicates = 0;
  const nowIso = new Date().toISOString();
  newAlbums.forEach(album => {
    if (albumMap.has(album.albumId)) {
      duplicates++;
    }
    albumMap.set(album.albumId, album);
    // 未抽卡数据允许覆盖，导入时间以本次导入为准；已抽卡数据已在上面保留，不会走到这里
    metaToKeep[album.albumId] = { albumId: album.albumId, importedAt: nowIso };
  });
  
  saveAlbums(Array.from(albumMap.values()));
  
  // 清理已删除专辑的抽卡状态
  const albumIds = new Set(albumMap.keys());
  const statusToKeep: Record<string, AlbumReviewStatus> = {};
  Object.entries(existingStatus).forEach(([id, status]) => {
    if (albumIds.has(id)) {
      statusToKeep[id] = status;
    }
  });
  saveReviewStatus(statusToKeep);

  // 清理已删除专辑的导入元数据
  const metaCleaned: Record<string, AlbumMeta> = {};
  Object.entries(metaToKeep).forEach(([id, meta]) => {
    if (albumIds.has(id)) metaCleaned[id] = meta;
  });
  saveAlbumMetaMap(metaCleaned);
  
  return {
    imported: newAlbums.length,
    duplicates,
  };
}

/**
 * 批量删除专辑数据（含抽卡状态与导入元数据）
 */
export function deleteAlbums(albumIdsToDelete: string[]): { deleted: number } {
  const deleteSet = new Set(albumIdsToDelete);
  if (deleteSet.size === 0) return { deleted: 0 };

  const albums = getAllAlbums();
  const status = getAllReviewStatus();
  const meta = getAlbumMetaMap();

  const remainingAlbums = albums.filter(a => !deleteSet.has(a.albumId));
  const remainingStatus: Record<string, AlbumReviewStatus> = {};
  Object.entries(status).forEach(([id, s]) => {
    if (!deleteSet.has(id)) remainingStatus[id] = s;
  });
  const remainingMeta: Record<string, AlbumMeta> = {};
  Object.entries(meta).forEach(([id, m]) => {
    if (!deleteSet.has(id)) remainingMeta[id] = m;
  });

  saveAlbums(remainingAlbums);
  saveReviewStatus(remainingStatus);
  saveAlbumMetaMap(remainingMeta);

  return { deleted: deleteSet.size };
}

/**
 * 添加操作日志
 */
export function addOperationLog(operation: string, result: string): void {
  const logs = getOperationLogs();
  const newLog: OperationLog = {
    id: Date.now().toString(),
    operator: '系统用户', // 可以根据实际需求修改
    operationTime: new Date().toLocaleString('zh-CN'),
    operation,
    result,
  };
  logs.unshift(newLog);
  // 只保留最近1000条日志
  if (logs.length > 1000) {
    logs.splice(1000);
  }
  localStorage.setItem(STORAGE_KEYS.OPERATION_LOGS, JSON.stringify(logs));
}

/**
 * 获取操作日志
 */
export function getOperationLogs(): OperationLog[] {
  const data = localStorage.getItem(STORAGE_KEYS.OPERATION_LOGS);
  return data ? JSON.parse(data) : [];
}

/**
 * 清空所有数据（用于测试或重置）
 */
export function clearAllData(): void {
  localStorage.removeItem(STORAGE_KEYS.ALBUMS);
  localStorage.removeItem(STORAGE_KEYS.REVIEW_STATUS);
  localStorage.removeItem(STORAGE_KEYS.ALBUM_META);
  // 不清空日志
}
