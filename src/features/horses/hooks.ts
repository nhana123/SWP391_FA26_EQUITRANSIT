import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../shared/api/session';
import { queryKeys } from '../../shared/api/query';
import { horsesApi } from './api';
export function useHorseSearch() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ q: '', page: 0 });
  useEffect(() => {
    const timer = setTimeout(() => setFilter({ q: search.trim(), page: 0 }), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const session = useSession()!;
  const query = useQuery({
    queryKey: [...queryKeys.horses(session.generation), 'list', filter],
    queryFn: ({ signal }) => horsesApi.list(filter.page, filter.q, signal),
  });
  return {
    search,
    setSearch,
    page: filter.page,
    setPage: (page: number) => setFilter((v) => ({ ...v, page })),
    query,
  };
}
export function useHorse(id: number) {
  const session = useSession()!;
  return useQuery({
    queryKey: queryKeys.horse(session.generation, id),
    queryFn: ({ signal }) => horsesApi.get(id, signal),
    enabled: Number.isSafeInteger(id) && id > 0,
  });
}
