import { DynamicModule, Module } from '@nestjs/common';

import { WorkerRuntime, type WorkerRuntimeOptions } from './worker-runtime';

@Module({})
export class WorkerRuntimeModule {
  static register(options: WorkerRuntimeOptions): DynamicModule {
    return {
      module: WorkerRuntimeModule,
      providers: [
        {
          provide: WorkerRuntime,
          useValue: new WorkerRuntime(options),
        },
      ],
      exports: [WorkerRuntime],
    };
  }
}
