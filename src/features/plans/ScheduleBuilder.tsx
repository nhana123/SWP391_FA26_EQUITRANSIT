import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../shared/api/session';
import type { FieldErrors } from '../../shared/lib/validation';
import { plansApi } from './api';
import { CommandForm, type Pinned } from './hooks';
import { quotationParent } from '../quotations/navigation';
import { emptyLeg, validateLegs, type LegForm } from './validation';
import { gapMinutes, shiftOperationalTime } from './operational-time';
import { TimelineStrip } from './TimelineStrip';

type Card = { id: string; leg: LegForm };
const card = (leg: LegForm): Card => ({ id: crypto.randomUUID(), leg });
export function ScheduleBuilder({
  orderId,
  revisionId,
  pinned,
  initial,
  basedOn,
  renderLeg,
}: {
  orderId: number;
  revisionId: number;
  pinned: Pinned;
  initial: LegForm[];
  basedOn: number | null;
  renderLeg: (
    leg: LegForm,
    index: number,
    count: number,
    fields: FieldErrors,
    change: (patch: Partial<LegForm>) => void,
    remove: () => void,
  ) => ReactNode;
}) {
  const session = useSession()!;
  const navigate = useNavigate();
  const [chain, setChain] = useState<Card[]>(() => initial.map(card));
  const [pool, setPool] = useState<Card[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [current, setCurrent] = useState(true);
  const [message, setMessage] = useState('');
  function connect(id: string, position: number, before = false) {
    const item = [...chain, ...pool].find((c) => c.id === id);
    if (!item) return;
    const next = chain.filter((c) => c.id !== id);
    const old = chain.findIndex((c) => c.id === id);
    const at = Math.min(
      before && old >= 0 && old < position ? position - 1 : position,
      next.length,
    );
    next.splice(at, 0, {
      ...item,
      leg: { ...item.leg, startPoint: item.leg.startPoint || next[at - 1]?.leg.endPoint || '' },
    });
    setChain(next);
    setPool((all) => all.filter((c) => c.id !== id));
    setMessage(`Đã nối chặng ở vị trí ${at + 1}.`);
  }
  function align(index: number) {
    const gap = gapMinutes(chain[index - 1].leg.plannedArrival, chain[index].leg.plannedDeparture);
    if (gap === null) return;
    setChain((all) =>
      all.map((c, i) =>
        i < index
          ? c
          : {
              ...c,
              leg: {
                ...c.leg,
                plannedDeparture: shiftOperationalTime(c.leg.plannedDeparture, 120 - gap),
                plannedArrival: shiftOperationalTime(c.leg.plannedArrival, 120 - gap),
              },
            },
      ),
    );
    setMessage('Đã dời các chặng phía sau, giữ thời lượng và thêm 2 giờ chuyển tiếp.');
  }
  return (
    <>
      <TimelineStrip legs={chain.map((c, i) => ({ ...c.leg, sequenceNo: i + 1 }))} />
      <CommandForm
        label="New plan version"
        title={
          basedOn
            ? `New draft version based on plan ${basedOn}`
            : 'Lập kế hoạch vận hành đa phương thức'
        }
        pinned={pinned}
        submitLabel="💾 Lưu Chuỗi Lịch Trình Xuống Hệ Thống"
        fieldErrors={errors}
        send={(body) => plansApi.draft(orderId, body)}
        build={() => {
          const result = validateLegs(chain.map((c) => c.leg));
          setErrors(result.errors);
          return result.input
            ? { revisionId, setAsCurrentDraft: current, legs: result.input }
            : null;
        }}
        onDone={(detail) =>
          navigate(
            `${quotationParent(session.role as 'MANAGER' | 'COORDINATOR', orderId)}/plans/${detail.planId}`,
          )
        }
      >
        {(locked, fields) => (
          <>
            <p className="muted">
              Kéo card vào chuỗi hoặc dùng nút nối và lên/xuống. Mã quốc gia trên card hỗ trợ soạn
              thảo; tuyến quốc gia lưu theo hồ sơ yêu cầu. Mỗi chuyến bay là một chặng AIR.
            </p>
            <p role="status">{message}</p>
            {fields.legs && (
              <p className="field-error" role="alert">
                {fields.legs}
              </p>
            )}
            <fieldset disabled={locked} className="plan-builder-grid">
              <section className="plan-pool" aria-label="Draft schedule cards pool">
                <h3>Kho bảng lịch trình nháp</h3>
                <div className="actions">
                  {(['ROAD', 'AIR'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={chain.length + pool.length >= 20}
                      onClick={() => setPool((all) => [...all, card(emptyLeg(mode))])}
                    >
                      + {mode}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={chain.length + pool.length > 17}
                    onClick={() =>
                      setChain((all) => [
                        ...all,
                        card(emptyLeg('ROAD')),
                        card(emptyLeg('AIR')),
                        card(emptyLeg('ROAD')),
                      ])
                    }
                  >
                    Tạo bộ ROAD → AIR → ROAD
                  </button>
                </div>
                {!pool.length && <p>Tạo card rồi kéo sang trục nối.</p>}
                {pool.map((c, i) => (
                  <article
                    className={`plan-draft-card ${c.leg.transportMode.toLowerCase()}`}
                    key={c.id}
                  >
                    <button
                      type="button"
                      className="plan-drag-handle"
                      draggable={!locked}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', c.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                    >
                      ⠿ Nháp {i + 1} · {c.leg.transportMode}
                    </button>
                    {renderLeg(
                      c.leg,
                      i,
                      pool.length,
                      {},
                      (patch) =>
                        setPool((all) =>
                          all.map((x) =>
                            x.id === c.id ? { ...x, leg: { ...x.leg, ...patch } } : x,
                          ),
                        ),
                      () => setPool((all) => all.filter((x) => x.id !== c.id)),
                    )}
                    <button type="button" onClick={() => connect(c.id, chain.length)}>
                      Nối vào cuối chuỗi →
                    </button>
                  </article>
                ))}
              </section>
              <section className="plan-chain" aria-label="Connected schedule chain">
                <h3>Chuỗi lịch trình · {chain.length}/20</h3>
                {Array.from({ length: chain.length + 1 }, (_, i) => (
                  <div key={chain[i]?.id ?? 'tail'}>
                    <div
                      className="plan-drop-zone"
                      onDragOver={(e) => {
                        if (!locked) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!locked) connect(e.dataTransfer.getData('text/plain'), i, true);
                      }}
                    >
                      Thả card vào vị trí {i + 1}
                    </div>
                    {chain[i] && (
                      <>
                        {i > 0 &&
                          (() => {
                            const gap = gapMinutes(
                              chain[i - 1].leg.plannedArrival,
                              chain[i].leg.plannedDeparture,
                            );
                            return (
                              <div
                                className={`plan-connector ${gap !== null && gap < 0 ? 'conflict' : ''}`}
                              >
                                {gap === null
                                  ? 'Nhập giờ để kiểm tra khớp nối'
                                  : gap < 0
                                    ? `⚠ Chồng giờ ${-gap} phút`
                                    : `🔗 Đã nối khớp (Thời gian chuyển tiếp: ${Math.floor(gap / 60)} giờ ${gap % 60} phút)`}
                                {gap !== null && gap < 0 && (
                                  <button type="button" onClick={() => align(i)}>
                                    ⚡ Tự khớp nối giờ (+2h chuyển tiếp)
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        <article
                          className={`plan-draft-card ${chain[i].leg.transportMode.toLowerCase()}`}
                        >
                          <div className="actions">
                            <button
                              type="button"
                              className="plan-drag-handle"
                              draggable={!locked}
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', chain[i].id);
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                            >
                              ⠿ Chặng {i + 1} · {chain[i].leg.transportMode}
                            </button>
                            <button
                              type="button"
                              aria-label={`Đưa chặng ${i + 1} lên`}
                              disabled={i === 0}
                              onClick={() => connect(chain[i].id, i - 1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={`Đưa chặng ${i + 1} xuống`}
                              disabled={i === chain.length - 1}
                              onClick={() => connect(chain[i].id, i + 1)}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPool((all) => [...all, chain[i]]);
                                setChain((all) => all.filter((_, j) => i !== j));
                              }}
                            >
                              Về kho nháp
                            </button>
                          </div>
                          {renderLeg(
                            chain[i].leg,
                            i,
                            chain.length,
                            fields,
                            (patch) =>
                              setChain((all) =>
                                all.map((c, j) =>
                                  j === i ? { ...c, leg: { ...c.leg, ...patch } } : c,
                                ),
                              ),
                            () => setChain((all) => all.filter((_, j) => i !== j)),
                          )}
                        </article>
                      </>
                    )}
                  </div>
                ))}
              </section>
            </fieldset>
            <label className="horse-choice">
              <input
                type="checkbox"
                checked={current}
                disabled={locked}
                onChange={(e) => setCurrent(e.target.checked)}
              />
              Đặt làm bản nháp hiện hành
            </label>
          </>
        )}
      </CommandForm>
    </>
  );
}
