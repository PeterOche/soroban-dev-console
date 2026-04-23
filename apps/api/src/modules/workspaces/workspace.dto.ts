import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

const NETWORK_IDS = ["mainnet", "testnet", "futurenet", "local"] as const;

class WorkspaceArtifactRefDto {
  @IsString()
  @MinLength(1)
  kind!: string;

  @IsString()
  @MinLength(1)
  id!: string;
}

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(NETWORK_IDS)
  selectedNetwork?: string;

  @IsOptional()
  @IsArray()
  contracts?: any[];

  @IsOptional()
  @IsArray()
  interactions?: any[];
}

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(NETWORK_IDS)
  selectedNetwork?: string;
}

export class ImportWorkspaceDto {
  @IsNumber()
  version!: number;

  @IsString()
  @MinLength(1)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsIn(NETWORK_IDS)
  selectedNetwork!: string;

  @IsArray()
  @IsString({ each: true })
  contractIds!: string[];

  @IsArray()
  @IsString({ each: true })
  savedCallIds!: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkspaceArtifactRefDto)
  artifactRefs!: WorkspaceArtifactRefDto[];

  @IsNumber()
  createdAt!: number;

  @IsNumber()
  updatedAt!: number;
}
