import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/authenticated-user.js';
import { CategoryRepository } from './category.repository.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { CategoryQueryDto } from './dto/category-query.dto.js';

const AUDIT_ENTITY = 'Category';

@Injectable()
export class CategoryService {
  constructor(
    private readonly categoryRepository: CategoryRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findById(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.requireCategoryInOrganization(ctx, id, tx);
  }

  async findByName(
    ctx: TenantContext,
    name: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.categoryRepository.findByName(name, ctx.organizationId, tx);
  }

  async findAll(
    ctx: TenantContext,
    query: CategoryQueryDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    return this.categoryRepository.findAllInOrganization(
      query,
      ctx.organizationId,
      tx,
    );
  }

  async create(
    ctx: TenantContext,
    createCategoryDto: CreateCategoryDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    // The organization always comes from the authenticated principal, so a
    // category can never be created inside another tenant by supplying an id.
    const existing = await this.categoryRepository.findByName(
      createCategoryDto.name,
      ctx.organizationId,
      tx,
    );
    if (existing) {
      throw new ConflictException(
        'Category with this name already exists in organization',
      );
    }

    await this.requireParentInOrganization(
      ctx,
      createCategoryDto.parentId ?? null,
      tx,
    );

    return this.write(tx, async (write) => {
      const category = await this.categoryRepository.create(
        {
          organizationId: ctx.organizationId,
          parentId: createCategoryDto.parentId ?? null,
          name: createCategoryDto.name,
          status: 'active',
        },
        write,
      );

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'category.create',
          entity: AUDIT_ENTITY,
          entityId: category.id,
          after: category,
        },
        write,
      );

      return category;
    });
  }

  async update(
    ctx: TenantContext,
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const category = (await this.requireCategoryInOrganization(
      ctx,
      id,
      tx,
    )) as { id: string; name: string; parentId: string | null };

    if (
      updateCategoryDto.name !== undefined &&
      updateCategoryDto.name !== category.name
    ) {
      const existing = await this.categoryRepository.findByName(
        updateCategoryDto.name,
        ctx.organizationId,
        tx,
      );
      if (existing && existing.id !== id) {
        throw new ConflictException(
          'Category with this name already exists in organization',
        );
      }
    }

    // A null parentId is a deliberate move to the root and must still clear the
    // hierarchy checks; an omitted parentId leaves the parent untouched.
    if (updateCategoryDto.parentId !== undefined) {
      await this.requireParentInOrganization(
        ctx,
        updateCategoryDto.parentId,
        tx,
      );
      await this.requireNoCycle(ctx, id, updateCategoryDto.parentId, tx);
    }

    return this.write(tx, async (write) => {
      const data: Record<string, unknown> = {};
      if (updateCategoryDto.name !== undefined)
        data.name = updateCategoryDto.name;
      if (updateCategoryDto.parentId !== undefined)
        data.parentId = updateCategoryDto.parentId;
      if (updateCategoryDto.status !== undefined)
        data.status = updateCategoryDto.status;

      const updated = await this.categoryRepository.update(id, data, write);

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'category.update',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: category,
          after: updated,
        },
        write,
      );

      return updated;
    });
  }

  async deactivate(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const category = await this.requireCategoryInOrganization(ctx, id, tx);

    return this.write(tx, async (write) => {
      const updated = await this.categoryRepository.update(
        id,
        { status: 'inactive' },
        write,
      );

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'category.deactivate',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: category,
          after: updated,
        },
        write,
      );

      return updated;
    });
  }

  async delete(ctx: TenantContext, id: string, tx?: PrismaTx): Promise<void> {
    const category = await this.requireCategoryInOrganization(ctx, id, tx);

    const client = tx ?? this.prisma.client;
    const [products, children] = await Promise.all([
      client.product.count({ where: { categoryId: id } }),
      client.category.count({ where: { parentId: id } }),
    ]);
    if (products > 0 || children > 0) {
      throw new BadRequestException(
        'Category is still referenced by products or subcategories; deactivate it instead',
      );
    }

    await this.write(tx, async (write) => {
      await this.categoryRepository.delete(id, write);

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'category.delete',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: category,
        },
        write,
      );
    });
  }

  private write<T>(
    tx: PrismaTx | undefined,
    fn: (write: PrismaTx) => Promise<T>,
  ): Promise<T> {
    return tx ? fn(tx) : this.prisma.runInTransaction(fn);
  }

  private async requireCategoryInOrganization(
    ctx: TenantContext,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const category = await this.categoryRepository.findByIdInOrganization(
      id,
      ctx.organizationId,
      tx,
    );
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  /**
   * A parent must exist inside the caller's own organization. The database
   * foreign key does not check organization, so a cross-tenant parent would
   * otherwise be accepted (BR-040). A missing parent is reported as not found
   * for the same reason a category from another tenant is.
   */
  private async requireParentInOrganization(
    ctx: TenantContext,
    parentId: string | null | undefined,
    tx?: PrismaTx,
  ): Promise<void> {
    if (!parentId) {
      return;
    }
    const parent = await this.categoryRepository.findByIdInOrganization(
      parentId,
      ctx.organizationId,
      tx,
    );
    if (!parent) {
      throw new BadRequestException('Invalid parentId for this organization');
    }
  }

  /**
   * The self-referencing foreign key has no database cycle check, so `A -> B ->
   * A` and self-parenting are both reachable at the database level. Walking the
   * ancestor chain is what makes the hierarchy an actual tree.
   *
   * The walk terminates because `seen` grows monotonically, so it cannot loop
   * even over pre-existing corrupt data. Two consequences follow, both of which
   * fail closed rather than admitting a cycle: a cycle that already exists in the
   * database is reported as a cycle here rather than being tolerated, and an
   * ancestor belonging to another organization reads as a root because
   * `findParentIdInOrganization` is organization-scoped, which can stop the walk
   * early. Both cases describe data this service refuses to create.
   */
  private async requireNoCycle(
    ctx: TenantContext,
    categoryId: string,
    newParentId: string | null,
    tx?: PrismaTx,
  ): Promise<void> {
    if (!newParentId) {
      return;
    }
    if (newParentId === categoryId) {
      throw new BadRequestException('A category cannot be its own parent');
    }

    const seen = new Set<string>([categoryId]);
    let cursor: string | null = newParentId;

    while (cursor) {
      if (seen.has(cursor)) {
        throw new BadRequestException(
          'Category parent assignment would create a cycle',
        );
      }
      seen.add(cursor);
      cursor = await this.categoryRepository.findParentIdInOrganization(
        cursor,
        ctx.organizationId,
        tx,
      );
    }
  }
}
