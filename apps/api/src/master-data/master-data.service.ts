import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActorContext,
  BranchInput,
  DepartmentInput,
  ItemDepartmentMappingInput,
  ProductInput,
  ProductionCenterInput,
} from './master-data.types';

type EntityName =
  | 'branch'
  | 'production_center'
  | 'department'
  | 'product'
  | 'item_department_mapping';

@Injectable()
export class MasterDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listBranches() {
    return this.prisma.branch.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  async createBranch(input: BranchInput, actor: ActorContext) {
    const created = await this.prisma.branch.create({ data: input });
    await this.auditMutation('branch', 'created', created.id, actor, input);
    return created;
  }

  async updateBranch(
    id: string,
    input: Partial<BranchInput>,
    actor: ActorContext,
  ) {
    await this.ensureBranch(id);
    const updated = await this.prisma.branch.update({
      where: { id },
      data: { ...input, version: { increment: 1 } },
    });
    await this.auditMutation('branch', 'updated', id, actor, input);
    return updated;
  }

  async deleteBranch(id: string, actor: ActorContext) {
    await this.ensureBranch(id);
    const deleted = await this.prisma.branch.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        version: { increment: 1 },
      },
    });
    await this.auditMutation('branch', 'deleted', id, actor, {});
    return deleted;
  }

  listProductionCenters() {
    return this.prisma.productionCenter.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  async createProductionCenter(
    input: ProductionCenterInput,
    actor: ActorContext,
  ) {
    const created = await this.prisma.productionCenter.create({ data: input });
    await this.auditMutation(
      'production_center',
      'created',
      created.id,
      actor,
      input,
    );
    return created;
  }

  async updateProductionCenter(
    id: string,
    input: Partial<ProductionCenterInput>,
    actor: ActorContext,
  ) {
    await this.ensureProductionCenter(id);
    const updated = await this.prisma.productionCenter.update({
      where: { id },
      data: { ...input, version: { increment: 1 } },
    });
    await this.auditMutation('production_center', 'updated', id, actor, input);
    return updated;
  }

  async deleteProductionCenter(id: string, actor: ActorContext) {
    await this.ensureProductionCenter(id);
    const deleted = await this.prisma.productionCenter.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        version: { increment: 1 },
      },
    });
    await this.auditMutation('production_center', 'deleted', id, actor, {});
    return deleted;
  }

  listDepartments() {
    return this.prisma.department.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  async createDepartment(input: DepartmentInput, actor: ActorContext) {
    const created = await this.prisma.department.create({ data: input });
    await this.auditMutation('department', 'created', created.id, actor, input);
    return created;
  }

  async updateDepartment(
    id: string,
    input: Partial<DepartmentInput>,
    actor: ActorContext,
  ) {
    await this.ensureDepartment(id);
    const updated = await this.prisma.department.update({
      where: { id },
      data: { ...input, version: { increment: 1 } },
    });
    await this.auditMutation('department', 'updated', id, actor, input);
    return updated;
  }

  async deleteDepartment(id: string, actor: ActorContext) {
    await this.ensureDepartment(id);
    const deleted = await this.prisma.department.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        version: { increment: 1 },
      },
    });
    await this.auditMutation('department', 'deleted', id, actor, {});
    return deleted;
  }

  listProducts() {
    return this.prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  async createProduct(input: ProductInput, actor: ActorContext) {
    const created = await this.prisma.product.create({ data: input });
    await this.auditMutation('product', 'created', created.id, actor, input);
    return created;
  }

  async updateProduct(
    id: string,
    input: Partial<ProductInput>,
    actor: ActorContext,
  ) {
    await this.ensureProduct(id);
    const updated = await this.prisma.product.update({
      where: { id },
      data: { ...input, version: { increment: 1 } },
    });
    await this.auditMutation('product', 'updated', id, actor, input);
    return updated;
  }

  async deleteProduct(id: string, actor: ActorContext) {
    await this.ensureProduct(id);
    const deleted = await this.prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        version: { increment: 1 },
      },
    });
    await this.auditMutation('product', 'deleted', id, actor, {});
    return deleted;
  }

  listItemDepartmentMappings() {
    return this.prisma.itemDepartmentMapping.findMany({
      where: { deletedAt: null },
      include: { product: true, department: true, productionCenter: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createItemDepartmentMapping(
    input: ItemDepartmentMappingInput,
    actor: ActorContext,
  ) {
    const created = await this.prisma.itemDepartmentMapping.create({
      data: input,
    });
    await this.auditMutation(
      'item_department_mapping',
      'created',
      created.id,
      actor,
      input,
    );
    return created;
  }

  async updateItemDepartmentMapping(
    id: string,
    input: Partial<ItemDepartmentMappingInput>,
    actor: ActorContext,
  ) {
    await this.ensureItemDepartmentMapping(id);
    const updated = await this.prisma.itemDepartmentMapping.update({
      where: { id },
      data: { ...input, version: { increment: 1 } },
    });
    await this.auditMutation(
      'item_department_mapping',
      'updated',
      id,
      actor,
      input,
    );
    return updated;
  }

  async deleteItemDepartmentMapping(id: string, actor: ActorContext) {
    await this.ensureItemDepartmentMapping(id);
    const deleted = await this.prisma.itemDepartmentMapping.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        version: { increment: 1 },
      },
    });
    await this.auditMutation(
      'item_department_mapping',
      'deleted',
      id,
      actor,
      {},
    );
    return deleted;
  }

  private async auditMutation(
    entity: EntityName,
    verb: 'created' | 'updated' | 'deleted',
    entityId: string,
    actor: ActorContext,
    payload: object,
  ) {
    await this.audit.record({
      action: `master_data.${entity}.${verb}`,
      actorId: actor.actorId,
      entityType: entity,
      entityId,
      payload,
    });
  }

  private async ensureBranch(id: string) {
    const entity = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
    });
    if (!entity) throw new NotFoundException({ code: 'BRANCH_NOT_FOUND' });
  }

  private async ensureProductionCenter(id: string) {
    const entity = await this.prisma.productionCenter.findFirst({
      where: { id, deletedAt: null },
    });
    if (!entity)
      throw new NotFoundException({ code: 'PRODUCTION_CENTER_NOT_FOUND' });
  }

  private async ensureDepartment(id: string) {
    const entity = await this.prisma.department.findFirst({
      where: { id, deletedAt: null },
    });
    if (!entity) throw new NotFoundException({ code: 'DEPARTMENT_NOT_FOUND' });
  }

  private async ensureProduct(id: string) {
    const entity = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!entity) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
  }

  private async ensureItemDepartmentMapping(id: string) {
    const entity = await this.prisma.itemDepartmentMapping.findFirst({
      where: { id, deletedAt: null },
    });
    if (!entity) {
      throw new NotFoundException({
        code: 'ITEM_DEPARTMENT_MAPPING_NOT_FOUND',
      });
    }
  }
}
