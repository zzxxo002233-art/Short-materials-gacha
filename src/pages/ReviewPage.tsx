import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAllAlbums, getAllReviewStatus, updateAlbumReviewStatus, addOperationLog } from '../utils/storage';
import { Album, AlbumReviewStatus } from '../types';
import { Modal } from '../components/Modal';
import '../styles/global.css';

export const ReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { albumId } = useParams<{ albumId: string }>();
  const [album, setAlbum] = useState<Album | null>(null);
  const [reviewStatus, setReviewStatus] = useState<AlbumReviewStatus | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [imageLoadStatus, setImageLoadStatus] = useState<Record<number, 'loading' | 'success' | 'error'>>({});
  const [showRejectModal, setShowRejectModal] = useState(false);
  // actionType 当前未直接使用，保留可用于后续扩展（如统计）
  // const [actionType, setActionType] = useState<'confirm' | 'reject' | null>(null);

  // 获取未抽卡专辑数量
  const totalAlbumCount = useMemo(() => {
    return getAllAlbums().length;
  }, [albumId]);

  const unreviewedCount = useMemo(() => {
    const albums = getAllAlbums();
    const allStatus = getAllReviewStatus();
    return albums.filter(a => {
      const status = allStatus[a.albumId];
      return !status || status.reviewStatus === '未抽卡';
    }).length;
  }, [albumId]);

  // 获取当前专辑在未抽卡列表中的位置
  const currentIndex = useMemo(() => {
    const albums = getAllAlbums();
    const allStatus = getAllReviewStatus();
    const unreviewed = albums.filter(a => {
      const status = allStatus[a.albumId];
      return !status || status.reviewStatus === '未抽卡';
    });
    return unreviewed.findIndex(a => a.albumId === albumId) + 1;
  }, [albumId]);

  // 校准顶部大号“xx/总数”：xx=已抽卡数量 + 当前在未抽卡队列中的序号
  const overallProgressText = useMemo(() => {
    if (!albumId) return `0/${totalAlbumCount}`;
    if (totalAlbumCount <= 0) return '0/0';

    const reviewedCount = Math.max(0, totalAlbumCount - unreviewedCount);
    const currentOverallIndex = currentIndex > 0 ? reviewedCount + currentIndex : reviewedCount;
    const safeCurrent = Math.min(Math.max(currentOverallIndex, 0), totalAlbumCount);

    return `${safeCurrent}/${totalAlbumCount}`;
  }, [albumId, totalAlbumCount, unreviewedCount, currentIndex]);

  const getNextUnreviewedAlbumId = (current: string) => {
    const albums = getAllAlbums();
    const allStatus = getAllReviewStatus();
    const unreviewed = albums.filter(a => {
      const status = allStatus[a.albumId];
      return !status || status.reviewStatus === '未抽卡';
    });

    if (unreviewed.length === 0) return null;

    const idx = unreviewed.findIndex(a => a.albumId === current);
    if (idx === -1) return unreviewed[0].albumId;
    if (idx >= unreviewed.length - 1) return null;
    return unreviewed[idx + 1].albumId;
  };

  // 获取上一个专辑ID（基于所有专辑）
  const getPreviousAlbumId = (current: string) => {
    const albums = getAllAlbums();
    const idx = albums.findIndex(a => a.albumId === current);
    if (idx <= 0) return null;
    return albums[idx - 1].albumId;
  };

  // 获取下一个专辑ID（基于所有专辑）
  const getNextAlbumId = (current: string) => {
    const albums = getAllAlbums();
    const idx = albums.findIndex(a => a.albumId === current);
    if (idx === -1 || idx >= albums.length - 1) return null;
    return albums[idx + 1].albumId;
  };

  useEffect(() => {
    if (!albumId) {
      console.warn('ReviewPage: 缺少albumId参数');
      navigate('/overview');
      return;
    }

    try {
      const albums = getAllAlbums();
      const allStatus = getAllReviewStatus();
      const foundAlbum = albums.find(a => a.albumId === albumId);

      if (!foundAlbum) {
        console.warn(`ReviewPage: 未找到专辑 ${albumId}`);
        navigate('/overview');
        return;
      }

      setAlbum(foundAlbum);
      const status = allStatus[albumId];
      setReviewStatus(status || null);
      
      // 初始化加载状态：根据图片URL是否存在来设置初始状态
      const initialStatus: Record<number, 'loading' | 'success' | 'error'> = {};
      const imageUrls = [foundAlbum.image1, foundAlbum.image2, foundAlbum.image3, foundAlbum.image4];
      [1, 2, 3, 4].forEach((idx) => {
        const url = (imageUrls[idx - 1] || '').trim();
        if (!url) {
          initialStatus[idx] = 'error';
        } else {
          initialStatus[idx] = 'loading';
        }
      });
      setImageLoadStatus(initialStatus);

      // 如果已抽卡，显示已选择的信息，但允许重新修改
      if (status && status.reviewStatus === '已抽卡') {
        if (status.selectedImageIndex) {
          setSelectedImageIndex(status.selectedImageIndex);
        } else {
          setSelectedImageIndex(null);
        }
      } else {
        // 未抽卡的专辑，默认不选择任何图片
        setSelectedImageIndex(null);
      }
    } catch (error) {
      console.error('ReviewPage: 加载专辑数据时出错', error);
      navigate('/overview');
    }
  }, [albumId, navigate]);

  // 加载超时兜底（2.5s）：如果图片既没 onLoad 也没 onError，则判定失败并展示占位
  useEffect(() => {
    if (!album) return;
    const timers: number[] = [];
    [1, 2, 3, 4].forEach((idx) => {
      const t = window.setTimeout(() => {
        setImageLoadStatus((prev) => {
          if (prev[idx] === 'success' || prev[idx] === 'error') return prev;
          return { ...prev, [idx]: 'error' };
        });
      }, 2500);
      timers.push(t);
    });
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [album?.albumId]);

  // 处理图片选择
  const handleImageSelect = (index: number) => {
    if (reviewStatus && reviewStatus.reviewStatus === '已抽卡') {
      return; // 已抽卡的不允许修改
    }

    if (selectedImageIndex === index) {
      // 取消选择
      setSelectedImageIndex(null);
    } else {
      // 选择新的图片
      setSelectedImageIndex(index);
    }
  };

  // 处理图片加载
  const handleImageLoad = (index: number, success: boolean) => {
    setImageLoadStatus(prev => ({
      ...prev,
      [index]: success ? 'success' : 'error',
    }));
  };


  // 通过（抽卡）- 直接执行，不需要二次确认
  const handleConfirm = () => {
    if (!album || selectedImageIndex === null) {
      return;
    }

    // 直接执行，不需要弹窗确认
    executeConfirm();
  };

  // 不通过（抽卡）- 保留二次确认
  const handleReject = () => {
    if (!album) {
      return;
    }

    setShowRejectModal(true);
  };

  // 执行通过（抽卡）
  const executeConfirm = () => {
    if (!album || selectedImageIndex === null) {
      return;
    }

    try {
      const imageLinks = [album.image1, album.image2, album.image3, album.image4];
      const selectedLink = imageLinks[selectedImageIndex - 1];

      updateAlbumReviewStatus(album.albumId, {
        reviewProgress: 1,
        reviewStatus: '已抽卡',
        selectedImageIndex: selectedImageIndex,
        selectedImageLink: selectedLink,
      });

      addOperationLog(
        `抽卡专辑：${album.albumId}`,
        `确认通过，选择图片${selectedImageIndex}`
      );

      // 自动跳转到下一个专辑（按CSV导入顺序）
      const nextId = getNextAlbumId(album.albumId);
      if (nextId) {
        navigate(`/review/${nextId}`);
      } else {
        // 如果没有下一个，可以提示或返回总览页
        navigate('/overview');
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : '抽卡失败');
    }
  };

  // 执行不通过（抽卡）
  const executeReject = () => {
    if (!album) {
      return;
    }

    try {
      updateAlbumReviewStatus(album.albumId, {
        reviewProgress: 0,
        reviewStatus: '已抽卡',
        selectedImageLink: '抽卡不通过',
      });

      addOperationLog(
        `抽卡专辑：${album.albumId}`,
        '抽卡不通过'
      );

      setShowRejectModal(false);
      const nextId = getNextUnreviewedAlbumId(album.albumId);
      if (nextId) {
        navigate(`/review/${nextId}`);
      } else {
        navigate('/overview');
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : '抽卡失败');
    }
  };

  if (!album) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>加载中...</div>
      </div>
    );
  }

  const imageLinks = [album.image1, album.image2, album.image3, album.image4];
  // 允许已抽卡的数据重新选择修改
  const canEdit = true;

  // 调试：输出图片链接（开发时使用）
  console.log('专辑图片链接:', {
    albumId: album.albumId,
    image1: album.image1,
    image2: album.image2,
    image3: album.image3,
    image4: album.image4,
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '16px',
        backgroundColor: 'var(--light-gray)',
        overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* 顶部信息栏 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <button
            className="btn btn-secondary"
            style={{ padding: '6px 10px' }}
            onClick={() => navigate('/overview')}
          >
            〈返回
          </button>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--primary-color)' }}>
            专辑ID: {album.albumId}
          </div>
        </div>

        {/* 专辑信息卡片 */}
        <div
          className="card"
          style={{
            border: '2px solid var(--primary-color)',
            marginBottom: '12px',
            backgroundColor: 'var(--white)',
            padding: '12px 14px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>专辑ID</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--dark-gray)' }}>{album.albumId}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>专辑名称</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--dark-gray)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {album.albumName}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>书名</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--dark-gray)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {album.bookName}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>赛道品类</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--dark-gray)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {album.category}
              </div>
            </div>
          </div>
        </div>

        {/* 抽卡进度展示 */}
        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--primary-color)', marginBottom: '2px' }}>
            {overallProgressText}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            当前为第 {currentIndex} 个抽卡，共 {unreviewedCount} 个未抽卡专辑
          </div>
        </div>

        {/* 图片抽卡区域 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gridTemplateRows: 'repeat(2, 1fr)',
            gap: '14px',
            // 让图片区尽量占满一屏：根据视口高度减去顶部信息与底部操作条的“保守估计”
            maxHeight: 'calc(100dvh - 260px)',
            height: 'calc(100dvh - 260px)',
          }}
        >
          {[1, 2, 3, 4].map(index => {
            const imageUrl = (imageLinks[index - 1] || '').trim();
            const isSelected = selectedImageIndex === index;
            const loadStatus = imageLoadStatus[index];
            // 直接使用图片URL，不添加额外参数，避免某些服务器拒绝请求
            const srcWithRetry = imageUrl;

            return (
              <div
                key={index}
                style={{
                  position: 'relative',
                  border: isSelected ? '3px solid var(--primary-color)' : '2px solid var(--border-color)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  backgroundColor: 'var(--white)',
                  cursor: canEdit ? 'pointer' : 'default',
                  transition: 'all 0.2s',
                  opacity: canEdit ? 1 : 0.7,
                  display: 'flex',
                  flexDirection: 'column',
                  listStyle: 'none',
                }}
                onClick={() => canEdit && handleImageSelect(index)}
                onMouseEnter={(e) => {
                  if (canEdit) {
                    e.currentTarget.style.borderColor = 'var(--primary-color)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 180, 42, 0.2)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
                {/* 图片序号 */}
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    backgroundColor: 'var(--primary-color)',
                    color: 'var(--white)',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    zIndex: 10,
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  }}
                >
                  图片{index}
                </div>

                {/* 单选框 */}
                {canEdit && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      width: '24px',
                      height: '24px',
                      border: '2px solid var(--border-color)',
                      borderRadius: '50%',
                      backgroundColor: isSelected ? 'var(--primary-color)' : 'var(--white)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 2,
                    }}
                  >
                    {isSelected && (
                      <div
                        style={{
                          width: '12px',
                          height: '12px',
                          backgroundColor: 'var(--white)',
                          borderRadius: '50%',
                        }}
                      />
                    )}
                  </div>
                )}

                {/* 图片预览 */}
                <div
                  style={{
                    width: '100%',
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px',
                    backgroundColor: '#F5F5F5',
                    minHeight: 0,
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      // 以"高度"为约束推导宽度，确保 3:4 图片完整呈现（不会被裁切）
                      width: '100%',
                      height: '100%',
                      aspectRatio: '3 / 4',
                      position: 'relative',
                      backgroundColor: '#F5F5F5',
                      borderRadius: '6px',
                      overflow: 'hidden',
                    }}
                  >
                    {imageUrl ? (
                      <>
                        {srcWithRetry && (
                          <img
                            key={`${album.albumId}_${index}`}
                            src={srcWithRetry}
                            alt=""
                            loading="eager"
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                              display: loadStatus === 'error' ? 'none' : 'block',
                              opacity: loadStatus === 'success' ? 1 : loadStatus === 'loading' ? 0.5 : 1,
                              transition: 'opacity 0.2s ease',
                              backgroundColor: '#F5F5F5',
                            }}
                            onLoad={() => {
                              handleImageLoad(index, true);
                            }}
                            onError={() => {
                              // 直接标记为失败，不再重试
                              handleImageLoad(index, false);
                            }}
                          />
                        )}
                        {loadStatus === 'loading' && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              color: 'var(--text-secondary)',
                              fontSize: '14px',
                              zIndex: 1,
                              pointerEvents: 'none',
                              backgroundColor: 'rgba(255, 255, 255, 0.8)',
                              padding: '8px 12px',
                              borderRadius: '4px',
                            }}
                          >
                            加载中...
                          </div>
                        )}
                        {loadStatus === 'error' && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--text-secondary)',
                              fontSize: '12px',
                              backgroundColor: '#F5F5F5',
                              padding: '12px',
                              textAlign: 'center',
                              zIndex: 1,
                            }}
                          >
                            <div style={{ marginBottom: '8px' }}>图片加载失败</div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 10px', fontSize: '12px' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // 手动重试：重新加载图片
                                  setImageLoadStatus((prev) => ({ ...prev, [index]: 'loading' }));
                                }}
                              >
                                重试
                              </button>
                              <a
                                href={imageUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  fontSize: '12px',
                                  color: 'var(--primary-color)',
                                  textDecoration: 'none',
                                  padding: '6px 10px',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '6px',
                                  background: 'var(--white)',
                                }}
                              >
                                新标签打开
                              </a>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--text-secondary)',
                          fontSize: '14px',
                          backgroundColor: '#F5F5F5',
                        }}
                      >
                        无图片链接
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 底部操作按钮（固定悬浮） */}
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            backgroundColor: 'var(--white)',
            borderTop: '1px solid var(--border-color)',
            marginTop: '12px',
            padding: '12px 12px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)',
            zIndex: 100,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              style={{
                padding: '10px 20px',
                fontSize: '15px',
                fontWeight: 600,
                borderRadius: '8px',
              }}
              onClick={() => {
                const prevId = getPreviousAlbumId(album.albumId);
                if (prevId) {
                  navigate(`/review/${prevId}`);
                }
              }}
              disabled={!getPreviousAlbumId(album.albumId)}
            >
              上一个
            </button>
            <button
              className="btn btn-danger"
              style={{
                padding: '10px 36px',
                fontSize: '15px',
                fontWeight: 600,
                borderRadius: '8px',
              }}
              onClick={handleReject}
              disabled={selectedImageIndex !== null}
              title={selectedImageIndex !== null ? '请先取消图片选择' : ''}
            >
              不通过
            </button>
            <button
              className="btn btn-primary"
              style={{
                padding: '10px 36px',
                fontSize: '15px',
                fontWeight: 600,
                borderRadius: '8px',
              }}
              onClick={handleConfirm}
              disabled={selectedImageIndex === null}
            >
              通过
            </button>
            <button
              className="btn btn-secondary"
              style={{
                padding: '10px 20px',
                fontSize: '15px',
                fontWeight: 600,
                borderRadius: '8px',
              }}
              onClick={() => {
                const nextId = getNextAlbumId(album.albumId);
                if (nextId) {
                  navigate(`/review/${nextId}`);
                }
              }}
              disabled={!getNextAlbumId(album.albumId)}
            >
              下一个
            </button>
          </div>
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
            仅可选择 1 张图片确认通过，或直接点击不通过（全不选），可随时重新选择修改
          </div>
        </div>


        {/* 不通过抽卡弹窗 */}
        <Modal
          isOpen={showRejectModal}
          onClose={() => setShowRejectModal(false)}
          title="确认不通过"
          onConfirm={executeReject}
          confirmText="确认"
          cancelText="取消"
          confirmButtonType="danger"
        >
          <div>
            确定要将该专辑标记为「抽卡不通过」吗？
            <br />
            <span style={{ color: 'var(--error-color)', fontSize: '12px', marginTop: '8px', display: 'block' }}>
              抽卡后不可修改
            </span>
          </div>
        </Modal>
      </div>
    </div>
  );
};
