import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { activityApi, ACTIVITY_PAGE_SIZE } from './api';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { getSession, useSession } from '../../shared/api/session';
import { useAction } from '../../shared/lib/useAction';
import { displayDate } from '../../shared/lib/validation';
import { Notice } from '../../shared/ui/common';
import type { NotificationPage } from './contracts';
import {
  activityKeys,
  ActivityError,
  ActivityHeading,
  ActivityPager,
  ActivityReadState,
  deniedActivity,
  InvalidActivityPage,
  orderPath,
  uncertainActivity,
  useActivityPage,
  useActivityQuery,
} from './shared';

export function NotificationsPage() {
  const session = useSession();
  if (!session) return <Notice>Please sign in to view notifications.</Notice>;
  return <NotificationWorkspace key={`${session.generation}-${session.role}`} />;
}
function NotificationWorkspace() {
  const session = useSession()!;
  const paging = useActivityPage();
  const query = useActivityQuery(
    ['notifications', paging.page, ACTIVITY_PAGE_SIZE],
    (signal) => activityApi.notifications(paging.page, ACTIVITY_PAGE_SIZE, signal),
    undefined,
    paging.valid,
  );
  const action = useAction();
  const [retryId, setRetryId] = useState<number | null>(null);
  const target = useRef<number | null>(null);
  const [notice, setNotice] = useState('');
  const reviewRequired = action.error instanceof ApiError && action.error.status === 409;
  const readDenied = deniedActivity(query.error);
  const accessDenied = readDenied || deniedActivity(action.error);
  const locked = action.pending || retryId !== null || reviewRequired || accessDenied;
  const prefix = activityKeys.notifications(session.generation, session.role);
  async function markRead(id: number) {
    if (accessDenied || reviewRequired || (target.current !== null && target.current !== id))
      return;
    target.current = id;
    setRetryId(id);
    await action.run(async () => {
      try {
        await queryClient.cancelQueries({ queryKey: prefix });
        if (getSession()?.generation !== session.generation) return;
        const saved = await activityApi.read(id);
        if (getSession()?.generation !== session.generation) return;
        await queryClient.cancelQueries({ queryKey: prefix });
        if (getSession()?.generation !== session.generation) return;
        queryClient.setQueriesData<NotificationPage>({ queryKey: prefix }, (old) =>
          old
            ? {
                ...old,
                items: old.items.map((item) => (item.notificationId === id ? saved : item)),
              }
            : old,
        );
        target.current = null;
        setRetryId(null);
        setNotice(`Notification ${id} marked as read.`);
      } catch (error) {
        if (!uncertainActivity(error)) {
          target.current = null;
          setRetryId(null);
        }
        throw error;
      }
    });
  }
  if (!paging.valid) return <InvalidActivityPage reset={() => paging.setPage(0)} />;
  const hidden = !!query.error || accessDenied;
  const data = query.data;
  return (
    <>
      <ActivityHeading title="Notifications">
        {session.role === 'CUSTOMER' && (
          <Link to="/customer/notification-preferences">Email preferences</Link>
        )}
      </ActivityHeading>
      <p>Notifications addressed to your account and still accessible to you.</p>
      <ActivityReadState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      <ActivityError error={readDenied ? null : action.error} />
      {reviewRequired && !accessDenied && (
        <button
          type="button"
          onClick={() =>
            void query
              .refetch({ throwOnError: true })
              .then(() => action.setError(null))
              .catch(() => {})
          }
        >
          Reload notifications and review
        </button>
      )}
      {retryId !== null && !action.pending && !accessDenied && (
        <div className="notice" role="status">
          <p>The result is uncertain. Retry marks the same notification as read.</p>
          <button type="button" onClick={() => void markRead(retryId)}>
            Retry marking notification as read
          </button>
        </div>
      )}
      {notice && !hidden && <p role="status">{notice}</p>}
      {data && !hidden && (
        <section className="card">
          <h2>Your notifications</h2>
          {!data.items.length ? (
            <p>No notifications on this page.</p>
          ) : (
            <ul className="activity-notifications">
              {data.items.map((item) => {
                const path = item.orderId === null ? null : orderPath(session.role, item.orderId);
                return (
                  <li key={item.notificationId}>
                    <h3>{item.title}</h3>
                    <p>{item.message}</p>
                    <p>
                      Created {displayDate(item.createdAt)} ·{' '}
                      {item.readAt ? `Read ${displayDate(item.readAt)}` : 'Unread'}
                    </p>
                    {path && <Link to={path}>Open request {item.orderId}</Link>}{' '}
                    <button
                      type="button"
                      disabled={locked || !!item.readAt}
                      onClick={() => void markRead(item.notificationId)}
                    >
                      {item.readAt
                        ? 'Already read'
                        : `Mark notification ${item.notificationId} as read`}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            disabled={locked || query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh notifications
          </button>
          <ActivityPager {...data} page={paging.page} onPage={paging.setPage} locked={locked} />
        </section>
      )}
    </>
  );
}

export function NotificationBell() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    button.current?.focus();
  }
  if (!session) return null;
  return (
    <div
      className="activity-bell"
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
      }}
    >
      <button
        ref={button}
        type="button"
        className="bell-button"
        aria-label="Notifications"
        title="Notifications"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path
            d="M12 3a6 6 0 0 0-6 6v3.6l-1.7 2.9A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .9-1.5L18 12.6V9a6 6 0 0 0-6-6Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M9.5 19.5a2.5 2.5 0 0 0 5 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open && (
        <NotificationPeek
          key={`${session.generation}-${session.role}`}
          id={panelId}
          close={close}
        />
      )}
    </div>
  );
}
function NotificationPeek({ id, close }: { id: string; close: () => void }) {
  const query = useActivityQuery(['notifications', 0, 5], (signal) =>
    activityApi.notifications(0, 5, signal),
  );
  return (
    <section id={id} className="activity-peek" aria-label="Recent notifications">
      <h2>Recent notifications</h2>
      <ActivityReadState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && !query.error && (
        <>
          <p>
            Unread on this page: {query.data.items.filter((item) => item.readAt === null).length}
          </p>
          {!query.data.items.length ? (
            <p>No recent notifications.</p>
          ) : (
            <ul>
              {query.data.items.map((item) => (
                <li key={item.notificationId}>
                  {item.title} · {item.readAt ? 'Read' : 'Unread'}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Link to="/notifications" onClick={close}>
        View all notifications
      </Link>
      <button type="button" onClick={close}>
        Close notifications
      </button>
    </section>
  );
}
