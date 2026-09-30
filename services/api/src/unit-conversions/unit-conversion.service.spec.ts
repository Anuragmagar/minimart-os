import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService, PrismaTx } from '../../database/prisma.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { TenantContext } from '../../common/auth/authenticated-user.js';
import type { UnitConversionRepository } from './unit-conversion.repository.js';
import type { UnitRepository } from '../units/unit.repository.js';
import { UnitConversionService } from './unit-conversion.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSION_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const DOZ = '55555555-5555-4555-8555-555555555555';
const PCS = '66666666-6666-4666-8666-666666666666';
const BOX = '77777777-7777-4777-8777-777777777777';
const CARTON = '88888888-8888-4888-8888-888888888888';

const ctx: TenantContext = {
  organizationId: ORG_ID,
  userId: USER_ID,
  storeId: null,
  permissions: ['products:manage'],
};

const unit = (id: string) => ({ id, name: id, code: id, precision: 0 });

type Edge = { fromUnitId: string; toUnitId: string };

/**
 * A stand-in for the real graph: it returns only the edges leaving the units the
 * service asked about, so a level of the walk cannot receive an edge from a unit
 * that was never expanded.
 */
function graph(edges: Edge[]) {
  return vi
    .fn()
    .mockImplementation((fromUnitIds: string[]) =>
      Promise.resolve(
        edges.filter((edge) => fromUnitIds.includes(edge.fromUnitId)),
      ),
    );
}

function createService(
  overrides: {
    findByIdInOrganization?: ReturnType<typeof vi.fn>;
    findByDirection?: ReturnType<typeof vi.fn>;
    findAllInOrganization?: ReturnType<typeof vi.fn>;
    findOutgoingEdges?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
    update?: ReturnType<typeof vi.fn>;
    delete?: ReturnType<typeof vi.fn>;
    record?: ReturnType<typeof vi.fn>;
    findUnit?: ReturnType<typeof vi.fn>;
    runInTransaction?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const conversionMocks = {
    findByIdInOrganization:
      overrides.findByIdInOrganization ?? vi.fn().mockResolvedValue(null),
    findByDirection:
      overrides.findByDirection ?? vi.fn().mockResolvedValue(null),
    findAllInOrganization:
      overrides.findAllInOrganization ??
      vi.fn().mockResolvedValue({ data: [], total: 0 }),
    findOutgoingEdges:
      overrides.findOutgoingEdges ?? vi.fn().mockResolvedValue([]),
    create:
      overrides.create ?? vi.fn().mockResolvedValue({ id: CONVERSION_ID }),
    update:
      overrides.update ?? vi.fn().mockResolvedValue({ id: CONVERSION_ID }),
    delete: overrides.delete ?? vi.fn().mockResolvedValue(undefined),
  };

  // Both endpoint units exist in the caller's organization unless a test says
  // otherwise, so each test only states the exception it is exercising.
  const findUnit =
    overrides.findUnit ??
    vi.fn().mockImplementation((id: string) => Promise.resolve(unit(id)));

  const repository = conversionMocks as unknown as UnitConversionRepository;
  const unitRepository = {
    findByIdInOrganization: findUnit,
  } as unknown as UnitRepository;
  const audit = {
    record: overrides.record ?? vi.fn().mockResolvedValue({}),
  } as unknown as AuditService;

  const tx = { unitConversion: {} } as unknown as PrismaTx;
  const runInTransaction = overrides.runInTransaction ?? vi.fn();
  runInTransaction.mockImplementation((fn: (t: PrismaTx) => Promise<unknown>) =>
    fn(tx),
  );
  const prisma = { runInTransaction } as unknown as PrismaService;

  return {
    service: new UnitConversionService(
      repository,
      unitRepository,
      prisma,
      audit,
    ),
    repository,
    audit,
    tx,
    findByDirection: conversionMocks.findByDirection,
    findOutgoingEdges: conversionMocks.findOutgoingEdges,
    create: conversionMocks.create,
    update: conversionMocks.update,
    delete: conversionMocks.delete,
    findUnit,
    findAllInOrganization: conversionMocks.findAllInOrganization,
  };
}

describe('UnitConversionService.create', () => {
  it('takes the organization from the principal, never from the payload', async () => {
    const create = vi.fn().mockResolvedValue({ id: CONVERSION_ID });
    const { service } = createService({ create });

    await service.create(ctx, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
      organizationId: OTHER_ORG_ID,
    } as never);

    expect(create.mock.calls[0][0]).toMatchObject({ organizationId: ORG_ID });
    expect(create.mock.calls[0][0]).not.toMatchObject({
      organizationId: OTHER_ORG_ID,
    });
  });

  it('creates a conversion with the given direction and factor', async () => {
    const create = vi.fn().mockResolvedValue({ id: CONVERSION_ID });
    const { service } = createService({ create });

    await service.create(ctx, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    });

    expect(create).toHaveBeenCalledWith(
      {
        organizationId: ORG_ID,
        fromUnitId: DOZ,
        toUnitId: PCS,
        multiplier: '12',
      },
      expect.anything(),
    );
  });

  it('resolves both endpoint units inside the caller organization', async () => {
    const { service, findUnit } = createService();

    await service.create(ctx, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    });

    expect(findUnit).toHaveBeenCalledWith(DOZ, ORG_ID, undefined);
    expect(findUnit).toHaveBeenCalledWith(PCS, ORG_ID, undefined);
    expect(findUnit).not.toHaveBeenCalledWith(DOZ, OTHER_ORG_ID, undefined);
  });

  it('refuses a source unit that is not in the caller organization', async () => {
    const create = vi.fn();
    const { service } = createService({
      findUnit: vi
        .fn()
        .mockImplementation((id: string) =>
          Promise.resolve(id === DOZ ? unit(DOZ) : null),
        ),
      create,
    });

    await expect(
      service.create(ctx, { fromUnitId: DOZ, toUnitId: PCS, multiplier: '12' }),
    ).rejects.toThrow(NotFoundException);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a target unit that is not in the caller organization', async () => {
    const create = vi.fn();
    const { service } = createService({
      findUnit: vi
        .fn()
        .mockImplementation((id: string) =>
          Promise.resolve(id === DOZ ? unit(DOZ) : null),
        ),
      create,
    });

    await expect(
      service.create(ctx, { fromUnitId: DOZ, toUnitId: PCS, multiplier: '12' }),
    ).rejects.toThrow(/target unit not found/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a conversion from a unit into itself', async () => {
    const create = vi.fn();
    const { service } = createService({ create });

    await expect(
      service.create(ctx, {
        fromUnitId: DOZ,
        toUnitId: DOZ,
        multiplier: '1',
      }),
    ).rejects.toThrow(/cannot be converted into itself/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a zero multiplier', async () => {
    const create = vi.fn();
    const { service } = createService({ create });

    await expect(
      service.create(ctx, { fromUnitId: DOZ, toUnitId: PCS, multiplier: '0' }),
    ).rejects.toThrow(/greater than zero/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a multiplier written as zero to six decimal places', async () => {
    const create = vi.fn();
    const { service } = createService({ create });

    await expect(
      service.create(ctx, {
        fromUnitId: DOZ,
        toUnitId: PCS,
        multiplier: '0.000000',
      }),
    ).rejects.toThrow(/greater than zero/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('accepts a small fractional multiplier without rounding it', async () => {
    const create = vi.fn().mockResolvedValue({ id: CONVERSION_ID });
    const { service } = createService({ create });

    await service.create(ctx, {
      fromUnitId: PCS,
      toUnitId: DOZ,
      multiplier: '0.083333',
    });

    expect(create.mock.calls[0][0]).toMatchObject({ multiplier: '0.083333' });
  });

  it('rejects a duplicate direction in the same organization', async () => {
    const create = vi.fn();
    const { service } = createService({
      findByDirection: vi.fn().mockResolvedValue({ id: CONVERSION_ID }),
      create,
    });

    await expect(
      service.create(ctx, { fromUnitId: DOZ, toUnitId: PCS, multiplier: '12' }),
    ).rejects.toThrow(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not treat the reverse direction as a duplicate', async () => {
    // Directions are separate rows by decision: a reciprocal factor is never
    // inferred, so PCS -> DOZ is legal even when DOZ -> PCS exists.
    const create = vi.fn().mockResolvedValue({ id: CONVERSION_ID });
    const { service, findByDirection } = createService({
      findByDirection: vi.fn().mockResolvedValue(null),
      findOutgoingEdges: vi
        .fn()
        .mockResolvedValue([{ fromUnitId: DOZ, toUnitId: PCS }]),
      create,
    });

    await service.create(ctx, {
      fromUnitId: PCS,
      toUnitId: DOZ,
      multiplier: '0.083333',
    });

    expect(findByDirection).toHaveBeenCalledWith(PCS, DOZ, ORG_ID, undefined);
    expect(create).toHaveBeenCalled();
  });

  it('allows a direct reciprocal pair when the reverse already exists', async () => {
    // The two decisions combine so that a purchase/selling pair can be recorded
    // in both directions: DOZ -> PCS 12 plus PCS -> DOZ 0.083333.
    const create = vi.fn().mockResolvedValue({ id: CONVERSION_ID });
    const { service } = createService({
      findByDirection: vi.fn().mockResolvedValue(null),
      findOutgoingEdges: vi
        .fn()
        .mockResolvedValue([{ fromUnitId: DOZ, toUnitId: PCS }]),
      create,
    });

    await expect(
      service.create(ctx, {
        fromUnitId: PCS,
        toUnitId: DOZ,
        multiplier: '0.083333',
      }),
    ).resolves.toBeDefined();
    expect(create).toHaveBeenCalled();
  });

  it('rejects a cycle of three units', async () => {
    const { service } = createService({
      findByDirection: vi.fn().mockResolvedValue(null),
      // PCS -> BOX and BOX -> CARTON exist, so adding CARTON -> PCS closes a loop.
      findOutgoingEdges: graph([
        { fromUnitId: PCS, toUnitId: BOX },
        { fromUnitId: BOX, toUnitId: CARTON },
      ]),
    });

    await expect(
      service.create(ctx, {
        fromUnitId: CARTON,
        toUnitId: PCS,
        multiplier: '1',
      }),
    ).rejects.toThrow(/cycle/i);
  });

  it('rejects an edge that closes a three-unit loop', async () => {
    // DOZ -> PCS -> BOX -> CARTON exists, so CARTON -> DOZ closes a loop.
    const { service } = createService({
      findByDirection: vi.fn().mockResolvedValue(null),
      findOutgoingEdges: graph([
        { fromUnitId: DOZ, toUnitId: PCS },
        { fromUnitId: PCS, toUnitId: BOX },
        { fromUnitId: BOX, toUnitId: CARTON },
      ]),
    });

    await expect(
      service.create(ctx, {
        fromUnitId: CARTON,
        toUnitId: DOZ,
        multiplier: '1',
      }),
    ).rejects.toThrow(/cycle/i);
  });

  it('allows a shortcut edge that duplicates an existing route', async () => {
    // DOZ -> BOX -> CARTON exists and DOZ -> CARTON is proposed, which adds a
    // route but closes no loop, so it is permitted.
    const { service } = createService({
      findByDirection: vi.fn().mockResolvedValue(null),
      findOutgoingEdges: graph([
        { fromUnitId: DOZ, toUnitId: BOX },
        { fromUnitId: BOX, toUnitId: CARTON },
      ]),
    });

    await expect(
      service.create(ctx, {
        fromUnitId: DOZ,
        toUnitId: CARTON,
        multiplier: '1',
      }),
    ).resolves.toBeDefined();
  });

  it('still rejects a longer cycle that coexists with a reciprocal pair', async () => {
    // DOZ <-> PCS is a permitted reciprocal pair, but BOX -> PCS means adding
    // DOZ -> BOX would make PCS -> DOZ -> BOX -> PCS, so it is refused.
    const { service } = createService({
      findByDirection: vi.fn().mockResolvedValue(null),
      findOutgoingEdges: graph([
        { fromUnitId: DOZ, toUnitId: PCS },
        { fromUnitId: PCS, toUnitId: DOZ },
        { fromUnitId: BOX, toUnitId: PCS },
      ]),
    });

    await expect(
      service.create(ctx, { fromUnitId: DOZ, toUnitId: BOX, multiplier: '1' }),
    ).rejects.toThrow(/cycle/i);
  });

  it('allows a fresh edge into a unit that has no outgoing conversions', async () => {
    const create = vi.fn().mockResolvedValue({ id: CONVERSION_ID });
    const { service } = createService({
      findOutgoingEdges: graph([]),
      create,
    });

    await expect(
      service.create(ctx, { fromUnitId: DOZ, toUnitId: PCS, multiplier: '12' }),
    ).resolves.toBeDefined();
    expect(create).toHaveBeenCalled();
  });

  it('allows a branching edge that does not close a loop', async () => {
    const create = vi.fn().mockResolvedValue({ id: CONVERSION_ID });
    const { service } = createService({
      // PCS -> BOX exists, so DOZ -> PCS is a tree, not a cycle.
      findOutgoingEdges: graph([{ fromUnitId: PCS, toUnitId: BOX }]),
      create,
    });

    await expect(
      service.create(ctx, { fromUnitId: DOZ, toUnitId: PCS, multiplier: '12' }),
    ).resolves.toBeDefined();
    expect(create).toHaveBeenCalled();
  });

  it('walks the graph one level per query and stops as soon as it closes', async () => {
    const findOutgoingEdges = graph([
      { fromUnitId: DOZ, toUnitId: PCS },
      { fromUnitId: PCS, toUnitId: BOX },
      { fromUnitId: BOX, toUnitId: CARTON },
    ]);
    const { service } = createService({ findOutgoingEdges });

    await expect(
      service.create(ctx, {
        fromUnitId: CARTON,
        toUnitId: DOZ,
        multiplier: '1',
      }),
    ).rejects.toThrow(/cycle/i);

    // Three levels explored, then the walk short-circuits instead of continuing.
    expect(findOutgoingEdges).toHaveBeenCalledTimes(3);
  });

  it('does not revisit a unit it has already seen', async () => {
    // A diamond (PCS -> BOX, PCS -> CARTON, BOX -> CARTON, CARTON -> BOX) must
    // terminate rather than ping-pong between BOX and CARTON.
    const findOutgoingEdges = graph([
      { fromUnitId: PCS, toUnitId: BOX },
      { fromUnitId: PCS, toUnitId: CARTON },
      { fromUnitId: BOX, toUnitId: CARTON },
      { fromUnitId: CARTON, toUnitId: BOX },
    ]);
    const create = vi.fn().mockResolvedValue({ id: CONVERSION_ID });
    const { service } = createService({ findOutgoingEdges, create });

    await expect(
      service.create(ctx, { fromUnitId: DOZ, toUnitId: PCS, multiplier: '12' }),
    ).resolves.toBeDefined();
    expect(create).toHaveBeenCalled();
  });

  it('scopes every graph query to the caller organization', async () => {
    const { service, findOutgoingEdges } = createService();

    await service.create(ctx, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    });

    expect(findOutgoingEdges).toHaveBeenCalledWith([PCS], ORG_ID, undefined);
  });

  it('does not walk the graph when a duplicate already blocks the write', async () => {
    const findOutgoingEdges = vi.fn();
    const { service } = createService({
      findByDirection: vi.fn().mockResolvedValue({ id: CONVERSION_ID }),
      findOutgoingEdges,
    });

    await expect(
      service.create(ctx, { fromUnitId: DOZ, toUnitId: PCS, multiplier: '12' }),
    ).rejects.toThrow(ConflictException);
    expect(findOutgoingEdges).not.toHaveBeenCalled();
  });

  it('writes an audit record in the same transaction as the create', async () => {
    const record = vi.fn().mockResolvedValue({});
    const { service, tx } = createService({ record });

    await service.create(ctx, {
      fromUnitId: DOZ,
      toUnitId: PCS,
      multiplier: '12',
    });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        userId: USER_ID,
        action: 'unit_conversion.create',
        entity: 'UnitConversion',
        entityId: CONVERSION_ID,
      }),
      tx,
    );
  });
});

describe('UnitConversionService.findAll', () => {
  it('scopes the list to the caller organization', async () => {
    const { service, findAllInOrganization } = createService();

    await service.findAll(ctx, { page: 1, limit: 20 });

    expect(findAllInOrganization).toHaveBeenCalledWith(
      expect.anything(),
      ORG_ID,
      undefined,
    );
  });
});

describe('UnitConversionService.update', () => {
  it('reports a missing or cross-organization conversion as not found', async () => {
    const { service } = createService();

    await expect(
      service.update(ctx, CONVERSION_ID, { multiplier: '13' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('changes only the multiplier', async () => {
    const update = vi.fn().mockResolvedValue({ id: CONVERSION_ID });
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: CONVERSION_ID,
        fromUnitId: DOZ,
        toUnitId: PCS,
      }),
      update,
    });

    await service.update(ctx, CONVERSION_ID, { multiplier: '6' });

    expect(update).toHaveBeenCalledWith(
      CONVERSION_ID,
      { multiplier: '6' },
      expect.anything(),
    );
  });

  it('refuses a non-positive multiplier', async () => {
    const update = vi.fn();
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({ id: CONVERSION_ID }),
      update,
    });

    await expect(
      service.update(ctx, CONVERSION_ID, { multiplier: '0' }),
    ).rejects.toThrow(/greater than zero/i);
    expect(update).not.toHaveBeenCalled();
  });

  it('leaves the row untouched when no field is supplied', async () => {
    const update = vi.fn();
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({ id: CONVERSION_ID }),
      update,
    });

    await service.update(ctx, CONVERSION_ID, {});

    expect(update).not.toHaveBeenCalled();
  });

  it('never re-points an existing conversion at different units', async () => {
    const update = vi.fn();
    const findByIdInOrganization = vi
      .fn()
      .mockResolvedValue({ id: CONVERSION_ID, fromUnitId: DOZ, toUnitId: PCS });
    const { service } = createService({ findByIdInOrganization, update });

    await service.update(ctx, CONVERSION_ID, {
      multiplier: '2',
      fromUnitId: CARTON,
    } as never);

    expect(update.mock.calls[0][1]).toEqual({ multiplier: '2' });
  });

  it('records the before and after state', async () => {
    const record = vi.fn().mockResolvedValue({});
    const { service, tx } = createService({
      findByIdInOrganization: vi
        .fn()
        .mockResolvedValue({ id: CONVERSION_ID, multiplier: '12' }),
      update: vi.fn().mockResolvedValue({ id: CONVERSION_ID, multiplier: '6' }),
      record,
    });

    await service.update(ctx, CONVERSION_ID, { multiplier: '6' });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'unit_conversion.update',
        before: expect.objectContaining({ multiplier: '12' }),
        after: expect.objectContaining({ multiplier: '6' }),
      }),
      tx,
    );
  });
});

describe('UnitConversionService.delete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes and audits an unreferenced conversion', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const record = vi.fn().mockResolvedValue({});
    const { service, tx } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({
        id: CONVERSION_ID,
        fromUnitId: DOZ,
        toUnitId: PCS,
      }),
      delete: remove,
      record,
    });

    await service.delete(ctx, CONVERSION_ID);

    expect(remove).toHaveBeenCalledWith(CONVERSION_ID, tx);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'unit_conversion.delete' }),
      tx,
    );
  });

  it('refuses to delete a conversion in another organization', async () => {
    const remove = vi.fn();
    const { service } = createService({ delete: remove });

    await expect(service.delete(ctx, CONVERSION_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('does not require the graph walk before deleting', async () => {
    // Removing an edge can never create a cycle, so the walk is skipped.
    const findOutgoingEdges = vi.fn();
    const { service } = createService({
      findByIdInOrganization: vi.fn().mockResolvedValue({ id: CONVERSION_ID }),
      findOutgoingEdges,
    });

    await service.delete(ctx, CONVERSION_ID);

    expect(findOutgoingEdges).not.toHaveBeenCalled();
  });
});
