export type Paginated<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type PaginateDelegate<Where> = {
  // findMany's arg/return types are deliberately `unknown` — every Prisma model delegate's
  // findMany is individually generic over its own SelectSubset<...>/GetFindResult<...>, which
  // can't be expressed as one structural type shared across models. Relaxing just this one
  // boundary (and casting the result to T[] below) is what makes the helper reusable; T/Where
  // stay fully typed at every call site (see courses.service.ts) — only this seam is untyped.
  // ponytail: revisit with per-model overloads only if this cast ever actually hides a bug.
  findMany(args: unknown): Promise<unknown>;
  count(args: { where?: Where }): Promise<number>;
};

export async function paginate<T, Where = unknown>(
  delegate: PaginateDelegate<Where>,
  args: { where?: Where } & Record<string, unknown>,
  pagination: { page: number; pageSize: number },
): Promise<Paginated<T>> {
  const { page, pageSize } = pagination;
  const skip = (page - 1) * pageSize;
  const [data, total] = await Promise.all([
    delegate.findMany({ ...args, skip, take: pageSize }),
    delegate.count({ where: args.where }),
  ]);
  return {
    data: data as T[],
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
