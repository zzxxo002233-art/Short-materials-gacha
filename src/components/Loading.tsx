import React from 'react';

interface LoadingProps {
  text?: string;
}

export const Loading: React.FC<LoadingProps> = ({ text = '加载中...' }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '40px' }}>
      <div className="loading"></div>
      <span style={{ color: 'var(--text-secondary)' }}>{text}</span>
    </div>
  );
};
