import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../lib/prisma.service.js";
import { Prisma } from "@prisma/client";

@Injectable()
export class WorkspacesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(params: {
    where?: Prisma.WorkspaceWhereInput;
    orderBy?: Prisma.WorkspaceOrderByWithRelationInput;
    select?: Prisma.WorkspaceSelect;
  }) {
    return this.prisma.workspace.findMany(params);
  }

  async findFirst(params: {
    where?: Prisma.WorkspaceWhereInput;
    include?: Prisma.WorkspaceInclude;
  }) {
    return this.prisma.workspace.findFirst(params);
  }

  async findUnique(params: {
    where: Prisma.WorkspaceWhereUniqueInput;
    include?: Prisma.WorkspaceInclude;
  }) {
    return this.prisma.workspace.findUnique(params);
  }

  async create(params: {
    data: Prisma.WorkspaceCreateInput;
    include?: Prisma.WorkspaceInclude;
  }) {
    return this.prisma.workspace.create(params);
  }

  async update(params: {
    where: Prisma.WorkspaceWhereUniqueInput;
    data: Prisma.WorkspaceUpdateInput;
  }) {
    return this.prisma.workspace.update(params);
  }

  async delete(params: {
    where: Prisma.WorkspaceWhereUniqueInput;
  }) {
    return this.prisma.workspace.delete(params);
  }
}
