import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteAlbums, getAlbumMetaMap, getAllAlbums, getAllReviewStatus, batchUpdateReviewStatus, addOperationLog } from '../utils/storage';
import { exportReviewResults } from '../utils/export';
import { Album, AlbumMeta, AlbumReviewStatus } from '../types';
import { Modal } from '../components/Modal';
import '../styles/global.css';

interface FilterState {
  reviewStatus: '全部' | '已抽卡' | '未抽卡';
  searchText: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [reviewStatus, setReviewStatus] = useState<Record<string, AlbumReviewStatus>>({});
  const [albumMeta, setAlbumMeta] = useState<Record<string, AlbumMeta>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterState>({
    reviewStatus: '全部',
    searchText: '',
    startDate: '',
    endDate: '',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // 加载数据
  const loadData = () => {
    const albumsData = getAllAlbums();
    const statusData = getAllReviewStatus();
    const metaData = getAlbumMetaMap();
    setAlbums(albumsData);
    setReviewStatus(statusData);
    setAlbumMeta(metaData);
  };

  useEffect(() => {
    loadData();
  }, []);

  // 当筛选条件改变时，清理不在当前筛选结果中的选中项
  useEffect(() => {
    const filteredIds = new Set(filteredAlbums.map(a => a.albumId));
    setSelectedIds(prev => {
      const newSelected = new Set<string>();
      prev.forEach(id => {
        if (filteredIds.has(id)) {
          newSelected.add(id);
        }
      });
      return newSelected;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.reviewStatus, filter.searchText]);

  // 统计数据
  const stats = useMemo(() => {
    const total = albums.length;
    let reviewed = 0;
    let unreviewed = 0;

    albums.forEach(album => {
      const status = reviewStatus[album.albumId];
      if (status && status.reviewStatus === '已抽卡') {
        reviewed++;
      } else {
        unreviewed++;
      }
    });

    return {
      total,
      reviewed,
      unreviewed,
      completionRate: total > 0 ? (reviewed / total) * 100 : 0,
    };
  }, [albums, reviewStatus]);

  // 过滤数据
  const filteredAlbums = useMemo(() => {
    let result = albums;

    // 抽卡状态筛选
    if (filter.reviewStatus !== '全部') {
      result = result.filter(album => {
        const status = reviewStatus[album.albumId];
        const isReviewed = status && status.reviewStatus === '已抽卡';
        return filter.reviewStatus === '已抽卡' ? isReviewed : !isReviewed;
      });
    }

    // 搜索筛选
    if (filter.searchText) {
      const searchLower = filter.searchText.toLowerCase();
      result = result.filter(
        album =>
          album.albumId.toLowerCase().includes(searchLower) ||
          album.bookName.toLowerCase().includes(searchLower)
      );
    }

    // 按导入时间筛选（精确到日，支持起止日期）
    if (filter.startDate || filter.endDate) {
      const start = filter.startDate ? new Date(`${filter.startDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
      const end = filter.endDate ? new Date(`${filter.endDate}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
      result = result.filter((album) => {
        const meta = albumMeta[album.albumId];
        if (!meta?.importedAt) return false;
        const t = new Date(meta.importedAt).getTime();
        return t >= start && t <= end;
      });
    }

    return result;
  }, [albums, reviewStatus, filter.reviewStatus, filter.searchText, filter.startDate, filter.endDate, albumMeta]);

  // 分页数据
  const paginatedAlbums = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAlbums.slice(start, start + pageSize);
  }, [filteredAlbums, currentPage, pageSize]);

  // 总页数
  const totalPages = Math.ceil(filteredAlbums.length / pageSize);

  // 处理全选
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredAlbums.map(a => a.albumId)));
    } else {
      setSelectedIds(new Set());
    }
  };

  // 处理单选
  const handleSelectOne = (albumId: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(albumId);
    } else {
      newSelected.delete(albumId);
    }
    setSelectedIds(newSelected);
  };

  // 批量抽卡（不通过）
  const handleBatchReview = () => {
    if (selectedIds.size === 0) {
      setMessage({ type: 'error', text: '请至少选择一个未抽卡的专辑' });
      return;
    }

    const idsToReview = Array.from(selectedIds).filter(id => {
      const status = reviewStatus[id];
      return !status || status.reviewStatus === '未抽卡';
    });

    if (idsToReview.length === 0) {
      setMessage({ type: 'error', text: '选中的专辑中没有未抽卡的数据' });
      return;
    }

    setShowBatchModal(true);
  };

  const confirmBatchReview = () => {
    const idsToReview = Array.from(selectedIds).filter(id => {
      const status = reviewStatus[id];
      return !status || status.reviewStatus === '未抽卡';
    });

    try {
      batchUpdateReviewStatus(idsToReview);
      addOperationLog(
        '批量抽卡',
        `批量抽卡${idsToReview.length}个专辑，全部标记为抽卡不通过`
      );
      setMessage({ type: 'success', text: `成功批量抽卡 ${idsToReview.length} 个专辑` });
      setSelectedIds(new Set());
      setShowBatchModal(false);
      loadData();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '批量抽卡失败' });
    }
  };

  // 导出结果
  const handleExport = () => {
    try {
      const filteredIds = filteredAlbums.map(a => a.albumId);
      exportReviewResults(filteredIds);
      setMessage({ type: 'success', text: '导出成功' });
      addOperationLog('导出抽卡结果', `导出${filteredIds.length}条记录`);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '导出失败' });
    }
  };

  // 导出选中
  const handleExportSelected = () => {
    if (selectedIds.size === 0) {
      setMessage({ type: 'error', text: '请先选择需要导出的数据' });
      return;
    }
    try {
      const ids = Array.from(selectedIds);
      exportReviewResults(ids);
      setMessage({ type: 'success', text: `导出成功（选中 ${ids.length} 条）` });
      addOperationLog('导出选中抽卡结果', `导出${ids.length}条记录`);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '导出失败' });
    }
  };

  // 批量删除
  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) {
      setMessage({ type: 'error', text: '请先选择需要删除的数据' });
      return;
    }
    setShowDeleteModal(true);
  };

  const confirmDeleteSelected = () => {
    const ids = Array.from(selectedIds);
    try {
      const { deleted } = deleteAlbums(ids);
      addOperationLog('批量删除专辑数据', `删除${deleted}条数据`);
      setMessage({ type: 'success', text: `删除成功（${deleted}条）` });
      setSelectedIds(new Set());
      setShowDeleteModal(false);
      loadData();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '删除失败' });
    }
  };

  // 检查是否全选
  const isAllSelected = useMemo(() => {
    return filteredAlbums.length > 0 && filteredAlbums.every(a => selectedIds.has(a.albumId));
  }, [paginatedAlbums, selectedIds, reviewStatus]);

  // 当前选中中未抽卡的数量（用于批量抽卡按钮状态）
  const selectedUnreviewedCount = useMemo(() => {
    return Array.from(selectedIds).filter(id => {
      const s = reviewStatus[id];
      return !s || s.reviewStatus === '未抽卡';
    }).length;
  }, [selectedIds, reviewStatus]);

  const formatImportedAt = (iso?: string) => {
    if (!iso) return '-';
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  };

  return (
    <div style={{ minHeight: '100vh', padding: '20px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* 顶部操作栏 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--dark-gray)' }}>抽卡进度总览</h1>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-primary" onClick={() => navigate('/import')}>
              导入新数据
            </button>
            <button className="btn btn-primary" onClick={handleExport}>
              导出筛选结果
            </button>
            <button className="btn btn-primary" onClick={handleExportSelected} disabled={selectedIds.size === 0}>
              导出选中
            </button>
            <button className="btn btn-danger" onClick={handleDeleteSelected} disabled={selectedIds.size === 0}>
              批量删除
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`message message-${message.type}`}
            style={{
              marginBottom: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              position: 'relative',
            }}
          >
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '18px',
                color: 'inherit',
                opacity: 0.7,
                padding: '0 8px',
                lineHeight: '1',
                marginLeft: '12px',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.7';
              }}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
        )}

        {/* 统计卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '24px' }}>
          <div className="card" style={{ borderLeft: '4px solid var(--primary-color)' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>总专辑数</div>
            <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--dark-gray)' }}>{stats.total}</div>
          </div>
          <div className="card" style={{ borderLeft: '4px solid #1890FF' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>未抽卡数</div>
            <div style={{ fontSize: '28px', fontWeight: 600, color: '#1890FF' }}>{stats.unreviewed}</div>
          </div>
          <div className="card" style={{ borderLeft: '4px solid #52C41A' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>已抽卡数</div>
            <div style={{ fontSize: '28px', fontWeight: 600, color: '#52C41A' }}>{stats.reviewed}</div>
          </div>
          <div className="card" style={{ borderLeft: '4px solid var(--primary-color)' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>抽卡完成率</div>
            <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--primary-color)', marginBottom: '8px' }}>
              {stats.completionRate.toFixed(1)}%
            </div>
            <div style={{ width: '100%', height: '8px', backgroundColor: '#E5E7EB', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${stats.completionRate}%`,
                  height: '100%',
                  backgroundColor: 'var(--primary-color)',
                  transition: 'width 0.3s',
                }}
              />
            </div>
          </div>
        </div>

        {/* 筛选区域 */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--dark-gray)' }}>
                抽卡状态
              </label>
              <select
                className="input"
                style={{ width: '100%' }}
                value={filter.reviewStatus}
                onChange={(e) => {
                  setFilter({ ...filter, reviewStatus: e.target.value as any });
                  setCurrentPage(1);
                }}
              >
                <option value="全部">全部</option>
                <option value="已抽卡">已抽卡</option>
                <option value="未抽卡">未抽卡</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--dark-gray)' }}>
                专辑ID/书名搜索
              </label>
              <input
                type="text"
                className="input"
                style={{ width: '100%' }}
                placeholder="输入关键词搜索"
                value={filter.searchText}
                onChange={(e) => {
                  setFilter({ ...filter, searchText: e.target.value });
                  setCurrentPage(1);
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--dark-gray)' }}>
                导入日期（开始）
              </label>
              <input
                type="date"
                className="input"
                style={{ width: '100%' }}
                value={filter.startDate}
                onChange={(e) => {
                  setFilter({ ...filter, startDate: e.target.value });
                  setCurrentPage(1);
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--dark-gray)' }}>
                导入日期（结束）
              </label>
              <input
                type="date"
                className="input"
                style={{ width: '100%' }}
                value={filter.endDate}
                onChange={(e) => {
                  setFilter({ ...filter, endDate: e.target.value });
                  setCurrentPage(1);
                }}
              />
              {(filter.startDate || filter.endDate) && (
                <div style={{ marginTop: '8px' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '12px' }}
                    onClick={() => {
                      setFilter({ ...filter, startDate: '', endDate: '' });
                      setCurrentPage(1);
                    }}
                  >
                    清空日期
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 批量操作栏 */}
        <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={() => handleSelectAll(!isAllSelected)}
            disabled={filteredAlbums.length === 0}
          >
            {isAllSelected ? '取消全选' : '全选（筛选结果）'}
          </button>
          <button
            className="btn btn-danger"
            onClick={handleBatchReview}
            disabled={selectedUnreviewedCount === 0}
            title={selectedUnreviewedCount === 0 ? '仅对选中的未抽卡专辑生效' : ''}
          >
            批量抽卡（不通过）
          </button>
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            已选择 {selectedIds.size} 个专辑（其中未抽卡 {selectedUnreviewedCount} 个）
          </span>
        </div>

        {/* 数据表格 */}
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '50px' }}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    disabled={filteredAlbums.length === 0}
                  />
                </th>
                <th>专辑ID</th>
                <th>专辑名称</th>
                <th>书名</th>
                <th>赛道品类</th>
                <th>导入时间</th>
                <th>抽卡状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAlbums.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px' }}>
                    暂无数据
                  </td>
                </tr>
              ) : (
                paginatedAlbums.map(album => {
                  const status = reviewStatus[album.albumId];
                  const isReviewed = status && status.reviewStatus === '未抽卡' ? false : (status?.reviewStatus === '已抽卡');
                  const progress = status?.reviewProgress ?? 0;
                  const importedAt = albumMeta[album.albumId]?.importedAt;

                  return (
                    <tr key={album.albumId}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(album.albumId)}
                          onChange={(e) => handleSelectOne(album.albumId, e.target.checked)}
                        />
                      </td>
                      <td>{album.albumId}</td>
                      <td>{album.albumName}</td>
                      <td>{album.bookName}</td>
                      <td>{album.category}</td>
                      <td>{formatImportedAt(importedAt)}</td>
                      <td>
                        <span
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            backgroundColor: isReviewed ? '#E6F7ED' : '#FFF7E6',
                            color: isReviewed ? 'var(--primary-color)' : '#FA8C16',
                          }}
                        >
                          {isReviewed ? '已抽卡' : '未抽卡'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => navigate(`/review/${album.albumId}`)}
                        >
                          抽卡
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="pagination">
            <div className="pagination-info">
              共 {filteredAlbums.length} 条，第 {currentPage} / {totalPages} 页
            </div>
            <div className="pagination-controls">
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                首页
              </button>
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                上一页
              </button>
              <span style={{ padding: '0 12px' }}>
                {currentPage} / {totalPages}
              </span>
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                下一页
              </button>
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                末页
              </button>
              <select
                className="pagination-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={20}>20条/页</option>
                <option value={50}>50条/页</option>
                <option value={100}>100条/页</option>
              </select>
            </div>
          </div>
        )}

        {/* 批量抽卡确认弹窗 */}
        <Modal
          isOpen={showBatchModal}
          onClose={() => setShowBatchModal(false)}
          title="确认批量抽卡"
          onConfirm={confirmBatchReview}
          confirmText="确认"
          cancelText="取消"
          confirmButtonType="danger"
        >
          <div>
            确定要将选中的 <strong>{selectedIds.size}</strong> 个专辑全部标记为「抽卡不通过」吗？
            <br />
            <span style={{ color: 'var(--error-color)', fontSize: '12px', marginTop: '8px', display: 'block' }}>
              此操作不可撤销
            </span>
          </div>
        </Modal>

        {/* 批量删除确认弹窗 */}
        <Modal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="确认批量删除"
          onConfirm={confirmDeleteSelected}
          confirmText="确认删除"
          cancelText="取消"
          confirmButtonType="danger"
        >
          <div>
            确定要删除选中的 <strong>{selectedIds.size}</strong> 条专辑数据吗？
            <br />
            <span style={{ color: 'var(--error-color)', fontSize: '12px', marginTop: '8px', display: 'block' }}>
              删除后不可恢复（包含抽卡状态与导入时间信息）
            </span>
          </div>
        </Modal>
      </div>
    </div>
  );
};
