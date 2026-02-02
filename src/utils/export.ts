import { Album, AlbumReviewStatus, ReviewResult } from '../types';
import { getAllAlbums, getAllReviewStatus } from './storage';
import { exportCSV } from './csvParser';

/**
 * 导出抽卡结果
 */
export function exportReviewResults(filteredAlbumIds?: string[]): void {
  const albums = getAllAlbums();
  const reviewStatus = getAllReviewStatus();
  
  let albumIdsToExport = filteredAlbumIds || albums.map(a => a.albumId);
  
  const results: ReviewResult[] = albumIdsToExport.map(albumId => {
    const album = albums.find(a => a.albumId === albumId);
    const status = reviewStatus[albumId];
    
    if (!album) {
      return {
        albumId,
        albumName: '',
        bookName: '',
        category: '',
        imageLink: '未抽卡',
        reviewStatus: '未抽卡',
      };
    }
    
    if (!status || status.reviewStatus === '未抽卡') {
      return {
        albumId: album.albumId,
        albumName: album.albumName,
        bookName: album.bookName,
        category: album.category,
        imageLink: '未抽卡',
        reviewStatus: '未抽卡',
      };
    }
    
    return {
      albumId: album.albumId,
      albumName: album.albumName,
      bookName: album.bookName,
      category: album.category,
      imageLink: status.selectedImageLink || '未抽卡',
      reviewStatus: '已抽卡',
    };
  });
  
  // 转换为CSV格式
  const csvData = results.map(result => ({
    '专辑id': result.albumId,
    '专辑名称': result.albumName,
    '书名': result.bookName,
    '赛道品类': result.category,
    '图片链接': result.imageLink,
    '抽卡状态': result.reviewStatus,
  }));
  
  // 生成文件名
  const now = new Date();
  const timestamp = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');
  
  const filename = `专辑图片抽卡结果_${timestamp}.csv`;
  
  exportCSV(csvData, filename);
}
