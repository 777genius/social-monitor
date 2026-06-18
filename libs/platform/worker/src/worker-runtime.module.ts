import { DynamicModule, Module } from '@nestjs/common';

import { WorkerCommandIdFactory } from './worker-command-id-factory';
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
        {
          provide: WorkerCommandIdFactory,
          useFactory: () => WorkerCommandIdFactory.system(),
        },
      ],
      exports: [WorkerRuntime, WorkerCommandIdFactory],
    };
  }
}
