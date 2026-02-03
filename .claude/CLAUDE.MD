# NestJS Project Guidelines for Claude Code

## Framework Information
- **NestJS Version**: 11.x (latest stable)
- **Official Documentation**: https://docs.nestjs.com
- **Architecture**: Modular, dependency injection-based framework built on top of Express/Fastify
- **Language**: TypeScript with strict mode enabled

## Project Structure

```
src/
├── common/           # Shared utilities, decorators, filters, guards, interceptors, pipes
│   ├── decorators/   # Custom decorators
│   ├── filters/      # Exception filters
│   ├── guards/       # Authorization guards
│   ├── interceptors/ # Request/response interceptors
│   ├── pipes/        # Validation and transformation pipes
│   └── utils/        # Utility functions
├── config/           # Configuration files and environment setup
├── modules/          # Feature modules (each domain has its own folder)
│   └── [module-name]/
│       ├── dto/      # Data Transfer Objects
│       ├── entities/ # TypeORM entities
│       ├── [module].controller.ts
│       ├── [module].service.ts
│       ├── [module].module.ts
│       └── tests/
├── shared/           # Shared modules used across multiple features
├── main.ts           # Application entry point
└── app.module.ts     # Root module
```

## TypeScript Configuration

### Strict Mode Settings (Required)
- `"strict": true` - Enable all strict type-checking options
- `"strictNullChecks": true` - Strict null and undefined checking
- `"noImplicitAny": true` - No implicit any types
- `"strictBindCallApply": true` - Strict checking of bind, call, and apply
- `"strictFunctionTypes": true` - Strict function type checking
- `"forceConsistentCasingInFileNames": true` - Consistent file name casing
- `"resolveJsonModule": true` - Allow importing JSON modules
- `"allowUnreachableCode": false` - Disallow unreachable code

## Code Style & Best Practices

### 1. Controllers
**Purpose**: Handle HTTP requests and return responses to the client.

**Guidelines**:
- Keep controllers thin - they should only handle request/response logic
- Delegate business logic to services
- Use route decorators: `@Get()`, `@Post()`, `@Put()`, `@Patch()`, `@Delete()`
- Use HTTP status code decorators when needed: `@HttpCode(204)`
- Apply validation using DTOs
- Use Swagger decorators for API documentation

**Example**:
```typescript
@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @ApiResponse({ status: 200, description: 'Return all devices' })
  async findAll(): Promise<Device[]> {
    return this.devicesService.findAll();
  }

  @Post()
  @ApiResponse({ status: 201, description: 'Device created successfully' })
  async create(@Body() createDeviceDto: CreateDeviceDto): Promise<Device> {
    return this.devicesService.create(createDeviceDto);
  }
}
```

### 2. Services (Providers)
**Purpose**: Contain business logic and can be injected into controllers or other services.

**Guidelines**:
- Implement all business logic in services
- Use `@Injectable()` decorator
- Follow single responsibility principle
- Use dependency injection for all dependencies
- Handle errors and throw appropriate HTTP exceptions
- Use async/await for asynchronous operations

**Example**:
```typescript
@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly configService: ConfigService,
  ) {}

  async findAll(): Promise<Device[]> {
    return this.deviceRepository.find();
  }

  async create(createDeviceDto: CreateDeviceDto): Promise<Device> {
    const device = this.deviceRepository.create(createDeviceDto);
    return this.deviceRepository.save(device);
  }
}
```

### 3. Data Transfer Objects (DTOs)
**Purpose**: Define the shape of data for requests and responses, with validation.

**Guidelines**:
- Use classes (not interfaces) for DTOs
- Apply validation decorators from `class-validator`
- Use `@ApiProperty()` decorator for Swagger documentation
- Create separate DTOs for create, update, and response operations
- Use `PartialType` or `PickType` utilities for reusability

**Example**:
```typescript
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDeviceDto {
  @ApiProperty({ description: 'Device name', example: 'Sensor-001' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Device type', example: 'temperature-sensor' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ description: 'Device location', required: false })
  @IsString()
  @IsOptional()
  location?: string;
}
```

### 4. Modules
**Purpose**: Organize application into cohesive blocks of functionality.

**Guidelines**:
- Each module should have a single, well-defined purpose
- Group related controllers, services, and providers
- Use `@Module()` decorator with imports, controllers, providers, and exports
- Import shared modules where needed
- Export services that need to be used by other modules

**Example**:
```typescript
@Module({
  imports: [TypeOrmModule.forFeature([Device])],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
```

### 5. TypeORM Entities
**Purpose**: Define database table structure and relationships.

**Guidelines**:
- Use decorators: `@Entity()`, `@PrimaryGeneratedColumn()`, `@Column()`, etc.
- Define relationships with `@OneToMany()`, `@ManyToOne()`, `@ManyToMany()`
- Add indexes for frequently queried fields
- Use `@CreateDateColumn()` and `@UpdateDateColumn()` for timestamps
- Keep entities simple - business logic belongs in services

**Example**:
```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  type: string;

  @Column({ nullable: true })
  location: string;

  @Column({ default: 'active' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

## NestJS-Specific Patterns

### Dependency Injection
- Use constructor-based injection
- Inject services, repositories, and configuration
- Use `@Inject()` decorator for custom providers

### Pipes
- **ValidationPipe**: Automatically validate DTOs (enabled globally)
- **ParseIntPipe**, **ParseUUIDPipe**: Transform and validate params
- Create custom pipes for specific transformations

### Guards
- Implement `CanActivate` interface
- Use for authentication and authorization
- Apply with `@UseGuards()` decorator
- Can be controller-scoped, method-scoped, or global

### Interceptors
- Implement `NestInterceptor` interface
- Use for logging, transformation, error handling
- Apply with `@UseInterceptors()` decorator

### Exception Filters
- Create custom exception filters for consistent error responses
- Use built-in HTTP exceptions: `NotFoundException`, `BadRequestException`, etc.
- Apply with `@UseFilters()` decorator or globally

### Configuration
- Use `@nestjs/config` package (ConfigModule)
- Access environment variables via `ConfigService`
- Inject ConfigService where needed
- Validate environment variables on startup

**Example**:
```typescript
@Injectable()
export class AppService {
  constructor(private configService: ConfigService) {}

  getDatabaseConfig() {
    return {
      host: this.configService.get<string>('DATABASE_HOST'),
      port: this.configService.get<number>('DATABASE_PORT'),
    };
  }
}
```

## PostgreSQL & TypeORM Guidelines

### Database Connection
- Configure TypeORM in `app.module.ts` using `TypeOrmModule.forRoot()`
- Use environment variables for connection details
- Enable synchronize only in development (use migrations in production)

### Repository Pattern
- Inject repositories using `@InjectRepository(Entity)`
- Use repository methods: `find()`, `findOne()`, `save()`, `update()`, `delete()`
- Create custom repository methods when needed

### Migrations
- Generate migrations: `npm run migration:generate -- -n MigrationName`
- Run migrations: `npm run migration:run`
- Revert migrations: `npm run migration:revert`
- Never use `synchronize: true` in production

### Transactions
- Use `QueryRunner` for complex transactions
- Wrap multiple operations in transactions for data consistency

### Performance
- Add indexes to frequently queried columns
- Use query builders for complex queries
- Implement pagination for large datasets
- Use eager/lazy loading appropriately
- Configure connection pooling

## API Documentation (Swagger)

### Setup
- Swagger is configured at `/api` endpoint
- Access Swagger UI at `http://localhost:3000/api`

### Decorators
- `@ApiTags('tag-name')` - Group endpoints
- `@ApiProperty()` - Document DTO properties
- `@ApiResponse()` - Document response codes
- `@ApiOperation()` - Describe endpoint purpose
- `@ApiBearerAuth()` - Indicate auth requirement

## Testing

### Unit Tests
- Use Jest for testing
- Test files: `*.spec.ts`
- Mock dependencies using Jest mocking
- Test services and business logic thoroughly
- Run: `npm run test`

### E2E Tests
- Test files: `*.e2e-spec.ts` in `test/` directory
- Test complete request/response flow
- Use test database
- Run: `npm run test:e2e`

### Coverage
- Generate coverage report: `npm run test:cov`
- Aim for high coverage on business logic

## Error Handling

### HTTP Exceptions
- Use built-in exceptions: `NotFoundException`, `BadRequestException`, `UnauthorizedException`, etc.
- Provide clear error messages
- Include relevant context in errors

**Example**:
```typescript
async findOne(id: string): Promise<Device> {
  const device = await this.deviceRepository.findOne({ where: { id } });
  if (!device) {
    throw new NotFoundException(`Device with ID ${id} not found`);
  }
  return device;
}
```

### Exception Filters
- Create custom filters for consistent error format
- Log errors appropriately
- Don't expose sensitive information in errors

## Async/Await
- Always use async/await for asynchronous operations
- Avoid callback-based patterns
- Handle promise rejections properly
- Use try/catch for error handling when appropriate

## Formatting & Linting

### ESLint
- Configuration in `.eslintrc.js`
- Run: `npm run lint`
- Fix automatically: `npm run lint:fix`

### Prettier
- Configuration in `.prettierrc`
- Integrated with ESLint
- Format on save in IDE (recommended)

## Environment Variables

### Required Variables
```
NODE_ENV=development
PORT=3000
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=ecomon
```

### Best Practices
- Never commit `.env` file
- Provide `.env.example` as template
- Validate required variables on startup
- Use different configs for dev/staging/production

## Security Best Practices

### Input Validation
- Always validate user input using DTOs
- Use `whitelist: true` in ValidationPipe to strip unknown properties
- Use `forbidNonWhitelisted: true` to reject requests with extra properties

### SQL Injection Prevention
- Use TypeORM query builders or repository methods
- Never construct raw SQL from user input
- Use parameterized queries if raw SQL is necessary

### Rate Limiting
- Implement rate limiting for public endpoints
- Use `@nestjs/throttler` package

### CORS
- Configure CORS appropriately
- Don't use `origin: '*'` in production

## Performance Optimization

### Caching
- Use `@nestjs/cache-manager` for caching
- Cache frequently accessed data
- Set appropriate TTL values

### Database Optimization
- Use indexes effectively
- Implement pagination
- Use select only needed fields
- Optimize N+1 query problems with eager loading

### Logging
- Use NestJS Logger
- Log important operations
- Include context in logs
- Use different log levels appropriately

## Common Patterns

### Barrel Exports
Create `index.ts` files to re-export module contents:
```typescript
export * from './devices.controller';
export * from './devices.service';
export * from './devices.module';
```

### DTO Inheritance
```typescript
export class UpdateDeviceDto extends PartialType(CreateDeviceDto) {}
```

### Custom Decorators
```typescript
export const User = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

## Development Workflow

1. **Start development server**: `npm run start:dev` (with hot reload)
2. **Run tests**: `npm run test` or `npm run test:watch`
3. **Lint code**: `npm run lint`
4. **Format code**: `npm run format`
5. **Build**: `npm run build`
6. **Run production**: `npm run start:prod`

## Additional Resources

- NestJS Documentation: https://docs.nestjs.com
- TypeORM Documentation: https://typeorm.io
- class-validator: https://github.com/typestack/class-validator
- Swagger Documentation: https://docs.nestjs.com/openapi/introduction
