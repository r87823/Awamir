import { scopedBranchFilter } from './report-scope';

describe('report branch scope', () => {
  it('leaves unscoped actors unrestricted', () => {
    expect(scopedBranchFilter(undefined, actor())).toBeUndefined();
    expect(scopedBranchFilter('branch-a', actor())).toBe('branch-a');
  });

  it('intersects requested branch with actor scope', () => {
    expect(
      scopedBranchFilter('branch-a', actor(['branch-a', 'branch-b'])),
    ).toBe('branch-a');
    expect(scopedBranchFilter(undefined, actor(['branch-a']))).toEqual({
      in: ['branch-a'],
    });
    expect(scopedBranchFilter('branch-b', actor(['branch-a']))).toEqual({
      in: [],
    });
  });
});

function actor(branchIds: string[] = []) {
  return {
    branchIds: new Set(branchIds),
    departmentIds: new Set<string>(),
    permissions: new Set<string>(),
  };
}
