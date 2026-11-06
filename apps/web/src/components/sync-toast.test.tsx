import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SyncToast } from './SyncToast';

describe('SyncToast Component', () => {
  it('renders nothing when idle and no error', () => {
    const html = renderToString(
      <SyncToast
        sidebarOpen={false}
        syncPhase="idle"
        isSyncing={false}
        syncEvent={null}
        error={null}
        toastDismissed={false}
        onDismiss={() => {}}
      />,
    );
    expect(html).toBe('');
  });

  it('renders syncing state with progress count', () => {
    const html = renderToString(
      <SyncToast
        sidebarOpen={false}
        syncPhase="syncing"
        isSyncing={true}
        syncEvent={{ type: 'progress', indexed: 42 }}
        error={null}
        toastDismissed={false}
        onDismiss={() => {}}
      />,
    );
    expect(html).toContain('Syncing Google Drive');
    expect(html).toContain('42 items indexed');
  });

  it('renders error state with error text and retry button', () => {
    const html = renderToString(
      <SyncToast
        sidebarOpen={false}
        syncPhase="error"
        isSyncing={false}
        syncEvent={null}
        error="OAuth token expired"
        toastDismissed={false}
        onDismiss={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(html).toContain('Sync Encountered an Issue');
    expect(html).toContain('OAuth token expired');
    expect(html).toContain('Retry');
  });

  it('renders completed state with indexed count', () => {
    const html = renderToString(
      <SyncToast
        sidebarOpen={false}
        syncPhase="completed"
        isSyncing={false}
        syncEvent={{ type: 'done', indexed: 150 }}
        error={null}
        toastDismissed={false}
        onDismiss={() => {}}
      />,
    );
    expect(html).toContain('Sync Complete');
    expect(html).toContain('150 photos &amp; videos indexed');
  });

  it('offsets position when sidebar is open', () => {
    const html = renderToString(
      <SyncToast
        sidebarOpen={true}
        syncPhase="syncing"
        isSyncing={true}
        syncEvent={null}
        error={null}
        toastDismissed={false}
        onDismiss={() => {}}
      />,
    );
    expect(html).toContain('left-[248px]');
  });
});
