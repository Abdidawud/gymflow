"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { MemberDetail, MemberInput, MemberListQuery } from "@gymflow/shared/api/types";
import { queryKeys } from "@/lib/query-keys";

export function useMembers(query: MemberListQuery) {
  return useQuery({
    queryKey: queryKeys.members.list(query),
    queryFn: () => api.members.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useMember(id: string) {
  return useQuery({ queryKey: queryKeys.members.detail(id), queryFn: () => api.members.get(id) });
}

export function useMemberPayments(id: string, page: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.members.payments(id, { page, pageSize: 10 }),
    queryFn: () => api.members.payments(id, { page, pageSize: 10 }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useMemberMemberships(id: string, page: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.members.memberships(id, { page, pageSize: 10 }),
    queryFn: () => api.members.memberships(id, { page, pageSize: 10 }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePlans(includeDisabled = false) {
  return useQuery({
    queryKey: queryKeys.plans.list(includeDisabled),
    queryFn: () => api.plans.list({ includeDisabled }),
    staleTime: 60_000,
  });
}

/** Member changes affect lists, lookups, memberships and dashboard counts. */
export function invalidateMemberViews(queryClient: QueryClient, member?: MemberDetail) {
  if (member) queryClient.setQueryData(queryKeys.members.detail(member.id), member);
  for (const key of [queryKeys.members.all, queryKeys.memberships.all, queryKeys.dashboard, queryKeys.reports.all]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

export function useSaveMember(memberId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MemberInput) => (memberId ? api.members.update(memberId, input) : api.members.create(input)),
    onSuccess: (member) => invalidateMemberViews(queryClient, member),
  });
}

export function useArchiveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      archive ? api.members.archive(id) : api.members.reactivate(id),
    onSuccess: (member) => invalidateMemberViews(queryClient, member),
  });
}

export function useMemberPhoto(memberId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File | null) =>
      file ? api.members.uploadPhoto(memberId, file) : api.members.removePhoto(memberId),
    onSuccess: (member) => invalidateMemberViews(queryClient, member),
  });
}
