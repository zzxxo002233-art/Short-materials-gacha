import React from 'react';
import '../styles/global.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmButtonType?: 'primary' | 'danger';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  onConfirm,
  confirmText = '确认',
  cancelText = '取消',
  confirmButtonType = 'primary',
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm?.();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            {cancelText}
          </button>
          {onConfirm && (
            <button
              className={`btn ${confirmButtonType === 'danger' ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleConfirm}
            >
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
