import {
  type DynamicModule,
  type ForwardReference,
  Module,
  type Provider,
  type Type,
} from '@nestjs/common';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';

import { SocialResearchToolHandlers } from '../tools/social-research-tool-handlers';
import { SocialResearchController } from './social-research.controller';

export type SocialResearchRestModuleOptions = {
  readonly handlersProvider?: Provider<SocialResearchToolHandlers>;
  readonly imports?: readonly (
    | Type<unknown>
    | DynamicModule
    | ForwardReference
  )[];
};

@Module({})
export class SocialResearchRestModule {
  static register(options: SocialResearchRestModuleOptions): DynamicModule {
    const imports = options.imports ?? [];
    if (options.handlersProvider === undefined && imports.length === 0) {
      throw new Error(
        'SocialResearchRestModule requires either a handlersProvider or an imported module exporting SocialResearchToolHandlers',
      );
    }

    return {
      module: SocialResearchRestModule,
      imports: [IdentityRestModule, ...imports],
      controllers: [SocialResearchController],
      providers:
        options.handlersProvider === undefined ? [] : [options.handlersProvider],
      exports:
        options.handlersProvider === undefined
          ? [...imports]
          : [SocialResearchToolHandlers],
    };
  }
}
