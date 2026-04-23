import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../lib/prisma.service.js";
import { Prisma } from "@prisma/client";

@Injectable()
export class SharesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(params: {
    where?: Prisma.ShareLinkWhereInput;
    orderBy?: Prisma.ShareLinkOrderByWithRelationInput;
    select?: Prisma.ShareLinkSelect;
  }) {
    return this.prisma.shareLink.findMany(params);
  }

  async findUnique(params: {
    where: Prisma.ShareLinkWhereUniqueInput;
    include?: Prisma.ShareLinkInclude;
  }) {
    return this.prisma.shareLink.findUnique(params);
  }

  async create(params: {
    data: Prisma.ShareLinkCreateInput;
  }) {
    return this.prisma.shareLink.create(params);
  }

  async update(params: {
    where: Prisma.ShareLinkWhereUniqueInput;
    data: Prisma.ShareLinkUpdateInput;
  }) {
    return this.prisma.shareLink.update(params);
  }

  async delete(params: {
    where: Prisma.ShareLinkWhereUniqueInput;
  }) {
    return this.prisma.shareLink.delete(params);
  }
}
