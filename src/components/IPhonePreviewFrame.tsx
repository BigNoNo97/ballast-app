import React from 'react';
import { Wifi, Battery, Signal } from 'lucide-react';

interface IPhonePreviewFrameProps {
  children: React.ReactNode;
  showFrameOnDesktop: boolean;
}

export const IPhonePreviewFrame: React.FC<IPhonePreviewFrameProps> = ({
  children,
  showFrameOnDesktop,
}) => {
  // Current time for iPhone Status Bar
  const now = new Date();
  const timeStr = `${now.getHours()}:${now.getMinutes() < 10 ? '0' : ''}${now.getMinutes()}`;

  if (!showFrameOnDesktop) {
    return (
      <div style={{ minHeight: '100dvh', width: '100%', maxWidth: '768px', margin: '0 auto', position: 'relative' }}>
        {children}
      </div>
    );
  }

  return (
    <div className="app-viewport-wrapper">
      <div className="iphone-frame">
        {/* Dynamic Island / Notch */}
        <div className="iphone-notch">
          <div className="iphone-camera" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: '0.62rem', color: '#666', fontFamily: 'var(--font-mono)' }}>FIT</span>
          </div>
          <div className="iphone-sensor" />
        </div>

        {/* Top iOS Status Bar (Visible in frame) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 36,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 24px',
            fontSize: '0.72rem',
            fontWeight: 700,
            color: 'var(--text-main)',
            zIndex: 90,
            pointerEvents: 'none',
          }}
        >
          <span>{timeStr}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Signal size={12} />
            <Wifi size={12} />
            <Battery size={14} />
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', paddingTop: 16 }}>
          {children}
        </div>
      </div>
    </div>
  );
};
