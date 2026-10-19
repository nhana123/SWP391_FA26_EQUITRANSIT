import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { idSchema } from '../../shared/api/contracts';
import { queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { ErrorNotice, Loading, Notice, PageHeading } from '../../shared/ui/common';
import { ActualCosts, CustomerHandovers, Profitability } from '../handover/panels';
import { plansApi } from '../plans/api';

// F14 pages on the BE handover/actual-cost API (3d6dd6d). There is still no
// financial settlement or close API: delivery never implies financial closure.
function OrderPage({
  title,
  description,
  backTo,
  children,
}: {
  title: string;
  description: string;
  backTo: string;
  children: (orderId: number) => ReactNode;
}) {
  const orderId = Number(useParams().id);
  if (!idSchema.safeParse(orderId).success)
    return <Notice>This transport request is unavailable.</Notice>;
  return (
    <>
      <PageHeading title={title} description={description}>
        <Link to={`${backTo}/${orderId}`}>Back to request</Link>
      </PageHeading>
      {children(orderId)}
    </>
  );
}

/** The order's current plan with its legs; costs and margin are recorded per plan. */
function useCurrentPlan(orderId: number) {
  const { generation } = useSession()!;
  return useQuery({
    queryKey: [...queryKeys.session(generation), 'handover', 'plan', orderId],
    queryFn: async ({ signal }) => {
      const page = await plansApi.list(orderId, 0, signal);
      const current = page.items.find((p) => p.currentPlan);
      return current ? plansApi.get(orderId, current.planId, signal) : null;
    },
    retry: false,
  });
}

function PlanCosts({ orderId, manager }: { orderId: number; manager: boolean }) {
  const plan = useCurrentPlan(orderId);
  if (plan.isPending) return <Loading />;
  if (plan.error) return <ErrorNotice error={plan.error} />;
  if (!plan.data)
    return <Notice>No current operational plan yet, so there are no costs to record.</Notice>;
  const legs = plan.data.legs.map((l) => ({ legId: l.legId, sequenceNo: l.sequenceNo }));
  return (
    <>
      <ActualCosts planId={plan.data.planId} legs={legs} canWrite />
      {manager && <Profitability planId={plan.data.planId} />}
    </>
  );
}

export function CustomerHandoverPage() {
  return (
    <OrderPage
      title="Delivery handover"
      description="Review how your horse was handed over and confirm the final delivery."
      backTo="/customer/requests"
    >
      {(orderId) => <CustomerHandovers orderId={orderId} />}
    </OrderPage>
  );
}

export function StaffActualCostsPage() {
  return (
    <OrderPage
      title="Actual costs"
      description="Record the internal supplier costs paid for this request's plan."
      backTo="/staff/cases"
    >
      {(orderId) => <PlanCosts orderId={orderId} manager={false} />}
    </OrderPage>
  );
}

export function ManagerSettlementPage() {
  return (
    <OrderPage
      title="Costs and profitability"
      description="Internal actual costs against the quoted total for this request."
      backTo="/manager/requests"
    >
      {(orderId) => (
        <>
          <PlanCosts orderId={orderId} manager />
          <Notice>
            Delivery and recorded costs do not close a request financially. Payments stay on the
            payments page; financial closing is not available from the server yet.
          </Notice>
        </>
      )}
    </OrderPage>
  );
}
